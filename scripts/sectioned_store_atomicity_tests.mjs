import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  SECTIONED_STORE_GENERATIONS_DIR,
  SECTIONED_STORE_LEGACY_DIR,
  SECTIONED_STORE_MANIFEST,
  SECTIONED_STORE_STAGING_DIR,
  readSectionedStore,
  writeSectionedStore,
} from "../server/sectioned_store.mjs";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function rootManifest(storeDir) {
  return readJson(path.join(storeDir, SECTIONED_STORE_MANIFEST));
}

function generationDir(storeDir, generation) {
  return path.join(storeDir, SECTIONED_STORE_GENERATIONS_DIR, generation);
}

async function createFlatStore(storeDir, rawSections) {
  await mkdir(storeDir, { recursive: true });
  const keys = Object.keys(rawSections).sort();
  const sectionHashes = {};
  const sectionBytes = {};
  for (const key of keys) {
    const raw = Buffer.from(rawSections[key], "utf8");
    await writeFile(path.join(storeDir, `${key}.json`), raw);
    sectionHashes[key] = sha256(raw);
    sectionBytes[key] = raw.byteLength;
  }
  const manifest = {
    schemaVersion: "sectioned-store-v1",
    keys,
    sectionHashes,
    sectionBytes,
  };
  const manifestRaw = Buffer.from(JSON.stringify(manifest), "utf8");
  await writeFile(path.join(storeDir, SECTIONED_STORE_MANIFEST), manifestRaw);
  return { manifest, manifestRaw };
}

const testRoot = await mkdtemp(path.join(os.tmpdir(), "market-pulse-sectioned-store-atomicity-"));
let passed = 0;

