import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { buildFactorSnapshotAsOf, normalizeHistoricalBars } from "../lib/historical_features.mjs";
import {
  classifyOutcomeQuality,
  applyCrossSectionalNormalization,
  buildFactorCorrelationMatrix,
  buildFactorStatsFromOutcomes,
  learnRecommendationFactorWeights,
  normalizeRecommendationFactorWeights,
  outcomeFromExcess,
  scoreRecommendationFromFactorSnapshot,
  winsorizeSeries,
} from "../lib/recommender_core.mjs";
import { numberOrNull } from "../lib/market_core.mjs";

const DEFAULT_HORIZONS = [1, 3, 5, 10, 20, 60];
const DEFAULT_WEIGHTS = normalizeRecommendationFactorWeights();
export const BENCHMARK_TICKERS = Object.freeze([
  "SPY",
  "QQQ",
  "XLK",
  "XLE",
  "XLF",
  "XLV",
  "XLY",
  "XLP",
  "XLI",
  "XLB",
  "XLU",
  "XLRE",
  "XLC",
  "SMH",
]);
const BENCHMARK_TICKER_SET = new Set(BENCHMARK_TICKERS);
const BRIDGE_VENV_PYTHON = fileURLToPath(new URL("../.venv-bridges/bin/python", import.meta.url));
const PYTHON = process.env.BRIDGE_PYTHON
  || process.env.HISTORICAL_BRIDGE_PYTHON
  || (fs.existsSync(BRIDGE_VENV_PYTHON) ? BRIDGE_VENV_PYTHON : "")
  || process.env.SQLITE_SYNC_PYTHON
  || "python3";
const QUANTSTATS_BRIDGE = fileURLToPath(new URL("../scripts/quantstats_bridge.py", import.meta.url));
const ALPHALENS_BRIDGE = fileURLToPath(new URL("../scripts/alphalens_bridge.py", import.meta.url));

function safeTicker(value = "") {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 16);
}

function isBenchmarkTicker(value = "") {
  return BENCHMARK_TICKER_SET.has(safeTicker(value));
}

function ymd(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : raw.slice(0, 10);
}

function pct(value) {
  const n = numberOrNull(value);
  return Number.isFinite(n) ? n : null;
}

function mean(values = []) {
  const rows = values.filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

function std(values = []) {
  const rows = values.filter(Number.isFinite);
  if (rows.length < 2) return null;
  const avg = mean(rows);
  return Math.sqrt(rows.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (rows.length - 1));
}

function rankNumbers(values = []) {
  const sorted = values
    .map((value, index) => ({ value: pct(value), index }))
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length).fill(null);
  for (let index = 0; index < sorted.length; index += 1) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1].value === sorted[index].value) end += 1;
    const rank = (index + end + 2) / 2;
    for (let cursor = index; cursor <= end; cursor += 1) ranks[sorted[cursor].index] = rank;
    index = end;
  }
  return ranks;
}

function correlation(xs = [], ys = []) {
  const pairs = xs.map((x, index) => [pct(x), pct(ys[index])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const xAvg = mean(pairs.map(([x]) => x));
  const yAvg = mean(pairs.map(([, y]) => y));
  let numerator = 0;
  let xDen = 0;
  let yDen = 0;
  for (const [x, y] of pairs) {
    const xd = x - xAvg;
    const yd = y - yAvg;
    numerator += xd * yd;
    xDen += xd * xd;
    yDen += yd * yd;
  }
  const denom = Math.sqrt(xDen * yDen);
  return denom ? numerator / denom : null;
}

function rankCorrelation(xs = [], ys = []) {
  return correlation(rankNumbers(xs), rankNumbers(ys));
}

function hashJson(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sqliteJson(dbPath, sql, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    execFile("sqlite3", ["-json", dbPath, sql], { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}${stderr ? `; ${stderr}` : ""}`));
        return;
      }
      const text = String(stdout || "").trim();
      if (!text) {
        resolve([]);
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (parseError) {
        reject(new Error(`sqlite3 JSON parse failed: ${parseError.message}; output=${text.slice(0, 300)}`));
      }
    });
  });
}

function sqliteExec(dbPath, sql, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = execFile("sqlite3", [dbPath], { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}${stderr ? `; ${stderr}` : ""}`));
        return;
      }
      resolve(stdout);
    });
    child.stdin.end(sql);
  });
}

