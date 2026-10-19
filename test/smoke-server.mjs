// Stand-in robot + stand-in VacDeck on 127.0.0.1, to try a built program by hand:
//   node test/smoke-server.mjs
//   vacdeck-pair K7QM4-XZP2A --api http://127.0.0.1:44378 --robot-host 127.0.0.1 --robot-port 44377
import { createServer } from "node:http";
import { startFakeRobot } from "./fake-robot.mjs";

const robot = await startFakeRobot({ port: 44377 });
createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    console.log("vacdeck", request.method, request.url, body);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      request.method === "GET"
        ? JSON.stringify({ uid: "U1", region: "eu", domain: "pair.example.test:1", timezone: "UTC" })
        : JSON.stringify({ name: "Test robot" }),
    );
  });
}).listen(44378, "127.0.0.1");
console.log(`robot 127.0.0.1:${robot.port}, vacdeck http://127.0.0.1:44378`);
setTimeout(() => {
  console.log("robot received", JSON.stringify(robot.received));
  process.exit(0);
}, Number(process.argv[2] ?? 20_000));