async function test(name, run) {
  const storeDir = path.join(testRoot, String(passed + 1).padStart(2, "0"));
  await run(storeDir);
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

try {
  await test("normal generation write/read and clean no-op", async (storeDir) => {
    const store = {
      alerts: [{ id: "a1", active: true }],
      watchlist: ["AAPL", "MSFT"],
    };
    const first = await writeSectionedStore(storeDir, store);
    assert.equal(first.schemaVersion, "sectioned-store-write-v2");
    assert.deepEqual(first.written, ["alerts", "watchlist"]);
    assert.equal(first.manifestWritten, true);

    const root = await rootManifest(storeDir);
    assert.equal(root.schemaVersion, "sectioned-store-v2");
    assert.equal(root.activeGeneration, first.generation);
    assert.deepEqual(root.keys, ["alerts", "watchlist"]);
    assert.deepEqual(root.sections.alerts, {
      bytes: root.sectionBytes.alerts,
      sha256: root.sectionHashes.alerts,
    });
    assert.equal(root.generations.length, 1);
    assert.equal((await readdir(generationDir(storeDir, first.generation))).sort().join(","), "_manifest.json,alerts.json,watchlist.json");

    const loaded = await readSectionedStore(storeDir);
    assert.deepEqual(loaded.store, store);
    assert.equal(loaded.generation, first.generation);
    assert.equal(loaded.recovered, false);
    assert.deepEqual(loaded.errors, []);

    const clean = await writeSectionedStore(storeDir, store, { previousHashes: first.sectionHashes });
    assert.deepEqual(clean.written, []);
    assert.deepEqual(clean.skipped, ["alerts", "watchlist"]);
    assert.equal(clean.manifestWritten, false);
    assert.equal(clean.generation, first.generation);
    assert.equal((await rootManifest(storeDir)).generations.length, 1);
  });

  await test("missing active section falls back to previous generation", async (storeDir) => {
    const firstStore = { alerts: [{ id: "old" }], watchlist: ["AAPL"] };
    const secondStore = { alerts: [{ id: "new" }], watchlist: ["AAPL"] };
    const first = await writeSectionedStore(storeDir, firstStore);
    const second = await writeSectionedStore(storeDir, secondStore);
    await unlink(path.join(generationDir(storeDir, second.generation), "alerts.json"));

    const loaded = await readSectionedStore(storeDir);
    assert.deepEqual(loaded.store, firstStore);
    assert.equal(loaded.activeGeneration, second.generation);
    assert.equal(loaded.generation, first.generation);
    assert.equal(loaded.recovered, true);
    assert.equal(loaded.errors[0].generation, second.generation);
    assert.equal(loaded.errors[0].code, "SECTIONED_STORE_SECTION_SET");
  });

  await test("active section SHA-256 corruption falls back", async (storeDir) => {
    const firstStore = { state: { value: "AAAA" } };
    const secondStore = { state: { value: "BBBB" } };
    const first = await writeSectionedStore(storeDir, firstStore);
    const second = await writeSectionedStore(storeDir, secondStore);
    await writeFile(path.join(generationDir(storeDir, second.generation), "state.json"), JSON.stringify({ value: "CCCC" }));

    const loaded = await readSectionedStore(storeDir);
    assert.deepEqual(loaded.store, firstStore);
    assert.equal(loaded.generation, first.generation);
    assert.equal(loaded.recovered, true);
    assert.equal(loaded.errors[0].code, "SECTIONED_STORE_SECTION_HASH");
  });

  await test("corrupt active metadata in the root manifest falls back", async (storeDir) => {
    const firstStore = { state: { value: "first" } };
    const secondStore = { state: { value: "second" } };
    const first = await writeSectionedStore(storeDir, firstStore);
    const second = await writeSectionedStore(storeDir, secondStore);
    const root = await rootManifest(storeDir);
    root.sectionHashes.state = "invalid-sha256";
    await writeFile(path.join(storeDir, SECTIONED_STORE_MANIFEST), JSON.stringify(root));

    const loaded = await readSectionedStore(storeDir);
    assert.deepEqual(loaded.store, firstStore);
    assert.equal(loaded.activeGeneration, second.generation);
    assert.equal(loaded.generation, first.generation);
    assert.equal(loaded.recovered, true);
    assert.equal(loaded.errors[0].code, "SECTIONED_STORE_MANIFEST_HASHES");
  });

  await test("interrupted staging and uncommitted generation are ignored", async (storeDir) => {
    const committedStore = { alerts: [{ id: "committed" }], watchlist: ["NVDA"] };
    const committed = await writeSectionedStore(storeDir, committedStore);
    const rootBefore = await readFile(path.join(storeDir, SECTIONED_STORE_MANIFEST));

    const interruptedStaging = path.join(storeDir, SECTIONED_STORE_STAGING_DIR, "interrupted-staging");
    await mkdir(interruptedStaging, { recursive: true });
    await writeFile(path.join(interruptedStaging, "alerts.json"), "[]");

    const promotedButUncommitted = path.join(storeDir, SECTIONED_STORE_GENERATIONS_DIR, "interrupted-before-switch");
    await mkdir(promotedButUncommitted, { recursive: true });
    await writeFile(path.join(promotedButUncommitted, "alerts.json"), "[]");
    await writeFile(
      path.join(storeDir, `${SECTIONED_STORE_MANIFEST}.interrupted.tmp`),
      JSON.stringify({ schemaVersion: "sectioned-store-v2", activeGeneration: "interrupted-before-switch" }),
    );

    const loaded = await readSectionedStore(storeDir);
    assert.deepEqual(loaded.store, committedStore);
    assert.equal(loaded.generation, committed.generation);
    assert.equal(loaded.recovered, false);
    assert.deepEqual(await readFile(path.join(storeDir, SECTIONED_STORE_MANIFEST)), rootBefore);
  });

  await test("flat v1 is read-only until a generation write migrates it", async (storeDir) => {
    const flatStore = {
      alerts: [{ id: "flat" }],
      watchlist: ["AAPL"],
    };
    const rawSections = Object.fromEntries(
      Object.entries(flatStore).map(([key, value]) => [key, JSON.stringify(value)]),
    );
    const { manifestRaw } = await createFlatStore(storeDir, rawSections);
    const entriesBeforeRead = (await readdir(storeDir)).sort();

    const flatRead = await readSectionedStore(storeDir);
    assert.deepEqual(flatRead.store, flatStore);
    assert.equal(flatRead.sourceFormat, "flat-v1");
    assert.equal(flatRead.migrationRequired, true);
    assert.equal(flatRead.legacyMigration.mode, "read-only");
    assert.deepEqual((await readdir(storeDir)).sort(), entriesBeforeRead, "legacy read must not mutate the flat store");

    const migratedStore = { ...flatStore, alerts: [{ id: "generation" }] };
    const migrated = await writeSectionedStore(storeDir, migratedStore);
    assert.equal(migrated.flatMigration.status, "migrated_read_only");
    assert.equal(migrated.flatMigration.sourcePreserved, true);
    assert.equal(await readFile(path.join(storeDir, "alerts.json"), "utf8"), rawSections.alerts);
    assert.equal(await readFile(path.join(storeDir, "watchlist.json"), "utf8"), rawSections.watchlist);

    const root = await rootManifest(storeDir);
    assert.equal(root.schemaVersion, "sectioned-store-v2");
    assert.ok(root.legacyFlat.id.startsWith("flat-"));
    const archivedManifest = path.join(storeDir, SECTIONED_STORE_LEGACY_DIR, root.legacyFlat.id, SECTIONED_STORE_MANIFEST);
    assert.deepEqual(await readFile(archivedManifest), manifestRaw);
    assert.deepEqual((await readSectionedStore(storeDir)).store, migratedStore);

    await unlink(path.join(generationDir(storeDir, migrated.generation), "alerts.json"));
    const fallback = await readSectionedStore(storeDir);
    assert.deepEqual(fallback.store, flatStore);
    assert.equal(fallback.sourceFormat, "flat-v1-fallback");
    assert.equal(fallback.recovered, true);
  });

  await test("malformed legacy JSON is never returned as an empty store", async (storeDir) => {
    await createFlatStore(storeDir, { alerts: "{" });
    await assert.rejects(
      readSectionedStore(storeDir),
      (error) => error?.code === "SECTIONED_STORE_SECTION_PARSE" && /Cannot parse section alerts/.test(error.message),
    );
  });

  await test("section key schema is append-only", async (storeDir) => {
    const store = { alerts: [], watchlist: ["AAPL"] };
    await writeSectionedStore(storeDir, store);
    const rootBefore = await readFile(path.join(storeDir, SECTIONED_STORE_MANIFEST));
    await assert.rejects(
      writeSectionedStore(storeDir, { watchlist: ["MSFT"] }),
      (error) => error?.code === "SECTIONED_STORE_SCHEMA_CONTRACTION" && error.details.missingKeys.includes("alerts"),
    );
    assert.deepEqual(await readFile(path.join(storeDir, SECTIONED_STORE_MANIFEST)), rootBefore);
    assert.deepEqual((await readSectionedStore(storeDir)).store, store);
  });

  await test("generation history is bounded after atomic promotion", async (storeDir) => {
    let latest;
    for (let index = 0; index < 6; index += 1) {
      latest = await writeSectionedStore(storeDir, { state: { index } }, { maxGenerations: 3 });
    }
    const root = await rootManifest(storeDir);
    const generationDirs = (await readdir(path.join(storeDir, SECTIONED_STORE_GENERATIONS_DIR))).sort();
    assert.equal(root.generations.length, 3);
    assert.equal(generationDirs.length, 3);
    assert.equal(root.activeGeneration, latest.generation);
    assert.deepEqual((await readSectionedStore(storeDir)).store, { state: { index: 5 } });
  });

  process.stdout.write(`sectioned_store_atomicity_tests: ${passed} passed\n`);
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
