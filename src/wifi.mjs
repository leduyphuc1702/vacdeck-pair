// Wi-Fi helpers per operating system. Every function is best effort: when one fails the tool
// falls back to asking the person to switch networks by hand, which always works.

import { execFile } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";

/** Hotspot names the robots use in pairing mode, e.g. `dreame-vacuum-xxxx_miapF92F`. */
export const HOTSPOT_PATTERN = /^(mova|dreame|trouver)-.*_miap/i;

/** Robots that only use the brand prefix (seen on some firmware). */
const LOOSE_PATTERN = /^(mova|dreame|trouver)-/i;

/** Address range the robot's hotspot hands out. */
export const HOTSPOT_SUBNET = /^192\.168\.5\.\d+$/;

function run(file, args, timeout = 20_000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, windowsHide: true, encoding: "utf8" }, (error, stdout, stderr) => {
      resolve({ ok: !error, out: String(stdout ?? ""), err: String(stderr ?? "") });
    });
  });
}

export function pickHotspot(names) {
  return (
    names.find((name) => HOTSPOT_PATTERN.test(name)) ??
    names.find((name) => LOOSE_PATTERN.test(name)) ??
    null
  );
}

/** Our address on the robot's hotspot, or null when not joined yet. */
export function hotspotAddress(interfaces = networkInterfaces()) {
  return usableAddresses(interfaces).find((address) => HOTSPOT_SUBNET.test(address)) ?? null;
}

/** IPv4 addresses a network handed out to this computer (no loopback, no 169.254 self-assigned). */
export function usableAddresses(interfaces = networkInterfaces()) {
  const found = [];
  for (const list of Object.values(interfaces)) {
    for (const entry of list ?? []) {
      const ipv4 = entry.family === "IPv4" || entry.family === 4;
      if (ipv4 && !entry.internal && !entry.address.startsWith("169.254.")) {
        found.push(entry.address);
      }
    }
  }
  return found;
}

/**
 * Where the robot may be once the computer is on its hotspot. Most robots sit at 192.168.5.1, some
 * elsewhere (a Dreame S50 hands out 192.168.1.x), and the robot is always the hotspot's gateway.
 */
export function candidateHosts({ gateways = [], addresses = usableAddresses(), standard }) {
  const sameNet = addresses.map((address) => address.replace(/\.\d+$/, ".1"));
  return [...new Set([standard, ...gateways, ...sameNet])].filter(
    (host) => host && !addresses.includes(host),
  );
}

/** `route print -4 0.0.0.0` lists gateways in digits whatever the Windows language is. */
export function parseWindowsGateways(out) {
  return out
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)\s/)?.[1])
    .filter(Boolean);
}

/* ---------------------------------- Windows --------------------------------- */

const NETSH = "netsh";

async function winCurrent() {
  const { out } = await run(NETSH, ["wlan", "show", "interfaces"]);
  // "SSID" is not translated in localized Windows; "BSSID" must not match.
  const line = out.split(/\r?\n/).find((l) => /^\s*SSID\s*:/.test(l));
  return line ? line.split(":").slice(1).join(":").trim() || null : null;
}

async function winScan() {
  const { out } = await run(NETSH, ["wlan", "show", "networks"]);
  return out
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*SSID\s+\d+\s*:\s*(.*)$/)?.[1]?.trim())
    .filter(Boolean);
}

async function winJoin(ssid) {
  const escape = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const xml = `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
  <name>${escape(ssid)}</name>
  <SSIDConfig><SSID><name>${escape(ssid)}</name></SSID></SSIDConfig>
  <connectionType>ESS</connectionType>
  <connectionMode>manual</connectionMode>
  <MSM><security><authEncryption>
    <authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX>
  </authEncryption></security></MSM>
</WLANProfile>`;
  const file = join(tmpdir(), "vacdeck-robot-hotspot.xml");
  writeFileSync(file, xml, "utf8");
  await run(NETSH, ["wlan", "add", "profile", `filename=${file}`, "user=current"]);
  const { ok } = await run(NETSH, ["wlan", "connect", `name=${ssid}`, `ssid=${ssid}`]);
  return ok;
}

async function winGateways() {
  const { out } = await run("route", ["print", "-4", "0.0.0.0"]);
  return parseWindowsGateways(out);
}

async function winRejoin(ssid) {
  const { ok } = await run(NETSH, ["wlan", "connect", `name=${ssid}`]);
  return ok;
}

