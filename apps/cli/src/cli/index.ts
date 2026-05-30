#!/usr/bin/env node

import { runCli } from "./yargs-app.js";

export async function main(argv: string[]): Promise<number> {
  return runCli(argv);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
