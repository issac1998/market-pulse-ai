import assert from "node:assert/strict";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  archiveOldRunsToDrive,
  driveArchiveConfigFromEnv,
  driveArchiveMetadataIsVerified,
  driveArchiveRunEligible,
  loadDriveArchivedRun,
} from "../server/drive_archive.mjs";

function md5(buffer) {
  return crypto.createHash("md5").update(buffer).digest("hex");
}

function fakeRclone(remoteDir, options = {}) {
  const calls = [];
  const remoteFile = (value) => {
    const [, relative = ""] = String(value).split(":", 2);
    return path.join(remoteDir, relative);
  };
  const runner = async (_config, args) => {
    calls.push(args.slice());
    const [command, source, target] = args;
    if (command === "listremotes") return { ok: true, stdout: "market-pulse-drive:\n", stderr: "" };
    if (command === "copyto") {
      const sourceIsRemote = String(source).includes(":");
      const sourceFile = sourceIsRemote ? remoteFile(source) : source;
      const targetFile = String(target).includes(":") ? remoteFile(target) : target;
      await mkdir(path.dirname(targetFile), { recursive: true });
      await writeFile(targetFile, await readFile(sourceFile));
      return { ok: true, stdout: "", stderr: "" };
    }
    if (command === "lsjson") {
      const buffer = await readFile(remoteFile(source));
      const hash = options.badHash ? "0".repeat(32) : md5(buffer);
      return {
        ok: true,
        stdout: JSON.stringify({ Size: buffer.length, Hashes: { MD5: hash } }),
        stderr: "",
      };
    }
    if (command === "md5sum") {
      const buffer = await readFile(remoteFile(source));
      return { ok: true, stdout: `${md5(buffer)}  ${path.basename(source)}\n`, stderr: "" };
    }
    return { ok: false, stdout: "", stderr: `unsupported fake command ${command}` };
  };
  runner.calls = calls;
  return runner;
}

async function run() {
  const root = await mkdtemp(path.join(os.tmpdir(), "market-pulse-drive-"));
  const localRunDir = path.join(root, "runs");
  const remoteDir = path.join(root, "remote");
  await mkdir(localRunDir, { recursive: true });
  const config = driveArchiveConfigFromEnv({
    dataDir: root,
    localRunDir,
    env: {
      DRIVE_ARCHIVE_ENABLED: "true",
      DRIVE_ARCHIVE_REMOTE: "market-pulse-drive",
      DRIVE_ARCHIVE_BASE_PATH: "MarketPulseAI",
      DRIVE_ARCHIVE_AFTER_DAYS: "30",
      DRIVE_ARCHIVE_BATCH_LIMIT: "10",
      DRIVE_ARCHIVE_DELETE_LOCAL_AFTER_VERIFY: "true",
    },
  });
  const now = Date.UTC(2026, 6, 11, 0, 0, 0);
  const oldRun = {
    id: "old-pre",
    completedAt: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(),
    summaryOnly: true,
    archiveFile: path.join(localRunDir, "old-pre.json"),
  };
  const recentRun = {
    id: "recent-pre",
    completedAt: new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString(),
    summaryOnly: true,
    archiveFile: path.join(localRunDir, "recent-pre.json"),
  };
  await writeFile(oldRun.archiveFile, JSON.stringify({ id: oldRun.id, payload: "old report" }));
  await writeFile(recentRun.archiveFile, JSON.stringify({ id: recentRun.id, payload: "recent report" }));

  assert.equal(driveArchiveRunEligible(config, oldRun, now), true);
  assert.equal(driveArchiveRunEligible(config, recentRun, now), false);

  const runner = fakeRclone(remoteDir);
  const result = await archiveOldRunsToDrive(config, [oldRun, recentRun], {
    now,
    runCommand: runner,
    deleteLocalAfterVerify: false,
  });
  assert.equal(result.status, "ok");
  assert.equal(result.verified, 1);
  assert.equal(existsSync(oldRun.archiveFile), true, "verified metadata must persist before local pruning");
  assert.equal(existsSync(recentRun.archiveFile), true, "recent archive must stay local");
  assert.equal(driveArchiveMetadataIsVerified(oldRun.driveArchive), true);

  const resumed = await archiveOldRunsToDrive(config, [oldRun, recentRun], {
    now,
    runCommand: runner,
    deleteLocalAfterVerify: false,
  });
  assert.equal(resumed.rows[0]?.status, "already_verified", "a restart must resume from persisted metadata");

  const pruned = await archiveOldRunsToDrive(config, [oldRun, recentRun], {
    now,
    runCommand: runner,
    runIds: [oldRun.id],
    deleteLocalAfterVerify: true,
  });
  assert.equal(pruned.pruned, 1);
  assert.equal(existsSync(oldRun.archiveFile), false, "verified old archive should be removed in phase two");

  const downloaded = await loadDriveArchivedRun(config, oldRun, { runCommand: runner });
  assert.equal(downloaded.source, "google-drive");
  assert.equal(downloaded.run.payload, "old report");
  const cached = await loadDriveArchivedRun(config, oldRun, { runCommand: runner });
  assert.equal(cached.source, "drive-cache");

  const failedRun = {
    id: "bad-hash-post",
    completedAt: oldRun.completedAt,
    summaryOnly: true,
    archiveFile: path.join(localRunDir, "bad-hash-post.json"),
  };
  await writeFile(failedRun.archiveFile, JSON.stringify({ id: failedRun.id, payload: "keep me" }));
  const failed = await archiveOldRunsToDrive(config, [failedRun], {
    now,
    runCommand: fakeRclone(remoteDir, { badHash: true }),
  });
  assert.equal(failed.failed, 1);
  assert.equal(existsSync(failedRun.archiveFile), true, "hash mismatch must preserve local archive");
  assert.equal(failedRun.driveArchive.status, "failed");

  const cacheStat = await stat(path.join(config.cacheDir, "old-pre.json"));
  assert.ok(cacheStat.size > 0);
  await rm(root, { recursive: true, force: true });
  console.log("drive_archive_tests: ok");
}

await run();
