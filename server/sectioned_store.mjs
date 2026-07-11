import { constants, existsSync } from "node:fs";
import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const SECTIONED_STORE_MANIFEST = "_manifest.json";
export const SECTIONED_STORE_GENERATIONS_DIR = "_generations";
export const SECTIONED_STORE_STAGING_DIR = "_staging";
export const SECTIONED_STORE_LEGACY_DIR = "_legacy";

const FLAT_SCHEMA_VERSION = "sectioned-store-v1";
const ROOT_SCHEMA_VERSION = "sectioned-store-v2";
const GENERATION_SCHEMA_VERSION = "sectioned-store-generation-v2";
const WRITE_SCHEMA_VERSION = "sectioned-store-write-v2";
const DEFAULT_MAX_GENERATIONS = 3;
const SECTION_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const GENERATION_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export class SectionedStoreIntegrityError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SectionedStoreIntegrityError";
    this.code = details.code || "SECTIONED_STORE_INTEGRITY";
    this.details = details;
  }
}

function integrityError(message, details = {}) {
  return new SectionedStoreIntegrityError(message, details);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Text(value = "") {
  return sha256(Buffer.from(String(value), "utf8"));
}

function validSectionKey(key) {
  return typeof key === "string" && key === key.trim() && SECTION_KEY_PATTERN.test(key) && key !== "_manifest";
}

function sectionFileName(key = "") {
  if (!validSectionKey(key)) {
    throw new Error(`Invalid store section key: ${String(key)}`);
  }
  return `${key}.json`;
}

function validGeneration(value) {
  return typeof value === "string" && GENERATION_PATTERN.test(value);
}

function generationId() {
  return `${String(Date.now()).padStart(13, "0")}-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
}

function stringifyJson(value, pretty = false) {
  const payload = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  if (typeof payload !== "string") {
    throw new TypeError("Store sections must be JSON-serializable values");
  }
  return payload;
}

function fullHashFor(keys, sectionHashes) {
  const orderedHashes = Object.fromEntries(keys.map((key) => [key, sectionHashes[key]]));
  return sha256Text(JSON.stringify(orderedHashes));
}

function emptyReadResult() {
  return {
    exists: false,
    store: {},
    sectionHashes: {},
    sectionBytes: {},
    totalBytes: 0,
    maxMtimeMs: 0,
    errors: [],
    fullHash: fullHashFor([], {}),
    sourceFormat: null,
    generation: null,
    activeGeneration: null,
    recovered: false,
    migrationRequired: false,
  };
}

async function syncFile(file) {
  const handle = await open(file, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(dir) {
  const handle = await open(dir, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function durableWriteFile(file, payload, flag = "w") {
  await mkdir(path.dirname(file), { recursive: true });
  const handle = await open(file, flag);
  try {
    await handle.writeFile(payload);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function atomicWriteFile(file, payload) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${generationId()}.tmp`;
  await durableWriteFile(temp, payload, "wx");
  await rename(temp, file);
  await syncDirectory(path.dirname(file));
}

async function cloneOrCopyFile(source, destination) {
  try {
    await copyFile(source, destination, constants.COPYFILE_FICLONE);
  } catch (error) {
    if (!["EINVAL", "ENOSYS", "ENOTSUP", "EOPNOTSUPP"].includes(error?.code)) throw error;
    await copyFile(source, destination);
  }
  await syncFile(destination);
}

function parseManifest(raw, file) {
  try {
    const parsed = JSON.parse(raw.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("manifest root must be an object");
    }
    return parsed;
  } catch (error) {
    throw integrityError(`Cannot parse sectioned-store manifest ${file}: ${error.message}`, {
      code: "SECTIONED_STORE_MANIFEST_PARSE",
      file,
      cause: error.message,
    });
  }
}

function validateSectionMetadata(manifest, file, { requireSections = false, requireTotalBytes = false } = {}) {
  if (!Array.isArray(manifest.keys)) {
    throw integrityError(`Manifest ${file} does not contain a complete keys array`, {
      code: "SECTIONED_STORE_MANIFEST_KEYS",
      file,
    });
  }
  const keys = [...manifest.keys];
  if (keys.some((key) => !validSectionKey(key))) {
    throw integrityError(`Manifest ${file} contains an invalid section key`, {
      code: "SECTIONED_STORE_MANIFEST_KEYS",
      file,
    });
  }
  if (new Set(keys).size !== keys.length || keys.some((key, index) => key !== [...keys].sort()[index])) {
    throw integrityError(`Manifest ${file} keys must be unique and sorted`, {
      code: "SECTIONED_STORE_MANIFEST_KEYS",
      file,
    });
  }
  if (!manifest.sectionHashes || typeof manifest.sectionHashes !== "object" || Array.isArray(manifest.sectionHashes)) {
    throw integrityError(`Manifest ${file} is missing sectionHashes`, {
      code: "SECTIONED_STORE_MANIFEST_HASHES",
      file,
    });
  }
  if (!manifest.sectionBytes || typeof manifest.sectionBytes !== "object" || Array.isArray(manifest.sectionBytes)) {
    throw integrityError(`Manifest ${file} is missing sectionBytes`, {
      code: "SECTIONED_STORE_MANIFEST_BYTES",
      file,
    });
  }
  const hashKeys = Object.keys(manifest.sectionHashes).sort();
  const byteKeys = Object.keys(manifest.sectionBytes).sort();
  if (JSON.stringify(hashKeys) !== JSON.stringify(keys) || JSON.stringify(byteKeys) !== JSON.stringify(keys)) {
    throw integrityError(`Manifest ${file} metadata does not cover the complete key set`, {
      code: "SECTIONED_STORE_MANIFEST_INCOMPLETE",
      file,
    });
  }

  const sectionHashes = Object.fromEntries(keys.map((key) => [key, manifest.sectionHashes[key]]));
  const sectionBytes = Object.fromEntries(keys.map((key) => [key, manifest.sectionBytes[key]]));
  for (const key of keys) {
    if (!SHA256_PATTERN.test(sectionHashes[key])) {
      throw integrityError(`Manifest ${file} has an invalid SHA-256 for section ${key}`, {
        code: "SECTIONED_STORE_MANIFEST_HASHES",
        file,
        key,
      });
    }
    if (!Number.isSafeInteger(sectionBytes[key]) || sectionBytes[key] < 0) {
      throw integrityError(`Manifest ${file} has an invalid byte size for section ${key}`, {
        code: "SECTIONED_STORE_MANIFEST_BYTES",
        file,
        key,
      });
    }
  }

  const totalBytes = keys.reduce((sum, key) => sum + sectionBytes[key], 0);
  if (requireTotalBytes && manifest.totalBytes !== totalBytes) {
    throw integrityError(`Manifest ${file} totalBytes does not match its sections`, {
      code: "SECTIONED_STORE_MANIFEST_BYTES",
      file,
    });
  }

  if (requireSections) {
    if (!manifest.sections || typeof manifest.sections !== "object" || Array.isArray(manifest.sections)) {
      throw integrityError(`Manifest ${file} is missing sections metadata`, {
        code: "SECTIONED_STORE_MANIFEST_INCOMPLETE",
        file,
      });
    }
    if (JSON.stringify(Object.keys(manifest.sections).sort()) !== JSON.stringify(keys)) {
      throw integrityError(`Manifest ${file} sections metadata is incomplete`, {
        code: "SECTIONED_STORE_MANIFEST_INCOMPLETE",
        file,
      });
    }
    for (const key of keys) {
      const section = manifest.sections[key];
      if (!section || section.sha256 !== sectionHashes[key] || section.bytes !== sectionBytes[key]) {
        throw integrityError(`Manifest ${file} has inconsistent metadata for section ${key}`, {
          code: "SECTIONED_STORE_MANIFEST_INCOMPLETE",
          file,
          key,
        });
      }
    }
  }

  return { keys, sectionHashes, sectionBytes, totalBytes };
}

function sameMetadata(left, right) {
  return (
    JSON.stringify(left.keys) === JSON.stringify(right.keys) &&
    JSON.stringify(left.sectionHashes) === JSON.stringify(right.sectionHashes) &&
    JSON.stringify(left.sectionBytes) === JSON.stringify(right.sectionBytes) &&
    left.totalBytes === right.totalBytes
  );
}

async function validateSnapshot({ baseDir, manifest, manifestFile, manifestStat, requireSections, requireTotalBytes }) {
  const metadata = validateSectionMetadata(manifest, manifestFile, { requireSections, requireTotalBytes });
  let entries;
  try {
    entries = await readdir(baseDir, { withFileTypes: true });
  } catch (error) {
    throw integrityError(`Cannot inspect sectioned-store snapshot ${baseDir}: ${error.message}`, {
      code: "SECTIONED_STORE_SNAPSHOT_READ",
      file: baseDir,
      cause: error.message,
    });
  }
  const actualFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== SECTIONED_STORE_MANIFEST)
    .map((entry) => entry.name)
    .sort();
  const expectedFiles = metadata.keys.map((key) => sectionFileName(key)).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    const missing = expectedFiles.filter((file) => !actualFiles.includes(file));
    const unexpected = actualFiles.filter((file) => !expectedFiles.includes(file));
    throw integrityError(
      `Snapshot ${baseDir} does not match its complete key set (missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"})`,
      {
        code: "SECTIONED_STORE_SECTION_SET",
        file: baseDir,
        missing,
        unexpected,
        key: missing[0]?.replace(/\.json$/, ""),
      },
    );
  }

  const values = [];
  let maxMtimeMs = Number(manifestStat?.mtimeMs || 0);
  for (const key of metadata.keys) {
    const file = path.join(baseDir, sectionFileName(key));
    let raw;
    let fileStat;
    try {
      [raw, fileStat] = await Promise.all([readFile(file), stat(file)]);
    } catch (error) {
      throw integrityError(`Cannot read section ${key} from ${file}: ${error.message}`, {
        code: "SECTIONED_STORE_SECTION_READ",
        file,
        key,
        cause: error.message,
      });
    }
    if (raw.byteLength !== metadata.sectionBytes[key]) {
      throw integrityError(
        `Section ${key} byte size mismatch in ${file}: expected ${metadata.sectionBytes[key]}, got ${raw.byteLength}`,
        {
          code: "SECTIONED_STORE_SECTION_BYTES",
          file,
          key,
          expected: metadata.sectionBytes[key],
          actual: raw.byteLength,
        },
      );
    }
    const actualHash = sha256(raw);
    if (actualHash !== metadata.sectionHashes[key]) {
      throw integrityError(`Section ${key} SHA-256 mismatch in ${file}`, {
        code: "SECTIONED_STORE_SECTION_HASH",
        file,
        key,
        expected: metadata.sectionHashes[key],
        actual: actualHash,
      });
    }
    try {
      values.push([key, JSON.parse(raw.toString("utf8"))]);
    } catch (error) {
      throw integrityError(`Cannot parse section ${key} from ${file}: ${error.message}`, {
        code: "SECTIONED_STORE_SECTION_PARSE",
        file,
        key,
        cause: error.message,
      });
    }
    maxMtimeMs = Math.max(maxMtimeMs, Number(fileStat.mtimeMs || 0));
  }

  return {
    store: Object.fromEntries(values),
    ...metadata,
    maxMtimeMs,
    sectionDir: baseDir,
  };
}

