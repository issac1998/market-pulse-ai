import { readdir, readFile, rename, stat, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const SECTIONED_STORE_MANIFEST = "_manifest.json";

function sha256Text(value = "") {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function sectionFileName(key = "") {
  const normalized = String(key || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error(`Invalid store section key: ${normalized}`);
  }
  return `${normalized}.json`;
}

async function atomicWriteText(file, payload) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(temp, payload, "utf8");
  await rename(temp, file);
}

function stringifySection(value, pretty = false) {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

export async function readSectionedStore(storeDir) {
  if (!existsSync(storeDir)) {
    return {
      exists: false,
      store: {},
      sectionHashes: {},
      sectionBytes: {},
      totalBytes: 0,
      maxMtimeMs: 0,
      errors: [],
    };
  }
  const files = (await readdir(storeDir)).filter((file) => file.endsWith(".json") && file !== SECTIONED_STORE_MANIFEST);
  const store = {};
  const sectionHashes = {};
  const sectionBytes = {};
  const errors = [];
  let totalBytes = 0;
  let maxMtimeMs = 0;
  for (const file of files.sort()) {
    const key = file.replace(/\.json$/, "");
    if (!/^[A-Za-z0-9_-]+$/.test(key)) continue;
    const fullPath = path.join(storeDir, file);
    try {
      const [raw, fileStat] = await Promise.all([readFile(fullPath, "utf8"), stat(fullPath)]);
      store[key] = raw ? JSON.parse(raw) : null;
      sectionHashes[key] = sha256Text(raw);
      sectionBytes[key] = Buffer.byteLength(raw, "utf8");
      totalBytes += sectionBytes[key];
      maxMtimeMs = Math.max(maxMtimeMs, Number(fileStat.mtimeMs || 0));
    } catch (error) {
      errors.push({ file: fullPath, error: error.message });
    }
  }
  return {
    exists: files.length > 0,
    store,
    sectionHashes,
    sectionBytes,
    totalBytes,
    maxMtimeMs,
    errors,
    fullHash: sha256Text(JSON.stringify(sectionHashes)),
  };
}

export async function writeSectionedStore(storeDir, store, options = {}) {
  const pretty = Boolean(options.pretty);
  const previousHashes = options.previousHashes || {};
  const sectionHashes = {};
  const sectionBytes = {};
  const written = [];
  const skipped = [];
  await mkdir(storeDir, { recursive: true });
  for (const [key, value] of Object.entries(store || {})) {
    const payload = stringifySection(value, pretty);
    const hash = sha256Text(payload);
    sectionHashes[key] = hash;
    sectionBytes[key] = Buffer.byteLength(payload, "utf8");
    const file = path.join(storeDir, sectionFileName(key));
    if (previousHashes[key] === hash && existsSync(file)) {
      skipped.push(key);
      continue;
    }
    await atomicWriteText(file, payload);
    written.push(key);
  }
  const manifest = {
    schemaVersion: "sectioned-store-v1",
    keys: Object.keys(sectionHashes).sort(),
    sectionHashes,
    sectionBytes,
  };
  const manifestPayload = stringifySection(manifest, pretty);
  const manifestFile = path.join(storeDir, SECTIONED_STORE_MANIFEST);
  let manifestWritten = true;
  let manifestReadError = "";
  try {
    if (existsSync(manifestFile) && (await readFile(manifestFile, "utf8")) === manifestPayload) {
      manifestWritten = false;
    } else {
      await atomicWriteText(manifestFile, manifestPayload);
    }
  } catch (error) {
    manifestReadError = error?.message || String(error);
    await atomicWriteText(manifestFile, manifestPayload);
  }

  let legacyMigration = null;
  if (options.migrateLegacy && options.legacyFile && options.legacyBackupFile && existsSync(options.legacyFile)) {
    if (!existsSync(options.legacyBackupFile)) {
      await rename(options.legacyFile, options.legacyBackupFile);
      legacyMigration = {
        status: "renamed",
        from: options.legacyFile,
        to: options.legacyBackupFile,
      };
    } else {
      legacyMigration = {
        status: "backup_exists",
        from: options.legacyFile,
        to: options.legacyBackupFile,
      };
    }
  }

  return {
    schemaVersion: "sectioned-store-write-v1",
    storeDir,
    sectionHashes,
    sectionBytes,
    fullHash: sha256Text(JSON.stringify(sectionHashes)),
    totalBytes: Object.values(sectionBytes).reduce((sum, value) => sum + Number(value || 0), 0),
    written,
    skipped,
    manifestBytes: Buffer.byteLength(manifestPayload, "utf8"),
    manifestWritten,
    manifestReadError,
    legacyMigration,
  };
}
