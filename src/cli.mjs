#!/usr/bin/env node
import { main } from "./main.mjs";

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