function runJsonBridge(scriptPath, payload, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON, [scriptPath], { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}${stderr ? `; ${stderr}` : ""}`));
        return;
      }
      try {
        resolve(JSON.parse(String(stdout || "{}").trim() || "{}"));
      } catch (parseError) {
        reject(new Error(`bridge JSON parse failed: ${parseError.message}; stderr=${String(stderr || "").slice(0, 300)}`));
      }
    }).stdin.end(JSON.stringify(payload));
  });
}

function sqlText(value = "") {
  return String(value || "").replace(/'/g, "''");
}

function sqlJson(value) {
  return sqlText(JSON.stringify(value ?? null));
}

function groupBars(rows = []) {
  const byTicker = new Map();
  for (const row of normalizeHistoricalBars(rows)) {
    const ticker = safeTicker(row.ticker);
    if (!ticker) continue;
    if (!byTicker.has(ticker)) byTicker.set(ticker, []);
    byTicker.get(ticker).push(row);
  }
  for (const rowsForTicker of byTicker.values()) rowsForTicker.sort((a, b) => a.date.localeCompare(b.date));
  return byTicker;
}

function regimeForDate(regimes = [], date = "") {
  const target = ymd(date);
  return (regimes || [])
    .map((row) => ({
      date: ymd(row.date),
      bucket: row.bucket || row.regime || "",
      risk_score: pct(row.risk_score ?? row.riskScore ?? row.score),
      json: row.json,
    }))
    .filter((row) => row.date && row.date <= target)
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function allDatesFromBars(byTicker = new Map(), minLookback = 60) {
  const dates = new Set();
  for (const rows of byTicker.values()) {
    for (let index = Math.max(0, minLookback - 1); index < rows.length - 1; index += 1) dates.add(rows[index].date);
  }
  return [...dates].sort();
}

function barAfter(rows = [], date = "") {
  const target = ymd(date);
  return rows.find((row) => row.date > target) || null;
}

function barAtHorizon(rows = [], entryDate = "", horizonDays = 1) {
  const startIndex = rows.findIndex((row) => row.date >= entryDate);
  if (startIndex < 0) return null;
  const index = startIndex + Math.max(0, Number(horizonDays) - 1);
  return rows[index] || null;
}

function returnPct(entryPrice, exitPrice, roundTripCostBps = 0) {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(exitPrice)) return null;
  return ((exitPrice - entryPrice) / entryPrice) * 100 - (Number(roundTripCostBps) || 0) / 100;
}

function benchmarkReturn(spyRows = [], signalDate = "", exitDate = "", roundTripCostBps = 0) {
  const entry = barAfter(spyRows, signalDate);
  const exit = entry ? spyRows.find((row) => row.date >= exitDate) || null : null;
  const value = entry && exit ? returnPct(entry.open, exit.close, roundTripCostBps) : null;
  return {
    label: "SPY",
    returnPct: value,
    components: entry && exit
      ? [{ ticker: "SPY", entryDate: entry.date, exitDate: exit.date, entryPrice: entry.open, exitPrice: exit.close, returnPct: value, weight: 1 }]
      : [],
  };
}

const SECTOR_ETF_BY_NAME = [
  [/information technology|technology|software|semiconductor/i, "XLK"],
  [/communication services|communication|media|telecom/i, "XLC"],
  [/consumer discretionary|automobiles|retail/i, "XLY"],
  [/consumer staples|food|beverage|household|personal products/i, "XLP"],
  [/energy|oil|gas/i, "XLE"],
  [/financials|banks|insurance|diversified financials/i, "XLF"],
  [/health care|pharma|biotech|life sciences/i, "XLV"],
  [/industrials|capital goods|transportation|aerospace|defense/i, "XLI"],
  [/materials|metals|mining|chemicals|paper/i, "XLB"],
  [/real estate|reit/i, "XLRE"],
  [/utilities|utility/i, "XLU"],
];

function sectorEtfForSecurity(row = {}) {
  const text = [row.sector, row.industry_group, row.industry, row.name].filter(Boolean).join(" ");
  for (const [pattern, etf] of SECTOR_ETF_BY_NAME) {
    if (pattern.test(text)) return etf;
  }
  return "";
}

function securityMasterMap(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const ticker = safeTicker(row.ticker);
    if (ticker) map.set(ticker, row);
  }
  return map;
}

function normalizeUniverseMembership(rows = []) {
  return (rows || [])
    .map((row) => {
      let json = row.json || row.payload || null;
      if (typeof json === "string") {
        try {
          json = JSON.parse(json);
        } catch {
          json = null;
        }
      }
      return {
        ticker: safeTicker(row.ticker ?? json?.ticker),
        addedAt: ymd(row.added_at ?? row.addedAt ?? row.start_date ?? json?.addedAt),
        removedAt: ymd(row.removed_at ?? row.removedAt ?? row.end_date ?? json?.removedAt),
        source: row.source || json?.sourceMeta?.sourceUrl || json?.sourceMeta?.repository || "",
        json,
      };
    })
    .filter((row) => row.ticker && row.addedAt)
    .sort((a, b) => a.ticker.localeCompare(b.ticker) || a.addedAt.localeCompare(b.addedAt));
}

function activeUniverseTickersForDate(rows = [], date = "") {
  const target = ymd(date);
  const active = new Set();
  for (const row of rows) {
    if (!row.ticker || !row.addedAt) continue;
    if (row.addedAt > target) continue;
    if (row.removedAt && row.removedAt <= target) continue;
    active.add(row.ticker);
  }
  return active;
}

function universeCoverageSummary(byTicker = new Map(), membershipRows = [], dates = [], mode = "watchlist") {
  if (mode !== "pit") {
    const tickers = [...byTicker.keys()].filter((ticker) => !isBenchmarkTicker(ticker));
    return {
      schemaVersion: "universe-coverage-v1",
      mode: "watchlist",
      totalMembers: tickers.length,
      membersWithBars: tickers.length,
      coveragePct: tickers.length ? 100 : null,
      missingBarsSample: [],
    };
  }
  const start = dates[0] || "0000-00-00";
  const end = dates.at(-1) || "9999-12-31";
  const members = new Set();
  for (const row of membershipRows) {
    if (!row.ticker) continue;
    if (row.addedAt > end) continue;
    if (row.removedAt && row.removedAt <= start) continue;
    members.add(row.ticker);
  }
  const withBars = [...members].filter((ticker) => byTicker.has(ticker));
  const missing = [...members].filter((ticker) => !byTicker.has(ticker)).sort();
  return {
    schemaVersion: "universe-coverage-v1",
    mode: "pit",
    totalMembers: members.size,
    membersWithBars: withBars.length,
    coveragePct: members.size ? Number(((withBars.length / members.size) * 100).toFixed(2)) : null,
    missingBarsSample: missing.slice(0, 25),
  };
}

function benchmarkBasketForTicker(ticker = "", securityMaster = new Map(), byTicker = new Map()) {
  const row = securityMaster.get(safeTicker(ticker)) || {};
  const sectorEtf = sectorEtfForSecurity(row);
  const basket = [{ ticker: "SPY", weight: sectorEtf ? 0.5 : 1, source: "historical_bars" }];
  let status = row.sector ? "sector_mapping_ok" : "missing_sector_mapping";
  if (sectorEtf) {
    basket.push({ ticker: sectorEtf, weight: 0.5, source: "security_master_ext" });
    if (!byTicker.has(sectorEtf)) status = "sector_mapping_missing_bars";
  }
  return {
    basket,
    status,
    sector: row.sector || "",
    industryGroup: row.industry_group || row.industryGroup || "",
    industry: row.industry || "",
  };
}

function benchmarkReturnForBasket(byTicker = new Map(), basket = [], signalDate = "", exitDate = "", roundTripCostBps = 0) {
  const components = [];
  const requiredTickers = (basket || []).map((item) => safeTicker(item.ticker)).filter(Boolean);
  const missingTickers = [];
  for (const item of basket || []) {
    const ticker = safeTicker(item.ticker);
    const rows = byTicker.get(ticker) || [];
    const entry = barAfter(rows, signalDate);
    const exit = entry ? rows.find((row) => row.date >= exitDate) || null : null;
    const value = entry && exit ? returnPct(entry.open, exit.close, roundTripCostBps) : null;
    if (Number.isFinite(value)) {
      components.push({
        ticker,
        weight: pct(item.weight) ?? 0,
        entryDate: entry.date,
        exitDate: exit.date,
        entryPrice: entry.open,
        exitPrice: exit.close,
        returnPct: value,
      });
    } else if (ticker) {
      missingTickers.push(ticker);
    }
  }
  const missingSpy = requiredTickers.includes("SPY") && !components.some((item) => item.ticker === "SPY");
  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  const value = !missingSpy && totalWeight > 0
    ? components.reduce((sum, item) => sum + item.returnPct * (item.weight / totalWeight), 0)
    : null;
  return {
    label: components.map((item) => item.ticker).join("+") || "",
    returnPct: value,
    components,
    status: Number.isFinite(value)
      ? (missingTickers.length ? "partial_benchmark" : "ok")
      : "missing_benchmark",
    missingTickers,
  };
}

function maxDrawdownFromReturns(returns = []) {
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let duration = 0;
  let maxDuration = 0;
  let guardedReturnCount = 0;
  for (const value of returns) {
    if (!Number.isFinite(value)) continue;
    const bounded = value <= -99.9 ? -99.9 : value;
    guardedReturnCount += bounded !== value ? 1 : 0;
    equity *= 1 + bounded / 100;
    if (equity >= peak) {
      peak = equity;
      duration = 0;
    } else {
      const drawdown = (equity / peak - 1) * 100;
      maxDrawdown = Math.min(maxDrawdown, drawdown);
      duration += 1;
      maxDuration = Math.max(maxDuration, duration);
    }
  }
  return { pct: maxDrawdown, duration, maxDuration, recovered: duration === 0, guardedReturnCount };
}

export function historicalMaxDrawdownFromReturns(returns = []) {
  return maxDrawdownFromReturns(returns);
}

function metric(value, n, source = "historical-backtest") {
  return { value: Number.isFinite(value) ? value : null, n, source };
}

function compoundReturnPct(values = []) {
  const rows = values.filter(Number.isFinite);
  if (!rows.length) return null;
  let equity = 1;
  for (const value of rows) equity *= 1 + Math.max(value, -99.9) / 100;
  return (equity - 1) * 100;
}

function equityAndDrawdownCurve(dailyRows = []) {
  let equity = 1;
  let peak = 1;
  return dailyRows
    .filter((row) => Number.isFinite(pct(row.avgExcessPct)))
    .map((row) => {
      const value = Math.max(pct(row.avgExcessPct), -99.9);
      equity *= 1 + value / 100;
      peak = Math.max(peak, equity);
      const drawdownPct = peak > 0 ? (equity / peak - 1) * 100 : null;
      return {
        date: row.date,
        returnPct: value,
        equity: Number(equity.toFixed(8)),
        drawdownPct: Number.isFinite(drawdownPct) ? drawdownPct : null,
        n: row.outcomeSamples || 0,
      };
    });
}

function aggregateOutcomes(outcomes = [], primaryHorizon = 20, dailyRows = []) {
  const rows = outcomes.filter((row) => row.horizonDays === primaryHorizon && row.outcomeUsable !== false);
  const primaryRowsAll = outcomes.filter((row) => row.horizonDays === primaryHorizon);
  const missingBenchmark = primaryRowsAll.filter((row) => row.benchmarkStatus === "missing_benchmark" || row.outcomeUsable === false && row.excessPct === null).length;
  const excess = rows.map((row) => pct(row.excessPct)).filter(Number.isFinite);
  const raw = rows.map((row) => pct(row.rawReturnPct)).filter(Number.isFinite);
  const benchmark = rows.map((row) => pct(row.benchmarkReturnPct)).filter(Number.isFinite);
  const wins = rows.filter((row) => row.outcome === "win").length;
  const losses = rows.filter((row) => row.outcome === "loss").length;
  const positive = excess.filter((value) => value > 0);
  const negative = excess.filter((value) => value < 0);
  const dailyExcess = (dailyRows || []).map((row) => pct(row.avgExcessPct)).filter(Number.isFinite);
  const dailyRaw = (dailyRows || []).map((row) => pct(row.portfolioReturnPct ?? row.avgRawReturnPct)).filter(Number.isFinite);
  const dailyBenchmark = (dailyRows || []).map((row) => pct(row.benchmarkReturnPct ?? row.avgBenchmarkReturnPct)).filter(Number.isFinite);
  const avgExcess = mean(excess);
  const avgRaw = mean(raw);
  const avgBenchmark = mean(benchmark);
  const portfolioAvg = mean(dailyExcess);
  const volatility = std(dailyExcess);
  const downside = std(dailyExcess.filter((value) => value < 0));
  const maxDrawdown = maxDrawdownFromReturns(dailyExcess);
  const totalExcessReturnPct = compoundReturnPct(dailyExcess);
  const totalRawReturnPct = compoundReturnPct(dailyRaw);
  const totalBenchmarkReturnPct = compoundReturnPct(dailyBenchmark);
  const years = dailyExcess.length ? Math.max(dailyExcess.length / 252, 1 / 252) : null;
  const cagr = Number.isFinite(totalExcessReturnPct) && years ? ((1 + totalExcessReturnPct / 100) ** (1 / years) - 1) * 100 : null;
  const profit = positive.reduce((sum, value) => sum + value, 0);
  const loss = Math.abs(negative.reduce((sum, value) => sum + value, 0));
  return {
    primaryHorizon,
    sampleCount: rows.length,
    missingBenchmark: { count: missingBenchmark, n: primaryRowsAll.length, source: "historical-backtest" },
    avgExcessPct: metric(avgExcess, rows.length),
    totalReturnPct: metric(totalRawReturnPct, dailyRaw.length),
    excessReturnPct: metric(totalExcessReturnPct, dailyExcess.length),
    cagr: metric(cagr, rows.length),
    excessVsSpy: metric(avgExcess, rows.length),
    avgRawReturnPct: metric(avgRaw, rows.length),
    avgBenchmarkReturnPct: metric(avgBenchmark, rows.length),
    portfolioDailyExcessPct: metric(portfolioAvg, dailyExcess.length),
    benchmarkTotalReturnPct: metric(totalBenchmarkReturnPct, dailyBenchmark.length),
    maxDrawdown: {
      ...metric(maxDrawdown.pct, dailyExcess.length),
      duration: maxDrawdown.maxDuration,
      recovered: maxDrawdown.recovered,
      guardedReturnCount: maxDrawdown.guardedReturnCount,
    },
    calmar: metric(Number.isFinite(cagr) && maxDrawdown.pct < 0 ? cagr / Math.abs(maxDrawdown.pct) : null, rows.length),
    sharpe: metric(Number.isFinite(portfolioAvg) && Number.isFinite(volatility) && volatility > 0 ? (portfolioAvg / volatility) * Math.sqrt(252) : null, dailyExcess.length),
    sortino: metric(Number.isFinite(portfolioAvg) && Number.isFinite(downside) && downside > 0 ? (portfolioAvg / downside) * Math.sqrt(252) : null, dailyExcess.length),
    volatility: metric(volatility, dailyExcess.length),
    hitRate: metric(rows.length ? wins / rows.length : null, rows.length),
    payoff: metric(positive.length && negative.length ? mean(positive) / Math.abs(mean(negative)) : null, rows.length),
    expectancy: metric(avgExcess, rows.length),
    profitFactor: metric(loss > 0 ? profit / loss : profit > 0 ? Infinity : null, rows.length),
    precisionAt10: metric(rows.length ? wins / rows.length : null, rows.length),
    dailyExcess,
    wins,
    losses,
  };
}

function dailyTable(decisions = [], outcomes = [], primaryHorizon = 20) {
  const byDate = new Map();
  for (const decision of decisions) {
    const date = ymd(decision.signalDate || decision.generatedAt);
    if (!byDate.has(date)) byDate.set(date, { date, decisions: 0, tickers: [], outcomeSamples: 0, avgExcessPct: null, avgRawReturnPct: null, avgBenchmarkReturnPct: null, _excess: [], _raw: [], _benchmark: [] });
    const row = byDate.get(date);
    row.decisions += 1;
    row.tickers.push(decision.ticker);
  }
  for (const outcome of outcomes.filter((row) => row.horizonDays === primaryHorizon && row.outcomeUsable !== false)) {
    const date = ymd(outcome.decisionAt);
    if (!byDate.has(date)) byDate.set(date, { date, decisions: 0, tickers: [], outcomeSamples: 0, avgExcessPct: null, avgRawReturnPct: null, avgBenchmarkReturnPct: null, _excess: [], _raw: [], _benchmark: [] });
    const row = byDate.get(date);
    row.outcomeSamples += 1;
    const excess = pct(outcome.excessPct);
    const raw = pct(outcome.rawReturnPct);
    const benchmark = pct(outcome.benchmarkReturnPct);
    if (Number.isFinite(excess)) row._excess.push(excess);
    if (Number.isFinite(raw)) row._raw.push(raw);
    if (Number.isFinite(benchmark)) row._benchmark.push(benchmark);
  }
  return [...byDate.values()]
    .map((row) => {
      row.avgExcessPct = mean(row._excess);
      row.avgRawReturnPct = mean(row._raw);
      row.avgBenchmarkReturnPct = mean(row._benchmark);
      delete row._excess;
      delete row._raw;
      delete row._benchmark;
      return row;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function spyDailyReturnForDate(spyRows = [], date = "") {
  const target = ymd(date);
  const index = spyRows.findIndex((row) => row.date >= target);
  if (index <= 0) return null;
  const previous = spyRows[index - 1];
  const current = spyRows[index];
  if (!current || current.date !== target) return null;
  return returnPct(previous.close, current.close, 0);
}

function portfolioDailyBook(decisions = [], byTicker = new Map(), spyRows = [], primaryHorizon = 20, roundTripCostBps = 0) {
  const byDate = new Map();
  const entryExitCostPct = (Number(roundTripCostBps) || 0) / 200;
  for (const decision of decisions || []) {
    const ticker = safeTicker(decision.ticker);
    const rows = byTicker.get(ticker) || [];
    const entryIndex = rows.findIndex((row) => row.date >= decision.entryDate);
    if (entryIndex < 0) continue;
    const exitIndex = Math.min(rows.length - 1, entryIndex + Math.max(1, Number(primaryHorizon || 1)) - 1);
    for (let index = entryIndex; index <= exitIndex; index += 1) {
      const row = rows[index];
      const previousPrice = index === entryIndex ? pct(decision.entryPrice) : pct(rows[index - 1]?.close);
      const currentPrice = pct(row.close);
      let positionReturnPct = returnPct(previousPrice, currentPrice, 0);
      if (!Number.isFinite(positionReturnPct)) continue;
      if (index === entryIndex) positionReturnPct -= entryExitCostPct;
      if (index === exitIndex) positionReturnPct -= entryExitCostPct;
      const date = row.date;
      if (!byDate.has(date)) {
        byDate.set(date, {
          date,
          decisions: 0,
          newDecisions: 0,
          openPositions: 0,
          tickers: [],
          outcomeSamples: 0,
          avgExcessPct: null,
          avgRawReturnPct: null,
          avgBenchmarkReturnPct: null,
          portfolioReturnPct: null,
          benchmarkReturnPct: null,
          _positionReturns: [],
        });
      }
      const daily = byDate.get(date);
      daily._positionReturns.push(positionReturnPct);
      daily.tickers.push(ticker);
      daily.openPositions += 1;
    }
  }
  for (const decision of decisions || []) {
    const date = ymd(decision.signalDate || decision.generatedAt);
    if (!byDate.has(date)) {
      byDate.set(date, {
        date,
        decisions: 0,
        newDecisions: 0,
        openPositions: 0,
        tickers: [],
        outcomeSamples: 0,
        avgExcessPct: null,
        avgRawReturnPct: null,
        avgBenchmarkReturnPct: null,
        portfolioReturnPct: null,
        benchmarkReturnPct: null,
        _positionReturns: [],
      });
    }
    byDate.get(date).newDecisions += 1;
  }
  return [...byDate.values()]
    .map((row) => {
      const portfolioReturnPct = mean(row._positionReturns);
      const benchmarkReturnPct = spyDailyReturnForDate(spyRows, row.date);
      const benchmarkAvailable = Number.isFinite(benchmarkReturnPct);
      const excess = Number.isFinite(portfolioReturnPct) && benchmarkAvailable
        ? portfolioReturnPct - benchmarkReturnPct
        : null;
      row.decisions = row.openPositions;
      row.tickers = [...new Set(row.tickers)].sort();
      row.portfolioReturnPct = portfolioReturnPct;
      row.benchmarkReturnPct = benchmarkReturnPct;
      row.benchmarkStatus = benchmarkAvailable ? "ok" : "missing_benchmark";
      row.avgRawReturnPct = portfolioReturnPct;
      row.avgBenchmarkReturnPct = benchmarkReturnPct;
      row.avgExcessPct = excess;
      delete row._positionReturns;
      return row;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeOutcomeSamplesIntoDaily(dailyRows = [], outcomes = [], primaryHorizon = 20) {
  const byDate = new Map((dailyRows || []).map((row) => [row.date, { ...row }]));
  for (const outcome of outcomes.filter((row) => row.horizonDays === primaryHorizon && row.outcomeUsable !== false)) {
    const date = ymd(outcome.decisionAt);
    if (!byDate.has(date)) {
      byDate.set(date, {
        date,
        decisions: 0,
        newDecisions: 0,
        openPositions: 0,
        tickers: [],
        outcomeSamples: 0,
        avgExcessPct: null,
        avgRawReturnPct: null,
        avgBenchmarkReturnPct: null,
        portfolioReturnPct: null,
        benchmarkReturnPct: null,
      });
    }
    byDate.get(date).outcomeSamples += 1;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function periodTable(outcomes = [], primaryHorizon = 20, size = 7) {
  const rows = outcomes.filter((row) => row.horizonDays === primaryHorizon && row.outcomeUsable !== false);
  const byMonth = new Map();
  const byQuarter = new Map();
  for (const outcome of rows) {
    const date = ymd(outcome.decisionAt);
    const month = date.slice(0, 7);
    const quarter = `${date.slice(0, 4)}Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
    for (const [map, key] of [[byMonth, month], [byQuarter, quarter]]) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(pct(outcome.excessPct));
    }
  }
  const summarize = (map) => [...map.entries()].map(([period, values]) => ({ period, n: values.filter(Number.isFinite).length, avgExcessPct: mean(values) })).slice(-size);
  return { monthly: summarize(byMonth), quarterly: summarize(byQuarter) };
}

