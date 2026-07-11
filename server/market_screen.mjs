import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { buildFactorSnapshotAsOf, normalizeHistoricalBars } from "../lib/historical_features.mjs";
import {
  applyCrossSectionalNormalization,
  normalizeRecommendationFactorWeights,
  scoreRecommendationFromFactorSnapshot,
} from "../lib/recommender_core.mjs";

const execFileAsync = promisify(execFile);

export const MARKET_SCREEN_SCHEMA = "market-screen-v1";
export const DEFAULT_MARKET_SCREEN_BENCHMARKS = Object.freeze([
  "SPY",
  "QQQ",
  "XLB",
  "XLC",
  "XLE",
  "XLF",
  "XLI",
  "XLK",
  "XLP",
  "XLRE",
  "XLU",
  "XLV",
  "XLY",
]);

function safeTicker(value = "") {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 16);
}

function ymd(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : raw.slice(0, 10);
}

function isoDateDaysAgo(days = 0, from = new Date()) {
  const date = new Date(from);
  date.setUTCDate(date.getUTCDate() - Math.max(0, Number(days) || 0));
  return date.toISOString().slice(0, 10);
}

function dateDistanceDays(from = "", to = "") {
  const left = new Date(`${ymd(from)}T00:00:00.000Z`).getTime();
  const right = new Date(`${ymd(to)}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.max(0, Math.round((right - left) / 86_400_000));
}

function hashJson(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sqlText(value = "") {
  return String(value ?? "").replaceAll("'", "''");
}

function tickerListSql(tickers = []) {
  const rows = [...new Set(tickers.map(safeTicker).filter(Boolean))];
  return rows.length ? rows.map((ticker) => `'${sqlText(ticker)}'`).join(",") : "''";
}

async function sqliteJson(sqlitePath, sql, timeoutMs = 120000) {
  const { stdout } = await execFileAsync("sqlite3", ["-json", sqlitePath, sql], {
    timeout: timeoutMs,
    maxBuffer: 128 * 1024 * 1024,
  });
  return String(stdout || "").trim() ? JSON.parse(stdout) : [];
}

async function sqliteExec(sqlitePath, sql, timeoutMs = 120000) {
  return execFileAsync("sqlite3", [sqlitePath, sql], {
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function tableExists(sqlitePath, table, timeoutMs = 30000) {
  const rows = await sqliteJson(
    sqlitePath,
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='${sqlText(table)}'`,
    timeoutMs,
  );
  return Number(rows[0]?.n || 0) > 0;
}

function chunkRows(rows = [], size = 120) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
}

export function normalizeMarketScreens(value = []) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === "object" && item.id)
    .sort((a, b) => String(b.generatedAt || "").localeCompare(String(a.generatedAt || "")))
    .slice(0, 10);
}

export function marketScreenEntryFunnel(labels = []) {
  const unique = [...new Set((labels || []).map((item) => String(item || "").trim()).filter(Boolean))];
  return unique.length === 1 && unique[0] === "全市场因子筛选" ? "market-screen" : "";
}

