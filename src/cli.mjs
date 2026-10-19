#!/usr/bin/env node
import { main } from "./main.mjs";

// Pipes are asynchronous on macOS: exit only once the last line (the --json result) is out.
const exit = (code) => process.stdout.write("", () => process.exit(code));

main().then(exit, (error) => {
  console.error(error);
  exit(1);
});