function factorStats(outcomes = []) {
  const usable = outcomes.filter((row) => row.outcomeUsable !== false);
  const clippedReturns = winsorizeSeries(usable.map((row) => row.excessPct), { enabled: true, lowerPct: 1, upperPct: 99 });
  const clippedOutcomes = usable.map((outcome, index) => ({ ...outcome, excessPct: clippedReturns.values[index] }));
  const stats = buildFactorStatsFromOutcomes(clippedOutcomes, {
    source: "historical-backtest",
    deadbandPct: 0.5,
  });
  for (const row of Object.values(stats)) {
    row.winsorization = {
      enabled: clippedReturns.enabled,
      lower: clippedReturns.lower,
      upper: clippedReturns.upper,
      clipCount: clippedReturns.clipCount,
    };
  }
  return stats;
}

function outcomeRegimeBucket(outcome = {}) {
  const direct = outcome.regimeBucket || outcome.regime || outcome.regimeTag?.bucket;
  if (direct) return String(direct);
  const raw = outcome.factorSnapshot?.factors?.macroRegime?.raw || {};
  return raw.bucket || raw.regime || raw.marketRegime || "unknown";
}

function quantileSpreadForFactor(outcomes = [], factorId = "") {
  const rows = outcomes
    .filter((row) => row.outcomeUsable !== false)
    .map((outcome) => ({
      score: pct(outcome.factorSnapshot?.factors?.[factorId]?.score),
      excess: pct(outcome.excessPct),
    }))
    .filter((row) => Number.isFinite(row.score) && Number.isFinite(row.excess))
    .sort((a, b) => a.score - b.score);
  if (rows.length < 20) {
    return { value: null, n: rows.length, source: "historical-backtest", status: "not-enough-cross-section" };
  }
  const bucket = Math.max(1, Math.floor(rows.length / 5));
  const low = rows.slice(0, bucket).map((row) => row.excess);
  const high = rows.slice(-bucket).map((row) => row.excess);
  return {
    value: (mean(high) ?? 0) - (mean(low) ?? 0),
    n: rows.length,
    source: "historical-backtest",
    topQuantileAvgExcessPct: mean(high),
    bottomQuantileAvgExcessPct: mean(low),
  };
}

