// VacDeck pairing tool. Adds a robot to VacDeck through the robot's own pairing hotspot, for
// robots that cannot scan a QR code. Run it on a computer with Wi-Fi, near the robot:
//
//   vacdeck-pair K7QM4-XZP2A
//
// 1. trades the one-time code from the VacDeck page for the robot's network settings;
// 2. asks for your Wi-Fi name and password (they never leave this computer except to the robot);
// 3. joins the robot's hotspot, sends the settings, and reads the robot's id;
// 4. reconnects to your Wi-Fi and tells VacDeck which robot was paired.
//
// With --json (for AI agents and scripts) it never waits for the keyboard: every step is one JSON
// line on stdout and the last line is {"event":"result",...} with `next` saying what to do.

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pickLanguage, translator } from "./messages.mjs";
import { pairOverHotspot, ROBOT_HOST, ROBOT_PORT } from "./protocol.mjs";
import { HOTSPOT_PATTERN, hotspotAddress, pickHotspot, wifiFor } from "./wifi.mjs";

export const VERSION = "0.2.0";
const DEFAULT_API = "https://app.vacdeck.com";
const ISSUES_URL = "https://github.com/leduyphuc1702/vacdeck-pair/issues/new/choose";
const SEARCH_MINUTES = 10;
const REPORT_MINUTES = 10;
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Exit codes, also documented in the README. */
export const EXIT = {
  ok: 0,
  failed: 1,
  badCode: 2,
  code: 3,
  report: 4,
  needInput: 5,
  runAgain: 6,
};

/** What the caller should do after a failure, for --json. */
const NEXT = {
  bad_code: "new_code",
  code_unknown: "new_code",
  code_used: "new_code",
  offline: "retry",
  need_ssid: "ask_ssid",
  need_password: "ask_password",
  hotspot_not_found: "retry",
  hotspot_join_failed: "retry",
  no_response: "retry",
  router_rejected: "ask_password",
  pincode_required: "report_issue",
  other: "report_issue",
  report_pending: "run_again",
  report_failed: "report_issue",
};

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

/**
 * A robot that paired but was not reported yet (the run was cut short, e.g. by an AI agent's
 * command timeout). Only the code and the robot id are kept, never the Wi-Fi password.
 */