export function buildMarketScreenFromRows({
  membership = [],
  extraTickers = [],
  benchmarkTickers = DEFAULT_MARKET_SCREEN_BENCHMARKS,
  bars = [],
  regimes = [],
  pitFundamentals = [],
  asOf = "",
  weights = null,
  strategyVersionId = "",
  funnelLimit = 50,
  minBars = 60,
  maxFreshnessDays = 7,
  generatedAt = new Date().toISOString(),
  trigger = "manual",
  barRefresh = null,
} = {}) {
  const benchmarkSet = new Set((benchmarkTickers || []).map(safeTicker).filter(Boolean));
  const membershipTickers = membership.map((item) => safeTicker(item?.ticker || item)).filter(Boolean);
  const allTickers = [...new Set([...membershipTickers, ...extraTickers.map(safeTicker), ...benchmarkSet].filter(Boolean))];
  const allTickerSet = new Set(allTickers);
  const normalizedBars = normalizeHistoricalBars(bars).filter((row) => allTickerSet.has(safeTicker(row.ticker)));
  const effectiveAsOf = ymd(asOf) || normalizedBars.map((row) => row.date).sort().at(-1) || ymd(generatedAt);
  const regime = (regimes || [])
    .filter((item) => !effectiveAsOf || ymd(item.date) <= effectiveAsOf)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0] || null;
  const byTicker = new Map();
  for (const row of normalizedBars) {
    const ticker = safeTicker(row.ticker);
    if (!ticker || (effectiveAsOf && row.date > effectiveAsOf)) continue;
    const list = byTicker.get(ticker) || [];
    list.push(row);
    byTicker.set(ticker, list);
  }
  for (const rows of byTicker.values()) rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const excluded = { benchmark: 0, insufficientBars: 0, staleBars: 0, missingBars: 0 };
  const candidates = [];
  for (const ticker of allTickers) {
    if (benchmarkSet.has(ticker)) {
      excluded.benchmark += 1;
      continue;
    }
    const tickerBars = byTicker.get(ticker) || [];
    if (!tickerBars.length) {
      excluded.missingBars += 1;
      continue;
    }
    if (tickerBars.length < minBars) {
      excluded.insufficientBars += 1;
      continue;
    }
    const latest = tickerBars.at(-1);
    const freshnessDays = dateDistanceDays(latest.date, effectiveAsOf);
    if (!Number.isFinite(freshnessDays) || freshnessDays > maxFreshnessDays) {
      excluded.staleBars += 1;
      continue;
    }
    const tickerPit = (pitFundamentals || []).filter((item) => safeTicker(item.ticker) === ticker);
    const built = buildFactorSnapshotAsOf({
      ticker,
      asOf: effectiveAsOf,
      bars: tickerBars,
      historicalRegime: regime,
      pitFundamentals: tickerPit,
      weights,
    });
    candidates.push({
      ticker,
      latest,
      freshnessDays,
      barCount: tickerBars.length,
      factorSnapshot: built.factorSnapshot,
    });
  }

  const normalized = applyCrossSectionalNormalization(
    candidates.map((item) => item.factorSnapshot),
    { minCrossSection: 30, lowerPct: 1, upperPct: 99 },
  );
  const normalizedByTicker = new Map((normalized.snapshots || []).map((snapshot) => [safeTicker(snapshot.ticker), snapshot]));
  const effectiveWeights = normalizeRecommendationFactorWeights(weights || {});
  const ranked = candidates
    .map((item) => {
      const factorSnapshot = normalizedByTicker.get(item.ticker) || item.factorSnapshot;
      const recommendationScore = scoreRecommendationFromFactorSnapshot(factorSnapshot, { weights: effectiveWeights });
      return {
        ticker: item.ticker,
        score: recommendationScore.actionScore,
        alphaScore: recommendationScore.alphaScore,
        dataQualityScore: factorSnapshot.dataQualityScore,
        latestClose: item.latest.close,
        latestDate: item.latest.date,
        barCount: item.barCount,
        freshnessDays: item.freshnessDays,
        factorSnapshot,
        recommendationScore,
        topPositiveFactors: recommendationScore.topPositiveFactors,
        topRiskFactors: recommendationScore.topRiskFactors,
        source: item.latest.source || "historical_bars",
        researchOnly: true,
      };
    })
    .sort((a, b) => b.score - a.score || b.alphaScore - a.alphaScore || b.dataQualityScore - a.dataQualityScore || a.ticker.localeCompare(b.ticker));
  ranked.forEach((item, index) => {
    item.rank = index + 1;
  });
  const rows = ranked.slice(0, Math.max(1, Number(funnelLimit) || 50));
  const config = {
    universe: "active-sp500+watchlist+positions",
    benchmarkTickers: [...benchmarkSet],
    benchmarkExcludedFromCandidates: true,
    funnelLimit: Math.max(1, Number(funnelLimit) || 50),
    minBars,
    maxFreshnessDays,
    weights: effectiveWeights,
    strategyVersionId,
  };
  const status = rows.length
    ? ([excluded.insufficientBars, excluded.staleBars, excluded.missingBars].some((value) => value > 0) ? "partial" : "ok")
    : "empty";
  return {
    schemaVersion: MARKET_SCREEN_SCHEMA,
    screenSchema: MARKET_SCREEN_SCHEMA,
    id: `market-screen-${Date.parse(generatedAt) || Date.now()}-${hashJson({ effectiveAsOf, config }).slice(0, 8)}`,
    generatedAt,
    asOf: effectiveAsOf,
    trigger,
    status,
    source: "SQLite historical_bars",
    scoringEngine: "lib/recommender_core.mjs",
    strategyVersionId,
    configHash: hashJson(config),
    config,
    summary: {
      universeCount: allTickers.length,
      membershipCount: new Set(membershipTickers).size,
      evaluatedCount: ranked.length,
      resultCount: rows.length,
      excluded,
      normalization: normalized.metadata || null,
      latestBarDate: ranked.map((item) => item.latestDate).sort().at(-1) || "",
    },
    barRefresh,
    rows,
    note: "全市场筛选只负责把安静标的送入深度研究漏斗；不绕过 Agent 的数据质量、风险门槛或每日可执行上限。",
  };
}