function icDecayForFactor(outcomes = [], factorId = "") {
  const byHorizon = new Map();
  for (const outcome of outcomes.filter((row) => row.outcomeUsable !== false)) {
    const horizon = Number(outcome.horizonDays || 0);
    if (!horizon) continue;
    if (!byHorizon.has(horizon)) byHorizon.set(horizon, { scores: [], returns: [], keys: [] });
    const row = byHorizon.get(horizon);
    row.scores.push(pct(outcome.factorSnapshot?.factors?.[factorId]?.score));
    row.returns.push(pct(outcome.excessPct));
    row.keys.push(outcome.decisionId || outcome.id || `${outcome.ticker || ""}:${outcome.decisionAt || ""}:${outcome.action || ""}`);
  }
  const curve = [...byHorizon.entries()]
    .map(([horizonDays, row]) => ({
      horizonDays,
      rankIC: rankCorrelation(row.scores, row.returns),
      n: row.scores.filter((value, index) => Number.isFinite(value) && Number.isFinite(row.returns[index])).length,
      effectiveN: new Set(row.keys.filter(Boolean)).size || row.scores.filter((value, index) => Number.isFinite(value) && Number.isFinite(row.returns[index])).length,
      effectiveNMethod: "unique-decision-non-overlap",
    }))
    .filter((row) => row.n >= 3)
    .sort((a, b) => a.horizonDays - b.horizonDays);
  if (curve.length < 2) {
    return { value: null, n: curve.reduce((sum, row) => sum + row.n, 0), source: "historical-backtest", status: "not-enough-horizons", curve };
  }
  const first = curve[0];
  const last = curve.at(-1);
  return {
    value: Number.isFinite(first.rankIC) && Number.isFinite(last.rankIC) ? last.rankIC - first.rankIC : null,
    n: curve.reduce((sum, row) => sum + row.n, 0),
    source: "historical-backtest",
    status: "ok",
    curve,
  };
}

function regimeSplit(outcomes = []) {
  const byRegime = new Map();
  for (const outcome of outcomes.filter((row) => row.outcomeUsable !== false)) {
    const regime = outcomeRegimeBucket(outcome);
    if (!byRegime.has(regime)) byRegime.set(regime, []);
    byRegime.get(regime).push(outcome);
  }
  return [...byRegime.entries()]
    .map(([regime, rows]) => {
      const excess = rows.map((row) => pct(row.excessPct)).filter(Number.isFinite);
      const wins = rows.filter((row) => row.outcome === "win").length;
      return {
        regime,
        n: rows.length,
        avgExcessPct: mean(excess),
        hitRate: rows.length ? wins / rows.length : null,
        horizons: [...new Set(rows.map((row) => row.horizonDays).filter(Boolean))].sort((a, b) => a - b),
        source: "historical-backtest",
      };
    })
    .sort((a, b) => b.n - a.n);
}

function factorAnalysis(outcomes = []) {
  const stats = factorStats(outcomes);
  const rows = Object.values(stats);
  const usable = outcomes.filter((row) => row.outcomeUsable !== false);
  const correlationMatrix = buildFactorCorrelationMatrix(usable.map((outcome) => outcome.factorSnapshot).filter(Boolean), { minN: 3 });
  return {
    schemaVersion: "historical-factor-analysis-v1",
    factorStats: stats,
    rankIC: Object.fromEntries(rows.map((row) => [row.id, {
      value: row.rankIC,
      n: row.samples,
      effectiveN: row.effectiveN,
      effectiveNMethod: row.effectiveNMethod,
      source: "historical-backtest",
    }])),
    quantileSpreads: Object.fromEntries(rows.map((row) => [row.id, quantileSpreadForFactor(usable, row.id)])),
    icDecay: Object.fromEntries(rows.map((row) => [row.id, icDecayForFactor(usable, row.id)])),
    regimeSplit: regimeSplit(usable),
    correlationMatrix,
  };
}

function weightTrajectory(outcomes = [], currentWeights = DEFAULT_WEIGHTS, options = {}) {
  const windowDays = Math.max(20, Number(options.weightWindowDays || 120));
  const stepDays = Math.max(5, Number(options.weightStepDays || 20));
  const dates = [...new Set(outcomes.map((row) => ymd(row.decisionAt)).filter(Boolean))].sort();
  if (dates.length < 2) return [];
  const windows = [];
  for (let endIndex = Math.min(windowDays, dates.length) - 1; endIndex < dates.length; endIndex += stepDays) {
    const startIndex = Math.max(0, endIndex - windowDays + 1);
    const startDate = dates[startIndex];
    const endDate = dates[endIndex];
    const windowOutcomes = outcomes.filter((row) => {
      const date = ymd(row.decisionAt);
      return date >= startDate && date <= endDate && row.outcomeUsable !== false;
    });
    const stats = factorStats(windowOutcomes);
    const learned = learnRecommendationFactorWeights(stats, {
      currentWeights,
      minSamples: options.minSamples || 20,
      maxStepPct: options.maxStepPct || 1,
      source: "historical-backtest-window",
    });
    windows.push({
      startDate,
      endDate,
      n: windowOutcomes.length,
      status: windowOutcomes.length >= (options.minSamples || 20) ? "ok" : "low-sample",
      candidateWeights: learned.learnedWeights || {},
      factorRankIC: Object.fromEntries(Object.entries(stats).map(([id, row]) => [id, {
        value: row.rankIC,
        n: row.samples,
        effectiveN: row.effectiveN,
        effectiveNMethod: row.effectiveNMethod,
        source: "historical-backtest-window",
      }])),
    });
  }
  return windows;
}

function weightOutputs(stats = {}, currentWeights = DEFAULT_WEIGHTS, options = {}, outcomes = []) {
  const learned = learnRecommendationFactorWeights(stats, {
    currentWeights,
    minSamples: options.minSamples || 20,
    maxStepPct: options.maxStepPct || 1,
    source: "historical-backtest",
  });
  const positive = Object.values(stats).filter((row) => Number.isFinite(row.rankIC) && row.rankIC > 0);
  const total = positive.reduce((sum, row) => sum + Math.abs(row.rankIC), 0);
  const referenceWeights = total > 0
    ? Object.fromEntries(Object.keys(currentWeights).map((id) => [id, Number(((positive.find((row) => row.id === id)?.rankIC || 0) / total).toFixed(6))]))
    : {};
  const verdicts = Object.fromEntries(
    Object.entries(currentWeights).map(([id]) => {
      const row = stats[id] || {};
      const n = Number(row.samples || 0);
      const rankIC = pct(row.rankIC);
      return [
        id,
        {
          factorId: id,
          n,
          source: "historical-backtest",
          verdict: n < (options.minSamples || 20) ? "needs-more-samples" : rankIC < -0.05 ? "floor" : "keep",
          rankIC: Number.isFinite(rankIC) ? rankIC : null,
        },
      ];
    }),
  );
  return {
    schemaVersion: "historical-weight-output-v1",
    candidateWeights: {
      ...learned,
      status: "candidate-only",
      note: "Historical weights are candidate strategy-version inputs only; live active weights require human promotion.",
    },
    referenceWeights: { source: "historical-backtest", label: "reference-only", weights: referenceWeights },
    trajectory: {
      schemaVersion: "historical-weight-trajectory-v1",
      windowDays: Math.max(20, Number(options.weightWindowDays || 120)),
      stepDays: Math.max(5, Number(options.weightStepDays || 20)),
      windows: weightTrajectory(outcomes, currentWeights, options),
    },
    verdicts,
  };
}