/** The exported profile XML is the same in every Windows language, unlike `show profile` text. */
async function winSavedPassword(ssid) {
  const folder = mkdtempSync(join(tmpdir(), "vacdeck-wifi-"));
  try {
    await run(NETSH, ["wlan", "export", "profile", `name=${ssid}`, "key=clear", `folder=${folder}`]);
    for (const file of readdirSync(folder)) {
      const key = readFileSync(join(folder, file), "utf8").match(/<keyMaterial>([^<]*)<\/keyMaterial>/);
      if (key) return unescapeXml(key[1]);
    }
    return null;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

function unescapeXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/* ----------------------------------- macOS ---------------------------------- */

async function macInterface() {
  const { out } = await run("networksetup", ["-listallhardwareports"]);
  const match = out.match(/Hardware Port: (?:Wi-Fi|AirPort)\s*\nDevice: (\S+)/);
  return match?.[1] ?? "en0";
}

async function macCurrent() {
  const { out } = await run("networksetup", ["-getairportnetwork", await macInterface()]);
  const match = out.match(/Current (?:Wi-Fi|AirPort) Network: (.+)/);
  return match?.[1]?.trim() || null;
}

async function macScan() {
  const { out } = await run("system_profiler", ["SPAirPortDataType", "-json"], 40_000);
  try {
    const data = JSON.parse(out);
    const names = [];
    const walk = (node) => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === "object") {
        if (typeof node._name === "string") names.push(node._name);
        Object.values(node).forEach(walk);
      }
    };
    walk(data);
    return names;
  } catch {
    return [];
  }
}

async function macJoin(ssid, password) {
  const args = ["-setairportnetwork", await macInterface(), ssid];
  if (password) args.push(password);
  const { ok, out } = await run("networksetup", args, 40_000);
  // networksetup exits 0 even when it prints "Could not find network" / "Failed to join".
  return ok && !/could not|failed|error/i.test(out);
}

/** macOS shows its own approval dialog; the person has two minutes to answer it. */
async function macGateways() {
  const { out } = await run("route", ["-n", "get", "default"]);
  const match = out.match(/gateway:\s*(\d+\.\d+\.\d+\.\d+)/);
  return match ? [match[1]] : [];
}

async function macSavedPassword(ssid) {
  const { ok, out } = await run(
    "security",
    ["find-generic-password", "-D", "AirPort network password", "-a", ssid, "-w"],
    120_000,
  );
  return ok ? out.replace(/\n$/, "") : null;
}

/* ----------------------------------- Linux ---------------------------------- */

async function linuxCurrent() {
  const { out } = await run("nmcli", ["-t", "-f", "active,ssid", "dev", "wifi"]);
  const line = out.split("\n").find((l) => l.startsWith("yes:"));
  return line ? line.slice(4).replace(/\\:/g, ":") || null : null;
}

async function linuxScan() {
  const { out } = await run("nmcli", ["-t", "-f", "ssid", "dev", "wifi", "list", "--rescan", "yes"]);
  return out
    .split("\n")
    .map((l) => l.replace(/\\:/g, ":").trim())
    .filter(Boolean);
}

async function linuxJoin(ssid) {
  const { ok } = await run("nmcli", ["dev", "wifi", "connect", ssid], 40_000);
  return ok;
}

async function linuxGateways() {
  const { out } = await run("ip", ["-4", "route", "show", "default"]);
  return [...out.matchAll(/default via (\d+\.\d+\.\d+\.\d+)/g)].map((m) => m[1]);
}

async function linuxRejoin(ssid) {
  const { ok } = await run("nmcli", ["connection", "up", "id", ssid], 40_000);
  return ok;
}

/** Needs root or a polkit rule that lets this user read secrets; otherwise nmcli prints nothing. */
async function linuxSavedPassword(ssid) {
  const { ok, out } = await run("nmcli", [
    "-s",
    "-g",
    "802-11-wireless-security.psk",
    "connection",
    "show",
    "id",
    ssid,
  ]);
  const value = out.replace(/\n$/, "").replace(/\\:/g, ":").replace(/\\\\/g, "\\");
  return ok && value ? value : null;
}

/* --------------------------------------------------------------------------- */

const none = async () => null;
const nothing = async () => [];
const fail = async () => false;

/**
 * The helpers for this computer. `password` is only used by macOS to rejoin a network.
 * `savedPassword` reads the password this computer stored for a network, or null.
 */
export function wifiFor(platform = process.platform) {
  if (platform === "win32") {
    return {
      current: winCurrent,
      scan: winScan,
      join: winJoin,
      rejoin: winRejoin,
      gateways: winGateways,
      savedPassword: winSavedPassword,
    };
  }
  if (platform === "darwin") {
    return {
      current: macCurrent,
      scan: macScan,
      join: (ssid) => macJoin(ssid),
      rejoin: (ssid, password) => macJoin(ssid, password),
      gateways: macGateways,
      savedPassword: macSavedPassword,
    };
  }
  if (platform === "linux") {
    return {
      current: linuxCurrent,
      scan: linuxScan,
      join: linuxJoin,
      rejoin: linuxRejoin,
      gateways: linuxGateways,
      savedPassword: linuxSavedPassword,
    };
  }
  return {
    current: none,
    scan: nothing,
    join: fail,
    rejoin: fail,
    gateways: nothing,
    savedPassword: none,
  };
}
