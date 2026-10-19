import assert from "node:assert/strict";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { main, normalizeCode, parseArgs } from "../src/main.mjs";
import { languages, messageKeys, tables } from "../src/messages.mjs";
import { pairOverHotspot } from "../src/protocol.mjs";
import { pickHotspot } from "../src/wifi.mjs";
import { startFakeRobot } from "./fake-robot.mjs";

const SETTINGS = {
  ssid: "Home 2.4G",
  password: "secret-pass",
  uid: "AB123456",
  region: "eu",
  domain: "pair.example.test:19974",
  timezone: "Europe/Berlin",
};

const LOG = join(tmpdir(), "vacdeck-pair-test.log");
const closers = [];
after(() => closers.forEach((close) => close()));

async function robot(options) {
  const fake = await startFakeRobot(options);
  closers.push(fake.close);
  return fake;
}

describe("protocol", () => {
  it("encrypted exchange: the robot reads exactly the settings, the id comes back", async () => {
    const fake = await robot();
    const result = await pairOverHotspot({
      settings: SETTINGS,
      host: "127.0.0.1",
      port: fake.port,
      localPort: 0,
    });
    assert.deepEqual(result, { ok: true, did: "123456789" });
    const { timestamp, ...rest } = fake.received[0];
    assert.match(timestamp, /^\d{10}$/);
    assert.deepEqual(rest, {
      ssid: "Home 2.4G",
      passwd: "secret-pass",
      uid: "AB123456",
      domain: "pair.example.test:19974",
      region: "eu",
      timezone: "Europe/Berlin",
      notClearLogFile: 0,
    });
  });

  it("robot without a key gets plain settings", async () => {
    const fake = await robot({ mode: "plain" });
    const result = await pairOverHotspot({
      settings: SETTINGS,
      host: "127.0.0.1",
      port: fake.port,
      localPort: 0,
    });
    assert.equal(result.ok, true);
    assert.equal(fake.received[0].ssid, "Home 2.4G");
  });

  it("reports refusal and PIN requests", async () => {
    const rejecting = await robot({ mode: "reject" });
    const pin = await robot({ mode: "pin" });
    const options = { settings: SETTINGS, host: "127.0.0.1", localPort: 0 };
    assert.deepEqual(await pairOverHotspot({ ...options, port: rejecting.port }), {
      ok: false,
      error: "router_rejected",
      did: "123456789",
    });
    assert.deepEqual(await pairOverHotspot({ ...options, port: pin.port }), {
      ok: false,
      error: "pincode_required",
    });
  });

  it("the log never contains the Wi-Fi password", async () => {
    const fake = await robot();
    const lines = [];
    await pairOverHotspot({
      settings: SETTINGS,
      host: "127.0.0.1",
      port: fake.port,
      localPort: 0,
      log: (line) => lines.push(line),
    });
    assert.ok(lines.length > 2);
    assert.ok(!lines.join("\n").includes("secret-pass"));
  });
});

describe("helpers", () => {
  it("normalizes codes like the gateway", () => {
    assert.equal(normalizeCode("abcde fghjk"), "ABCDE-FGHJK");
    assert.equal(normalizeCode("o1il0-22222"), "01110-22222");
    assert.equal(normalizeCode("ABCDE-FGHJU"), null);
    assert.equal(normalizeCode(undefined), null);
  });

  it("parses flags", () => {
    assert.deepEqual(parseArgs(["X", "--ssid", "A B", "--yes", "--api=http://h"]), {
      _: ["X"],
      ssid: "A B",
      yes: true,
      api: "http://h",
    });
  });

  it("recognizes the robot's hotspot", () => {
    assert.equal(
      pickHotspot(["Home", "dreame-vacuum-abc_miapF92F", "mova-x"]),
      "dreame-vacuum-abc_miapF92F",
    );
    assert.equal(pickHotspot(["Home", "MOVA-vacuum-x"]), "MOVA-vacuum-x");
    assert.equal(pickHotspot(["Home", "Dreamers"]), null);
  });

  it("every language has every message", () => {
    for (const language of languages) {
      for (const key of messageKeys) assert.ok(tables[language][key], `${language}.${key}`);
    }
  });
});

describe("whole run against a stand-in VacDeck and robot", () => {
  async function fakeVacdeck(reportStatuses) {
    const calls = [];
    const server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        calls.push({ method: request.method, url: request.url, body: body ? JSON.parse(body) : null });
        const send = (status, data) => {
          response.writeHead(status, { "content-type": "application/json" });
          response.end(JSON.stringify(data));
        };
        if (request.method === "GET" && request.url === "/v1/pair-agent/K7QM4-XZP2A") {
          return send(200, {
            uid: SETTINGS.uid,
            region: SETTINGS.region,
            domain: SETTINGS.domain,
            timezone: SETTINGS.timezone,
          });
        }
        if (request.method === "POST" && request.url === "/v1/pair-agent/K7QM4-XZP2A/report") {
          const status = reportStatuses.shift() ?? 200;
          return send(status, status === 200 ? { name: "Kitchen robot" } : { error: {} });
        }
        send(404, { error: { code: "pair_code_not_found" } });
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    closers.push(() => server.close());
    return { url: `http://127.0.0.1:${server.address().port}`, calls };
  }

  it("pairs, retries while the robot comes online, then reports the id", async () => {
    const fake = await robot();
    const vacdeck = await fakeVacdeck([409]);
    const code = await main([
      "k7qm4xzp2a",
      "--api",
      vacdeck.url,
      "--robot-host",
      "127.0.0.1",
      "--robot-port",
      String(fake.port),
      "--ssid",
      SETTINGS.ssid,
      "--pass",
      SETTINGS.password,
      "--retry-ms",
      "50",
      "--yes",
      "--lang",
      "en",
      "--log",
      LOG,
    ]);
    assert.equal(code, 0);
    assert.equal(fake.received[0].uid, SETTINGS.uid);
    const reports = vacdeck.calls.filter((call) => call.method === "POST");
    assert.equal(reports.length, 2);
    assert.deepEqual(reports[1].body, { did: "123456789" });
    // VacDeck never sees the Wi-Fi password.
    assert.ok(!JSON.stringify(vacdeck.calls).includes(SETTINGS.password));
  });

  it("a robot that refuses is reported as a failure", async () => {
    const fake = await robot({ mode: "reject" });
    const vacdeck = await fakeVacdeck([]);
    const code = await main([
      "K7QM4-XZP2A",
      "--api",
      vacdeck.url,
      "--robot-host",
      "127.0.0.1",
      "--robot-port",
      String(fake.port),
      "--ssid",
      "x",
      "--pass",
      "y",
      "--yes",
      "--lang",
      "en",
      "--log",
      LOG,
    ]);
    assert.equal(code, 1);
    const report = vacdeck.calls.find((call) => call.method === "POST");
    assert.deepEqual(report?.body, { error: "router_rejected" });
  });

  it("an unknown code stops before touching the robot", async () => {
    const vacdeck = await fakeVacdeck([]);
    const code = await main(["ZZZZZ-ZZZZZ", "--api", vacdeck.url, "--yes", "--lang", "en", "--log", LOG]);
    assert.equal(code, 3);
  });
});