function buildReport(run = {}) {
  const metrics = run.metrics || {};
  const n = metrics.sampleCount || 0;
  const summary = n
    ? `历史 walk-forward 使用 ${n} 个主 horizon 样本，平均超额 ${Number(metrics.excessVsSpy?.value || 0).toFixed(2)}%，命中率 ${Number((metrics.hitRate?.value || 0) * 100).toFixed(1)}%。`
    : "历史 walk-forward 语料为空或未产生到期样本，当前只能验证引擎和数据缺口，不能解读收益表现。";
  return {
    schemaVersion: "historical-backtest-report-v1",
    id: run.id,
    generatedAt: new Date().toISOString(),
    narrativeZh: summary,
    json: run,
    provenance: run.provenance,
  };
}

function quantstatsPayload(run = {}) {
  return {
    schemaVersion: "quantstats-input-v1",
    daily: (run.daily || []).map((row) => ({
      date: row.date,
      returnPct: row.portfolioReturnPct ?? row.avgRawReturnPct ?? row.avgExcessPct,
      benchmarkReturnPct: row.benchmarkReturnPct ?? row.avgBenchmarkReturnPct ?? 0,
    })),
    costs: {
      costBps: run.config?.costBps || 0,
      slippageBps: run.config?.slippageBps || 0,
    },
  };
}

function alphalensPayload(run = {}) {
  const byKey = new Map();
  for (const outcome of run.outcomes || []) {
    const factors = outcome.factorSnapshot?.factors || {};
    for (const [factorId, factor] of Object.entries(factors)) {
      const score = pct(factor.score);
      if (!Number.isFinite(score)) continue;
      const key = `${outcome.decisionId}|${factorId}`;
      const row = byKey.get(key) || {
        date: ymd(outcome.decisionAt),
        ticker: outcome.ticker,
        factorId,
        score,
      };
      row[`h${outcome.horizonDays}`] = pct(outcome.excessPct);
      byKey.set(key, row);
    }
  }
  return {
    schemaVersion: "alphalens-input-v1",
    horizons: run.config?.horizons || DEFAULT_HORIZONS,
    observations: [...byKey.values()],
  };
}

function historicalRunSchemaSql() {
  return `
CREATE TABLE IF NOT EXISTS historical_backtest_runs (
  id TEXT PRIMARY KEY,
  generated_at TEXT,
  status TEXT,
  decisions_count INTEGER,
  outcomes_count INTEGER,
  daily_count INTEGER,
  summary_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  report_json TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS historical_backtest_decisions (
  run_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ticker TEXT,
  signal_date TEXT,
  action_score REAL,
  alpha_score REAL,
  json TEXT NOT NULL,
  PRIMARY KEY (run_id, id)
);
CREATE INDEX IF NOT EXISTS idx_historical_backtest_decisions_run_signal
  ON historical_backtest_decisions(run_id, signal_date, ticker);
CREATE TABLE IF NOT EXISTS historical_backtest_outcomes (
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
  PRIMARY KEY (run_id, decision_id, horizon_days)
);
CREATE INDEX IF NOT EXISTS idx_historical_backtest_outcomes_run_horizon
  ON historical_backtest_outcomes(run_id, horizon_days, decision_at);
CREATE TABLE IF NOT EXISTS historical_decisions (
  run_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ticker TEXT,
  signal_date TEXT,
  action_score REAL,
  alpha_score REAL,
  json TEXT NOT NULL,
  PRIMARY KEY (run_id, id)
);
CREATE INDEX IF NOT EXISTS idx_historical_decisions_run_signal
  ON historical_decisions(run_id, signal_date, ticker);
CREATE TABLE IF NOT EXISTS historical_outcomes (
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
  PRIMARY KEY (run_id, decision_id, horizon_days)
);
CREATE INDEX IF NOT EXISTS idx_historical_outcomes_run_horizon
  ON historical_outcomes(run_id, horizon_days, decision_at);
CREATE TABLE IF NOT EXISTS historical_backtest_daily (
  run_id TEXT NOT NULL,
  date TEXT NOT NULL,
  decisions INTEGER,
  outcome_samples INTEGER,
  avg_excess_pct REAL,
  json TEXT NOT NULL,
  PRIMARY KEY (run_id, date)
);
CREATE INDEX IF NOT EXISTS idx_historical_backtest_daily_run_date
  ON historical_backtest_daily(run_id, date);
`;
}

function historicalRunSummary(run = {}) {
  return {
    schemaVersion: "historical-backtest-run-summary-v1",
    id: run.id,
    generatedAt: run.generatedAt,
    status: run.status,
    scope: run.scope,
    config: run.config,
    strategyHash: run.strategyHash,
    decisionCount: run.decisions?.length || run.detailCounts?.decisions || 0,
    outcomeCount: run.outcomes?.length || run.detailCounts?.outcomes || 0,
    dailyCount: run.daily?.length || run.detailCounts?.daily || 0,
    metrics: run.metrics,
    weightOutputs: run.weightOutputs,
    factorAnalysis: run.factorAnalysis
      ? {
          schemaVersion: run.factorAnalysis.schemaVersion,
          rankIC: run.factorAnalysis.rankIC,
          quantileSpreads: run.factorAnalysis.quantileSpreads,
          icDecay: run.factorAnalysis.icDecay,
          regimeSplit: run.factorAnalysis.regimeSplit,
        }
      : null,
    provenance: run.provenance,
    caveats: run.caveats,
  };
}

async function persistHistoricalBacktestRun(sqlitePath, run = {}, report = {}, timeoutMs = 60000) {
  if (!sqlitePath || !run?.id) return { persisted: false, reason: "missing-sqlite-or-run-id" };
  const summary = historicalRunSummary(run);
  const compactJson = {
    ...summary,
    schemaVersion: run.schemaVersion,
    metricEngines: run.metricEngines,
    equityCurve: run.equityCurve || [],
    drawdownCurve: run.drawdownCurve || [],
  };
  const statements = [
    "PRAGMA busy_timeout=60000;",
    historicalRunSchemaSql(),
    "BEGIN;",
    `DELETE FROM historical_backtest_decisions WHERE run_id='${sqlText(run.id)}';`,
    `DELETE FROM historical_backtest_outcomes WHERE run_id='${sqlText(run.id)}';`,
    `DELETE FROM historical_decisions WHERE run_id='${sqlText(run.id)}';`,
    `DELETE FROM historical_outcomes WHERE run_id='${sqlText(run.id)}';`,
    `DELETE FROM historical_backtest_daily WHERE run_id='${sqlText(run.id)}';`,
    `DELETE FROM historical_backtest_runs WHERE id='${sqlText(run.id)}';`,
    `INSERT INTO historical_backtest_runs(id, generated_at, status, decisions_count, outcomes_count, daily_count, summary_json, metrics_json, report_json, json)
      VALUES ('${sqlText(run.id)}','${sqlText(run.generatedAt)}','${sqlText(run.status)}',${Number(run.decisions?.length || 0)},${Number(run.outcomes?.length || 0)},${Number(run.daily?.length || 0)},'${sqlJson(summary)}','${sqlJson(run.metrics || {})}','${sqlJson(report || {})}','${sqlJson(compactJson)}');`,
  ];
  for (const decision of run.decisions || []) {
    const values = `('${sqlText(run.id)}','${sqlText(decision.id)}','${sqlText(decision.ticker)}','${sqlText(ymd(decision.signalDate || decision.generatedAt))}',${pct(decision.actionScore) ?? "NULL"},${pct(decision.alphaScore) ?? "NULL"},'${sqlJson(decision)}')`;
    statements.push(`INSERT OR REPLACE INTO historical_backtest_decisions(run_id, id, ticker, signal_date, action_score, alpha_score, json) VALUES ${values};`);
    statements.push(`INSERT OR REPLACE INTO historical_decisions(run_id, id, ticker, signal_date, action_score, alpha_score, json) VALUES ${values};`);
  }
  for (const outcome of run.outcomes || []) {
    const values = `('${sqlText(run.id)}','${sqlText(outcome.decisionId)}','${sqlText(outcome.ticker)}',${Number(outcome.horizonDays || 0)},'${sqlText(ymd(outcome.decisionAt))}','${sqlText(outcome.entryDate)}','${sqlText(outcome.exitDate)}',${pct(outcome.rawReturnPct) ?? "NULL"},${pct(outcome.benchmarkReturnPct) ?? "NULL"},${pct(outcome.excessPct) ?? "NULL"},'${sqlText(outcome.outcome)}','${sqlText(outcome.outcomeQualityStatus)}','${sqlText(outcomeRegimeBucket(outcome))}','${sqlJson(outcome)}')`;
    statements.push(`INSERT OR REPLACE INTO historical_backtest_outcomes(run_id, decision_id, ticker, horizon_days, decision_at, entry_date, exit_date, raw_return_pct, benchmark_return_pct, excess_pct, outcome, outcome_quality_status, regime, json) VALUES ${values};`);
    statements.push(`INSERT OR REPLACE INTO historical_outcomes(run_id, decision_id, ticker, horizon_days, decision_at, entry_date, exit_date, raw_return_pct, benchmark_return_pct, excess_pct, outcome, outcome_quality_status, regime, json) VALUES ${values};`);
  }
  for (const row of run.daily || []) {
    statements.push(
      `INSERT OR REPLACE INTO historical_backtest_daily(run_id, date, decisions, outcome_samples, avg_excess_pct, json)
       VALUES ('${sqlText(run.id)}','${sqlText(row.date)}',${Number(row.decisions || 0)},${Number(row.outcomeSamples || 0)},${pct(row.avgExcessPct) ?? "NULL"},'${sqlJson(row)}');`,
    );
  }
  statements.push("COMMIT;");
  await sqliteExec(sqlitePath, statements.join("\n"), timeoutMs);
  return { persisted: true, runId: run.id };
}

