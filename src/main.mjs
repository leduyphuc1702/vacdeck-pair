// VacDeck pairing tool. Adds a robot to VacDeck through the robot's own pairing hotspot, for
// robots that cannot scan a QR code. Run it on a computer with Wi-Fi, near the robot:
//
//   vacdeck-pair K7QM4-XZP2A
//
// 1. trades the one-time code from the VacDeck page for the robot's network settings;
// 2. asks for your Wi-Fi name and password (they never leave this computer except to the robot);
// 3. joins the robot's hotspot, sends the settings, and reads the robot's id;
// 4. reconnects to your Wi-Fi and tells VacDeck which robot was paired.

import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pickLanguage, translator } from "./messages.mjs";
import { pairOverHotspot, ROBOT_HOST, ROBOT_PORT } from "./protocol.mjs";
import { HOTSPOT_PATTERN, hotspotAddress, pickHotspot, wifiFor } from "./wifi.mjs";

export const VERSION = "0.1.0";
const DEFAULT_API = "https://app.vacdeck.com";
const ISSUES_URL = "https://github.com/leduyphuc1702/vacdeck-pair/issues/new/choose";
const SEARCH_MINUTES = 10;
const REPORT_MINUTES = 10;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const [name, inline] = token.slice(2).split("=", 2);
    if (inline !== undefined) args[name] = inline;
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) args[name] = true;
    else args[name] = argv[++i];
  }
  return args;
}