function validateGenerationDescriptor(descriptor, rootFile) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    throw integrityError(`Root manifest ${rootFile} contains an invalid generation descriptor`, {
      code: "SECTIONED_STORE_GENERATION_HISTORY",
      file: rootFile,
    });
  }
  if (!validGeneration(descriptor.generation)) {
    throw integrityError(`Root manifest ${rootFile} contains an invalid generation id`, {
      code: "SECTIONED_STORE_GENERATION_HISTORY",
      file: rootFile,
    });
  }
  if (!Number.isSafeInteger(descriptor.manifestBytes) || descriptor.manifestBytes <= 0) {
    throw integrityError(`Root manifest ${rootFile} has invalid manifestBytes for ${descriptor.generation}`, {
      code: "SECTIONED_STORE_GENERATION_HISTORY",
      file: rootFile,
      generation: descriptor.generation,
    });
  }
  if (!SHA256_PATTERN.test(descriptor.manifestSha256)) {
    throw integrityError(`Root manifest ${rootFile} has invalid manifestSha256 for ${descriptor.generation}`, {
      code: "SECTIONED_STORE_GENERATION_HISTORY",
      file: rootFile,
      generation: descriptor.generation,
    });
  }
  return descriptor;
}

function validateLegacyDescriptor(descriptor, rootFile) {
  if (!descriptor) return null;
  validateGenerationDescriptor({ ...descriptor, generation: descriptor.id }, rootFile);
  if (!String(descriptor.id).startsWith("flat-")) {
    throw integrityError(`Root manifest ${rootFile} has an invalid legacy flat id`, {
      code: "SECTIONED_STORE_LEGACY_DESCRIPTOR",
      file: rootFile,
    });
  }
  return descriptor;
}