export function compactHistoricalRun(run = {}, options = {}) {
  const limit = Math.max(0, Number(options.detailLimit ?? 20));
  const decisionCount = run.decisions?.length || 0;
  const outcomeCount = run.outcomes?.length || 0;
  const dailyCount = run.daily?.length || 0;
  return {
    ...run,
    detailPersisted: true,
    detailCounts: {
      decisions: decisionCount,
      outcomes: outcomeCount,
      daily: dailyCount,
    },
    decisions: limit ? (run.decisions || []).slice(0, limit) : [],
    outcomes: limit ? (run.outcomes || []).slice(0, limit) : [],
    daily: limit ? (run.daily || []).slice(-limit) : [],
    pagination: {
      schemaVersion: "historical-backtest-pagination-v1",
      detailLimit: limit,
      endpoints: {
        decisions: `/api/recommender/historical-backtest/${encodeURIComponent(run.id)}/details?kind=decisions&page=1&pageSize=100`,
        outcomes: `/api/recommender/historical-backtest/${encodeURIComponent(run.id)}/details?kind=outcomes&page=1&pageSize=100`,
        daily: `/api/recommender/historical-backtest/${encodeURIComponent(run.id)}/details?kind=daily&page=1&pageSize=100`,
      },
    },
  };
}

async function applyMetricBridges(run = {}, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.bridgeTimeoutMs || 60000));
  const engines = {
    native: {
      engine: "native-js",
      status: "ok",
      metrics: run.metrics,
    },
  };
  try {
    const quantstats = await runJsonBridge(QUANTSTATS_BRIDGE, quantstatsPayload(run), timeoutMs);
    engines.quantstats = {
      status: quantstats.ok ? "ok" : "fail",
      ...quantstats,
    };
  } catch (error) {
    engines.quantstats = {
      status: "fail",
      ok: false,
      engine: "quantstats",
      degradation: error.message,
    };
  }
  try {
    const alphalens = await runJsonBridge(ALPHALENS_BRIDGE, alphalensPayload(run), timeoutMs);
    run.factorAnalysis = {
      ...(run.factorAnalysis || {}),
      alphalens: {
        status: alphalens.ok ? "ok" : "fail",
        ...alphalens,
      },
    };
  } catch (error) {
    run.factorAnalysis = {
      ...(run.factorAnalysis || {}),
      alphalens: {
        status: "fail",
        ok: false,
        engine: "alphalens",
        degradation: error.message,
      },
    };
  }
  const preferred = engines.quantstats?.ok && engines.quantstats?.preferredAvailable ? "quantstats" : "native-js";
  run.metricEngines = {
    schemaVersion: "metric-engines-v1",
    preferred,
    engines,
    degradationNotes: [
      engines.quantstats?.degradation ? `quantstats: ${engines.quantstats.degradation}` : "",
      run.factorAnalysis?.alphalens?.degradation ? `alphalens: ${run.factorAnalysis.alphalens.degradation}` : "",
    ].filter(Boolean),
  };
  return run;
}

