// Talks to the robot while the computer is joined to the hotspot the robot raises in pairing
// mode (the robot's standard Wi-Fi setup step):
//
//   -> {"method":"request_connection","value":<b64 X25519 public key>,"length":32}
//   <- {"method":"response_connection","did":"<id>","value":<b64 robot key>,"code":"0"}
//   -> {"method":"config_router","value":<b64 AES-256-CBC(settings)>,"length":n}
//      (plain JSON instead when the robot sent no key)
//   <- {"method":"response_router","code":"0"}
//
// AES key = X25519 shared secret; IV = first 16 characters of `${id}1111111111111111`.

import {
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
} from "node:crypto";
import { createSocket } from "node:dgram";

export const ROBOT_HOST = "192.168.5.1";
export const ROBOT_PORT = 44321;

const RETRY_MS = 2000;
const TRIES = 15;

// DER header of a raw X25519 public key: Node wants SPKI, the robot sends the 32 bytes alone.
const SPKI_X25519_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

export function rawPublicKey(keyObject) {
  return keyObject.export({ type: "spki", format: "der" }).subarray(-32);
}

export function publicKeyFromRaw(raw) {
  return createPublicKey({
    key: Buffer.concat([SPKI_X25519_PREFIX, raw]),
    format: "der",
    type: "spki",
  });
}

export function ivFor(did) {
  return Buffer.from(`${did}1111111111111111`.slice(0, 16), "utf8");
}

/** The `config_router` datagram for the robot's answer to `request_connection`. */
export function routerMessage({ did, robotKey, privateKey, settings, now = Date.now() }) {
  const body = {
    ssid: settings.ssid,
    passwd: settings.password,
    uid: settings.uid,
    timestamp: String(Math.floor(now / 1000)),
    domain: settings.domain,
    region: settings.region,
    timezone: settings.timezone,
    notClearLogFile: 0,
  };
  if (!robotKey) return JSON.stringify({ ...body, method: "config_router" });
  const shared = diffieHellman({ privateKey, publicKey: publicKeyFromRaw(robotKey) });
  const cipher = createCipheriv("aes-256-cbc", shared, ivFor(did));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(body), "utf8"), cipher.final()]);
  return JSON.stringify({
    method: "config_router",
    value: encrypted.toString("base64"),
    length: encrypted.length,
  });
}

/** Inverse of `routerMessage`, for the stand-in robot in the tests. */
export function decryptRouter({ value, did, privateKey, clientKey }) {
  const shared = diffieHellman({ privateKey, publicKey: publicKeyFromRaw(clientKey) });
  const decipher = createDecipheriv("aes-256-cbc", shared, ivFor(did));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(value, "base64")), decipher.final()]).toString("utf8"),
  );
}

/**
 * Runs the exchange. Resolves `{ ok: true, did, host }` once the robot accepted the settings, or
 * `{ ok: false, error, did? }` with error one of `no_response`, `pincode_required`,
 * `router_rejected`, `other`. `log` receives one line per step; the Wi-Fi password never appears.
 *
 * Robots do not all use the same address on their hotspot, so `hosts` (a list, or a function
 * read again on every try while the address is still being handed out) are all asked; only the
 * public key goes to them. The settings go to the one that answered.
 */
export function pairOverHotspot({
  settings,
  host = ROBOT_HOST,
  hosts = [host],
  port = ROBOT_PORT,
  localPort = ROBOT_PORT,
  log = () => {},
}) {
  return new Promise((resolve) => {
    const { publicKey, privateKey } = generateKeyPairSync("x25519");
    const mine = rawPublicKey(publicKey);
    let socket = null;
    let bound = false;
    let triedEphemeral = false;
    let timer = null;
    let tries = 0;
    let did = null;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearInterval(timer);
      try {
        socket?.close();
      } catch {}
      resolve(result);
    };

    let robotHost = null;
    const targets = () => {
      if (robotHost) return [robotHost];
      const list = typeof hosts === "function" ? hosts() : hosts;
      return [...new Set(list)];
    };

    const send = (payload, label) => {
      const to = targets();
      for (const address of to) {
        socket.send(payload, port, address, (error) => {
          // Before the hotspot hands out an address there is no route yet: the next try will do.
          if (error) log(`send ${label} ${address}: ${error.message}`);
        });
      }
      log(`-> ${label} ${to.join(",")} (try ${tries})`);
    };

    const repeat = (payload, label, failure) => {
      if (timer) clearInterval(timer);
      tries = 1;
      send(payload, label);
      timer = setInterval(() => {
        tries++;
        if (tries > TRIES) return finish({ ok: false, error: failure, did });
        send(payload, label);
      }, RETRY_MS);
    };

    const onMessage = (raw, from) => {
      let message;
      try {
        message = JSON.parse(raw.toString("utf8"));
      } catch {
        log("<- unreadable datagram");
        return;
      }
      const code = message.code === undefined || message.code === null ? "0" : String(message.code);
      log(`<- ${message.method ?? "?"} code=${code}`);

      if (message.method === "response_connection") {
        if (did) return;
        if (code !== "0" && message.remain !== undefined && message.remain !== null) {
          return finish({ ok: false, error: "pincode_required" });
        }
        const id = message.did === undefined || message.did === null ? "" : String(message.did);
        if (!id) return finish({ ok: false, error: "other" });
        did = id;
        robotHost = from?.address ?? null;
        log(`robot answered from ${robotHost ?? "?"}`);
        const robotKey =
          typeof message.value === "string" && message.value.length > 0
            ? Buffer.from(message.value, "base64")
            : null;
        log(`robot id ${did}, ${robotKey ? "encrypted" : "plain"} channel`);
        const payload = routerMessage({ did, robotKey, privateKey, settings });
        repeat(payload, "config_router", "no_response");
        return;
      }

      if (message.method === "response_router" && did) {
        finish(
          code === "0" ? { ok: true, did, host: robotHost } : { ok: false, error: "router_rejected", did },
        );
      }
    };

    const open = (local) => {
      socket = createSocket({ type: "udp4", reuseAddr: true });
      socket.on("message", onMessage);
      socket.on("error", (error) => {
        log(`socket: ${error.message}`);
        if (bound) return;
        try {
          socket.close();
        } catch {}
        // 44321 is preferred, but any port works when that one is taken.
        if (!triedEphemeral) {
          triedEphemeral = true;
          setTimeout(() => open(0), 250);
          return;
        }
        finish({ ok: false, error: "other" });
      });
      socket.once("listening", () => {
        bound = true;
        const payload = JSON.stringify({
          method: "request_connection",
          value: mine.toString("base64"),
          length: mine.length,
        });
        repeat(payload, "request_connection", "no_response");
      });
      socket.bind(local, "0.0.0.0");
    };

    open(localPort);
  });
}
