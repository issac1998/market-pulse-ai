import crypto from "node:crypto";
import { open, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

function sha1Buffer(buffer) {
  return crypto.createHash("sha1").update(buffer).digest("hex");
}

export function gitBlobSha1(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer || ""), "utf8");
  return sha1Buffer(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`, "utf8"), bytes]));
}

async function walk(root, predicate, out = []) {
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    out.push({ path: root, error: error.message, missingDirectory: true });
    return out;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      await walk(fullPath, predicate, out);
      continue;
    }
    if (entry.isFile() && predicate(fullPath, entry.name)) out.push(fullPath);
  }
  return out;
}

export async function repoPreflightPaths(repoRoot, options = {}) {
  const root = path.resolve(repoRoot);
  const paths = [];
  paths.push(...(await walk(path.join(root, "server"), (file) => file.endsWith(".mjs"))).filter((item) => typeof item === "string"));
  paths.push(...(await walk(path.join(root, "lib"), (file, name) => name.endsWith(".mjs") && path.dirname(file) === path.join(root, "lib"))).filter((item) => typeof item === "string"));
  paths.push(...(await walk(path.join(root, "strategies"), (file, name) => name.endsWith(".json"))).filter((item) => typeof item === "string"));
  if (options.includeHarness) {
    paths.push(...(await walk(path.join(root, "harness"), (file) => /\.(py|md|toml|json)$/.test(file))).filter((item) => typeof item === "string"));
  }
  return [...new Set(paths)].sort();
}

export async function preflightReadablePaths(paths = [], options = {}) {
  const root = options.repoRoot ? path.resolve(options.repoRoot) : "";
  const issues = [];
  let checked = 0;
  const started = Date.now();
  for (const file of paths) {
    const rel = root ? path.relative(root, file) : file;
    try {
      const fileStat = await stat(file);
      if (!fileStat.isFile()) {
        issues.push({ file: rel, reason: "not_file", detail: "Path is not a regular file" });
        continue;
      }
      if (fileStat.size <= 0) {
        issues.push({ file: rel, reason: "empty", detail: "File is empty or dataless" });
        continue;
      }
      const handle = await open(file, "r");
      try {
        const buffer = Buffer.alloc(1);
        await handle.read(buffer, 0, 1, 0);
      } finally {
        await handle.close();
      }
      checked += 1;
    } catch (error) {
      issues.push({ file: rel, reason: "unreadable", detail: error.message });
    }
  }
  return {
    schemaVersion: "repo-preflight-v1",
    ok: issues.length === 0,
    checked,
    issueCount: issues.length,
    issues,
    durationMs: Date.now() - started,
  };
}

export async function runRepoPreflight(repoRoot, options = {}) {
  const paths = await repoPreflightPaths(repoRoot, options);
  return preflightReadablePaths(paths, { repoRoot });
}

export function formatRepoPreflightIssue(result = {}) {
  const issue = (result.issues || [])[0];
  if (!issue) return "";
  return `Repo preflight failed: ${issue.file} is ${issue.reason} (${issue.detail}). Hint: check iCloud eviction, disk pressure, or file permissions.`;
}

export function parseGitIndex(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12 || buffer.subarray(0, 4).toString("utf8") !== "DIRC") {
    throw new Error("Unsupported or missing git index header");
  }
  const version = buffer.readUInt32BE(4);
  if (![2, 3].includes(version)) {
    throw new Error(`Unsupported git index version ${version}; this checker supports v2/v3`);
  }
  const count = buffer.readUInt32BE(8);
  let offset = 12;
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    const entryStart = offset;
    if (offset + 62 > buffer.length) throw new Error(`Truncated git index entry at ${index}`);
    const size = buffer.readUInt32BE(offset + 36);
    const mode = buffer.readUInt32BE(offset + 24);
    const oid = buffer.subarray(offset + 40, offset + 60).toString("hex");
    const flags = buffer.readUInt16BE(offset + 60);
    offset += 62;
    if (flags & 0x4000) offset += 2;
    const nameEnd = buffer.indexOf(0, offset);
    if (nameEnd < 0) throw new Error(`Missing NUL path terminator at git index entry ${index}`);
    const filePath = buffer.subarray(offset, nameEnd).toString("utf8");
    offset = nameEnd + 1;
    while ((offset - entryStart) % 8 !== 0) offset += 1;
    const stage = (flags >> 12) & 0x3;
    entries.push({ path: filePath, oid, size, mode, stage });
  }
  return { version, count, entries };
}

export async function verifyRepoIntegrity(repoRoot, options = {}) {
  const root = path.resolve(repoRoot);
  const indexPath = options.indexPath || path.join(root, ".git", "index");
  const started = Date.now();
  const parsed = parseGitIndex(await readFile(indexPath));
  const issues = [];
  let checked = 0;
  for (const entry of parsed.entries) {
    if (entry.stage !== 0) continue;
    const file = path.join(root, entry.path);
    try {
      const bytes = await readFile(file);
      checked += 1;
      const actual = gitBlobSha1(bytes);
      if (actual !== entry.oid) {
        issues.push({
          file: entry.path,
          reason: bytes.length === 0 && entry.size > 0 ? "dataless_or_truncated" : "modified",
          expected: entry.oid,
          actual,
          size: bytes.length,
          indexSize: entry.size,
        });
      }
    } catch (error) {
      issues.push({ file: entry.path, reason: "missing_or_unreadable", detail: error.message, expected: entry.oid });
    }
  }
  return {
    schemaVersion: "repo-integrity-v1",
    ok: issues.length === 0,
    indexVersion: parsed.version,
    indexEntries: parsed.count,
    checked,
    issueCount: issues.length,
    issues: issues.slice(0, options.issueLimit || 200),
    truncatedIssues: Math.max(0, issues.length - (options.issueLimit || 200)),
    durationMs: Date.now() - started,
  };
}