export function runHistoricalWalkForwardFromRows({ bars = [], regimes = [], config = {} } = {}) {
  const runConfig = {
    schemaVersion: "historical-walk-forward-config-v1",
    topN: Math.max(1, Number(config.topN || 10)),
    maxDates: Math.max(1, Number(config.maxDates || 30)),
    minLookback: Math.max(20, Number(config.minLookback || 60)),
    horizons: (Array.isArray(config.horizons) && config.horizons.length ? config.horizons : DEFAULT_HORIZONS)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item > 0)
      .slice(0, 8),
    primaryHorizon: Math.max(1, Number(config.primaryHorizon || 20)),
    costBps: Math.max(0, Number(config.costBps || 0)),
    slippageBps: Math.max(0, Number(config.slippageBps || 0)),
    minSamplesForWeightUpdate: Math.max(1, Number(config.minSamplesForWeightUpdate || 20)),
    maxStepPct: Math.max(0, Math.min(2, Number(config.maxStepPct || 1))),
    pitFundamentalsError: config.pitFundamentalsError || "",
    securityMasterExtError: config.securityMasterExtError || "",
    universeMode: ["pit", "watchlist"].includes(String(config.universeMode || "watchlist").toLowerCase())
      ? String(config.universeMode || "watchlist").toLowerCase()
      : "watchlist",
    universeMembershipError: config.universeMembershipError || "",
  };
  const strategyHash = hashJson({ engine: "historical-walk-forward-v1", config: runConfig, weights: DEFAULT_WEIGHTS });
  const byTicker = groupBars(bars);
  const securityMaster = securityMasterMap(config.securityMasterExt || []);
  const pitRows = Array.isArray(config.pitFundamentals) ? config.pitFundamentals : [];
  const universeMembership = normalizeUniverseMembership(config.universeMembership || []);
  const dates = allDatesFromBars(byTicker, runConfig.minLookback).slice(-runConfig.maxDates);
  const universeCoverage = universeCoverageSummary(byTicker, universeMembership, dates, runConfig.universeMode);
  const spyRows = byTicker.get("SPY") || [];
  const decisions = [];
  const outcomes = [];
  const roundTripCostBps = runConfig.costBps + runConfig.slippageBps;
  for (const signalDate of dates) {
    const scored = [];
    const activeUniverse = runConfig.universeMode === "pit"
      ? activeUniverseTickersForDate(universeMembership, signalDate)
      : null;
    for (const [ticker, rows] of byTicker.entries()) {
      if (isBenchmarkTicker(ticker)) continue;
      if (activeUniverse && !activeUniverse.has(ticker)) continue;
      const eligibleBars = rows.filter((row) => row.date <= signalDate);
      if (eligibleBars.length < runConfig.minLookback) continue;
      const { factorSnapshot, recommendationScore } = buildFactorSnapshotAsOf({
        ticker,
        asOf: signalDate,
        bars: rows,
        historicalRegime: regimeForDate(regimes, signalDate),
        pitFundamentals: pitRows.filter((row) => safeTicker(row.ticker) === ticker),
        weights: DEFAULT_WEIGHTS,
      });
      scored.push({ ticker, factorSnapshot, recommendationScore, latestBar: eligibleBars.at(-1) });
    }
    const normalizedSnapshots = applyCrossSectionalNormalization(scored.map((item) => item.factorSnapshot), {
      minCrossSection: 30,
      lowerPct: 1,
      upperPct: 99,
    }).snapshots;
    scored.forEach((item, index) => {
      item.factorSnapshot = normalizedSnapshots[index] || item.factorSnapshot;
      item.recommendationScore = scoreRecommendationFromFactorSnapshot(item.factorSnapshot, { weights: DEFAULT_WEIGHTS });
    });
    scored.sort((a, b) => b.recommendationScore.actionScore - a.recommendationScore.actionScore || b.recommendationScore.alphaScore - a.recommendationScore.alphaScore);
    for (const item of scored.slice(0, runConfig.topN)) {
      const rows = byTicker.get(item.ticker) || [];
      const entry = barAfter(rows, signalDate);
      if (!entry) continue;
      const benchmarkPlan = benchmarkBasketForTicker(item.ticker, securityMaster, byTicker);
      const decision = {
        schemaVersion: "historical-pseudo-decision-v1",
        id: `historical:${strategyHash.slice(0, 12)}:${signalDate}:${item.ticker}`,
        decisionSource: "historical-backtest",
        ticker: item.ticker,
        action: "买入",
        signalDate,
        generatedAt: `${signalDate}T21:00:00.000Z`,
        entryDate: entry.date,
        entryPrice: entry.open,
        signalClose: item.latestBar?.close ?? null,
        actionScore: item.recommendationScore.actionScore,
        alphaScore: item.recommendationScore.alphaScore,
        dataQualityScore: item.factorSnapshot.dataQualityScore,
        factorSnapshot: item.factorSnapshot,
        recommendationScore: item.recommendationScore,
        strategyHash,
        costBps: runConfig.costBps,
        slippageBps: runConfig.slippageBps,
        benchmarkBasket: benchmarkPlan.basket,
        sectorBasketStatus: benchmarkPlan.status,
        sector: benchmarkPlan.sector,
        industryGroup: benchmarkPlan.industryGroup,
        industry: benchmarkPlan.industry,
      };
      decisions.push(decision);
      for (const horizon of runConfig.horizons) {
        const exit = barAtHorizon(rows, entry.date, horizon);
        if (!exit) continue;
        const raw = returnPct(entry.open, exit.close, roundTripCostBps);
        const benchmark = benchmarkReturnForBasket(byTicker, decision.benchmarkBasket, signalDate, exit.date, roundTripCostBps);
        const spyBenchmark = benchmarkReturn(spyRows, signalDate, exit.date, roundTripCostBps);
        const benchmarkPct = pct(benchmark.returnPct);
        const benchmarkStatus = Number.isFinite(benchmarkPct) ? benchmark.status || "ok" : "missing_benchmark";
        const excess = Number.isFinite(raw) && Number.isFinite(benchmarkPct) ? raw - benchmarkPct : null;
        const outcome = outcomeFromExcess(excess, 0.5);
        const quality = classifyOutcomeQuality({
          entryPrice: entry.open,
          exitPrice: exit.close,
          rawReturnPct: raw,
          benchmarkReturnPct: benchmarkPct,
          excessPct: excess,
          horizonDays: horizon,
        });
        const regimeBucket = outcomeRegimeBucket({ factorSnapshot: decision.factorSnapshot });
        outcomes.push({
          schemaVersion: "historical-backtest-outcome-v1",
          decisionId: decision.id,
          decisionSource: "historical-backtest",
          ticker: decision.ticker,
          action: decision.action,
          decisionAt: decision.generatedAt,
          entryDate: entry.date,
          exitDate: exit.date,
          horizonDays: horizon,
          entryPrice: entry.open,
          exitPrice: exit.close,
          rawReturnPct: raw,
          benchmarkTicker: benchmark.label || "SPY",
          benchmarkReturnPct: benchmarkPct,
          benchmarkStatus,
          missingBenchmarkTickers: benchmark.missingTickers || [],
          spyBenchmarkReturnPct: pct(spyBenchmark.returnPct),
          sectorBenchmarkReturnPct: benchmarkPct,
          benchmarkComponents: benchmark.components,
          sectorBasketStatus: decision.sectorBasketStatus,
          excessPct: excess,
          outcome,
          outcomeQualityStatus: quality.status,
          outcomeQualityReasons: quality.reasons,
          outcomeUsable: quality.usable && benchmarkStatus !== "missing_benchmark",
          regimeBucket,
          scoreSchema: decision.factorSnapshot.schemaVersion || decision.factorSnapshot.scoreSchema || "",
          factorSnapshot: decision.factorSnapshot,
          actionScore: decision.actionScore,
          alphaScore: decision.alphaScore,
          dataQualityScore: decision.dataQualityScore,
          strategyHash,
        });
      }
    }
  }
  const stats = factorStats(outcomes);
  const daily = mergeOutcomeSamplesIntoDaily(
    portfolioDailyBook(decisions, byTicker, spyRows, runConfig.primaryHorizon, roundTripCostBps),
    outcomes,
    runConfig.primaryHorizon,
  );
  const metrics = aggregateOutcomes(outcomes, runConfig.primaryHorizon, daily);
  const periods = periodTable(outcomes, runConfig.primaryHorizon);
  const factorPack = factorAnalysis(outcomes);
  const weights = weightOutputs(stats, DEFAULT_WEIGHTS, runConfig, outcomes);
  const equityCurve = equityAndDrawdownCurve(daily);
  const sectorBasketStatusCounts = decisions.reduce((acc, decision) => {
    const key = decision.sectorBasketStatus || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const run = {
    schemaVersion: "historical-walk-forward-run-v1",
    id: `hist-bt-${Date.now()}-${strategyHash.slice(0, 8)}`,
    generatedAt: new Date().toISOString(),
    status: dates.length ? "ok" : "empty",
    decisionSource: "historical-backtest",
    scope: {
      tickers: [...byTicker.keys()].filter((ticker) => !isBenchmarkTicker(ticker)).length,
      benchmarkTickers: [...byTicker.keys()].filter(isBenchmarkTicker).sort(),
      universeMode: runConfig.universeMode,
      pointInTimeMembers: universeCoverage.totalMembers,
      pointInTimeMembersWithBars: universeCoverage.membersWithBars,
      pointInTimeCoveragePct: universeCoverage.coveragePct,
      dates: dates.length,
      barRows: normalizeHistoricalBars(bars).length,
      regimeRows: regimes.length,
      pitFundamentalRows: pitRows.length,
      universeMembershipRows: universeMembership.length,
      horizons: runConfig.horizons,
    },
    config: runConfig,
    strategyHash,
    decisions,
    outcomes,
    daily,
    equityCurve,
    drawdownCurve: equityCurve.map((row) => ({ date: row.date, drawdownPct: row.drawdownPct, n: row.n })),
    periods,
    metrics: {
      ...metrics,
      turnover: metric(daily.length > 1 ? mean(daily.slice(1).map((row, index) => {
        const previous = new Set(daily[index].tickers || []);
        const current = new Set(row.tickers || []);
        const overlap = [...current].filter((ticker) => previous.has(ticker)).length;
        return 1 - overlap / Math.max(1, current.size, previous.size);
      })) : null, daily.length),
      costDrag: metric(roundTripCostBps / 100, decisions.length),
      exposure: metric(daily.length ? mean(daily.map((row) => Math.min(1, (row.decisions || 0) / runConfig.topN))) : null, daily.length),
    },
    factorAnalysis: factorPack,
    factorStats: factorPack.factorStats,
    weightOutputs: weights,
    provenance: {
      schemaVersion: "historical-backtest-provenance-v1",
      engine: "native-js",
      factorDataSource: {
        momentum: "historical_bars",
        macroRegime: "historical_regimes",
        smartMoney: "historical_bars/liquidity-proxy",
        qualityGrowth: "not-reconstructable-until-WP6",
        valuationExpectation: "not-reconstructable-until-WP6",
      },
      universeMode: runConfig.universeMode,
      universeCoverage,
      universeCaveat: runConfig.universeMode === "pit"
        ? "Universe is filtered by point-in-time universe_membership active rows on each signal date; missing bars are disclosed in coverage and excluded from candidates."
        : "Universe comes from historical_bars currently present in SQLite; the Tier-1 corpus has survivorship caveats until point-in-time mode is used.",
      strategyHash,
      config: runConfig,
      backtestWeightsUsage: "candidate-only",
      friction: roundTripCostBps > 0 ? "costed" : "frictionless-reference",
      sectorBasketStatus: Object.keys(sectorBasketStatusCounts).length ? sectorBasketStatusCounts : { missing_sector_mapping: decisions.length },
      diagnostics: {
        pitFundamentalsError: runConfig.pitFundamentalsError,
        securityMasterExtError: runConfig.securityMasterExtError,
        universeMembershipError: runConfig.universeMembershipError,
        securityMasterExtRows: securityMaster.size,
        universeMembershipRows: universeMembership.length,
        sectorBasketStatusCounts,
        missingBenchmark: metrics.missingBenchmark,
      },
    },
    caveats: [
      "Walk-forward uses only dates present in historical_bars and never reads rows after the signal date.",
      "Backtest outputs are labeled historical-backtest and must not blend with live recommendation rows.",
      "Benchmark tickers are loaded independently and excluded from the trading universe/cross-section; missing benchmark rows make outcomes unusable instead of treating raw return as excess.",
      "Sector baskets use security_master_ext when present; if a mapped sector ETF has no historical bars, the basket uses available benchmark components only with partial_benchmark disclosure.",
      runConfig.universeMode === "pit"
        ? `PIT mode: ${universeCoverage.membersWithBars} of ${universeCoverage.totalMembers} point-in-time members have bars (${universeCoverage.coveragePct ?? "n/a"}%).`
        : "Watchlist mode: membership filtering is disabled, so headline levels retain current-universe survivorship caveats.",
      roundTripCostBps > 0 ? "Costs/slippage are included in raw and benchmark returns." : "Zero-cost run is labeled frictionless-reference.",
    ],
  };
  return { run, report: buildReport(run) };
}

export async function runHistoricalWalkForwardFromSqlite({ sqlitePath, config = {} } = {}) {
  if (!sqlitePath) throw new Error("sqlitePath is required");
  const start = config.startDate ? ymd(config.startDate) : "";
  const end = config.endDate ? ymd(config.endDate) : "";
  const universeMode = ["pit", "watchlist"].includes(String(config.universeMode || "watchlist").toLowerCase())
    ? String(config.universeMode || "watchlist").toLowerCase()
    : "watchlist";
  const where = [
    start ? `date >= '${sqlText(start)}'` : "",
    end ? `date <= '${sqlText(end)}'` : "",
  ].filter(Boolean);
  const limitTickers = Math.max(0, Number(config.maxTickers || 0));
  const benchmarkSqlList = BENCHMARK_TICKERS.map((ticker) => `'${sqlText(ticker)}'`).join(",");
  let universeMembership = [];
  let universeMembershipError = "";
  if (universeMode === "pit") {
    try {
      const overlapWhere = [
        end ? `added_at <= '${sqlText(end)}'` : "",
        start ? `(removed_at IS NULL OR removed_at='' OR removed_at >= '${sqlText(start)}')` : "",
      ].filter(Boolean);
      universeMembership = await sqliteJson(
        sqlitePath,
        `SELECT ticker,added_at,removed_at,source,json FROM universe_membership ${overlapWhere.length ? `WHERE ${overlapWhere.join(" AND ")}` : ""} ORDER BY ticker,added_at;`,
        config.sqliteTimeoutMs || 30000,
      );
    } catch (error) {
      universeMembershipError = error.message;
      universeMembership = [];
    }
  }
  const pitTickerCandidates = universeMode === "pit"
    ? [...new Set(universeMembership.map((row) => safeTicker(row.ticker)).filter(Boolean))].sort()
    : [];
  const limitedPitTickers = limitTickers && pitTickerCandidates.length
    ? pitTickerCandidates.slice(0, limitTickers)
    : pitTickerCandidates;
  let tickerRows = [];
  if (universeMode === "pit" && !limitedPitTickers.length) {
    tickerRows = [];
  } else if (universeMode === "pit") {
    const pitTickerList = limitedPitTickers.map((ticker) => `'${sqlText(ticker)}'`).join(",");
    tickerRows = await sqliteJson(
      sqlitePath,
      `SELECT DISTINCT ticker FROM historical_bars WHERE ticker IN (${pitTickerList})${where.length ? ` AND ${where.join(" AND ")}` : ""} AND ticker NOT IN (${benchmarkSqlList}) ORDER BY ticker;`,
      config.sqliteTimeoutMs || 30000,
    );
  } else {
    tickerRows = await sqliteJson(
      sqlitePath,
      `SELECT DISTINCT ticker FROM historical_bars ${where.length ? `WHERE ${where.join(" AND ")} AND` : "WHERE"} ticker NOT IN (${benchmarkSqlList}) ORDER BY ticker${limitTickers ? ` LIMIT ${limitTickers}` : ""};`,
      config.sqliteTimeoutMs || 30000,
    );
  }
  const tickers = tickerRows.map((row) => safeTicker(row.ticker)).filter(Boolean);
  if (!tickers.length) {
    const result = runHistoricalWalkForwardFromRows({
      bars: [],
      regimes: [],
      config: { ...config, universeMode, universeMembership, universeMembershipError },
    });
    await applyMetricBridges(result.run, config);
    result.report = buildReport(result.run);
    result.run.persistence = await persistHistoricalBacktestRun(
      sqlitePath,
      result.run,
      result.report,
      Math.max(Number(config.sqliteTimeoutMs || 30000), 60000),
    ).catch((error) => ({ persisted: false, error: error.message }));
    if (config.compactResponse !== false) {
      result.run = compactHistoricalRun(result.run, { detailLimit: config.detailLimit ?? 20 });
      result.report = buildReport(result.run);
    }
    return result;
  }
  const benchmarkRows = await sqliteJson(
    sqlitePath,
    `SELECT DISTINCT ticker FROM historical_bars WHERE ticker IN (${benchmarkSqlList})${where.length ? ` AND ${where.join(" AND ")}` : ""} ORDER BY ticker;`,
    config.sqliteTimeoutMs || 30000,
  );
  const benchmarkTickers = benchmarkRows.map((row) => safeTicker(row.ticker)).filter(Boolean);
  const allBarTickers = [...new Set([...tickers, ...benchmarkTickers])];
  const tickerList = tickers.map((ticker) => `'${sqlText(ticker)}'`).join(",");
  const barTickerList = allBarTickers.map((ticker) => `'${sqlText(ticker)}'`).join(",");
  const bars = await sqliteJson(
    sqlitePath,
    `SELECT ticker,date,open,high,low,close,volume,source FROM historical_bars WHERE ticker IN (${barTickerList})${where.length ? ` AND ${where.join(" AND ")}` : ""} ORDER BY ticker,date;`,
    config.sqliteTimeoutMs || 30000,
  );
  const regimes = await sqliteJson(
    sqlitePath,
    `SELECT date,bucket,risk_score,json FROM historical_regimes ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY date;`,
    config.sqliteTimeoutMs || 30000,
  );
  let pitFundamentals = [];
  let pitFundamentalsError = "";
  let securityMasterExt = [];
  let securityMasterExtError = "";
  try {
    pitFundamentals = await sqliteJson(
      sqlitePath,
      `SELECT ticker,filed_at,period,field,value,form,json FROM pit_fundamentals WHERE ticker IN (${tickerList})${where.length ? ` AND filed_at <= '${sqlText(end || "9999-12-31")}'` : ""} ORDER BY ticker,filed_at,period;`,
      config.sqliteTimeoutMs || 30000,
    );
  } catch (error) {
    pitFundamentalsError = error.message;
    pitFundamentals = [];
  }
  try {
    securityMasterExt = await sqliteJson(
      sqlitePath,
      `SELECT ticker,name,sector,industry_group,industry,country,market_cap_bucket,market_cap,exchange,mic FROM security_master_ext WHERE ticker IN (${tickerList}) ORDER BY ticker;`,
      config.sqliteTimeoutMs || 30000,
    );
  } catch (error) {
    securityMasterExtError = error.message;
    securityMasterExt = [];
  }
  const result = runHistoricalWalkForwardFromRows({
    bars,
    regimes,
    config: {
      ...config,
      universeMode,
      universeMembership,
      universeMembershipError,
      pitFundamentals,
      pitFundamentalsError,
      securityMasterExt,
      securityMasterExtError,
    },
  });
  await applyMetricBridges(result.run, config);
  result.report = buildReport(result.run);
  const persistence = await persistHistoricalBacktestRun(
    sqlitePath,
    result.run,
    result.report,
    Math.max(Number(config.sqliteTimeoutMs || 30000), 60000),
  ).catch((error) => ({ persisted: false, error: error.message }));
  result.run.persistence = persistence;
  if (config.compactResponse !== false) {
    result.run = compactHistoricalRun(result.run, { detailLimit: config.detailLimit ?? 20 });
    result.report = buildReport(result.run);
  }
  return result;
}

export async function historicalBacktestDetailsFromSqlite({ sqlitePath, runId, kind = "outcomes", page = 1, pageSize = 100, offset = null, limit = null, horizonDays = null } = {}) {
  if (!sqlitePath) throw new Error("sqlitePath is required");
  const safeRunId = sqlText(runId);
  const safeKind = String(kind || "outcomes").toLowerCase();
  const size = Math.max(1, Math.min(500, Number(limit || pageSize || 100)));
  const requestedOffset = offset !== null && offset !== undefined && String(offset).trim() !== "" ? Math.max(0, Number(offset)) : null;
  const currentPage = requestedOffset === null ? Math.max(1, Number(page || 1)) : Math.floor(requestedOffset / size) + 1;
  const rowOffset = requestedOffset === null ? (currentPage - 1) * size : requestedOffset;
  const requestedHorizon = horizonDays !== null && horizonDays !== undefined && String(horizonDays).trim() !== "" ? Number(horizonDays) : null;
  const tables = {
    decisions: {
      table: "historical_backtest_decisions",
      order: "signal_date, ticker",
      where: `run_id='${safeRunId}'`,
    },
    outcomes: {
      table: "historical_backtest_outcomes",
      order: "decision_at, ticker, horizon_days",
      where: [`run_id='${safeRunId}'`, Number.isFinite(requestedHorizon) ? `horizon_days=${requestedHorizon}` : ""].filter(Boolean).join(" AND "),
    },
    daily: {
      table: "historical_backtest_daily",
      order: "date",
      where: `run_id='${safeRunId}'`,
    },
  };
  const spec = tables[safeKind];
  if (!spec) throw new Error(`Unsupported historical detail kind: ${kind}`);
  const countRows = await sqliteJson(sqlitePath, `SELECT COUNT(*) AS total FROM ${spec.table} WHERE ${spec.where};`);
  const total = Number(countRows?.[0]?.total || 0);
  const rows = await sqliteJson(
    sqlitePath,
    `SELECT json FROM ${spec.table} WHERE ${spec.where} ORDER BY ${spec.order} LIMIT ${size} OFFSET ${rowOffset};`,
  );
  return {
    schemaVersion: "historical-backtest-details-page-v1",
    runId,
    kind: safeKind,
    page: currentPage,
    offset: rowOffset,
    limit: size,
    pageSize: size,
    total,
    totalPages: Math.ceil(total / size),
    rows: rows.map((row) => {
      try {
        return JSON.parse(row.json || "{}");
      } catch (error) {
        return { parseError: true, error: error.message, raw: row.json };
      }
    }),
  };
}

export function historicalBacktestReport(run = {}) {
  return buildReport(run);
}
