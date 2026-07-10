import crypto from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { parseBoolean } from "./env_utils.mjs";
import { execFileText, isCliCommandAvailable } from "./runtime_utils.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const downloadLocks = new Map();

function positiveNumber(value, fallback, minimum = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function safeRunId(value = "") {
  return String(value || "").replace(/[^A-Za-z0-9_.-]/g, "_");
}

function cleanRemoteName(value = "") {
  return String(value || "").trim().replace(/:+$/, "");
}

function cleanRemoteBasePath(value = "") {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.{2,}/g, ".");
}

export function driveArchiveConfigFromEnv(options = {}) {
  const env = options.env || process.env;
  const dataDir = path.resolve(options.dataDir || "data");
  const localRunDir = path.resolve(options.localRunDir || path.join(dataDir, "runs"));
  const cacheDir = path.resolve(
    dataDir,
    env.DRIVE_ARCHIVE_CACHE_DIR || path.join("cache", "drive-runs"),
  );
  return {
    schemaVersion: "drive-archive-config-v1",
    enabled: parseBoolean(env.DRIVE_ARCHIVE_ENABLED, false),
    command: String(env.DRIVE_ARCHIVE_RCLONE_COMMAND || "rclone").trim() || "rclone",
    remote: cleanRemoteName(env.DRIVE_ARCHIVE_REMOTE || "market-pulse-drive"),
    basePath: cleanRemoteBasePath(env.DRIVE_ARCHIVE_BASE_PATH || "MarketPulseAI"),
    afterDays: positiveNumber(env.DRIVE_ARCHIVE_AFTER_DAYS, 30),
    batchLimit: positiveNumber(env.DRIVE_ARCHIVE_BATCH_LIMIT, 3),
    timeoutMs: positiveNumber(env.DRIVE_ARCHIVE_TIMEOUT_MS, 30 * 60 * 1000, 1000),
    intervalMs: positiveNumber(env.DRIVE_ARCHIVE_INTERVAL_MS, 6 * 60 * 60 * 1000, 60_000),
    cacheTtlHours: positiveNumber(env.DRIVE_ARCHIVE_CACHE_TTL_HOURS, 24),
    deleteLocalAfterVerify: parseBoolean(env.DRIVE_ARCHIVE_DELETE_LOCAL_AFTER_VERIFY, true),
    localRunDir,
    cacheDir,
  };
}

export function driveArchiveRemotePath(config = {}, runId = "") {
  const id = safeRunId(runId);
  if (!id || !config.remote) return "";
  const relative = [config.basePath, "runs", `${id}.json`].filter(Boolean).join("/");
  return `${cleanRemoteName(config.remote)}:${relative}`;
}

export function driveArchiveLocalPath(config = {}, run = {}) {
  const id = safeRunId(run?.id);
  if (!id) return "";
  return run.archiveFile || path.join(config.localRunDir, `${id}.json`);
}