function validateRootManifest(manifest, rootFile) {
  if (manifest.schemaVersion !== ROOT_SCHEMA_VERSION) {
    throw integrityError(`Unsupported sectioned-store schema ${String(manifest.schemaVersion)} in ${rootFile}`, {
      code: "SECTIONED_STORE_SCHEMA",
      file: rootFile,
    });
  }
  if (!validGeneration(manifest.activeGeneration) || !Array.isArray(manifest.generations) || !manifest.generations.length) {
    throw integrityError(`Root manifest ${rootFile} is missing its committed generation history`, {
      code: "SECTIONED_STORE_GENERATION_HISTORY",
      file: rootFile,
    });
  }
  const generations = manifest.generations.map((descriptor) => validateGenerationDescriptor(descriptor, rootFile));
  if (new Set(generations.map((descriptor) => descriptor.generation)).size !== generations.length) {
    throw integrityError(`Root manifest ${rootFile} contains duplicate generations`, {
      code: "SECTIONED_STORE_GENERATION_HISTORY",
      file: rootFile,
    });
  }
  if (generations.at(-1).generation !== manifest.activeGeneration) {
    throw integrityError(`Root manifest ${rootFile} activeGeneration is not the latest committed generation`, {
      code: "SECTIONED_STORE_GENERATION_HISTORY",
      file: rootFile,
    });
  }
  let activeMetadata = null;
  let activeMetadataError = null;
  try {
    activeMetadata = validateSectionMetadata(manifest, rootFile, {
      requireSections: true,
      requireTotalBytes: true,
    });
  } catch (error) {
    activeMetadataError = error;
  }
  return {
    activeMetadata,
    activeMetadataError,
    generations,
    legacyFlat: validateLegacyDescriptor(manifest.legacyFlat, rootFile),
  };
}

