import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { evaluateFactorSpecOverCorpus } from "../server/factor_registry.mjs";
import {
  historicalBacktestDetailsFromSqlite,
  persistHistoricalBacktestRun,
} from "../server/historical_backtest.mjs";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SYNC_SCRIPT = path.join(ROOT, "scripts", "sqlite_store_sync.py");

function sqlText(value) {
  return String(value ?? "").replaceAll("'", "''");
}

async function sqliteExec(dbPath, sql) {
  await execFileAsync("sqlite3", [dbPath, sql], { maxBuffer: 64 * 1024 * 1024 });
}

async function sqliteJson(dbPath, sql) {
  const { stdout } = await execFileAsync("sqlite3", ["-json", dbPath, sql], { maxBuffer: 64 * 1024 * 1024 });
  return String(stdout || "").trim() ? JSON.parse(stdout) : [];
}

async function syncStore(storePath, dbPath, since = "") {
  const args = [SYNC_SCRIPT, "--store-json", storePath, "--db", dbPath];
  if (since) args.push("--since", since);
  const { stdout } = await execFileAsync("python3", args, { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function baseMirrorRun() {
  return {
    id: "run-old-001",
    session: "post",
    trigger: "storage-test",
    startedAt: "2026-01-02T20:00:00.000Z",
    completedAt: "2026-01-02T20:05:00.000Z",
    news: [
      {
        id: "news-old-1",
        ticker: "AAPL",
        title: "Initial item",
        publishedAt: "2026-01-02T19:00:00.000Z",
        url: "https://example.test/initial",
      },
    ],
    options: [],
    errors: [],
  };
}

async function testOldRunRevisionSync(tmpDir) {
  const dbPath = path.join(tmpDir, "mirror.sqlite");
  const storePath = path.join(tmpDir, "store.json");
  const run = baseMirrorRun();
  const fullJson = JSON.stringify(run);
  await sqliteExec(dbPath, `
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  session TEXT,
  trigger TEXT,
  started_at TEXT,
  completed_at TEXT,
  summary_only INTEGER DEFAULT 0,
  news_count INTEGER DEFAULT 0,
  social_posts_count INTEGER DEFAULT 0,
  options_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  summary_json TEXT NOT NULL,
  full_json TEXT NOT NULL,
  slim_json TEXT,
  row_count_checksum TEXT,
  spot_hash TEXT
);
INSERT INTO runs(
  id,session,trigger,started_at,completed_at,summary_only,
  news_count,social_posts_count,options_count,error_count,
  summary_json,full_json,slim_json,row_count_checksum,spot_hash
) VALUES (
  '${sqlText(run.id)}','post','storage-test','${run.startedAt}','${run.completedAt}',0,
  1,0,0,0,'{}','${sqlText(fullJson)}','{}','',''
);
`);
  await writeFile(storePath, JSON.stringify({ runs: [run] }), "utf8");

  const baseline = await syncStore(storePath, dbPath, "2099-01-01T00:00:00.000Z");
  assert.equal(baseline.synced.runs, 0, "old schema row should be backfilled without a false new revision");
  assert.equal((await sqliteJson(dbPath, "SELECT COUNT(*) AS n FROM run_revisions;"))[0].n, 1);

  const revisedRun = {
    ...run,
    news: [
      ...run.news,
      {
        id: "news-old-2",
        ticker: "AAPL",
        title: "Late enrichment",
        publishedAt: "2026-01-02T19:30:00.000Z",
        url: "https://example.test/enrichment",
      },
    ],
    options: [
      {
        ticker: "AAPL",
        provider: "storage-test",
        status: "ok",
        summary: { ivAtm: 0.24, putCallRatio: 1.18 },
      },
    ],
  };
  await writeFile(storePath, JSON.stringify({ runs: [revisedRun] }), "utf8");
  const revised = await syncStore(storePath, dbPath, "2099-01-01T00:00:00.000Z");
  assert.equal(revised.synced.runs, 1, "content hash must select an old completed run despite the future watermark");
  assert.equal(revised.synced.runRevisions, 1);
  const [latest] = await sqliteJson(dbPath, "SELECT revision,news_count,options_count,content_hash,full_json FROM runs WHERE id='run-old-001';");
  assert.equal(latest.revision, 2);
  assert.equal(latest.news_count, 2);
  assert.equal(latest.options_count, 1);
  assert.equal(JSON.parse(latest.full_json).news.length, 2);
  const [revisions] = await sqliteJson(dbPath, "SELECT COUNT(*) AS n,COUNT(DISTINCT content_hash) AS hashes FROM run_revisions WHERE run_id='run-old-001';");
  assert.deepEqual(revisions, { n: 2, hashes: 2 });

  const idempotent = await syncStore(storePath, dbPath, "2099-01-01T00:00:00.000Z");
  assert.equal(idempotent.synced.runs, 0);
  assert.equal((await sqliteJson(dbPath, "SELECT COUNT(*) AS n FROM run_revisions WHERE run_id='run-old-001';"))[0].n, 2);
  return { baseline: baseline.synced, revised: revised.synced, latestRevision: latest.revision };
}

async function testFactorRegistryRealSchema(tmpDir) {
  const dbPath = path.join(tmpDir, "factor.sqlite");
  const storePath = path.join(tmpDir, "factor-store.json");
  const run = {
    id: "factor-run-001",
    startedAt: "2026-02-01T20:00:00.000Z",
    completedAt: "2026-02-01T20:05:00.000Z",
    options: [
      {
        ticker: "AAPL",
        provider: "storage-test",
        status: "ok",
        summary: { ivAtm: 0.31, putCallRatio: 1.42 },
      },
    ],
    researchPacks: [
      {
        ticker: "AAPL",
        provider: "storage-test",
        summary: {
          shortInterest: 0.075,
          daysToCover: 3.8,
          upgrades: 2,
          downgrades: 0,
          ratingCount: 17,
          consensusEps: 2.45,
        },
      },
    ],
  };
  const store = {
    runs: [run],
    consensusSnapshots: [
      {
        id: "consensus-aapl-1",
        ticker: "AAPL",
        eventDate: "2026-02-10",
        capturedAt: "2026-02-01T19:00:00.000Z",
        epsEstimate: 2.45,
        revenueEstimate: 125000,
        source: "storage-test",
        status: "ok",
      },
    ],
  };
  await writeFile(storePath, JSON.stringify(store), "utf8");
  await syncStore(storePath, dbPath);
  await sqliteExec(dbPath, `
CREATE TABLE historical_bars (
  ticker TEXT,date TEXT,open REAL,high REAL,low REAL,close REAL,volume REAL,source TEXT
);
CREATE TABLE historical_outcomes (
  run_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  ticker TEXT,
  horizon_days INTEGER,
  decision_at TEXT,
  entry_date TEXT,
  exit_date TEXT,
  raw_return_pct REAL,
  benchmark_return_pct REAL,
  excess_pct REAL,
  outcome TEXT,
  outcome_quality_status TEXT,
  regime TEXT,
  json TEXT NOT NULL,
  PRIMARY KEY (run_id,decision_id,horizon_days)
);
INSERT INTO historical_bars VALUES
  ('AAPL','2026-02-01',100,101,99,100,1000000,'storage-test'),
  ('AAPL','2026-02-02',100,103,99,102,1100000,'storage-test');
INSERT INTO historical_outcomes VALUES
  ('factor-bt','factor-decision','AAPL',1,'2026-02-01','2026-02-01','2026-02-02',2,0.5,1.5,'win','ok','neutral','{}');
`);

  const specs = [
    ["options_snapshots", "ivHistory.put_call_ratio"],
    ["short_interest_history", "shortInterest.days_to_cover"],
    ["analyst_revision_history", "revisions.consensus_eps"],
    ["consensus_snapshots", "consensus.eps"],
  ];
  const results = [];
  for (const [label, input] of specs) {
    const evidence = await evaluateFactorSpecOverCorpus({
      factorId: `storage-${label}`,
      family: "storage-test",
      expectedSign: 1,
      horizons: [1],
      pipeline: [{ op: "ref", input }],
    }, {
      db: dbPath,
      universe: ["AAPL"],
      dateGrid: ["2026-02-01"],
    });
    assert.equal(evidence.status, "ok", `${label} should query the real sqlite_store_sync schema`);
    assert.ok(evidence.scoreSeries.length, `${label} should produce a score from real/JSON-backed columns`);
    const diagnostic = evidence.diagnostics.find((row) => row.label === label);
    assert.equal(diagnostic?.qualityStatus, "compatible");
    results.push({ label, status: evidence.status, qualityStatus: diagnostic.qualityStatus });
  }

  const malformedDb = path.join(tmpDir, "factor-malformed.sqlite");
  await sqliteExec(malformedDb, `
CREATE TABLE historical_bars (ticker TEXT,date TEXT,open REAL,high REAL,low REAL,close REAL,volume REAL,source TEXT);
CREATE TABLE options_snapshots (id TEXT PRIMARY KEY,ticker TEXT,captured_at TEXT,json TEXT NOT NULL);
INSERT INTO historical_bars VALUES ('AAPL','2026-02-01',100,101,99,100,1000,'test');
`);
  const malformed = await evaluateFactorSpecOverCorpus({
    factorId: "storage-malformed-options",
    family: "storage-test",
    horizons: [1],
    pipeline: [{ op: "ref", input: "ivHistory.iv_atm" }],
  }, {
    db: malformedDb,
    universe: ["AAPL"],
    dateGrid: ["2026-02-01"],
  });
  assert.equal(malformed.status, "data-quality-error");
  assert.equal(malformed.qualityStatus, "schema-incompatible");
  assert.ok(malformed.errors.some((row) => row.label === "options_snapshots" && row.missingColumns.includes("as_of")));
  return { compatible: results, malformed: { status: malformed.status, qualityStatus: malformed.qualityStatus } };
}

function historicalRunFixture() {
  const decision = {
    id: "decision-new-1",
    ticker: "AAPL",
    signalDate: "2026-03-01",
    generatedAt: "2026-03-01T20:00:00.000Z",
    actionScore: 72,
    alphaScore: 61,
  };
  const outcome = {
    decisionId: decision.id,
    ticker: "AAPL",
    horizonDays: 1,
    decisionAt: "2026-03-01",
    entryDate: "2026-03-01",
    exitDate: "2026-03-02",
    rawReturnPct: 2,
    benchmarkReturnPct: 0.5,
    excessPct: 1.5,
    outcome: "win",
    outcomeQualityStatus: "ok",
    regimeBucket: "neutral",
  };
  return {
    schemaVersion: "historical-walk-forward-run-v1",
    id: "hist-storage-new-1",
    generatedAt: "2026-03-03T00:00:00.000Z",
    status: "ok",
    scope: { tickers: 1, dates: 1 },
    config: { horizons: [1], primaryHorizon: 1 },
    strategyHash: "storage-test-hash",
    decisions: [decision],
    outcomes: [outcome],
    daily: [{ date: "2026-03-01", decisions: 1, outcomeSamples: 1, avgExcessPct: 1.5 }],
    detailCounts: { decisions: 1, outcomes: 1, daily: 1 },
    metrics: { sampleCount: 1 },
    provenance: { engine: "storage-test" },
    caveats: [],
  };
}

async function testHistoricalCanonicalCompatibility(tmpDir) {
  const dbPath = path.join(tmpDir, "historical.sqlite");
  await sqliteExec(dbPath, `
CREATE TABLE historical_decisions (
  run_id TEXT NOT NULL,id TEXT NOT NULL,ticker TEXT,signal_date TEXT,
  action_score REAL,alpha_score REAL,json TEXT NOT NULL,
  PRIMARY KEY (run_id,id)
);
CREATE TABLE historical_outcomes (
  run_id TEXT NOT NULL,decision_id TEXT NOT NULL,ticker TEXT,horizon_days INTEGER,
  decision_at TEXT,entry_date TEXT,exit_date TEXT,raw_return_pct REAL,
  benchmark_return_pct REAL,excess_pct REAL,outcome TEXT,outcome_quality_status TEXT,
  regime TEXT,json TEXT NOT NULL,
  PRIMARY KEY (run_id,decision_id,horizon_days)
);
INSERT INTO historical_decisions VALUES
  ('legacy-run','legacy-decision','MSFT','2025-12-01',55,51,'{"id":"legacy-decision","ticker":"MSFT"}');
INSERT INTO historical_outcomes VALUES
  ('legacy-run','legacy-decision','MSFT',1,'2025-12-01','2025-12-01','2025-12-02',1.2,0.2,1.0,'win','ok','neutral','{"decisionId":"legacy-decision","ticker":"MSFT"}');
`);

  const run = historicalRunFixture();
  const persisted = await persistHistoricalBacktestRun(dbPath, run, { schemaVersion: "storage-test-report-v1" });
  assert.equal(persisted.persisted, true);
  assert.equal(persisted.storageStatus, "ready");
  assert.equal(persisted.compatibility.status, "ok");
  const objects = await sqliteJson(dbPath, `
SELECT name,type FROM sqlite_master
WHERE name IN ('historical_decisions','historical_outcomes','historical_backtest_decisions','historical_backtest_outcomes')
ORDER BY name;
`);
  assert.deepEqual(Object.fromEntries(objects.map((row) => [row.name, row.type])), {
    historical_backtest_decisions: "table",
    historical_backtest_outcomes: "table",
    historical_decisions: "view",
    historical_outcomes: "view",
  });
  const [counts] = await sqliteJson(dbPath, `
SELECT
  (SELECT COUNT(*) FROM historical_backtest_decisions) AS canonical_decisions,
  (SELECT COUNT(*) FROM historical_decisions) AS legacy_decisions,
  (SELECT COUNT(*) FROM historical_backtest_outcomes) AS canonical_outcomes,
  (SELECT COUNT(*) FROM historical_outcomes) AS legacy_outcomes;
`);
  assert.deepEqual(counts, {
    canonical_decisions: 2,
    legacy_decisions: 2,
    canonical_outcomes: 2,
    legacy_outcomes: 2,
  });
  const archives = await sqliteJson(dbPath, "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'historical_%_legacy_archive%' ORDER BY name;");
  assert.equal(archives.length, 2);
  for (const archive of archives) {
    assert.equal((await sqliteJson(dbPath, `SELECT COUNT(*) AS n FROM ${archive.name};`))[0].n, 1);
  }
  const [state] = await sqliteJson(dbPath, "SELECT status,expected_decisions,expected_outcomes,expected_daily,staged_decisions,staged_outcomes,staged_daily FROM historical_backtest_write_state WHERE run_id='hist-storage-new-1';");
  assert.deepEqual(state, {
    status: "ready",
    expected_decisions: 1,
    expected_outcomes: 1,
    expected_daily: 1,
    staged_decisions: 1,
    staged_outcomes: 1,
    staged_daily: 1,
  });
  const [staging] = await sqliteJson(dbPath, "SELECT (SELECT COUNT(*) FROM historical_backtest_decisions_staging) AS decisions,(SELECT COUNT(*) FROM historical_backtest_outcomes_staging) AS outcomes,(SELECT COUNT(*) FROM historical_backtest_daily_staging) AS daily;");
  assert.deepEqual(staging, { decisions: 0, outcomes: 0, daily: 0 });
  const page = await historicalBacktestDetailsFromSqlite({ sqlitePath: dbPath, runId: run.id, kind: "outcomes" });
  assert.equal(page.total, 1);
  assert.equal(page.rows[0].decisionId, "decision-new-1");

  const idempotent = await persistHistoricalBacktestRun(dbPath, run, { schemaVersion: "storage-test-report-v1" });
  assert.equal(idempotent.idempotent, true);
  const changed = structuredClone(run);
  changed.outcomes[0].excessPct = 9.9;
  await assert.rejects(
    persistHistoricalBacktestRun(dbPath, changed, { schemaVersion: "storage-test-report-v1" }),
    /run id conflict/,
  );
  assert.equal((await sqliteJson(dbPath, "SELECT excess_pct FROM historical_backtest_outcomes WHERE run_id='hist-storage-new-1';"))[0].excess_pct, 1.5);
  assert.equal((await sqliteJson(dbPath, "SELECT status FROM historical_backtest_write_state WHERE run_id='hist-storage-new-1';"))[0].status, "ready");

  const failedRun = historicalRunFixture();
  failedRun.id = "hist-storage-atomic-failure";
  failedRun.decisions = [failedRun.decisions[0], structuredClone(failedRun.decisions[0])];
  failedRun.outcomes = [];
  failedRun.daily = [];
  failedRun.detailCounts = { decisions: 2, outcomes: 0, daily: 0 };
  await assert.rejects(
    persistHistoricalBacktestRun(dbPath, failedRun, { schemaVersion: "storage-test-report-v1" }),
    /UNIQUE constraint failed/,
  );
  assert.equal((await sqliteJson(dbPath, "SELECT COUNT(*) AS n FROM historical_backtest_runs WHERE id='hist-storage-atomic-failure';"))[0].n, 0);
  assert.equal((await sqliteJson(dbPath, "SELECT COUNT(*) AS n FROM historical_backtest_decisions WHERE run_id='hist-storage-atomic-failure';"))[0].n, 0);
  assert.equal((await sqliteJson(dbPath, "SELECT status FROM historical_backtest_write_state WHERE run_id='hist-storage-atomic-failure';"))[0].status, "failed");

  failedRun.decisions = [failedRun.decisions[0]];
  failedRun.detailCounts.decisions = 1;
  const recovered = await persistHistoricalBacktestRun(dbPath, failedRun, { schemaVersion: "storage-test-report-v1" });
  assert.equal(recovered.storageStatus, "ready");
  assert.equal((await sqliteJson(dbPath, "SELECT COUNT(*) AS n FROM historical_backtest_decisions WHERE run_id='hist-storage-atomic-failure';"))[0].n, 1);
  return {
    migrations: persisted.migrations,
    compatibility: persisted.compatibility,
    state,
    atomicFailureRecovery: recovered.storageStatus,
    archives: archives.map((row) => row.name),
  };
}

async function main() {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "market-pulse-storage-"));
  try {
    const mirror = await testOldRunRevisionSync(tmpDir);
    const factors = await testFactorRegistryRealSchema(tmpDir);
    const historical = await testHistoricalCanonicalCompatibility(tmpDir);
    console.log(JSON.stringify({ status: "ok", mirror, factors, historical }, null, 2));
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

await main();