export async function loadMarketScreenCorpus({
  sqlitePath,
  extraTickers = [],
  benchmarkTickers = DEFAULT_MARKET_SCREEN_BENCHMARKS,
  asOf = "",
  lookbackDays = 240,
  timeoutMs = 120000,
} = {}) {
  const requestedAsOf = ymd(asOf);
  const maxRows = await sqliteJson(sqlitePath, "SELECT MAX(date) AS latest FROM historical_bars", timeoutMs);
  const effectiveAsOf = requestedAsOf || ymd(maxRows[0]?.latest) || ymd(new Date());
  const membershipRows = await sqliteJson(
    sqlitePath,
    `SELECT DISTINCT ticker FROM universe_membership
     WHERE added_at <= '${sqlText(effectiveAsOf)}'
       AND (removed_at IS NULL OR removed_at = '' OR removed_at > '${sqlText(effectiveAsOf)}')
     ORDER BY ticker`,
    timeoutMs,
  );
  const tickers = [...new Set([
    ...membershipRows.map((item) => safeTicker(item.ticker)),
    ...extraTickers.map(safeTicker),
    ...benchmarkTickers.map(safeTicker),
  ].filter(Boolean))];
  const startDate = isoDateDaysAgo(lookbackDays, new Date(`${effectiveAsOf}T00:00:00.000Z`));
  const bars = [];
  for (const chunk of chunkRows(tickers, 120)) {
    bars.push(...await sqliteJson(
      sqlitePath,
      `SELECT ticker,date,open,high,low,close,volume,source FROM (
         SELECT ticker,date,open,high,low,close,volume,source,
           ROW_NUMBER() OVER (
             PARTITION BY ticker,date
             ORDER BY CASE WHEN LOWER(source) LIKE 'longbridge%' THEN 0 ELSE 1 END, source
           ) AS provider_rank
         FROM historical_bars
         WHERE ticker IN (${tickerListSql(chunk)})
           AND date >= '${sqlText(startDate)}' AND date <= '${sqlText(effectiveAsOf)}'
       )
       WHERE provider_rank = 1
       ORDER BY ticker,date`,
      timeoutMs,
    ));
  }
  const regimes = await tableExists(sqlitePath, "historical_regimes", timeoutMs)
    ? await sqliteJson(
        sqlitePath,
        `SELECT date,bucket,risk_score,json FROM historical_regimes WHERE date <= '${sqlText(effectiveAsOf)}' ORDER BY date DESC LIMIT 5`,
        timeoutMs,
      )
    : [];
  const pitFundamentals = [];
  if (await tableExists(sqlitePath, "pit_fundamentals", timeoutMs)) {
    for (const chunk of chunkRows(tickers, 120)) {
      pitFundamentals.push(...await sqliteJson(
        sqlitePath,
        `SELECT ticker,filed_at,period,field,value,form,json FROM pit_fundamentals
         WHERE ticker IN (${tickerListSql(chunk)}) AND filed_at <= '${sqlText(effectiveAsOf)}'
         ORDER BY ticker,filed_at`,
        timeoutMs,
      ));
    }
  }
  return { membership: membershipRows, tickers, bars, regimes, pitFundamentals, asOf: effectiveAsOf };
}