function serializeCandidateError(error, context = {}) {
  return {
    generation: context.generation || null,
    file: error?.details?.file || context.file || "",
    code: error?.code || "SECTIONED_STORE_INTEGRITY",
    error: error?.message || String(error),
  };
}

function resultFromSnapshot(snapshot, options = {}) {
  const activeGeneration = options.activeGeneration || null;
  const generation = options.generation || null;
  return {
    exists: true,
    store: snapshot.store,
    sectionHashes: snapshot.sectionHashes,
    sectionBytes: snapshot.sectionBytes,
    totalBytes: snapshot.totalBytes,
    maxMtimeMs: Math.max(snapshot.maxMtimeMs, Number(options.rootMtimeMs || 0)),
    errors: options.errors || [],
    fullHash: fullHashFor(snapshot.keys, snapshot.sectionHashes),
    sourceFormat: options.sourceFormat,
    generation,
    activeGeneration,
    recovered: Boolean(options.recovered),
    recoveredFromGeneration: options.recovered ? activeGeneration : null,
    migrationRequired: Boolean(options.migrationRequired),
    committedKeys: options.committedKeys || snapshot.keys,
    legacyMigration: options.legacyMigration || null,
  };
}

async function readGeneration(storeDir, descriptor, expectedActiveMetadata = null) {
  const generationDir = path.join(storeDir, SECTIONED_STORE_GENERATIONS_DIR, descriptor.generation);
  const manifestFile = path.join(generationDir, SECTIONED_STORE_MANIFEST);
  let raw;
  let manifestStat;
  try {
    [raw, manifestStat] = await Promise.all([readFile(manifestFile), stat(manifestFile)]);
  } catch (error) {
    throw integrityError(`Cannot read generation manifest ${manifestFile}: ${error.message}`, {
      code: "SECTIONED_STORE_GENERATION_MANIFEST_READ",
      file: manifestFile,
      generation: descriptor.generation,
      cause: error.message,
    });
  }
  if (raw.byteLength !== descriptor.manifestBytes || sha256(raw) !== descriptor.manifestSha256) {
    throw integrityError(`Generation manifest integrity mismatch for ${descriptor.generation}`, {
      code: "SECTIONED_STORE_GENERATION_MANIFEST_HASH",
      file: manifestFile,
      generation: descriptor.generation,
    });
  }
  const manifest = parseManifest(raw, manifestFile);
  if (manifest.schemaVersion !== GENERATION_SCHEMA_VERSION || manifest.generation !== descriptor.generation) {
    throw integrityError(`Generation manifest identity mismatch for ${descriptor.generation}`, {
      code: "SECTIONED_STORE_GENERATION_MANIFEST_ID",
      file: manifestFile,
      generation: descriptor.generation,
    });
  }
  const generationMetadata = validateSectionMetadata(manifest, manifestFile, {
    requireSections: true,
    requireTotalBytes: true,
  });
  if (expectedActiveMetadata && !sameMetadata(generationMetadata, expectedActiveMetadata)) {
    throw integrityError(`Root and generation metadata disagree for ${descriptor.generation}`, {
      code: "SECTIONED_STORE_GENERATION_METADATA",
      file: manifestFile,
      generation: descriptor.generation,
    });
  }
  return validateSnapshot({
    baseDir: generationDir,
    manifest,
    manifestFile,
    manifestStat,
    requireSections: true,
    requireTotalBytes: true,
  });
}

