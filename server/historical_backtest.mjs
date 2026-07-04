import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

import { buildFactorSnapshotAsOf, normalizeHistoricalBars } from "../lib/historical_features.mjs";
import {
  classifyOutcomeQuality,
  learnRecommendationFactorWeights,
  normalizeRecommendationFactorWeights,
  outcomeFromExcess,
} from "../lib/recommender_core.mjs";
import { numberOrNull } from "../lib/market_core.mjs";

const DEFAULT_HORIZONS = [1, 3, 5, 10, 20, 60];
const DEFAULT_WEIGHTS = normalizeRecommendationFactorWeights();
const PYTHON = process.env.HISTORICAL_BRIDGE_PYTHON || process.env.SQLITE_SYNC_PYTHON || "python3";
const QUANTSTATS_BRIDGE = fileURLToPath(new URL("../scripts/quantstats_bridge.py", import.meta.url));
const ALPHALENS_BRIDGE = fileURLToPath(new URL("../scripts/alphalens_bridge.py", import.meta.url));

function safeTicker(value = "") {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 16);
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

function maxDrawdownFromReturns(returns = []) {
  let equity = 1;
  let peak = 1;
  let maxDrawdown = 0;
  let duration = 0;
  let maxDuration = 0;
  for (const value of returns) {
    if (!Number.isFinite(value)) continue;
    equity *= 1 + value / 100;
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
  return { pct: maxDrawdown, duration, maxDuration, recovered: duration === 0 };
}

function metric(value, n, source = "historical-backtest") {
  return { value: Number.isFinite(value) ? value : null, n, source };
}

function aggregateOutcomes(outcomes = [], primaryHorizon = 20) {
  const rows = outcomes.filter((row) => row.horizonDays === primaryHorizon && row.outcomeUsable !== false);
  const excess = rows.map((row) => pct(row.excessPct)).filter(Number.isFinite);
  const raw = rows.map((row) => pct(row.rawReturnPct)).filter(Number.isFinite);
  const wins = rows.filter((row) => row.outcome === "win").length;
  const losses = rows.filter((row) => row.outcome === "loss").length;
  const positive = excess.filter((value) => value > 0);
  const negative = excess.filter((value) => value < 0);
  const dailyExcess = excess;
  const avgExcess = mean(excess);
  const avgRaw = mean(raw);
  const volatility = std(excess);
  const downside = std(excess.filter((value) => value < 0));
  const maxDrawdown = maxDrawdownFromReturns(excess);
  const cagr = excess.length ? ((1 + (avgExcess || 0) / 100) ** Math.min(252 / Math.max(1, excess.length), 4) - 1) * 100 : null;
  const profit = positive.reduce((sum, value) => sum + value, 0);
  const loss = Math.abs(negative.reduce((sum, value) => sum + value, 0));
  return {
    primaryHorizon,
    sampleCount: rows.length,
    cagr: metric(cagr, rows.length),
    excessVsSpy: metric(avgExcess, rows.length),
    avgRawReturnPct: metric(avgRaw, rows.length),
    maxDrawdown: { ...metric(maxDrawdown.pct, rows.length), duration: maxDrawdown.maxDuration, recovered: maxDrawdown.recovered },
    calmar: metric(Number.isFinite(cagr) && maxDrawdown.pct < 0 ? cagr / Math.abs(maxDrawdown.pct) : null, rows.length),
    sharpe: metric(Number.isFinite(avgExcess) && Number.isFinite(volatility) && volatility > 0 ? (avgExcess / volatility) * Math.sqrt(252 / Math.max(1, primaryHorizon)) : null, rows.length),
    sortino: metric(Number.isFinite(avgExcess) && Number.isFinite(downside) && downside > 0 ? (avgExcess / downside) * Math.sqrt(252 / Math.max(1, primaryHorizon)) : null, rows.length),
    volatility: metric(volatility, rows.length),
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
    if (!byDate.has(date)) byDate.set(date, { date, decisions: 0, tickers: [], outcomeSamples: 0, avgExcessPct: null });
    const row = byDate.get(date);
    row.decisions += 1;
    row.tickers.push(decision.ticker);
  }
  for (const outcome of outcomes.filter((row) => row.horizonDays === primaryHorizon && row.outcomeUsable !== false)) {
    const date = ymd(outcome.decisionAt);
    if (!byDate.has(date)) byDate.set(date, { date, decisions: 0, tickers: [], outcomeSamples: 0, avgExcessPct: null });
    const row = byDate.get(date);
    row.outcomeSamples += 1;
    const values = outcomes
      .filter((item) => ymd(item.decisionAt) === date && item.horizonDays === primaryHorizon && item.outcomeUsable !== false)
      .map((item) => pct(item.excessPct))
      .filter(Number.isFinite);
    row.avgExcessPct = mean(values);
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
  const stats = {};
  for (const outcome of outcomes.filter((row) => row.outcomeUsable !== false)) {
    const value = pct(outcome.excessPct);
    if (!Number.isFinite(value)) continue;
    for (const [id, factor] of Object.entries(outcome.factorSnapshot?.factors || {})) {
      const score = pct(factor.score);
      if (!Number.isFinite(score)) continue;
      const row = stats[id] || {
        id,
        label: factor.label || id,
        samples: 0,
        wins: 0,
        losses: 0,
        avgExcessPct: 0,
        avgScore: 0,
        scores: [],
        returns: [],
      };
      row.samples += 1;
      row.wins += outcome.outcome === "win" ? 1 : 0;
      row.losses += outcome.outcome === "loss" ? 1 : 0;
      row.avgExcessPct = ((row.avgExcessPct * (row.samples - 1)) + value) / row.samples;
      row.avgScore = ((row.avgScore * (row.samples - 1)) + score) / row.samples;
      row.scores.push(score);
      row.returns.push(value);
      stats[id] = row;
    }
  }
  for (const row of Object.values(stats)) {
    row.rankIC = rankCorrelation(row.scores, row.returns);
    row.ic = correlation(row.scores, row.returns);
    row.hitRate = row.samples ? row.wins / row.samples : null;
    row.source = "historical-backtest";
    delete row.scores;
    delete row.returns;
  }
  return stats;
}

function factorAnalysis(outcomes = []) {
  const stats = factorStats(outcomes);
  const rows = Object.values(stats);
  const correlationMatrix = rows.map((left) => ({
    factorId: left.id,
    correlations: Object.fromEntries(rows.map((right) => [right.id, left.id === right.id ? 1 : null])),
    n: left.samples,
  }));
  return {
    schemaVersion: "historical-factor-analysis-v1",
    factorStats: stats,
    rankIC: Object.fromEntries(rows.map((row) => [row.id, { value: row.rankIC, n: row.samples, source: "historical-backtest" }])),
    quantileSpreads: Object.fromEntries(rows.map((row) => [row.id, { value: null, n: row.samples, source: "historical-backtest", status: "not-enough-cross-section" }])),
    icDecay: Object.fromEntries(rows.map((row) => [row.id, { value: null, n: row.samples, source: "historical-backtest", status: "pending-more-horizons" }])),
    correlationMatrix,
  };
}

function weightOutputs(stats = {}, currentWeights = DEFAULT_WEIGHTS, options = {}) {
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
      returnPct: row.avgExcessPct,
      benchmarkReturnPct: 0,
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
  };
  const strategyHash = hashJson({ engine: "historical-walk-forward-v1", config: runConfig, weights: DEFAULT_WEIGHTS });
  const byTicker = groupBars(bars);
  const dates = allDatesFromBars(byTicker, runConfig.minLookback).slice(-runConfig.maxDates);
  const spyRows = byTicker.get("SPY") || [];
  const decisions = [];
  const outcomes = [];
  const roundTripCostBps = runConfig.costBps + runConfig.slippageBps;
  for (const signalDate of dates) {
    const scored = [];
    for (const [ticker, rows] of byTicker.entries()) {
      if (ticker === "SPY") continue;
      const eligibleBars = rows.filter((row) => row.date <= signalDate);
      if (eligibleBars.length < runConfig.minLookback) continue;
      const { factorSnapshot, recommendationScore } = buildFactorSnapshotAsOf({
        ticker,
        asOf: signalDate,
        bars: rows,
        historicalRegime: regimeForDate(regimes, signalDate),
        weights: DEFAULT_WEIGHTS,
      });
      scored.push({ ticker, factorSnapshot, recommendationScore, latestBar: eligibleBars.at(-1) });
    }
    scored.sort((a, b) => b.recommendationScore.actionScore - a.recommendationScore.actionScore || b.recommendationScore.alphaScore - a.recommendationScore.alphaScore);
    for (const item of scored.slice(0, runConfig.topN)) {
      const rows = byTicker.get(item.ticker) || [];
      const entry = barAfter(rows, signalDate);
      if (!entry) continue;
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
        benchmarkBasket: [{ ticker: "SPY", weight: 1, source: "historical_bars" }],
        sectorBasketStatus: "missing_sector_mapping",
      };
      decisions.push(decision);
      for (const horizon of runConfig.horizons) {
        const exit = barAtHorizon(rows, entry.date, horizon);
        if (!exit) continue;
        const raw = returnPct(entry.open, exit.close, roundTripCostBps);
        const benchmark = benchmarkReturn(spyRows, signalDate, exit.date, roundTripCostBps);
        const benchmarkPct = pct(benchmark.returnPct);
        const excess = Number.isFinite(raw) ? raw - (Number.isFinite(benchmarkPct) ? benchmarkPct : 0) : null;
        const outcome = outcomeFromExcess(excess, 0.5);
        const quality = classifyOutcomeQuality({
          entryPrice: entry.open,
          exitPrice: exit.close,
          rawReturnPct: raw,
          benchmarkReturnPct: benchmarkPct,
          excessPct: excess,
          horizonDays: horizon,
        });
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
          benchmarkTicker: "SPY",
          benchmarkReturnPct: benchmarkPct,
          benchmarkComponents: benchmark.components,
          excessPct: excess,
          outcome,
          outcomeQualityStatus: quality.status,
          outcomeQualityReasons: quality.reasons,
          outcomeUsable: quality.usable,
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
  const metrics = aggregateOutcomes(outcomes, runConfig.primaryHorizon);
  const daily = dailyTable(decisions, outcomes, runConfig.primaryHorizon);
  const periods = periodTable(outcomes, runConfig.primaryHorizon);
  const factorPack = factorAnalysis(outcomes);
  const weights = weightOutputs(stats, DEFAULT_WEIGHTS, runConfig);
  const run = {
    schemaVersion: "historical-walk-forward-run-v1",
    id: `hist-bt-${Date.now()}-${strategyHash.slice(0, 8)}`,
    generatedAt: new Date().toISOString(),
    status: dates.length ? "ok" : "empty",
    decisionSource: "historical-backtest",
    scope: {
      tickers: byTicker.size,
      dates: dates.length,
      barRows: normalizeHistoricalBars(bars).length,
      regimeRows: regimes.length,
      horizons: runConfig.horizons,
    },
    config: runConfig,
    strategyHash,
    decisions,
    outcomes,
    daily,
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
      universeCaveat: "Universe comes from historical_bars currently present in SQLite; the Tier-1 corpus has survivorship caveats until delisted constituents are added.",
      strategyHash,
      config: runConfig,
      backtestWeightsUsage: "candidate-only",
      friction: roundTripCostBps > 0 ? "costed" : "frictionless-reference",
      sectorBasketStatus: "missing_sector_mapping",
    },
    caveats: [
      "Walk-forward uses only dates present in historical_bars and never reads rows after the signal date.",
      "Backtest outputs are labeled historical-backtest and must not blend with live recommendation rows.",
      "Sector baskets require a stable ticker-to-sector mapping; current Tier-1 fallback uses SPY only and records sectorBasketStatus.",
      roundTripCostBps > 0 ? "Costs/slippage are included in raw and benchmark returns." : "Zero-cost run is labeled frictionless-reference.",
    ],
  };
  return { run, report: buildReport(run) };
}

export async function runHistoricalWalkForwardFromSqlite({ sqlitePath, config = {} } = {}) {
  if (!sqlitePath) throw new Error("sqlitePath is required");
  const start = config.startDate ? ymd(config.startDate) : "";
  const end = config.endDate ? ymd(config.endDate) : "";
  const where = [
    start ? `date >= '${sqlText(start)}'` : "",
    end ? `date <= '${sqlText(end)}'` : "",
  ].filter(Boolean);
  const limitTickers = Math.max(0, Number(config.maxTickers || 0));
  const tickerRows = await sqliteJson(
    sqlitePath,
    `SELECT DISTINCT ticker FROM historical_bars ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ticker${limitTickers ? ` LIMIT ${limitTickers}` : ""};`,
    config.sqliteTimeoutMs || 30000,
  );
  const tickers = tickerRows.map((row) => safeTicker(row.ticker)).filter(Boolean);
  if (!tickers.length) {
    const result = runHistoricalWalkForwardFromRows({ bars: [], regimes: [], config });
    await applyMetricBridges(result.run, config);
    result.report = buildReport(result.run);
    return result;
  }
  const tickerList = tickers.map((ticker) => `'${sqlText(ticker)}'`).join(",");
  const bars = await sqliteJson(
    sqlitePath,
    `SELECT ticker,date,open,high,low,close,volume,source FROM historical_bars WHERE ticker IN (${tickerList})${where.length ? ` AND ${where.join(" AND ")}` : ""} ORDER BY ticker,date;`,
    config.sqliteTimeoutMs || 30000,
  );
  const regimes = await sqliteJson(
    sqlitePath,
    `SELECT date,bucket,risk_score,json FROM historical_regimes ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY date;`,
    config.sqliteTimeoutMs || 30000,
  );
  const result = runHistoricalWalkForwardFromRows({ bars, regimes, config });
  await applyMetricBridges(result.run, config);
  result.report = buildReport(result.run);
  return result;
}

export function historicalBacktestReport(run = {}) {
  return buildReport(run);
}