function runCompletedTime(run = {}) {
  const value = new Date(run.completedAt || run.startedAt || 0).getTime();
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function driveArchiveRunEligible(config = {}, run = {}, now = Date.now()) {
  const completedAt = runCompletedTime(run);
  return Boolean(
    run?.id &&
      completedAt &&
      now - completedAt >= positiveNumber(config.afterDays, 30) * DAY_MS,
  );
}

export function driveArchiveMetadataIsVerified(value = {}) {
  return Boolean(
    value &&
      value.provider === "google-drive-rclone" &&
      value.status === "verified" &&
      value.remotePath &&
      Number(value.sizeBytes) > 0 &&
      (value.md5 || value.sha256),
  );
}

async function hashFile(file, algorithm) {
  const hash = crypto.createHash(algorithm);
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function localFileIdentity(file) {
  const fileStat = await stat(file);
  const [md5, sha256] = await Promise.all([hashFile(file, "md5"), hashFile(file, "sha256")]);
  return { sizeBytes: Number(fileStat.size), md5, sha256 };
}

async function defaultRunCommand(config, args) {
  return execFileText(config.command, args, config.timeoutMs);
}

function commandFailure(label, result = {}) {
  const detail = String(result.stderr || result.error || result.stdout || "未知错误").trim();
  const error = new Error(`${label}失败：${detail.slice(0, 600)}`);
  error.code = "DRIVE_ARCHIVE_COMMAND_FAILED";
  return error;
}

async function runRclone(config, args, options = {}) {
  const runner = options.runCommand || defaultRunCommand;
  const result = await runner(config, args);
  if (!result?.ok) throw commandFailure(`rclone ${args[0] || "command"} `, result);
  return result;
}

function parseHashLine(value = "") {
  const match = String(value || "").trim().match(/^([a-fA-F0-9]{32,64})\s+/);
  return match?.[1]?.toLowerCase() || "";
}

async function configuredRemotes(config, options = {}) {
  if (!isCliCommandAvailable(config.command) && !options.runCommand) return [];
  try {
    const result = await runRclone(config, ["listremotes"], options);
    return String(result.stdout || "")
      .split(/\r?\n/)
      .map((item) => cleanRemoteName(item))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function verifyRemoteFile(config, remotePath, localIdentity, options = {}) {
  const statResult = await runRclone(config, ["lsjson", remotePath, "--stat", "--hash"], options);
  let remoteStat;
  try {
    remoteStat = JSON.parse(statResult.stdout || "{}");
  } catch {
    throw new Error("Google Drive 远端文件状态不是合法 JSON，不能安全删除本地归档。");
  }
  const remoteSize = Number(remoteStat.Size);
  let remoteMd5 = String(remoteStat.Hashes?.MD5 || remoteStat.Hashes?.md5 || "").toLowerCase();
  if (!remoteMd5) {
    const hashResult = await runRclone(config, ["md5sum", remotePath], options);
    remoteMd5 = parseHashLine(hashResult.stdout);
  }
  const sizeMatches = remoteSize === localIdentity.sizeBytes;
  const hashMatches = Boolean(remoteMd5 && remoteMd5 === localIdentity.md5.toLowerCase());
  return {
    verified: sizeMatches && hashMatches,
    remoteSize,
    remoteMd5,
    sizeMatches,
    hashMatches,
  };
}

async function archiveOneRun(config, run, options = {}) {
  const localFile = driveArchiveLocalPath(config, run);
  const remotePath = driveArchiveRemotePath(config, run.id);
  const attemptedAt = new Date().toISOString();
  if (!localFile || !existsSync(localFile)) {
    return { status: "missing_local", runId: run.id, localFile, remotePath };
  }
  if (driveArchiveMetadataIsVerified(run.driveArchive)) {
    const identity = await localFileIdentity(localFile);
    const metadata = run.driveArchive;
    const identityMatches =
      Number(metadata.sizeBytes) === identity.sizeBytes &&
      (!metadata.md5 || String(metadata.md5).toLowerCase() === identity.md5) &&
      (!metadata.sha256 || String(metadata.sha256).toLowerCase() === identity.sha256);
    if (!identityMatches) {
      metadata.localPruneStatus = "blocked";
      metadata.localPruneError = "本地归档与已验证的 Drive 元数据不一致，已保留本地文件。";
      return {
        status: "failed",
        runId: run.id,
        localFile,
        remotePath,
        error: "本地归档与已验证的 Drive 元数据不一致，已保留本地文件。",
      };
    }
    if (config.deleteLocalAfterVerify && options.deleteLocalAfterVerify !== false) {
      await unlink(localFile);
      metadata.localDeleted = true;
      metadata.localDeletedAt = new Date().toISOString();
      metadata.localPruneStatus = "pruned";
      metadata.localPruneError = "";
      return { status: "pruned", runId: run.id, localFile, remotePath, metadata };
    }
    return { status: "already_verified", runId: run.id, localFile, remotePath, metadata };
  }
  if (options.dryRun) {
    const identity = await localFileIdentity(localFile);
    return { status: "dry_run", runId: run.id, localFile, remotePath, ...identity };
  }
  try {
    const identity = await localFileIdentity(localFile);
    await runRclone(config, ["copyto", localFile, remotePath, "--metadata"], options);
    const verification = await verifyRemoteFile(config, remotePath, identity, options);
    if (!verification.verified) {
      throw new Error(
        `Google Drive 校验失败（size=${verification.sizeMatches ? "ok" : "mismatch"}，md5=${verification.hashMatches ? "ok" : "mismatch"}），已保留本地文件。`,
      );
    }
    const metadata = {
      schemaVersion: "drive-run-archive-v1",
      provider: "google-drive-rclone",
      status: "verified",
      remote: config.remote,
      remotePath,
      sizeBytes: identity.sizeBytes,
      md5: identity.md5,
      sha256: identity.sha256,
      uploadedAt: attemptedAt,
      verifiedAt: new Date().toISOString(),
      localDeleted: false,
      localDeletedAt: "",
      localPruneStatus: "pending",
      localPruneError: "",
      lastError: "",
    };
    if (config.deleteLocalAfterVerify && options.deleteLocalAfterVerify !== false) {
      await unlink(localFile);
      metadata.localDeleted = true;
      metadata.localDeletedAt = new Date().toISOString();
    }
    run.driveArchive = metadata;
    return { status: "verified", runId: run.id, localFile, remotePath, metadata };
  } catch (error) {
    run.driveArchive = {
      ...(run.driveArchive || {}),
      schemaVersion: "drive-run-archive-v1",
      provider: "google-drive-rclone",
      status: "failed",
      remote: config.remote,
      remotePath,
      lastAttemptAt: attemptedAt,
      lastError: error.message,
    };
    return { status: "failed", runId: run.id, localFile, remotePath, error: error.message };
  }
}

export async function archiveOldRunsToDrive(config = {}, runs = [], options = {}) {
  const startedAt = new Date().toISOString();
  if (!config.enabled && !options.ignoreDisabled) {
    return { schemaVersion: "drive-archive-run-v1", status: "disabled", startedAt, completedAt: startedAt, rows: [] };
  }
  const remotes = await configuredRemotes(config, options);
  if (!remotes.includes(cleanRemoteName(config.remote))) {
    return {
      schemaVersion: "drive-archive-run-v1",
      status: "not_configured",
      startedAt,
      completedAt: new Date().toISOString(),
      remote: config.remote,
      rows: [],
      error: `rclone remote ${config.remote}: 尚未配置。`,
    };
  }
  const now = Number(options.now || Date.now());
  const allowedRunIds = Array.isArray(options.runIds)
    ? new Set(options.runIds.map((item) => String(item || "")).filter(Boolean))
    : null;
  const candidates = (runs || [])
    .filter((run) => driveArchiveRunEligible(config, run, now))
    .filter((run) => !allowedRunIds || allowedRunIds.has(String(run.id || "")))
    .filter((run) => !driveArchiveMetadataIsVerified(run.driveArchive) || existsSync(driveArchiveLocalPath(config, run)))
    .slice(0, positiveNumber(options.batchLimit, config.batchLimit));
  const rows = [];
  for (const run of candidates) {
    rows.push(await archiveOneRun(config, run, options));
  }
  const failed = rows.filter((row) => row.status === "failed").length;
  const verified = rows.filter((row) => row.status === "verified").length;
  const pruned = rows.filter((row) => row.status === "pruned").length;
  return {
    schemaVersion: "drive-archive-run-v1",
    status: failed ? "partial" : "ok",
    startedAt,
    completedAt: new Date().toISOString(),
    remote: config.remote,
    basePath: config.basePath,
    candidates: candidates.length,
    verified,
    pruned,
    failed,
    rows,
  };
}

async function validCachedRun(config, run, cacheFile) {
  if (!existsSync(cacheFile)) return null;
  const metadata = run.driveArchive || {};
  const fileStat = await stat(cacheFile);
  const ageMs = Date.now() - Number(fileStat.mtimeMs || 0);
  if (ageMs > positiveNumber(config.cacheTtlHours, 24) * 60 * 60 * 1000) return null;
  if (Number(metadata.sizeBytes) > 0 && Number(fileStat.size) !== Number(metadata.sizeBytes)) return null;
  if (metadata.sha256 && (await hashFile(cacheFile, "sha256")) !== String(metadata.sha256).toLowerCase()) return null;
  try {
    return JSON.parse(await readFile(cacheFile, "utf8"));
  } catch {
    return null;
  }
}

async function downloadRun(config, run, options = {}) {
  const metadata = run.driveArchive || {};
  if (!driveArchiveMetadataIsVerified(metadata)) return null;
  if (!isCliCommandAvailable(config.command) && !options.runCommand) {
    const error = new Error("历史报告位于 Google Drive，但本机 rclone 不可用。");
    error.statusCode = 503;
    throw error;
  }
  await mkdir(config.cacheDir, { recursive: true });
  const cacheFile = path.join(config.cacheDir, `${safeRunId(run.id)}.json`);
  const cached = await validCachedRun(config, run, cacheFile);
  if (cached) return { run: cached, source: "drive-cache", cacheFile };
  const tempFile = `${cacheFile}.${Date.now()}.tmp`;
  try {
    await runRclone(config, ["copyto", metadata.remotePath, tempFile], options);
    const identity = await localFileIdentity(tempFile);
    if (Number(metadata.sizeBytes) > 0 && identity.sizeBytes !== Number(metadata.sizeBytes)) {
      throw new Error("从 Google Drive 下载的历史报告大小与归档元数据不一致。");
    }
    if (metadata.sha256 && identity.sha256 !== String(metadata.sha256).toLowerCase()) {
      throw new Error("从 Google Drive 下载的历史报告 SHA256 校验失败。");
    }
    if (metadata.md5 && identity.md5 !== String(metadata.md5).toLowerCase()) {
      throw new Error("从 Google Drive 下载的历史报告 MD5 校验失败。");
    }
    const parsed = JSON.parse(await readFile(tempFile, "utf8"));
    await rename(tempFile, cacheFile);
    return { run: parsed, source: "google-drive", cacheFile };
  } catch (error) {
    if (existsSync(tempFile)) await unlink(tempFile).catch(() => {});
    error.statusCode ||= 503;
    throw error;
  }
}

export async function loadDriveArchivedRun(config = {}, run = {}, options = {}) {
  if (!driveArchiveMetadataIsVerified(run?.driveArchive)) return null;
  const id = safeRunId(run.id);
  if (!id) return null;
  if (downloadLocks.has(id)) return downloadLocks.get(id);
  const task = downloadRun(config, run, options).finally(() => downloadLocks.delete(id));
  downloadLocks.set(id, task);
  return task;
}

export async function cleanupDriveArchiveCache(config = {}, now = Date.now()) {
  if (!existsSync(config.cacheDir)) return { removed: 0, bytes: 0 };
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(config.cacheDir);
  let removed = 0;
  let bytes = 0;
  const ttlMs = positiveNumber(config.cacheTtlHours, 24) * 60 * 60 * 1000;
  for (const file of files.filter((item) => item.endsWith(".json"))) {
    const full = path.join(config.cacheDir, file);
    const fileStat = await stat(full).catch(() => null);
    if (!fileStat || now - Number(fileStat.mtimeMs || 0) <= ttlMs) continue;
    await unlink(full).catch(() => {});
    removed += 1;
    bytes += Number(fileStat.size || 0);
  }
  return { removed, bytes };
}

export async function driveArchiveStatus(config = {}, runs = [], options = {}) {
  const remotes = await configuredRemotes(config, options);
  const remoteConfigured = remotes.includes(cleanRemoteName(config.remote));
  const now = Number(options.now || Date.now());
  const eligible = (runs || []).filter((run) => driveArchiveRunEligible(config, run, now));
  const remoteOnly = eligible.filter(
    (run) => driveArchiveMetadataIsVerified(run.driveArchive) && !existsSync(driveArchiveLocalPath(config, run)),
  );
  const pending = eligible.filter(
    (run) => !driveArchiveMetadataIsVerified(run.driveArchive) && existsSync(driveArchiveLocalPath(config, run)),
  );
  const failed = eligible.filter((run) => run.driveArchive?.status === "failed");
  const pruneBlocked = eligible.filter((run) => run.driveArchive?.localPruneStatus === "blocked");
  return {
    schemaVersion: "drive-archive-status-v1",
    enabled: config.enabled,
    provider: "google-drive-rclone",
    command: config.command,
    commandAvailable: isCliCommandAvailable(config.command) || Boolean(options.runCommand),
    remote: config.remote,
    remoteConfigured,
    basePath: config.basePath,
    afterDays: config.afterDays,
    deleteLocalAfterVerify: config.deleteLocalAfterVerify,
    cacheTtlHours: config.cacheTtlHours,
    counts: {
      totalRuns: (runs || []).length,
      eligible: eligible.length,
      remoteOnly: remoteOnly.length,
      pending: pending.length,
      failed: failed.length + pruneBlocked.length,
    },
    lastFailure:
      failed[0]?.driveArchive?.lastError || pruneBlocked[0]?.driveArchive?.localPruneError || "",
    generatedAt: new Date().toISOString(),
  };
}
