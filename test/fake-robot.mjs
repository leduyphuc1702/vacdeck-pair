// Stand-in for a robot in pairing mode, on 127.0.0.1. Answers exactly like the robot's hotspot,
// so the whole exchange (keys, encryption, settings) is checked without a real vacuum.
//
//   node test/fake-robot.mjs 44322     # then: node src/cli.mjs CODE --robot-host 127.0.0.1 --robot-port 44322

import { generateKeyPairSync } from "node:crypto";
import { createSocket } from "node:dgram";
import { decryptRouter, rawPublicKey } from "../src/protocol.mjs";

/**
 * `mode`: `ok` (default), `plain` (robot sends no key), `reject` (refuses the settings),
 * `pin` (asks for a PIN), `silent` (never answers).
 */
export function startFakeRobot({ port = 0, did = "123456789", mode = "ok" } = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  const robotKey = rawPublicKey(publicKey);
  const received = [];
  let clientKey = null;
  const socket = createSocket("udp4");

  socket.on("message", (data, remote) => {
    if (mode === "silent") return;
    const message = JSON.parse(data.toString("utf8"));
    const reply = (body) => socket.send(JSON.stringify(body), remote.port, remote.address);
    if (message.method === "request_connection") {
      clientKey = Buffer.from(message.value, "base64");
      if (mode === "pin") {
        reply({ method: "response_connection", code: "-1", remain: 3 });
        return;
      }
      reply({
        method: "response_connection",
        did,
        code: "0",
        ...(mode === "plain" ? {} : { value: robotKey.toString("base64") }),
      });
      return;
    }
    if (message.method === "config_router") {
      const settings = message.value
        ? decryptRouter({ value: message.value, did, privateKey, clientKey })
        : (({ method, ...rest }) => rest)(message);
      received.push(settings);
      reply({ method: "response_router", code: mode === "reject" ? "-2" : "0" });
    }
  });

  return new Promise((resolve) => {
    socket.bind(port, "127.0.0.1", () => {
      resolve({ port: socket.address().port, received, close: () => socket.close() });
    });
  });
}

if (process.argv[1]?.endsWith("fake-robot.mjs")) {
  const robot = await startFakeRobot({ port: Number(process.argv[2] ?? 44322) });
  console.log(`fake robot on 127.0.0.1:${robot.port}`);
}