function parseLastJsonLine(stdout = "") {
  const lines = String(stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try {
      return JSON.parse(line);
    } catch {
      // Keep scanning earlier lines emitted by the resumable bridge.
    }
  }
  return null;
}

export async function refreshMarketScreenBars({
  sqlitePath,
  tickers = [],
  pythonCommand = "python3",
  buildBarsScript,
  longbridgeCommand = "longbridge",
  days = 45,
  limitBars = 60,
  concurrency = 10,
  timeoutMs = 14 * 60 * 1000,
} = {}) {
  const symbols = [...new Set(tickers.map(safeTicker).filter(Boolean))];
  if (!symbols.length) return { status: "empty", tickers: 0, rowsMerged: 0 };
  if (!buildBarsScript) throw new Error("build_historical_bars.py path is required");
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "market-pulse-screen-"));
  const aggregateDb = path.join(tempDir, "market-screen-aggregate.sqlite");
  try {
    await sqliteExec(
      aggregateDb,
      `CREATE TABLE IF NOT EXISTS historical_bars (
        ticker TEXT NOT NULL,
        date TEXT NOT NULL,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        volume REAL,
        source TEXT NOT NULL,
        PRIMARY KEY (ticker, date, source)
      );`,
    );
    let pending = symbols;
    let processed = 0;
    let stderrTail = "";
    const attempts = [];
    const workerDbs = [];
    const failureMessages = new Map();
    for (let attempt = 1; attempt <= 3 && pending.length; attempt += 1) {
      const workerCount = Math.max(1, Math.min(Math.floor(Number(concurrency) || 1), pending.length));
      const groups = chunkRows(pending, Math.ceil(pending.length / workerCount));
      const requested = pending.length;
      const results = await Promise.all(groups.map(async (group, workerIndex) => {
        const workerDb = path.join(tempDir, `market-screen-${attempt}-${workerIndex}.sqlite`);
        workerDbs.push(workerDb);
        const args = [
          buildBarsScript,
          "--db", workerDb,
          "--tickers", group.join(","),
          "--days", String(Math.max(30, days)),
          "--limit-bars", String(Math.max(30, limitBars)),
          "--provider-order", "longbridge",
          "--longbridge-command", longbridgeCommand,
          "--sleep-ms", "0",
          "--fetch-timeout", "60",
          "--force",
          "--skip-regimes",
          "--no-remote-universe",
        ];
        try {
          const { stdout, stderr } = await execFileAsync(pythonCommand, args, {
            timeout: timeoutMs,
            maxBuffer: 32 * 1024 * 1024,
            cwd: path.dirname(buildBarsScript),
          });
          const parsed = String(stdout || "").split(/\r?\n/).map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          }).filter(Boolean);
          const succeeded = new Set(parsed.filter((item) => item.ticker && !item.error).map((item) => safeTicker(item.ticker)));
          const failedRows = parsed.filter((item) => item.ticker && item.error);
          for (const item of failedRows) failureMessages.set(safeTicker(item.ticker), String(item.error || "Longbridge 未返回 K 线"));
          const failed = group.filter((ticker) => !succeeded.has(ticker));
          return {
            succeeded: [...succeeded],
            failed,
            stderr: String(stderr || "").trim().slice(-1000),
          };
        } catch (error) {
          for (const ticker of group) failureMessages.set(ticker, error.message);
          return { succeeded: [], failed: group, stderr: String(error.stderr || error.message || "").slice(-1000) };
        }
      }));
      const succeeded = [...new Set(results.flatMap((item) => item.succeeded))];
      const failed = [...new Set(results.flatMap((item) => item.failed))];
      processed += succeeded.length;
      stderrTail = results.map((item) => item.stderr).filter(Boolean).at(-1) || stderrTail;
      attempts.push({ attempt, requested, processed: succeeded.length, failed: failed.length, workers: groups.length });
      pending = failed;
      if (pending.length && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
    for (const workerDb of workerDbs) {
      if (!(await tableExists(workerDb, "historical_bars"))) continue;
      await sqliteExec(
        aggregateDb,
        `ATTACH DATABASE '${sqlText(workerDb)}' AS worker_src;
         BEGIN;
         INSERT OR REPLACE INTO historical_bars(ticker,date,open,high,low,close,volume,source)
         SELECT ticker,date,open,high,low,close,volume,source FROM worker_src.historical_bars;
         COMMIT;
         DETACH DATABASE worker_src;`,
      );
    }
    const countRows = await sqliteJson(aggregateDb, "SELECT COUNT(*) AS n, COUNT(DISTINCT ticker) AS tickers, MAX(date) AS latest FROM historical_bars");
    const escapedTemp = sqlText(aggregateDb);
    await sqliteExec(
      sqlitePath,
      `PRAGMA busy_timeout=30000;
       ATTACH DATABASE '${escapedTemp}' AS screen_src;
       BEGIN IMMEDIATE;
       INSERT OR REPLACE INTO historical_bars(ticker,date,open,high,low,close,volume,source)
       SELECT ticker,date,open,high,low,close,volume,source FROM screen_src.historical_bars;
       COMMIT;
       DETACH DATABASE screen_src;`,
      120000,
    );
    return {
      status: pending.length ? "partial" : "ok",
      tickers: symbols.length,
      processed,
      errors: pending.slice(0, 20).map((ticker) => ({
        ticker,
        error: `Longbridge 连续 3 次未返回可用 K 线：${failureMessages.get(ticker) || "无有效结果"}`,
      })),
      attempts,
      concurrency: Math.max(1, Math.floor(Number(concurrency) || 1)),
      rowsMerged: Number(countRows[0]?.n || 0),
      tickerRows: Number(countRows[0]?.tickers || 0),
      latestBarDate: ymd(countRows[0]?.latest),
      stderr: stderrTail,
      mode: "isolated-temp-db-atomic-merge",
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function runMarketScreenFromSqlite({
  sqlitePath,
  extraTickers = [],
  benchmarkTickers = DEFAULT_MARKET_SCREEN_BENCHMARKS,
  weights = null,
  strategyVersionId = "",
  funnelLimit = 50,
  minBars = 60,
  maxFreshnessDays = 7,
  asOf = "",
  trigger = "manual",
  refreshBars = false,
  refreshOptions = {},
} = {}) {
  const initial = await loadMarketScreenCorpus({ sqlitePath, extraTickers, benchmarkTickers, asOf });
  let barRefresh = null;
  if (refreshBars) {
    barRefresh = await refreshMarketScreenBars({
      sqlitePath,
      tickers: initial.tickers,
      ...refreshOptions,
    });
  }
  const corpus = refreshBars
    ? await loadMarketScreenCorpus({ sqlitePath, extraTickers, benchmarkTickers, asOf })
    : initial;
  return buildMarketScreenFromRows({
    membership: corpus.membership,
    extraTickers,
    benchmarkTickers,
    bars: corpus.bars,
    regimes: corpus.regimes,
    pitFundamentals: corpus.pitFundamentals,
    asOf: corpus.asOf,
    weights,
    strategyVersionId,
    funnelLimit,
    minBars,
    maxFreshnessDays,
    trigger,
    barRefresh,
  });
}