async function readLegacyFallback(storeDir, descriptor) {
  const manifestFile = path.join(storeDir, SECTIONED_STORE_LEGACY_DIR, descriptor.id, SECTIONED_STORE_MANIFEST);
  let raw;
  let manifestStat;
  try {
    [raw, manifestStat] = await Promise.all([readFile(manifestFile), stat(manifestFile)]);
  } catch (error) {
    throw integrityError(`Cannot read archived flat manifest ${manifestFile}: ${error.message}`, {
      code: "SECTIONED_STORE_LEGACY_MANIFEST_READ",
      file: manifestFile,
      generation: descriptor.id,
      cause: error.message,
    });
  }
  if (raw.byteLength !== descriptor.manifestBytes || sha256(raw) !== descriptor.manifestSha256) {
    throw integrityError(`Archived flat manifest integrity mismatch for ${descriptor.id}`, {
      code: "SECTIONED_STORE_LEGACY_MANIFEST_HASH",
      file: manifestFile,
      generation: descriptor.id,
    });
  }
  const manifest = parseManifest(raw, manifestFile);
  if (manifest.schemaVersion !== FLAT_SCHEMA_VERSION) {
    throw integrityError(`Archived flat manifest ${manifestFile} has an unsupported schema`, {
      code: "SECTIONED_STORE_SCHEMA",
      file: manifestFile,
      generation: descriptor.id,
    });
  }
  return validateSnapshot({
    baseDir: storeDir,
    manifest,
    manifestFile,
    manifestStat,
    requireSections: false,
    requireTotalBytes: false,
  });
}