/** Same rules as the gateway: any case, optional dash, I/L read as 1 and O as 0. */
export function normalizeCode(raw) {
  const plain = String(raw ?? "")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (plain.length !== 10 || [...plain].some((c) => !ALPHABET.includes(c))) return null;
  return `${plain.slice(0, 5)}-${plain.slice(5)}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Reads a line without echoing it. Falls back to a plain prompt when stdin is not a terminal. */
function askHidden(question) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") return ask(question);
  process.stdout.write(question);
  return new Promise((resolve) => {
    let value = "";
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") {
          input.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value.length > 0) {
            value = [...value].slice(0, -1).join("");
            process.stdout.write("\b \b");
          }
          continue;
        }
        value += ch;
        process.stdout.write("*");
      }
    };
    input.on("data", onData);
  });
}

class Api {
  constructor(base, code) {
    this.base = base.replace(/\/+$/, "");
    this.code = code;
  }

  async call(method, path, body) {
    const response = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "user-agent": `vacdeck-pair/${VERSION} (${process.platform})`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  }

  config() {
    return this.call("GET", `/v1/pair-agent/${encodeURIComponent(this.code)}`);
  }

  report(body) {
    return this.call("POST", `/v1/pair-agent/${encodeURIComponent(this.code)}/report`, body);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.version) {
    console.log(VERSION);
    return 0;
  }
  const t = translator(args.lang ?? pickLanguage());
  const lines = [];
  const log = (line) => lines.push(`${new Date().toISOString()} ${line}`);
  const say = (line = "") => {
    console.log(line);
    log(`| ${line}`);
  };
  const interactive = Boolean(process.stdin.isTTY) && !args.yes;
  const logPath = typeof args.log === "string" ? args.log : join(homedir(), "vacdeck-pair.log");
  const saveLog = () => {
    try {
      writeFileSync(logPath, `${lines.join("\n")}\n`);
      return true;
    } catch {
      return false;
    }
  };
  const fail = async (reason, api) => {
    say("");
    say(t("failed", { reason: t(`reason_${reason}`) }));
    if (api) {
      // The page should show what happened; best effort, the computer may still be offline.
      await api.report({ error: reason }).catch(() => {});
    }
    if (saveLog()) say(t("log_saved", { path: logPath }));
    say(t("help", { url: ISSUES_URL }));
    if (interactive) await ask(t("press_enter"));
    return 1;
  };

  log(`vacdeck-pair ${VERSION} ${process.platform} ${process.arch}`);
  say(`${t("title")} ${VERSION}`);
  say("");

  let code = normalizeCode(args._[0] ?? args.code);
  while (!code) {
    if (args._[0] || args.code || !process.stdin.isTTY) {
      say(t("bad_code"));
      return 2;
    }
    code = normalizeCode(await ask(t("ask_code")));
    if (!code) say(t("bad_code"));
  }

  const api = new Api(String(args.api ?? process.env.VACDECK_API ?? DEFAULT_API), code);
  say(t("fetching"));
  let config;
  try {
    const { status, data } = await api.config();
    log(`config -> ${status}`);
    if (status === 404) return (say(t("code_unknown")), 3);
    if (status === 410) return (say(t("code_used")), 3);
    if (status !== 200 || !data?.uid) return (say(t("offline")), 3);
    config = data;
  } catch (error) {
    log(`config error ${error.message}`);
    say(t("offline"));
    return 3;
  }
  log(`settings region=${config.region} timezone=${config.timezone}`);

  const wifi = wifiFor();
  const homeSsid = await wifi.current().catch(() => null);
  log(`current wifi ${homeSsid ? "known" : "unknown"}`);
  let ssid = typeof args.ssid === "string" ? args.ssid : "";
  while (!ssid) {
    const hint = homeSsid ? t("ask_ssid_hint", { ssid: homeSsid }) : "";
    ssid = (await ask(t("ask_ssid", { hint }))) || homeSsid || "";
  }
  if (/5\s*g/i.test(ssid)) say(t("five_ghz", { ssid }));
  const password =
    typeof args.pass === "string"
      ? args.pass
      : (process.env.VACDECK_WIFI_PASSWORD ?? (await askHidden(t("ask_pass", { ssid }))));

  const settings = {
    ssid,
    password,
    uid: config.uid,
    region: config.region,
    domain: config.domain,
    timezone: config.timezone,
  };

  const hotspotHost = String(args["robot-host"] ?? ROBOT_HOST);
  const testing = hotspotHost !== ROBOT_HOST;
  let joinedBy = null;

  if (!testing) {
    say("");
    say(t("step_mode"));
    say(t("searching", { min: SEARCH_MINUTES }));
    const deadline = Date.now() + SEARCH_MINUTES * 60_000;
    let announcedManual = false;
    while (Date.now() < deadline && !hotspotAddress()) {
      if (!args.manual) {
        const names = await wifi.scan().catch(() => []);
        const hotspot = pickHotspot(names);
        if (hotspot && joinedBy !== hotspot) {
          say(t("found", { ssid: hotspot }));
          log(`join ${hotspot} matches=${HOTSPOT_PATTERN.test(hotspot)}`);
          const ok = await wifi.join(hotspot).catch(() => false);
          log(`join result ${ok}`);
          joinedBy = hotspot;
          for (let i = 0; i < 30 && !hotspotAddress(); i++) await sleep(1000);
          if (hotspotAddress()) break;
          say(t("not_joined"));
        }
      }
      // Scanning can miss the hotspot (or be blocked by the OS): offer the manual way early.
      if (!announcedManual && (args.manual || Date.now() > deadline - (SEARCH_MINUTES - 1) * 60_000)) {
        announcedManual = true;
        say(t("join_manual"));
      }
      await sleep(4000);
    }
    const address = hotspotAddress();
    log(`hotspot address ${address ?? "none"}`);
    if (!address) {
      return fail(joinedBy ? "hotspot_join_failed" : "hotspot_not_found", api);
    }
  }

  say(t("joined"));
  const result = await pairOverHotspot({
    settings,
    host: hotspotHost,
    port: Number(args["robot-port"] ?? ROBOT_PORT),
    localPort: testing ? 0 : ROBOT_PORT,
    log,
  });
  log(`pair result ${JSON.stringify(result)}`);

  if (!testing && homeSsid) {
    say(t("rejoining", { ssid: homeSsid }));
    // The robot drops its hotspot after accepting, and most computers rejoin the usual network
    // by themselves; asking explicitly just makes it faster.
    await sleep(3000);
    const ok = await wifi.rejoin(homeSsid, homeSsid === ssid ? password : undefined).catch(() => false);
    log(`rejoin ${ok}`);
  } else if (!testing) {
    say(t("rejoin_manual"));
  }

  if (!result.ok) return fail(result.error, api);
  say(t("paired", { ssid }));
  say("");
  say(t("reporting"));

  const retryMs = Number(args["retry-ms"] ?? 10_000);
  const deadline = Date.now() + REPORT_MINUTES * 60_000;
  let warned = false;
  let offlineSince = null;
  while (Date.now() < deadline) {
    try {
      const { status, data } = await api.report({ did: result.did });
      log(`report -> ${status}`);
      offlineSince = null;
      if (status === 200) {
        say("");
        say(data?.name ? t("done", { name: data.name }) : t("done_unnamed"));
        saveLog();
        if (interactive) await ask(t("press_enter"));
        return 0;
      }
      if (status === 409 && !warned && Date.now() > deadline - (REPORT_MINUTES - 2) * 60_000) {
        warned = true;
        say(t("report_slow"));
      }
      if (status !== 409 && status !== 429 && status < 500) break;
    } catch (error) {
      log(`report error ${error.message}`);
      offlineSince ??= Date.now();
      if (Date.now() - offlineSince > 60_000 && !warned) {
        warned = true;
        say(t("rejoin_manual"));
      }
    }
    await sleep(retryMs);
  }
  say(t("report_failed"));
  if (saveLog()) say(t("log_saved", { path: logPath }));
  say(t("help", { url: ISSUES_URL }));
  if (interactive) await ask(t("press_enter"));
  return 4;
}
