#!/usr/bin/env node
import { runHistoricalWalkForwardFromSqlite } from "../server/historical_backtest.mjs";

function parseArgs(argv = []) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[index + 1] || "";
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.sqlite) throw new Error("--sqlite is required");
  const config = args.configJson ? JSON.parse(args.configJson) : {};
  const result = await runHistoricalWalkForwardFromSqlite({ sqlitePath: args.sqlite, config });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
