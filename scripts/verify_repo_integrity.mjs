#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyRepoIntegrity } from "../server/repo_integrity.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv = []) {
  const args = { root: repoRoot, json: false, issueLimit: 200 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") args.root = path.resolve(argv[++index] || repoRoot);
    else if (arg === "--json") args.json = true;
    else if (arg === "--issue-limit") args.issueLimit = Math.max(1, Number(argv[++index] || 200));
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

try {
  const result = await verifyRepoIntegrity(args.root, { issueLimit: args.issueLimit });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`repo-integrity: ${result.ok ? "ok" : "fail"} checked=${result.checked} issues=${result.issueCount} durationMs=${result.durationMs}`);
    for (const issue of result.issues.slice(0, 20)) {
      console.log(`${issue.reason}\t${issue.file}${issue.detail ? `\t${issue.detail}` : ""}`);
    }
    if (result.truncatedIssues > 0) console.log(`... ${result.truncatedIssues} more issues omitted`);
  }
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  const payload = { status: "fail", error: error.message };
  if (args.json) console.log(JSON.stringify(payload, null, 2));
  else console.error(`repo-integrity: fail ${error.message}`);
  process.exit(1);
}