function stateStore(path) {
  return {
    read(code) {
      try {
        const saved = JSON.parse(readFileSync(path, "utf8"));
        return saved?.code === code && typeof saved.did === "string" ? saved : null;
      } catch {
        return null;
      }
    },
    write(code, did) {
      try {
        writeFileSync(path, JSON.stringify({ code, did, at: new Date().toISOString() }));
      } catch {}
    },
    clear() {
      rmSync(path, { force: true });
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  const started = Date.now();
  const args = parseArgs(argv);
  if (args.version) {
    console.log(VERSION);
    return EXIT.ok;
  }
  const json = Boolean(args.json);
  const t = translator(args.lang ?? pickLanguage());
  const lines = [];
  const log = (line) => lines.push(`${new Date().toISOString()} ${line}`);
  const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
  const say = (line = "") => {
    log(`| ${line}`);
    if (!json) console.log(line);
    else if (line) emit({ event: "say", text: line });
  };
  const step = (name) => {
    log(`step ${name}`);
    if (json) emit({ event: "step", step: name });
  };
  // Never wait for the keyboard without a terminal: an agent or a script would hang forever.
  const canAsk = Boolean(process.stdin.isTTY) && !json;
  const interactive = canAsk && !args.yes;
  const logPath = typeof args.log === "string" ? args.log : join(homedir(), "vacdeck-pair.log");
  const state = stateStore(
    typeof args.state === "string" ? args.state : join(homedir(), ".vacdeck-pair-state.json"),
  );
  const saveLog = () => {
    try {
      writeFileSync(logPath, `${lines.join("\n")}\n`);
      return true;
    } catch {
      return false;
    }
  };
  const finish = (exit, result) => {
    log(`exit ${exit} ${result.reason ?? "ok"}`);
    const saved = saveLog();
    if (json) {
      emit({
        event: "result",
        ok: exit === EXIT.ok,
        ...result,
        next: result.reason ? (NEXT[result.reason] ?? "report_issue") : null,
        log: saved ? logPath : null,
        issues: exit === EXIT.ok ? undefined : ISSUES_URL,
      });
    }
    return exit;
  };
  const closeWindow = async () => {
    if (interactive) await ask(t("press_enter"));
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
    await closeWindow();
    return finish(EXIT.failed, { reason, message: t(`reason_${reason}`) });
  };
  const stop = (exit, reason, message) => {
    say(message);
    return finish(exit, { reason, message });
  };

  // An AI agent's command has a time limit; finish (and keep the progress) before it is reached.
  const maxMinutes = Number(args["max-minutes"]);
  const budgetEnd = maxMinutes > 0 ? started + maxMinutes * 60_000 : Number.POSITIVE_INFINITY;

  log(`vacdeck-pair ${VERSION} ${process.platform} ${process.arch}${json ? " json" : ""}`);
  say(`${t("title")} ${VERSION}`);
  say("");

  let code = normalizeCode(args._[0] ?? args.code);
  while (!code) {
    if (args._[0] || args.code || !canAsk) return stop(EXIT.badCode, "bad_code", t("bad_code"));
    code = normalizeCode(await ask(t("ask_code")));
    if (!code) say(t("bad_code"));
  }

  const api = new Api(String(args.api ?? process.env.VACDECK_API ?? DEFAULT_API), code);
  const pending = state.read(code);
  step("check_code");
  say(t("fetching"));
  let config;
  try {
    const { status, data } = await api.config();
    log(`config -> ${status}`);
    if (status === 404) return stop(EXIT.code, "code_unknown", t("code_unknown"));
    if (status === 410) {
      // The last run reported the robot but was stopped before it could say so.
      if (pending) {
        state.clear();
        say(t("already_added"));
        return finish(EXIT.ok, { message: t("already_added"), name: null });
      }
      return stop(EXIT.code, "code_used", t("code_used"));
    }
    if (status !== 200 || !data?.uid) return stop(EXIT.code, "offline", t("offline"));
    config = data;
  } catch (error) {
    log(`config error ${error.message}`);
    return stop(EXIT.code, "offline", t("offline"));
  }
  log(`settings region=${config.region} timezone=${config.timezone}`);

  let did = pending?.did ?? null;
  if (did) {
    step("resume");
    say(t("resuming"));
  } else {
    const result = await pairRobot();
    if (typeof result === "number") return result;
    did = result;
  }

  step("report");
  say("");
  say(t("reporting"));
  const retryMs = Number(args["retry-ms"] ?? 10_000);
  const reportEnd = Math.min(Date.now() + REPORT_MINUTES * 60_000, budgetEnd);
  let warned = false;
  let offlineSince = null;
  while (Date.now() < reportEnd) {
    try {
      const { status, data } = await api.report({ did });
      log(`report -> ${status}`);
      offlineSince = null;
      if (status === 200) {
        state.clear();
        const message = data?.name ? t("done", { name: data.name }) : t("done_unnamed");
        say("");
        say(message);
        await closeWindow();
        return finish(EXIT.ok, { message, name: data?.name ?? null });
      }
      if (status === 409 && !warned && Date.now() > started + 3 * 60_000) {
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
    await sleep(Math.max(0, Math.min(retryMs, reportEnd - Date.now())));
  }
  if (Date.now() >= budgetEnd) {
    await closeWindow();
    return stop(EXIT.runAgain, "report_pending", t("report_pending"));
  }
  state.clear();
  say(t("report_failed"));
  if (saveLog()) say(t("log_saved", { path: logPath }));
  say(t("help", { url: ISSUES_URL }));
  await closeWindow();
  return finish(EXIT.report, { reason: "report_failed", message: t("report_failed") });

  /** Wi-Fi details, hotspot, settings. Resolves to the robot's id, or to an exit code. */
  async function pairRobot() {
    const wifi = wifiFor();
    const homeSsid = await wifi.current().catch(() => null);
    log(`current wifi ${homeSsid ? "known" : "unknown"}`);
    let ssid = typeof args.ssid === "string" ? args.ssid : "";
    while (!ssid) {
      if (!canAsk) {
        if (!homeSsid) return stop(EXIT.needInput, "need_ssid", t("need_ssid"));
        ssid = homeSsid;
        break;
      }
      const hint = homeSsid ? t("ask_ssid_hint", { ssid: homeSsid }) : "";
      ssid = (await ask(t("ask_ssid", { hint }))) || homeSsid || "";
    }
    if (/5\s*g/i.test(ssid)) say(t("five_ghz", { ssid }));

    let password =
      typeof args.pass === "string" ? args.pass : (process.env.VACDECK_WIFI_PASSWORD ?? null);
    if (password === null && args["saved-password"]) {
      step("read_saved_password");
      password = await wifi.savedPassword(ssid).catch(() => null);
      log(`saved password ${password === null ? "missing" : "found"}`);
      say(t(password === null ? "saved_password_missing" : "saved_password_used", { ssid }));
    }
    if (password === null) {
      if (!canAsk) return stop(EXIT.needInput, "need_password", t("need_password"));
      password = await askHidden(t("ask_pass", { ssid }));
    }

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
      step("robot_mode");
      say("");
      say(t("step_mode"));
      // Keep two minutes of the budget for reporting.
      const searchEnd = Math.min(
        Date.now() + SEARCH_MINUTES * 60_000,
        Math.max(Date.now() + 60_000, budgetEnd - 2 * 60_000),
      );
      say(t("searching", { min: Math.round((searchEnd - Date.now()) / 60_000) }));
      let announcedManual = false;
      while (Date.now() < searchEnd && !hotspotAddress()) {
        if (!args.manual) {
          const names = await wifi.scan().catch(() => []);
          const hotspot = pickHotspot(names);
          if (hotspot && joinedBy !== hotspot) {
            step("join_hotspot");
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
        if (!announcedManual && (args.manual || Date.now() > started + 60_000)) {
          announcedManual = true;
          say(t("join_manual"));
        }
        await sleep(4000);
      }
      const address = hotspotAddress();
      log(`hotspot address ${address ?? "none"}`);
      if (!address) return fail(joinedBy ? "hotspot_join_failed" : "hotspot_not_found", api);
    }

    step("send_settings");
    say(t("joined"));
    const result = await pairOverHotspot({
      settings,
      host: hotspotHost,
      port: Number(args["robot-port"] ?? ROBOT_PORT),
      localPort: testing ? 0 : ROBOT_PORT,
      log,
    });
    log(`pair result ${JSON.stringify(result)}`);
    if (result.ok) state.write(code, result.did);

    if (!testing) {
      step("rejoin");
      // Without a known current network (newer macOS hides it), the robot's network is the best guess.
      const back = homeSsid ?? ssid;
      say(t("rejoining", { ssid: back }));
      // The robot drops its hotspot after accepting, and most computers rejoin the usual network
      // by themselves; asking explicitly just makes it faster.
      await sleep(3000);
      for (let attempt = 0; attempt < 3; attempt++) {
        const ok = await wifi.rejoin(back, back === ssid ? password : undefined).catch(() => false);
        await sleep(5000);
        const now = await wifi.current().catch(() => null);
        log(`rejoin ${attempt + 1} ${ok} ${now === back ? "on network" : "not yet"}`);
        if (now === back || (now && !hotspotAddress())) break;
      }
    }

    if (!result.ok) return fail(result.error, api);
    say(t("paired", { ssid }));
    return result.did;
  }
}