async function readSectionedStoreInternal(storeDir) {
  if (!existsSync(storeDir)) {
    return { result: emptyReadResult(), kind: "absent", sectionDir: null };
  }
  const rootFile = path.join(storeDir, SECTIONED_STORE_MANIFEST);
  if (!existsSync(rootFile)) {
    const entries = await readdir(storeDir, { withFileTypes: true });
    const uncommittedFlatFiles = entries.filter(
      (entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== SECTIONED_STORE_MANIFEST,
    );
    if (uncommittedFlatFiles.length) {
      throw integrityError(`Sectioned store ${storeDir} has section files but no manifest`, {
        code: "SECTIONED_STORE_MANIFEST_MISSING",
        file: rootFile,
      });
    }
    return { result: emptyReadResult(), kind: "absent", sectionDir: null };
  }

  let rootRaw;
  let rootStat;
  try {
    [rootRaw, rootStat] = await Promise.all([readFile(rootFile), stat(rootFile)]);
  } catch (error) {
    throw integrityError(`Cannot read sectioned-store manifest ${rootFile}: ${error.message}`, {
      code: "SECTIONED_STORE_MANIFEST_READ",
      file: rootFile,
      cause: error.message,
    });
  }
  const rootManifest = parseManifest(rootRaw, rootFile);

  if (rootManifest.schemaVersion === FLAT_SCHEMA_VERSION) {
    const snapshot = await validateSnapshot({
      baseDir: storeDir,
      manifest: rootManifest,
      manifestFile: rootFile,
      manifestStat: rootStat,
      requireSections: false,
      requireTotalBytes: false,
    });
    const legacyMigration = {
      status: "pending_generation_write",
      mode: "read-only",
      sourceFormat: FLAT_SCHEMA_VERSION,
      sourcePreserved: true,
    };
    return {
      kind: "flat",
      rootManifest,
      rootRaw,
      rootStat,
      snapshot,
      sectionDir: storeDir,
      result: resultFromSnapshot(snapshot, {
        sourceFormat: "flat-v1",
        migrationRequired: true,
        rootMtimeMs: rootStat.mtimeMs,
        committedKeys: snapshot.keys,
        legacyMigration,
      }),
    };
  }

  const root = validateRootManifest(rootManifest, rootFile);
  const errors = [];
  for (let index = root.generations.length - 1; index >= 0; index -= 1) {
    const descriptor = root.generations[index];
    try {
      if (descriptor.generation === rootManifest.activeGeneration && root.activeMetadataError) {
        throw root.activeMetadataError;
      }
      const snapshot = await readGeneration(
        storeDir,
        descriptor,
        descriptor.generation === rootManifest.activeGeneration ? root.activeMetadata : null,
      );
      const recovered = descriptor.generation !== rootManifest.activeGeneration;
      return {
        kind: "generation",
        rootManifest,
        rootRaw,
        rootStat,
        root,
        descriptor,
        snapshot,
        sectionDir: snapshot.sectionDir,
        result: resultFromSnapshot(snapshot, {
          sourceFormat: "generation-v2",
          generation: descriptor.generation,
          activeGeneration: rootManifest.activeGeneration,
          recovered,
          errors,
          rootMtimeMs: rootStat.mtimeMs,
          committedKeys: root.activeMetadata?.keys || snapshot.keys,
        }),
      };
    } catch (error) {
      errors.push(serializeCandidateError(error, {
        generation: descriptor.generation,
        file: path.join(storeDir, SECTIONED_STORE_GENERATIONS_DIR, descriptor.generation),
      }));
    }
  }

  if (root.legacyFlat) {
    try {
      const snapshot = await readLegacyFallback(storeDir, root.legacyFlat);
      return {
        kind: "legacy-fallback",
        rootManifest,
        rootRaw,
        rootStat,
        root,
        descriptor: root.legacyFlat,
        snapshot,
        sectionDir: storeDir,
        result: resultFromSnapshot(snapshot, {
          sourceFormat: "flat-v1-fallback",
          generation: root.legacyFlat.id,
          activeGeneration: rootManifest.activeGeneration,
          recovered: true,
          errors,
          rootMtimeMs: rootStat.mtimeMs,
          committedKeys: root.activeMetadata?.keys || snapshot.keys,
          legacyMigration: {
            status: "fallback_read",
            mode: "read-only",
            sourceFormat: FLAT_SCHEMA_VERSION,
            sourcePreserved: true,
          },
        }),
      };
    } catch (error) {
      errors.push(serializeCandidateError(error, {
        generation: root.legacyFlat.id,
        file: storeDir,
      }));
    }
  }

  const summary = errors.map((entry) => `${entry.generation || "unknown"}: ${entry.error}`).join("; ");
  throw integrityError(`No valid committed sectioned-store snapshot remains in ${storeDir}: ${summary}`, {
    code: "SECTIONED_STORE_NO_VALID_GENERATION",
    file: rootFile,
    errors,
  });
}

export async function readSectionedStore(storeDir) {
  return (await readSectionedStoreInternal(storeDir)).result;
}

function serializeStore(store, pretty) {
  if (!store || typeof store !== "object" || Array.isArray(store)) {
    throw new TypeError("Sectioned store payload must be an object");
  }
  const keys = Object.keys(store).sort();
  const payloads = new Map();
  const sectionHashes = {};
  const sectionBytes = {};
  for (const key of keys) {
    sectionFileName(key);
    let payload;
    try {
      payload = stringifyJson(store[key], pretty);
    } catch (error) {
      throw new TypeError(`Cannot serialize store section ${key}: ${error.message}`);
    }
    const bytes = Buffer.from(payload, "utf8");
    payloads.set(key, bytes);
    sectionHashes[key] = sha256(bytes);
    sectionBytes[key] = bytes.byteLength;
  }
  const totalBytes = keys.reduce((sum, key) => sum + sectionBytes[key], 0);
  const sections = Object.fromEntries(
    keys.map((key) => [key, { bytes: sectionBytes[key], sha256: sectionHashes[key] }]),
  );
  return { keys, payloads, sectionHashes, sectionBytes, sections, totalBytes };
}

async function archiveFlatManifest(storeDir, state) {
  const currentRaw = await readFile(path.join(storeDir, SECTIONED_STORE_MANIFEST));
  if (sha256(currentRaw) !== sha256(state.rootRaw)) {
    throw integrityError(`Flat manifest changed while migrating ${storeDir}`, {
      code: "SECTIONED_STORE_CONCURRENT_MIGRATION",
      file: path.join(storeDir, SECTIONED_STORE_MANIFEST),
    });
  }
  const manifestSha256 = sha256(currentRaw);
  const id = `flat-${manifestSha256}`;
  const archiveDir = path.join(storeDir, SECTIONED_STORE_LEGACY_DIR, id);
  const archiveFile = path.join(archiveDir, SECTIONED_STORE_MANIFEST);
  await mkdir(archiveDir, { recursive: true });
  if (existsSync(archiveFile)) {
    const archived = await readFile(archiveFile);
    if (!archived.equals(currentRaw)) {
      throw integrityError(`Archived flat manifest collision at ${archiveFile}`, {
        code: "SECTIONED_STORE_LEGACY_ARCHIVE",
        file: archiveFile,
      });
    }
  } else {
    await durableWriteFile(archiveFile, currentRaw, "wx");
    await syncDirectory(archiveDir);
    await syncDirectory(path.dirname(archiveDir));
  }
  return {
    id,
    manifestBytes: currentRaw.byteLength,
    manifestSha256,
  };
}

async function copyLegacyWholeFile(options) {
  if (!options.migrateLegacy || !options.legacyFile || !options.legacyBackupFile || !existsSync(options.legacyFile)) {
    return null;
  }
  if (existsSync(options.legacyBackupFile)) {
    return {
      status: "backup_exists",
      from: options.legacyFile,
      to: options.legacyBackupFile,
      sourcePreserved: true,
    };
  }
  await mkdir(path.dirname(options.legacyBackupFile), { recursive: true });
  const temp = `${options.legacyBackupFile}.${generationId()}.tmp`;
  await cloneOrCopyFile(options.legacyFile, temp);
  await rename(temp, options.legacyBackupFile);
  await syncDirectory(path.dirname(options.legacyBackupFile));
  return {
    status: "copied",
    from: options.legacyFile,
    to: options.legacyBackupFile,
    sourcePreserved: true,
  };
}

function writeResult({
  storeDir,
  serialized,
  written,
  skipped,
  generation,
  manifestPayload,
  manifestWritten,
  manifestReadError = "",
  legacyMigration = null,
  flatMigration = null,
  generationGc = null,
}) {
  return {
    schemaVersion: WRITE_SCHEMA_VERSION,
    storeDir,
    generation,
    sectionHashes: serialized.sectionHashes,
    sectionBytes: serialized.sectionBytes,
    fullHash: fullHashFor(serialized.keys, serialized.sectionHashes),
    totalBytes: serialized.totalBytes,
    written,
    skipped,
    manifestBytes: manifestPayload.byteLength,
    manifestWritten,
    manifestReadError,
    legacyMigration: legacyMigration || flatMigration,
    flatMigration,
    generationGc,
  };
}

export async function writeSectionedStore(storeDir, store, options = {}) {
  const pretty = Boolean(options.pretty);
  const serialized = serializeStore(store, pretty);
  await mkdir(storeDir, { recursive: true });
  const previous = await readSectionedStoreInternal(storeDir);
  const requiredKeys = previous.result.committedKeys || Object.keys(previous.result.sectionHashes || {});
  const missingKeys = requiredKeys.filter((key) => !serialized.keys.includes(key));
  if (missingKeys.length) {
    throw integrityError(`Sectioned-store schema is append-only; refusing to remove keys: ${missingKeys.join(", ")}`, {
      code: "SECTIONED_STORE_SCHEMA_CONTRACTION",
      file: storeDir,
      missingKeys,
    });
  }

  const sameAsPrevious =
    previous.result.exists &&
    serialized.keys.length === Object.keys(previous.result.sectionHashes).length &&
    serialized.keys.every((key) => serialized.sectionHashes[key] === previous.result.sectionHashes[key]);
  const cleanGeneration = previous.kind === "generation" && !previous.result.recovered && sameAsPrevious;
  if (cleanGeneration) {
    const legacyMigration = await copyLegacyWholeFile(options);
    return writeResult({
      storeDir,
      serialized,
      written: [],
      skipped: serialized.keys,
      generation: previous.result.generation,
      manifestPayload: previous.rootRaw,
      manifestWritten: false,
      legacyMigration,
    });
  }

  const forceFullWrite = !previous.result.exists || previous.kind !== "generation" || previous.result.recovered;
  const written = forceFullWrite
    ? [...serialized.keys]
    : serialized.keys.filter((key) => serialized.sectionHashes[key] !== previous.result.sectionHashes[key]);
  const skipped = serialized.keys.filter((key) => !written.includes(key));
  const id = generationId();
  const stagingRoot = path.join(storeDir, SECTIONED_STORE_STAGING_DIR);
  const generationsRoot = path.join(storeDir, SECTIONED_STORE_GENERATIONS_DIR);
  const stagingDir = path.join(stagingRoot, id);
  const generationDir = path.join(generationsRoot, id);
  await Promise.all([
    mkdir(stagingRoot, { recursive: true }),
    mkdir(generationsRoot, { recursive: true }),
  ]);
  await mkdir(stagingDir);

  for (const key of serialized.keys) {
    const destination = path.join(stagingDir, sectionFileName(key));
    const canCopy =
      previous.result.exists &&
      previous.sectionDir &&
      previous.result.sectionHashes[key] === serialized.sectionHashes[key];
    if (canCopy) {
      try {
        await cloneOrCopyFile(path.join(previous.sectionDir, sectionFileName(key)), destination);
        continue;
      } catch {
        // The complete in-memory payload remains authoritative if a prior snapshot races with this write.
      }
    }
    await durableWriteFile(destination, serialized.payloads.get(key), "w");
  }

  const generationManifest = {
    schemaVersion: GENERATION_SCHEMA_VERSION,
    generation: id,
    createdAt: new Date().toISOString(),
    previousGeneration: previous.result.generation || null,
    keys: serialized.keys,
    sectionHashes: serialized.sectionHashes,
    sectionBytes: serialized.sectionBytes,
    sections: serialized.sections,
    totalBytes: serialized.totalBytes,
  };
  const generationManifestPayload = Buffer.from(stringifyJson(generationManifest, pretty), "utf8");
  const generationManifestFile = path.join(stagingDir, SECTIONED_STORE_MANIFEST);
  await durableWriteFile(generationManifestFile, generationManifestPayload, "w");

  for (let repaired = 0; ; repaired += 1) {
    try {
      await validateSnapshot({
        baseDir: stagingDir,
        manifest: generationManifest,
        manifestFile: generationManifestFile,
        manifestStat: await stat(generationManifestFile),
        requireSections: true,
        requireTotalBytes: true,
      });
      break;
    } catch (error) {
      const key = error?.details?.key;
      if (!key || !serialized.payloads.has(key) || repaired >= serialized.keys.length) throw error;
      await durableWriteFile(path.join(stagingDir, sectionFileName(key)), serialized.payloads.get(key), "w");
    }
  }

  await syncDirectory(stagingDir);
  await rename(stagingDir, generationDir);
  await syncDirectory(stagingRoot);
  await syncDirectory(generationsRoot);

  let legacyFlat = previous.kind === "flat" ? await archiveFlatManifest(storeDir, previous) : previous.rootManifest?.legacyFlat;
  const descriptor = {
    generation: id,
    manifestBytes: generationManifestPayload.byteLength,
    manifestSha256: sha256(generationManifestPayload),
  };
  const previousRoot = previous.rootManifest?.schemaVersion === ROOT_SCHEMA_VERSION ? previous.rootManifest : null;
  const allGenerations = previousRoot ? [...previousRoot.generations, descriptor] : [descriptor];
  const maxGenerations = Math.max(2, Math.min(12, Number(options.maxGenerations) || DEFAULT_MAX_GENERATIONS));
  const generations = allGenerations.slice(-maxGenerations);
  const prunedGenerations = allGenerations.slice(0, Math.max(0, allGenerations.length - generations.length));
  const rootManifest = {
    ...(previousRoot || {}),
    schemaVersion: ROOT_SCHEMA_VERSION,
    createdAt: previousRoot?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeGeneration: id,
    generations,
    keys: serialized.keys,
    sectionHashes: serialized.sectionHashes,
    sectionBytes: serialized.sectionBytes,
    sections: serialized.sections,
    totalBytes: serialized.totalBytes,
  };
  if (legacyFlat) rootManifest.legacyFlat = legacyFlat;
  const rootManifestPayload = Buffer.from(stringifyJson(rootManifest, pretty), "utf8");
  await atomicWriteFile(path.join(storeDir, SECTIONED_STORE_MANIFEST), rootManifestPayload);

  const generationGc = { maxGenerations, pruned: [], errors: [] };
  for (const stale of prunedGenerations) {
    try {
      await rm(path.join(generationsRoot, stale.generation), { recursive: true, force: true });
      generationGc.pruned.push(stale.generation);
    } catch (error) {
      generationGc.errors.push({ generation: stale.generation, error: error.message });
    }
  }
  if (generationGc.pruned.length) await syncDirectory(generationsRoot);

  const flatMigration = previous.kind === "flat"
    ? {
        status: "migrated_read_only",
        mode: "read-only",
        sourceFormat: FLAT_SCHEMA_VERSION,
        sourcePreserved: true,
        archivedManifest: path.join(storeDir, SECTIONED_STORE_LEGACY_DIR, legacyFlat.id, SECTIONED_STORE_MANIFEST),
      }
    : null;
  const legacyMigration = await copyLegacyWholeFile(options);
  return writeResult({
    storeDir,
    serialized,
    written,
    skipped,
    generation: id,
    manifestPayload: rootManifestPayload,
    manifestWritten: true,
    manifestReadError: previous.result.errors.map((entry) => entry.error).join("; "),
    legacyMigration,
    flatMigration,
    generationGc,
  });
}
