import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import {
  blackScholesPrice,
  calculateTechnicalSnapshot,
  inferOptionIvFromPrice,
  normalizeOptionIv,
} from "../lib/finance_math.mjs";
import {
  addNyseTradingDays,
  calculateOptionFifoLots,
  isNyseTradingDay,
  nyseSessionForYmdRuleBased,
  nyseSessionForYmd,
  scoreFredMacroRegime,
  semanticNewsOwnership,
} from "../lib/market_core.mjs";
import {
  buildBenchmarkBasket,
  buildFactorStatsFromOutcomes,
  buildSubSignalCompositePlan,
  classifyOutcomeQuality,
  applyCrossSectionalNormalization,
  newsRecencyDecayWeight,
  learnRecommendationFactorWeights,
  normalizeRecommendationFactorWeights,
  normalizeFactorValue,
  outcomeFromExcess,
  outcomeIsUsable,
  pathExcursions,
  scoreRecommendationFromFactorSnapshot,
  selectStarvationBackfillEvaluations,
  stockHistoryPricePath,
  winsorizeFactorSnapshots,
  winsorizeSeries,
} from "../lib/recommender_core.mjs";
import { storyFingerprint, triageIntradaySignal } from "../lib/alert_triage.mjs";
import {
  alpha158Subset,
  buildFactorSnapshotAsOf,
  calculateAltmanZScore,
  calculatePiotroskiFScore,
  normalizeHistoricalBars,
} from "../lib/historical_features.mjs";
import { runIntradayWatcherOnce } from "../server/intraday_watcher.mjs";
import { historicalMaxDrawdownFromReturns, runHistoricalWalkForwardFromRows } from "../server/historical_backtest.mjs";
import { proxyFetchResponse } from "../server/network_fetch.mjs";
import { evaluateFactorSpec, parseFactorSpec } from "../lib/factor_spec.mjs";
import {
  addFactorCandidate,
  appendFactorPostmortem,
  evaluateFactorRegistryWithCorpus,
  evaluateFactorSpecOverCorpus,
  evaluateFactorRegistry,
  ingestFactorResearcherOutput,
  normalizeFactorRegistry,
} from "../server/factor_registry.mjs";
import {
  activeStrategyVersion,
  activeStrategyWeights,
  attachValidationRecord,
  buildLiveParityPayload,
  buildPromotionValidationRecord,
  buildRegimeSplitEvaluationPayload,
  candidateStrategyVersionForFactorFloor,
  candidateStrategyVersionFromLearning,
  candidateStrategyVersionForShadowPromotion,
  candidateStrategyVersionFromSubSignalComposites,
  promoteStrategyVersion,
  rollbackStrategyVersions,
  upsertStrategyVersion,
} from "../server/strategy_versions.mjs";
import {
  normalizeCatchUpAttempts,
  registerCatchUpAttempt,
  scheduledCollectionRuntime,
} from "../server/scheduler_guard.mjs";

function assertApprox(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}, got ${actual}`);
}

function chunkedBuffer(buffer) {
  return Buffer.concat([
    Buffer.from(`${buffer.length.toString(16)}\r\n`, "latin1"),
    buffer,
    Buffer.from("\r\n0\r\n\r\n", "latin1"),
  ]);
}

const proxyPayload = { ok: true, text: "压缩代理响应" };
const proxyResponse = proxyFetchResponse(
  "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Encoding: gzip\r\nContent-Type: application/json\r\n\r\n",
  chunkedBuffer(zlib.gzipSync(Buffer.from(JSON.stringify(proxyPayload), "utf8"))),
);
assert.deepEqual(await proxyResponse.json(), proxyPayload, "Proxy fetch should decode chunked gzip bodies before JSON parsing");

assert.equal(isNyseTradingDay("2026-07-03"), false, "Independence Day observed should be closed in 2026");
assert.equal(isNyseTradingDay("2026-07-06"), true, "Monday after observed Independence Day should trade");
assert.equal(nyseSessionForYmd("2026-11-27").isHalfDay, true, "Day after Thanksgiving should be half-day");
assert.equal(addNyseTradingDays("2026-06-18T12:00:00Z", 1).toISOString().slice(0, 10), "2026-06-22", "Juneteenth + weekend should be skipped");

assert.deepEqual(
  scheduledCollectionRuntime("catch-up", 90000),
  { scheduledRun: true, scheduledLlmStageTimeoutMs: 90000 },
  "Catch-up collection should use scheduled LLM stage timeout without relying on outer scope variables",
);
assert.deepEqual(
  scheduledCollectionRuntime("manual", 90000),
  { scheduledRun: false, scheduledLlmStageTimeoutMs: null },
  "Manual collection should not inherit scheduled LLM timeout",
);
const catchUpDue = { key: "2026-07-07:pre", newYorkDate: "2026-07-07", job: { id: "pre" } };
const firstCatchUp = registerCatchUpAttempt({}, catchUpDue, { maxAttempts: 2, now: "2026-07-07T13:00:00.000Z" });
assert.equal(firstCatchUp.allowed, true, "First catch-up attempt should be allowed");
const secondCatchUp = registerCatchUpAttempt(firstCatchUp.attempts, catchUpDue, { maxAttempts: 2, now: "2026-07-07T13:01:00.000Z" });
assert.equal(secondCatchUp.allowed, true, "Second catch-up attempt should be allowed");
const blockedCatchUp = registerCatchUpAttempt(secondCatchUp.attempts, catchUpDue, { maxAttempts: 2, now: "2026-07-07T13:02:00.000Z" });
assert.equal(blockedCatchUp.allowed, false, "Third catch-up attempt should be blocked");
assert.equal(blockedCatchUp.reason, "max_attempts_exceeded", "Blocked catch-up should expose the max-attempt reason");
assert.equal(
  normalizeCatchUpAttempts(blockedCatchUp.attempts).catchUp[catchUpDue.key].count,
  2,
  "Catch-up attempt count should remain capped after blocking",
);

const macro = scoreFredMacroRegime({
  DGS10: [{ date: "2026-06-01", value: "5.10" }],
  DGS2: [{ date: "2026-06-01", value: "5.85" }],
  BAMLC0A0CM: [{ date: "2026-06-01", value: "5.70" }],
  T10YIE: [{ date: "2026-06-01", value: "2.70" }],
  VIXCLS: [{ date: "2026-06-01", value: "27.5" }],
});
assert.equal(macro.tone, "riskOff", "High rates, spreads, breakevens and VIX should score as risk-off");
assert.ok(macro.score >= 72, "Risk-off macro score should clear high-risk threshold");

const mismatch = semanticNewsOwnership(
  {
    ticker: "AAPL",
    title: "Intel shares rise after foundry order report",
    article: { text: "Intel shares rose after a report about new foundry customer orders." },
  },
  { ticker: "AAPL", companyName: "Apple Inc." },
);
assert.equal(mismatch.mismatch, true, "Article without AAPL/Apple evidence should be marked as ownership mismatch");

const direct = semanticNewsOwnership(
  {
    ticker: "AAPL",
    title: "Apple raises iPhone production plan",
    article: { text: "Apple said iPhone demand remained resilient." },
  },
  { ticker: "AAPL", companyName: "Apple Inc." },
);
assert.equal(direct.category, "direct_company", "Company name hit should classify as direct company news");
assert.equal(direct.mismatch, false, "Direct company news should not be marked mismatch");

const fifo = calculateOptionFifoLots([
  {
    id: "b1",
    ticker: "AAPL",
    underlyingTicker: "AAPL",
    optionSymbol: "AAPL-2026-07-17-call-200",
    side: "buy",
    quantity: 2,
    price: 1,
    multiplier: 100,
    executedAt: "2026-06-01T14:30:00Z",
  },
  {
    id: "b2",
    ticker: "AAPL",
    underlyingTicker: "AAPL",
    optionSymbol: "AAPL-2026-07-17-call-210",
    side: "buy",
    quantity: 1,
    price: 0.8,
    multiplier: 100,
    executedAt: "2026-06-01T14:31:00Z",
  },
  {
    id: "s1",
    ticker: "AAPL",
    underlyingTicker: "AAPL",
    optionSymbol: "AAPL-2026-07-17-call-200",
    side: "sell",
    quantity: 1,
    price: 1.5,
    multiplier: 100,
    executedAt: "2026-06-02T14:30:00Z",
  },
]);
assert.equal(fifo.closedLots.length, 1, "Only matching option symbol should close");
assert.equal(fifo.openLots.length, 2, "One remaining 200 call lot and the untouched 210 call should remain open");
assert.equal(fifo.realizedPnl, 50, "Option realized PnL should include multiplier");

assert.equal(normalizeOptionIv(45), 0.45, "Option IV percentages should normalize to decimals");
const callPrice = blackScholesPrice({ spot: 100, strike: 100, iv: 0.2, dte: 30, optionType: "call", rate: 0.045 });
assertApprox(callPrice, 2.5, 0.08, "Black-Scholes ATM 30D call should stay in expected range");
const inferredIv = inferOptionIvFromPrice({ spot: 100, strike: 100, dte: 30, optionType: "call", price: callPrice, rate: 0.045 });
assertApprox(inferredIv, 0.2, 0.002, "Implied-volatility inversion should recover the source IV");
const technicalSnapshot = calculateTechnicalSnapshot(
  Array.from({ length: 60 }, (_, index) => ({
    date: `2026-06-${String(index + 1).padStart(2, "0")}`,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100 + index,
    volume: 1_000_000 + index,
  })),
);
assert.equal(technicalSnapshot.trend, "uptrend", "Rising closes should classify as uptrend");
assert.equal(technicalSnapshot.chart.length, 60, "Technical snapshot should keep available chart rows under 90");
assert.ok(technicalSnapshot.sma10 > technicalSnapshot.sma20, "SMA10 should be above SMA20 in a rising series");

const normalizedMomentum = normalizeFactorValue("momentum", 72, {
  industry: "Semiconductors",
  sizeBucket: "mega",
  liquidityBucket: "very-liquid",
});
assert.equal(normalizedMomentum.method, "factor-peer-baseline", "Factor normalization should use peer baseline when no live median/MAD exists");
assert.ok(normalizedMomentum.score > 60, "Strong raw momentum should stay above neutral after normalization");

const syntheticFactorUniverse = Array.from({ length: 40 }, (_, index) => ({
  ticker: `T${index}`,
  factors: {
    momentum: {
      label: "Momentum",
      score: 20 + index,
      heuristicScore: 20 + index,
      quality: 100,
    },
    optionsFlow: {
      label: "Options",
      score: 50 + index / 10,
      heuristicScore: 50 + index / 10,
      quality: 100,
    },
  },
  dataQualityScore: 90,
}));
const shiftedFactorUniverse = syntheticFactorUniverse.map((row) => ({
  ...row,
  factors: Object.fromEntries(
    Object.entries(row.factors).map(([id, factor]) => [
      id,
      {
        ...factor,
        score: factor.score + 10,
        heuristicScore: factor.heuristicScore + 10,
      },
    ]),
  ),
}));
const normalizedSynthetic = applyCrossSectionalNormalization(syntheticFactorUniverse).snapshots;
const normalizedShifted = applyCrossSectionalNormalization(shiftedFactorUniverse).snapshots;
for (const [index, row] of normalizedSynthetic.entries()) {
  assert.equal(
    row.factors.momentum.normalization.method,
    "cross-sectional-rank",
    "40-ticker universe should use cross-sectional rank normalization",
  );
  assertApprox(
    row.factors.momentum.score,
    normalizedShifted[index].factors.momentum.score,
    1e-9,
    "Uniform +10 factor shift should not change percentile score",
  );
}
const fiftyTieFraction =
  normalizedSynthetic.filter((row) => Math.abs(row.factors.momentum.score - 50) < 1e-9).length /
  normalizedSynthetic.length;
assert.ok(fiftyTieFraction < 0.05, "Cross-sectional rank should not collapse many names to exactly 50");
const normalizedSyntheticAgain = applyCrossSectionalNormalization(JSON.parse(JSON.stringify(syntheticFactorUniverse))).snapshots;
assert.deepEqual(
  normalizedSynthetic.map((row) => row.factors.momentum.score),
  normalizedSyntheticAgain.map((row) => row.factors.momentum.score),
  "Same cross-section through the shared live/historical normalizer should produce identical scores",
);
const subSignalUniverse = Array.from({ length: 40 }, (_, index) => ({
  ticker: `S${index}`,
  factors: {
    newsCatalyst: {
      label: "News",
      score: 50,
      quality: 80,
      subSignals: [
        { id: "positiveMateriality", label: "Positive", heuristicScore: index, score: index, quality: 100 },
        { id: "negativeMateriality", label: "Negative", heuristicScore: 40 - index, score: 40 - index, quality: 100 },
      ],
    },
  },
}));
const normalizedSubSignals = applyCrossSectionalNormalization(subSignalUniverse).snapshots;
assert.equal(
  normalizedSubSignals[0].factors.newsCatalyst.normalization.method,
  "subsignal-composite",
  "Factors with sub-signals should use sub-signal composite scores",
);
assert.equal(
  normalizedSubSignals[0].factors.newsCatalyst.subSignals[0].normalization.method,
  "cross-sectional-rank",
  "Sub-signals should be normalized through the cross-sectional rank path",
);
const icWeightedSubSignals = applyCrossSectionalNormalization(subSignalUniverse, {
  subSignalCompositeMode: "ic-weighted",
  subSignalStats: {
    newsCatalyst: {
      subSignals: {
        positiveMateriality: { effectiveN: 60, n: 80, rankIC: 0.12 },
        negativeMateriality: { effectiveN: 60, n: 80, rankIC: 0 },
      },
    },
  },
}).snapshots;
assert.equal(
  icWeightedSubSignals[10].factors.newsCatalyst.normalization.method,
  "ic-weighted-subsignal-composite",
  "IC-weighted sub-signal composite should activate only when a strategy-version-controlled plan is supplied",
);
assert.notEqual(
  icWeightedSubSignals[10].factors.newsCatalyst.score,
  normalizedSubSignals[10].factors.newsCatalyst.score,
  "IC-weighted composite should reweight at least one factor score relative to equal-weight composite",
);
const allNullSubSignals = applyCrossSectionalNormalization(Array.from({ length: 40 }, (_, index) => ({
  ticker: `N${index}`,
  factors: {
    optionsFlow: {
      label: "Options",
      score: 50,
      quality: 70,
      subSignals: [
        { id: "flowRatio", label: "Flow", heuristicScore: null, score: 50, quality: 0 },
      ],
    },
  },
}))).snapshots;
assert.equal(allNullSubSignals[0].factors.optionsFlow.quality, 0, "All-null sub-signal composites should set factor quality to 0");
assert.equal(allNullSubSignals[0].factors.optionsFlow.score, 50, "All-null sub-signal composites should stay neutral");
assertApprox(
  newsRecencyDecayWeight("2026-01-01T00:00:00Z", "2026-01-02T12:00:00Z", 36),
  0.5,
  1e-12,
  "News recency decay should halve materiality after 36 hours",
);
assert.equal(newsRecencyDecayWeight("", "2026-01-01T00:00:00Z", 36), 0.5, "Missing news timestamps should receive the documented 0.5 weight");

assert.throws(
  () => parseFactorSpec({ factorId: "bad", pipeline: [{ op: "evil_op", input: "bars.close" }] }),
  /Valid ops/,
  "Factor spec parser should reject unknown operators with the valid whitelist",
);
const pitFilteredFactor = evaluateFactorSpec(
  {
    factorId: "closeDelta",
    pipeline: [
      { op: "ref", input: "bars.close" },
      { op: "delta", window: 5 },
    ],
  },
  {
    bars: [
      ...Array.from({ length: 8 }, (_, index) => ({ date: `2026-01-${String(index + 1).padStart(2, "0")}`, close: 100 + index })),
      { date: "2026-02-01", close: 9999, source: "future-poison" },
    ],
  },
  { asOf: "2026-01-08" },
);
assert.equal(pitFilteredFactor.status, "ok", "Factor DSL evaluator should produce values before asOf");
assert.notEqual(pitFilteredFactor.latest.value, 9999 - 107, "Factor DSL evaluator must filter future rows before evaluation");
const multiTickerDelta = evaluateFactorSpec(
  {
    factorId: "multiTickerDelta",
    pipeline: [
      { op: "ref", input: "bars.close" },
      { op: "delta", window: 5 },
    ],
  },
  {
    bars: [
      { ticker: "AAA", date: "2026-01-01", close: 10 },
      { ticker: "BBB", date: "2026-01-01", close: 20 },
      { ticker: "AAA", date: "2026-01-02", close: 12 },
      { ticker: "BBB", date: "2026-01-02", close: 18 },
      { ticker: "AAA", date: "2026-01-03", close: 15 },
      { ticker: "BBB", date: "2026-01-03", close: 16 },
      { ticker: "AAA", date: "2026-01-04", close: 16 },
      { ticker: "BBB", date: "2026-01-04", close: 15 },
      { ticker: "AAA", date: "2026-01-05", close: 18 },
      { ticker: "BBB", date: "2026-01-05", close: 14 },
      { ticker: "AAA", date: "2026-01-06", close: 21 },
      { ticker: "BBB", date: "2026-01-06", close: 13 },
    ],
  },
  { asOf: "2026-01-06" },
);
const multiTickerDeltaMap = new Map(multiTickerDelta.values.map((row) => [`${row.ticker}|${row.date}`, row.value]));
assert.equal(multiTickerDeltaMap.get("AAA|2026-01-06"), 11, "Factor DSL delta should be computed within each ticker only");
assert.equal(multiTickerDeltaMap.get("BBB|2026-01-06"), -7, "Factor DSL delta must not cross ticker boundaries");
const multiTickerCsRank = evaluateFactorSpec(
  {
    factorId: "multiTickerCsRank",
    pipeline: [
      { op: "ref", input: "bars.close" },
      { op: "cs_rank" },
    ],
  },
  {
    bars: [
      { ticker: "AAA", date: "2026-01-01", close: 10 },
      { ticker: "BBB", date: "2026-01-01", close: 20 },
      { ticker: "AAA", date: "2026-01-02", close: 30 },
      { ticker: "BBB", date: "2026-01-02", close: 18 },
    ],
  },
  { asOf: "2026-01-02" },
);
const csRankMap = new Map(multiTickerCsRank.values.map((row) => [`${row.ticker}|${row.date}`, row.value]));
assert.equal(csRankMap.get("AAA|2026-01-01"), 0, "cs_rank should rank across tickers on the same date");
assert.equal(csRankMap.get("BBB|2026-01-01"), 1, "cs_rank should rank the higher same-date value above peers");
assert.equal(csRankMap.get("AAA|2026-01-02"), 1, "cs_rank should recompute independently for each date");
assert.equal(csRankMap.get("BBB|2026-01-02"), 0, "cs_rank should not use the whole time series as its peer set");
const revisionMomentumMapping = evaluateFactorSpec(
  {
    factorId: "revisionMomentum",
    pipeline: [
      { op: "ref", input: "revisions.upgrades" },
      { op: "delta", window: 21 },
    ],
  },
  {
    revisions: Array.from({ length: 22 }, (_, index) => ({
      ticker: "AAA",
      date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
      upgrades: index === 0 ? 2 : index === 21 ? 5 : 2 + index / 21,
    })),
  },
  { asOf: "2026-01-22" },
);
assert.equal(
  revisionMomentumMapping.latest.value,
  3,
  "revisionMomentum field mapping should compute 21-row upgrade breadth delta from revisions.upgrades",
);
const registryWithSeeds = normalizeFactorRegistry({});
assert.ok(
  registryWithSeeds.factors.some((item) => item.factorId === "netShareIssuance" && item.evidence?.status === "insufficient-data"),
  "B4 PIT netShareIssuance seed should be registered with honest insufficient-data evidence",
);
assert.ok(
  registryWithSeeds.factors.some((item) => item.factorId === "institutionalBreadthDelta" && item.evidence?.status === "blocked-data-depth"),
  "B5 institutional breadth factor should be recorded as blocked rather than faked",
);
const duplicateCandidate = addFactorCandidate(registryWithSeeds, {
  factorId: "revisionMomentumClone",
  spec: {
    factorId: "revisionMomentumClone",
    pipeline: [
      { op: "ref", input: "revisions.upgrades" },
      { op: "delta", window: 21 },
    ],
  },
});
assert.equal(duplicateCandidate.factor.state, "rejected", "Originality gate should reject duplicate op-sequence factor candidates");
assert.equal(duplicateCandidate.registry.trialLedger.count, registryWithSeeds.trialLedger.count + 1, "Rejected factor candidates should still be recorded in trial ledger");
const idConflictRegistry = normalizeFactorRegistry({
  factors: [
    {
      factorId: "liveShadowAlpha",
      family: "momentum",
      spec: { factorId: "liveShadowAlpha", pipeline: [{ op: "ref", input: "bars.close" }] },
      expectedSign: 1,
      prior: "literature",
      state: "shadow",
      stateHistory: [],
      evidence: {},
    },
  ],
});
const idConflict = addFactorCandidate(idConflictRegistry, {
  factorId: "liveShadowAlpha",
  spec: { factorId: "liveShadowAlpha", pipeline: [{ op: "ref", input: "bars.volume" }] },
});
assert.equal(idConflict.factor.state, "rejected", "Candidate submission reusing a non-rejected factor id should be rejected");
assert.match(idConflict.gate.reason, /liveShadowAlpha/, "ID conflict rejection should name the conflicting factor id");
assert.equal(
  idConflict.registry.factors.find((item) => item.factorId === "liveShadowAlpha").state,
  "shadow",
  "ID conflict rejection must not overwrite the existing shadow factor",
);
const corpusTickers = ["AAA", "BBB", "CCC", "DDD"];
const corpusSlopes = { AAA: 0.6, BBB: 0.25, CCC: -0.15, DDD: -0.45 };
const corpusBars = [];
const corpusOutcomes = [];
const corpusRegimes = [];
const corpusDates = Array.from({ length: 540 }, (_, index) => {
  const date = new Date(Date.UTC(2024, 0, 1 + index));
  return date.toISOString().slice(0, 10);
});
for (const [ticker, slope] of Object.entries(corpusSlopes)) {
  for (let index = 0; index < corpusDates.length; index += 1) {
    const close = 100 + slope * index;
    corpusBars.push({
      ticker,
      date: corpusDates[index],
      open: close - slope / 2,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000_000 + index,
    });
  }
}
const corpusDecisionDates = corpusDates.slice(252, 520).filter((_, index) => index % 20 === 0);
for (const [regimeIndex, date] of corpusDecisionDates.entries()) {
  corpusRegimes.push({ date, bucket: ["riskOn", "neutral", "riskOff"][regimeIndex % 3], risk_score: 30 + regimeIndex });
  for (const [ticker, slope] of Object.entries(corpusSlopes)) {
    for (const horizonDays of [20, 60]) {
      corpusOutcomes.push({
        ticker,
        horizon_days: horizonDays,
        decision_at: date,
        excess_pct: slope * 10,
        outcome_quality_status: "ok",
      });
    }
  }
}
const week52CorpusEvidence = await evaluateFactorSpecOverCorpus(
  registryWithSeeds.factors.find((item) => item.factorId === "week52HighProximity").spec,
  {
    db: {
      bars: corpusBars,
      historicalOutcomes: corpusOutcomes,
      historicalRegimes: corpusRegimes,
    },
    universe: corpusTickers,
    dateGrid: corpusDecisionDates,
  },
);
assert.equal(week52CorpusEvidence.source, "historical-corpus", "Corpus factor evidence should be labeled as historical-corpus");
assert.ok(week52CorpusEvidence.horizons["20"].n > 0, "Corpus factor evidence should include horizon cells with n");
assert.ok(Number.isFinite(week52CorpusEvidence.horizons["20"].rankIC), "Corpus factor evidence should compute rankIC");
assert.ok(week52CorpusEvidence.regimeSigns >= 2, "Corpus factor evidence should carry regime sign checks");
const corpusAdmitted = await evaluateFactorRegistryWithCorpus(registryWithSeeds, {
  db: {
    bars: corpusBars,
    historicalOutcomes: corpusOutcomes,
    historicalRegimes: corpusRegimes,
  },
  universe: corpusTickers,
  dateGrid: corpusDecisionDates,
  maxCorpusFactors: 9,
});
assert.equal(
  corpusAdmitted.registry.factors.find((item) => item.factorId === "week52HighProximity").state,
  "shadow",
  "Mechanical evaluator should admit a B3 seed using computed corpus evidence without manual overrides",
);
assert.equal(
  corpusAdmitted.registry.factors.find((item) => item.factorId === "week52HighProximity").evidence.admission.source,
  "historical-corpus",
  "B3 seed admission should record the computed corpus evidence source",
);
const shadowNormalized = applyCrossSectionalNormalization(
  [
    {
      ticker: "AAA",
      peerGroup: {},
      factors: {
        liveShadowAlpha: {
          id: "liveShadowAlpha",
          lifecycleState: "shadow",
          weightEligible: false,
          heuristicScore: 1,
          score: 1,
          quality: 80,
        },
      },
    },
    {
      ticker: "BBB",
      peerGroup: {},
      factors: {
        liveShadowAlpha: {
          id: "liveShadowAlpha",
          lifecycleState: "shadow",
          weightEligible: false,
          heuristicScore: 3,
          score: 3,
          quality: 80,
        },
      },
    },
    {
      ticker: "CCC",
      peerGroup: {},
      factors: {
        liveShadowAlpha: {
          id: "liveShadowAlpha",
          lifecycleState: "shadow",
          weightEligible: false,
          heuristicScore: null,
          score: null,
          quality: 0,
          missingReason: "fixture missing",
        },
      },
    },
  ],
  { minCrossSection: 2 },
).snapshots;
assert.notEqual(
  shadowNormalized[0].factors.liveShadowAlpha.score,
  shadowNormalized[1].factors.liveShadowAlpha.score,
  "Live shadow factors with different raw inputs should produce non-constant cross-sectional scores",
);
assert.equal(
  shadowNormalized[2].factors.liveShadowAlpha.score,
  null,
  "Missing live shadow factors should remain missing rather than fabricated as neutral 50",
);
const shadowPromotionCandidate = candidateStrategyVersionForShadowPromotion(
  { factorId: "liveShadowAlpha" },
  {
    baseVersion: { id: "active-fixture", configHash: "active-fixture", weights: { momentum: 0.5, qualityGrowth: 0.5 } },
    previousWeights: { momentum: 0.5, qualityGrowth: 0.5 },
    fallbackWeights: { momentum: 0.5, qualityGrowth: 0.5 },
    evidence: { samples: 55, liveRankIC: 0.08, historicalRankIC: 0.07, maxCorrelation: 0.2 },
  },
);
assert.equal(shadowPromotionCandidate.status, "candidate", "Shadow promotion should only emit a candidate strategy version");
assert.equal(shadowPromotionCandidate.active, false, "Shadow promotion candidate must not become active automatically");
assert.ok(
  Number(shadowPromotionCandidate.weights.liveShadowAlpha) > 0,
  "Shadow promotion candidate should include the promoted factor at a small positive weight",
);
const floorCandidate = candidateStrategyVersionForFactorFloor("momentum", {
  baseVersion: { id: "active-fixture", configHash: "active-fixture", weights: { momentum: 0.2, qualityGrowth: 0.8 } },
  previousWeights: { momentum: 0.2, qualityGrowth: 0.8 },
  fallbackWeights: { momentum: 0.2, qualityGrowth: 0.8 },
  evidence: { status: "decay", rankIC: -0.02, n: 120 },
});
assert.equal(floorCandidate.status, "candidate", "Decay floor should be emitted as a candidate strategy version");
assert.ok(floorCandidate.weights.momentum < 0.2, "Decay floor candidate should reduce the decayed factor weight");
const evaluatedRegistry = evaluateFactorRegistry(registryWithSeeds, {
  evidenceOverrides: {
    week52HighProximity: {
      rankIC: 0.08,
      n: 160,
      tStat: 3.4,
      regimeSigns: 2,
      adjacentHorizonSigns: 1,
      maxCorrelation: 0.2,
      coverage: 0.78,
    },
  },
});
assert.equal(
  evaluatedRegistry.registry.factors.find((item) => item.factorId === "week52HighProximity").state,
  "shadow",
  "Mechanical evaluator should admit seeded factors to shadow when all gates pass",
);
assert.ok(
  evaluatedRegistry.registry.trialLedger.count > registryWithSeeds.trialLedger.count,
  "Factor evaluator should write trial-ledger entries before transitions",
);
let repeatedRegistry = evaluatedRegistry.registry;
const repeatedTrialCount = repeatedRegistry.trialLedger.count;
for (let index = 0; index < 3; index += 1) {
  repeatedRegistry = evaluateFactorRegistry(repeatedRegistry, {}).registry;
}
assert.equal(
  repeatedRegistry.trialLedger.count,
  repeatedTrialCount,
  "Routine evaluator runs over an unchanged registry should not inflate the trial ledger",
);
const correctedLedgerRegistry = normalizeFactorRegistry({
  trialLedger: {
    count: 3,
    entries: [
      { id: "factor-eval-old-1", reason: "state active observed only" },
      { id: "factor-eval-old-2", reason: "state shadow observed only" },
      { id: "factor-trial-old-1", factorId: "oldSubmission", reason: "candidate submitted" },
    ],
  },
  factors: [],
});
assert.equal(correctedLedgerRegistry.trialLedger.count, 1, "Ledger normalization should correct inflated routine-evaluation counts");
assert.equal(
  correctedLedgerRegistry.trialLedger.entries[0].type,
  "ledger-correction",
  "Ledger correction should be append-only and explicit",
);
const decayFixture = normalizeFactorRegistry({
  factors: [
    {
      factorId: "activeDecayFixture",
      family: "momentum",
      spec: { factorId: "activeDecayFixture", pipeline: [{ op: "ref", input: "bars.close" }] },
      expectedSign: 1,
      prior: "literature",
      state: "active",
      stateHistory: [],
      evidence: {},
    },
  ],
});
const negativeWindowOutcomes = Array.from({ length: 120 }, (_, index) => {
  const highScore = index % 2 === 0;
  const decisionAt = new Date(Date.UTC(2026, 1, 1 + index)).toISOString().slice(0, 10);
  return {
    ticker: highScore ? "AAA" : "BBB",
    decisionAt,
    excessPct: highScore ? -2 : 2,
    outcomeQualityStatus: "ok",
    factorSnapshot: {
      factors: {
        activeDecayFixture: {
          score: highScore ? 80 : 20,
        },
      },
    },
  };
});
const oneBadWindow = evaluateFactorRegistry(decayFixture, {
  outcomeSnapshots: negativeWindowOutcomes.slice(0, 60),
});
assert.equal(
  oneBadWindow.registry.factors.find((item) => item.factorId === "activeDecayFixture").state,
  "active",
  "Decay monitor should not demote after only one bad 60-outcome window",
);
const decayed = evaluateFactorRegistry(decayFixture, {
  outcomeSnapshots: negativeWindowOutcomes,
});
assert.equal(
  decayed.registry.factors.find((item) => item.factorId === "activeDecayFixture").state,
  "decayed",
  "Decay monitor should demote after two consecutive bad 60-outcome windows",
);
assert.equal(
  decayed.registry.factors.find((item) => item.factorId === "activeDecayFixture").evidence.latestDecay.twoBadWindows,
  true,
  "Decay evidence should record the two-window condition",
);
const positiveWindowOutcomes = Array.from({ length: 60 }, (_, index) => {
  const highScore = index % 2 === 0;
  const decisionAt = new Date(Date.UTC(2026, 5, 1 + index)).toISOString().slice(0, 10);
  return {
    ticker: highScore ? "AAA" : "BBB",
    decisionAt,
    excessPct: highScore ? 2 : -2,
    outcomeQualityStatus: "ok",
    factorSnapshot: {
      factors: {
        activeDecayFixture: {
          score: highScore ? 80 : 20,
        },
      },
    },
  };
});
const recovered = evaluateFactorRegistry(decayed.registry, {
  outcomeSnapshots: positiveWindowOutcomes,
});
assert.equal(recovered.registry.factors.find((item) => item.factorId === "activeDecayFixture").state, "shadow", "Decay monitor should recover decayed factors after positive IC");
const researcherIngest = ingestFactorResearcherOutput(registryWithSeeds, {
  schemaVersion: "factor-proposal-v1",
  proposals: [
    {
      factorId: "volumeAccumulation63",
      family: "smartMoney",
      hypothesis: "成交量中期累积代表资金关注，预期 20/60 日超额为正；若跨 regime RankIC 不为正则证伪。",
      expectedSign: 1,
      horizons: [20, 60],
      novelty: "相对价格动量因子，使用成交量累积且与现有 op sequence 不同。",
      spec: {
        factorId: "volumeAccumulation63",
        family: "smartMoney",
        hypothesis: "成交量中期累积代表资金关注，预期 20/60 日超额为正；若跨 regime RankIC 不为正则证伪。",
        expectedSign: 1,
        horizons: [20, 60],
        pipeline: [
          { op: "ref", input: "bars.volume" },
          { op: "ts_sum", window: 63 },
          { op: "ts_rank", window: 126 },
        ],
      },
    },
  ],
});
assert.equal(researcherIngest.accepted.length, 1, "Factor researcher proposals should enter registry through parse + originality gates");
assert.equal(researcherIngest.accepted[0].factor.createdBy, "llm:factor_researcher", "Researcher candidates should retain LLM provenance");
assert.equal(researcherIngest.accepted[0].factor.state, "candidate", "LLM researcher cannot set lifecycle state beyond candidate ingest");
const postmortemRegistry = appendFactorPostmortem(decayed.registry, "activeDecayFixture", {
  schemaVersion: "factor-postmortem-v1",
  factorId: "activeDecayFixture",
  hypothesis: "fixture",
  evidenceShowed: "rolling IC <= 0",
  transferableLesson: "弱因子只能沉淀教训，不能由 LLM 改状态或权重。",
  tags: ["fixture"],
});
assert.equal(postmortemRegistry.registry.memory.lessons.length, 1, "Factor postmortem should append episodic memory");
assert.equal(
  postmortemRegistry.registry.factors.find((item) => item.factorId === "activeDecayFixture").postMortems.length,
  1,
  "Factor postmortem should also attach to registry factor entry",
);
const overlappingFactorStats = buildFactorStatsFromOutcomes([
  {
    decisionId: "decision-1",
    ticker: "AAA",
    horizonDays: 1,
    excessPct: 1,
    factorSnapshot: { factors: { momentum: { label: "Momentum", score: 60 } } },
  },
  {
    decisionId: "decision-1",
    ticker: "AAA",
    horizonDays: 3,
    excessPct: 2,
    factorSnapshot: { factors: { momentum: { label: "Momentum", score: 60 } } },
  },
  {
    decisionId: "decision-2",
    ticker: "BBB",
    horizonDays: 1,
    excessPct: -1,
    factorSnapshot: { factors: { momentum: { label: "Momentum", score: 40 } } },
  },
]);
assert.equal(overlappingFactorStats.momentum.n, 3, "Factor stats should retain raw pooled n");
assert.equal(overlappingFactorStats.momentum.effectiveN, 2, "Factor stats should report non-overlapping effectiveN by frozen decision");
assert.ok(overlappingFactorStats.momentum.effectiveN < overlappingFactorStats.momentum.n, "effectiveN should be below raw n when horizons overlap");
const backfillFactorStats = buildFactorStatsFromOutcomes([
  {
    decisionId: "normal-1",
    ticker: "AAA",
    horizonDays: 1,
    excessPct: 1.2,
    trackingReason: "",
    outcome: "win",
    factorSnapshot: { factors: { momentum: { label: "Momentum", score: 65 } } },
  },
  {
    decisionId: "backfill-1",
    ticker: "BBB",
    horizonDays: 1,
    excessPct: -0.8,
    trackingReason: "starvation-backfill",
    outcome: "loss",
    factorSnapshot: { factors: { momentum: { label: "Momentum", score: 35 } } },
  },
]);
assert.equal(backfillFactorStats.momentum.trackingReasonSplit.primary.n, 1, "Factor stats should count primary samples by tracking reason");
assert.equal(
  backfillFactorStats.momentum.trackingReasonSplit["starvation-backfill"].n,
  1,
  "Factor stats should count starvation backfill samples by tracking reason",
);
const starvationBackfill = selectStarvationBackfillEvaluations(
  [
    { ticker: "HELD", actionScore: 90, alphaScore: 80, dataQualityScore: 70, hasPosition: true },
    { ticker: "COOL", actionScore: 99, alphaScore: 95, dataQualityScore: 90, actionability: { gates: [{ id: "ticker_cooldown" }] } },
    { ticker: "LOWDQ", actionScore: 98, alphaScore: 85, dataQualityScore: 20 },
    { ticker: "FREE", actionScore: 75, alphaScore: 70, dataQualityScore: 65 },
  ],
  { minNeeded: 2, minDataQuality: 42, existingTickers: ["OLD"] },
);
assert.deepEqual(
  starvationBackfill.map((item) => item.ticker),
  ["HELD", "FREE"],
  "Starvation backfill should include held positions, skip cooldowns and low-DQ rows, and sort by actionScore",
);
const adjacentHorizonStats = buildFactorStatsFromOutcomes(
  Array.from({ length: 5 }, (_, index) => ({
    decisionId: `adjacent-${index}`,
    ticker: "AAA",
    decisionAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
    horizonDays: 20,
    excessPct: index - 2,
    factorSnapshot: { factors: { momentum: { label: "Momentum", score: 40 + index * 5 } } },
  })),
);
const adjacentH20 = adjacentHorizonStats.momentum.horizons["20"];
assert.equal(adjacentH20.n, 5, "Adjacent horizon fixture should retain raw n");
assert.equal(adjacentH20.effectiveNUniqueDecision, 5, "Unique-decision effectiveN should count each frozen decision");
assert.equal(adjacentH20.effectiveNCalendarNonOverlap, 1, "Calendar non-overlap effectiveN should subsample overlapping T+20 decisions");
assert.equal(adjacentH20.effectiveN, adjacentH20.effectiveNCalendarNonOverlap, "T-stat effectiveN should use calendar non-overlap");
assert.ok(adjacentH20.effectiveNVariants.calendarNonOverlap.method.includes("20d"), "effectiveN variants should label the horizon window");

const recommendationScore = scoreRecommendationFromFactorSnapshot(
  {
    dataQualityScore: 88,
    factors: {
      momentum: { label: "Momentum", score: 80, quality: 90 },
      qualityGrowth: { label: "Quality", score: 75, quality: 80 },
      valuationExpectation: { label: "Valuation", score: 65, quality: 75 },
      earningsRevision: { label: "Revision", score: 60, quality: 70 },
      newsCatalyst: { label: "News", score: 70, quality: 80 },
      industryChain: { label: "Industry", score: 55, quality: 65 },
      macroRegime: { label: "Macro", score: 65, quality: 90, raw: { marketRisk: 35 } },
      optionsFlow: { label: "Options", score: 50, quality: 40 },
      smartMoney: { label: "Smart", score: 55, quality: 50 },
      socialAttention: { label: "Social", score: 52, quality: 50 },
    },
  },
  { portfolioFit: { score: 2 }, gates: [] },
);
assert.ok(recommendationScore.alphaScore > 60, "Positive factor mix should produce alpha score above neutral");
assert.ok(recommendationScore.actionScore >= recommendationScore.alphaScore, "Risk-on regime and portfolio fit should not reduce action score");
assert.ok(recommendationScore.topPositiveFactors.length > 0, "Recommendation score should expose positive factor contributions");
const optionContributionWithData = scoreRecommendationFromFactorSnapshot(
  { dataQualityScore: 100, factors: { optionsFlow: { label: "Options", score: 50, quality: 100 } } },
  { weights: { optionsFlow: 1 } },
).contributions.find((item) => item.id === "optionsFlow");
const optionContributionMissing = scoreRecommendationFromFactorSnapshot(
  { dataQualityScore: 100, factors: { optionsFlow: { label: "Options", score: 80, quality: 0 } } },
  { weights: { optionsFlow: 1 } },
).contributions.find((item) => item.id === "optionsFlow");
assert.equal(optionContributionWithData.contribution, 0, "Neutral optionsFlow data should contribute 0");
assert.equal(optionContributionMissing.contribution, 0, "Missing optionsFlow data should shrink contribution to 0");

const normalizedWeights = normalizeRecommendationFactorWeights({ momentum: 2, qualityGrowth: 1 });
assert.ok(Math.abs(Object.values(normalizedWeights).reduce((sum, value) => sum + value, 0) - 1) < 1e-9, "Factor weights should normalize to 1");
assert.ok(normalizedWeights.momentum > normalizedWeights.qualityGrowth, "Explicit larger raw weight should remain larger after normalization");

const learnedWeights = learnRecommendationFactorWeights(
  {
    momentum: { label: "Momentum", samples: 40, rankIC: 0.12, avgExcessPct: 4, hitRate: 0.62 },
    qualityGrowth: { label: "Quality", samples: 40, rankIC: -0.12, avgExcessPct: -3, hitRate: 0.38 },
    newsCatalyst: { label: "News", samples: 5, rankIC: 0.5, avgExcessPct: 10, hitRate: 0.8 },
  },
  {
    currentWeights: {
      momentum: 0.18,
      qualityGrowth: 0.16,
      valuationExpectation: 0.14,
      earningsRevision: 0.14,
      newsCatalyst: 0.12,
      industryChain: 0.08,
      macroRegime: 0.06,
      optionsFlow: 0.05,
      smartMoney: 0.04,
      socialAttention: 0.03,
    },
    minSamples: 20,
    maxStepPct: 1,
    generatedAt: "2026-07-01T00:00:00.000Z",
  },
);
assert.equal(learnedWeights.status, "updated", "Enough factor samples should update learned weights");
assert.ok(learnedWeights.learnedWeights.momentum > learnedWeights.previousWeights.momentum, "Positive RankIC factor should be promoted");
assert.ok(learnedWeights.learnedWeights.qualityGrowth < learnedWeights.previousWeights.qualityGrowth, "Negative RankIC factor should be demoted");
assert.ok(
  Math.abs(learnedWeights.learnedWeights.momentum - learnedWeights.previousWeights.momentum) <= 0.010001,
  "Single factor promotion should respect the configured 1 percentage point cap after normalization",
);
assert.equal(
  learnedWeights.learnedWeights.newsCatalyst,
  learnedWeights.previousWeights.newsCatalyst,
  "Factors below min sample gate should keep their previous weight exactly",
);
assert.ok(
  Math.abs(Object.values(learnedWeights.learnedWeights).reduce((sum, value) => sum + value, 0) - 1) < 1e-9,
  "Learned factor weights should still sum to 1 while skipped factors are frozen",
);
assert.equal(
  learnedWeights.audit.stepViolations.length,
  0,
  "Factor learning should report no post-normalization step cap violations",
);
assert.ok(
  learnedWeights.skipped.some((item) => item.factorId === "newsCatalyst" && /最小门槛/.test(item.reason)),
  "Factors below min sample gate should be skipped",
);

const activeStrategy = {
  id: "active-v1",
  status: "active",
  weights: { momentum: 0.2, qualityGrowth: 0.2, valuationExpectation: 0.2, earningsRevision: 0.2, newsCatalyst: 0.2 },
  configHash: "active-hash",
};
const candidateStrategy = candidateStrategyVersionFromLearning(learnedWeights, {
  source: "fixture-live-learning",
  sourceRunId: "run-1",
  baseVersion: activeStrategy,
  fallbackWeights: normalizeRecommendationFactorWeights(),
});
assert.equal(candidateStrategy.status, "candidate", "Learned weights should create a candidate strategy version");
const subSignalPlan = buildSubSignalCompositePlan({
  newsCatalyst: {
    subSignals: {
      positiveMateriality: { effectiveN: 55, n: 70, rankIC: 0.11 },
      negativeMateriality: { effectiveN: 55, n: 70, rankIC: 0 },
    },
  },
});
const subSignalCandidate = candidateStrategyVersionFromSubSignalComposites({}, {
  plan: subSignalPlan,
  baseVersion: activeStrategy,
  fallbackWeights: normalizeRecommendationFactorWeights(),
  sourceRunId: "run-1",
});
assert.equal(subSignalCandidate.status, "candidate", "IC-weighted sub-signal composites should enter through a candidate strategy version");
assert.equal(subSignalCandidate.json.settings.subSignalCompositeMode, "ic-weighted", "Sub-signal candidate should carry the active-after-promote setting");
assert.ok(subSignalCandidate.changelog?.[0]?.summary.includes("IC 加权子信号"), "Sub-signal candidate should record a changelog entry");
let strategyRows = upsertStrategyVersion([activeStrategy], candidateStrategy);
assert.equal(activeStrategyVersion(strategyRows).id, "active-v1", "Candidate insertion must not change active strategy version");
assert.notEqual(
  activeStrategyWeights(strategyRows).momentum,
  candidateStrategy.weights.momentum,
  "Active scoring weights must not read candidate weights before promotion",
);
const failedPromotion = promoteStrategyVersion(strategyRows, candidateStrategy.id);
assert.equal(failedPromotion.ok, false, "Promotion must fail without a passed validation record");
const passedValidation = buildPromotionValidationRecord(candidateStrategy, activeStrategy, {
  candidateExcessPct: 3,
  activeExcessPct: 2,
  candidateMaxDrawdownPct: -5,
  activeMaxDrawdownPct: -7,
  n: 42,
});
assert.equal(passedValidation.status, "passed", "Fixture validation should pass excess and MaxDD gates");
strategyRows = attachValidationRecord(strategyRows, candidateStrategy.id, passedValidation);
const beforePromotionSnapshot = JSON.parse(JSON.stringify(strategyRows));
const promoted = promoteStrategyVersion(strategyRows, candidateStrategy.id);
assert.equal(promoted.ok, true, "Candidate with passed validation can be promoted");
assert.equal(activeStrategyVersion(promoted.rows).id, candidateStrategy.id, "Promoted candidate should become active");
const rolledBack = rollbackStrategyVersions(promoted.rows, [{ id: "rollback-1", snapshot: beforePromotionSnapshot }]);
assert.equal(rolledBack.ok, true, "Rollback fixture should restore previous snapshot");
assert.deepEqual(rolledBack.rows, beforePromotionSnapshot, "Rollback must restore strategy versions byte-equivalent after normalization");

const splitPayload = buildRegimeSplitEvaluationPayload({
  liveOutcomes: [
    { ticker: "AAPL", horizonDays: 20, regime: "risk_on", outcome: "win", excessPct: 2, outcomeQualityStatus: "ok" },
    { ticker: "MSFT", horizonDays: 20, regime: "risk_on", outcome: "loss", excessPct: -1, outcomeQualityStatus: "ok" },
  ],
  historicalRuns: [{
    outcomes: [{ ticker: "NVDA", horizonDays: 20, regime: "risk_off", outcome: "win", excessPct: 4, outcomeUsable: true }],
  }],
});
assert.equal(splitPayload.panels.live.source, "live-outcomes", "Regime split must keep live panel separate");
assert.equal(splitPayload.panels.historical.source, "historical-backtest", "Regime split must keep historical panel separate");
assert.equal(splitPayload.panels.live.rows[0].avgExcessPct.n, 2, "Regime split metrics must carry sample count");

const parityPayload = buildLiveParityPayload({
  liveRun: {
    summary: { evaluated: 10, buy: 2, sell: 1, actionableBuy: 1 },
    evaluations: [{ factorSnapshot: { factors: { momentum: { score: 70 } } }, gates: [{ id: "low_data_quality" }] }],
    buyCandidates: [{ factorSnapshot: { factors: { momentum: { score: 80 } } } }],
  },
  historicalRuns: [{ summary: { evaluated: 20, buy: 2, sell: 0 }, decisions: [{ factorSnapshot: { factors: { momentum: { score: 50 } } } }] }],
});
assert.equal(parityPayload.panels.live.decisionRates.buyRate.n, 10, "Live parity decision rate must include n");
assert.equal(parityPayload.panels.historical.decisionRates.buyRate.n, 20, "Historical parity decision rate must include n");
assert.ok(parityPayload.panels.live.factorDistributions.momentum.mean.n >= 1, "Live parity factor distribution must include n");

const winsorizedReturns = winsorizeSeries([-1000, 1, 2, 3, 1000], { lowerPct: 1, upperPct: 99 });
assert.ok(winsorizedReturns.clipCount >= 2, "Winsorization should clip both tails in an extreme-return fixture");
const winsorizedSnapshots = winsorizeFactorSnapshots([
  { factors: { momentum: { score: 0 } } },
  { factors: { momentum: { score: 50 } } },
  { factors: { momentum: { score: 100 } } },
]);
assert.equal(winsorizedSnapshots.schemaVersion, "factor-winsorization-v1", "Factor winsorization should expose a versioned audit payload");
assert.ok("momentum" in winsorizedSnapshots.clipCounts, "Factor winsorization should report clip counts by factor");

const semiBasket = buildBenchmarkBasket("NVDA", {
  industry: "Semiconductors",
  mainBusiness: "GPU and AI data center chips",
  marketCapitalization: 3_000_000_000_000,
});
assert.deepEqual(
  semiBasket.map((item) => item.ticker),
  ["QQQ", "SMH", "SPY"],
  "Semiconductor mega-cap basket should use QQQ/SMH/SPY",
);
assert.ok(Math.abs(semiBasket.reduce((sum, item) => sum + item.weight, 0) - 1) < 1e-9, "Benchmark weights should normalize to 1");
const materialsBasket = buildBenchmarkBasket("AA", {
  sector: "Materials",
  industry_group: "Materials",
  market_cap: 5_000_000_000,
});
assert.ok(
  materialsBasket.some((item) => item.ticker === "XLB"),
  "FinanceDatabase sector fields should map Materials names to the XLB sector basket",
);

const piotroskiFixture = calculatePiotroskiFScore(
  {
    net_income: 100,
    assets: 1000,
    operating_cash_flow: 130,
    long_term_debt: 250,
    current_assets: 500,
    current_liabilities: 250,
    shares_basic: 100,
    gross_profit: 420,
    revenue: 1100,
  },
  {
    net_income: 80,
    assets: 900,
    operating_cash_flow: 90,
    long_term_debt: 260,
    current_assets: 430,
    current_liabilities: 250,
    shares_basic: 101,
    gross_profit: 340,
    revenue: 900,
  },
);
assert.equal(piotroskiFixture.score, 9, "Piotroski fixture should hand-compute to 9/9");
assert.equal(piotroskiFixture.status, "ok", "Piotroski fixture should require all nine signals");
const altmanFixture = calculateAltmanZScore({
  current_assets: 500,
  current_liabilities: 250,
  retained_earnings: 300,
  ebit: 120,
  assets: 1000,
  liabilities: 400,
  revenue: 1000,
  latest_close: 20,
  shares_basic: 100,
});
assertApprox(altmanFixture.zScore, 5.116, 1e-12, "Altman Z fixture should match the hand-computed public-company formula");
assert.equal(altmanFixture.status, "ok", "Altman Z fixture should be exact when all formula components are present");

const nyseReferencePath = new URL("../data/reference/nyse_calendar_2019_2028.json", import.meta.url);
if (fs.existsSync(nyseReferencePath)) {
  const calendar = JSON.parse(fs.readFileSync(nyseReferencePath, "utf8"));
  const divergences = (calendar.sessions || []).filter((row) => {
    const rule = nyseSessionForYmdRuleBased(row.date);
    return Boolean(rule.isTradingDay) !== Boolean(row.isTradingDay) || Boolean(rule.isHalfDay) !== Boolean(row.isHalfDay);
  });
  assert.equal(divergences.length, 0, "Rule-based NYSE calendar should match pandas-market-calendars over the generated reference range");
  assert.equal(nyseSessionForYmd("2026-07-03").source, "pandas-market-calendars-reference", "Generated NYSE reference calendar should win when present");
  assert.equal(isNyseTradingDay("2026-07-03"), false, "Generated NYSE reference calendar should mark observed Independence Day closed");
}

assert.equal(outcomeFromExcess(1.2, 0.5), "win", "Excess return above deadband should be win");
assert.equal(outcomeFromExcess(-1.2, 0.5), "loss", "Excess return below negative deadband should be loss");
assert.equal(outcomeFromExcess(0.2, 0.5), "flat", "Excess return inside deadband should be flat");
const normalOutcomeQuality = classifyOutcomeQuality({
  entryPrice: 100,
  exitPrice: 104,
  rawReturnPct: 4,
  benchmarkReturnPct: 1,
  excessPct: 3,
});
assert.equal(normalOutcomeQuality.status, "ok", "Normal outcome should remain usable");
assert.equal(
  outcomeIsUsable({ entryPrice: 100, exitPrice: 104, rawReturnPct: 4, benchmarkReturnPct: 1, excessPct: 3 }),
  true,
  "Complete outcome should be usable",
);
const badOutcomeQuality = classifyOutcomeQuality({
  entryPrice: 0.0137,
  exitPrice: 2.625,
  rawReturnPct: 19059,
  benchmarkReturnPct: 0.4,
  excessPct: 19058,
});
assert.equal(badOutcomeQuality.status, "suspect_price", "Extreme price-scale outcome should be marked suspect_price");
assert.equal(badOutcomeQuality.usable, false, "Extreme price-scale outcome should be quarantined");
assert.equal(
  outcomeIsUsable({ entryPrice: 0.0137, exitPrice: 2.625, rawReturnPct: 19059, excessPct: 19058 }),
  false,
  "Legacy rows without explicit quality status should still be quarantined when returns are extreme",
);

const pricePath = stockHistoryPricePath(
  [
    { ticker: "AAPL", capturedAt: "2026-06-01T13:30:00Z", quote: { price: 100 } },
    { ticker: "AAPL", capturedAt: "2026-06-02T13:30:00Z", quote: { price: 96 } },
    { ticker: "AAPL", capturedAt: "2026-06-03T13:30:00Z", quote: { price: 108 } },
    { ticker: "MSFT", capturedAt: "2026-06-02T13:30:00Z", quote: { price: 50 } },
  ],
  "AAPL",
  "2026-06-01T00:00:00Z",
  "2026-06-03T23:59:59Z",
);
assert.equal(pricePath.length, 3, "Price path should filter ticker and date window");
const buyExcursions = pathExcursions(pricePath, 100, "买入");
assert.equal(buyExcursions.maePct, -4, "Buy MAE should capture maximum adverse drawdown");
assert.equal(buyExcursions.mfePct, 8, "Buy MFE should capture maximum favorable move");
const sellExcursions = pathExcursions(pricePath, 100, "卖出");
assert.equal(sellExcursions.maePct, -8, "Sell MAE should invert unfavorable upside move");
assert.equal(sellExcursions.mfePct, 4, "Sell MFE should treat price decline as favorable");

const intradayTriage = triageIntradaySignal(
  {
    ticker: "NVDA",
    movePercent: 5.2,
    moveZ: 3.1,
    volumePace: 3.4,
    headline: "NVDA files 8-K and raises guidance after data-center demand update",
    membership: ["watchlist", "today_candidate"],
  },
  { existingAlerts: [], now: "2026-07-01T15:00:00.000Z" },
);
assert.equal(intradayTriage.llmCriticalPath, false, "Intraday triage must not call or depend on LLM output");
assert.ok(["high", "critical"].includes(intradayTriage.severity), "Large move + guidance keyword should triage as high priority");
assert.equal(intradayTriage.catalystClass, "guidance", "Guidance headline should be classified as guidance catalyst");
const repeatedTriage = triageIntradaySignal(
  {
    ticker: "NVDA",
    movePercent: 4.1,
    headline: "NVDA files 8-K and raises guidance after data-center demand update",
  },
  {
    existingAlerts: [{ storyFingerprint: intradayTriage.storyFingerprint, createdAt: "2026-07-01T14:55:00.000Z" }],
    now: "2026-07-01T15:00:00.000Z",
  },
);
assert.equal(repeatedTriage.novelty, "update", "Matching story fingerprint inside lookback should become an update");
assert.equal(
  storyFingerprint({ ticker: "NVDA", headline: "NVDA files 8-K and raises guidance after data-center demand update", catalystClass: "guidance" }),
  intradayTriage.storyFingerprint,
  "Story fingerprint should be stable for the same ticker/headline/catalyst",
);

const historicalBars = Array.from({ length: 70 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
  return {
    ticker: "MU",
    date,
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index * 1.1,
    volume: 1_000_000 + index * 10_000,
    source: "fixture",
  };
});
const alpha = alpha158Subset(historicalBars);
assert.equal(alpha.sampleCount, 70, "Alpha158 subset should keep the full OHLCV fixture sample");
for (const key of ["KMID", "KLEN", "KUP", "KLOW", "KSFT", "ROC5", "ROC20", "ROC60", "MA20", "STD20", "RSV20", "RANK20", "IMAX20", "IMIN20", "CORR20", "CNTP20", "CNTN20", "WVMA20"]) {
  assert.equal(Number.isFinite(alpha.features[key]), true, `Alpha158 subset should compute ${key}`);
}
const normalizedHistoricalBars = normalizeHistoricalBars(historicalBars);
assert.deepEqual(
  alpha158Subset(normalizedHistoricalBars).features,
  alpha.features,
  "Alpha158 subset must be formula-identical for normalized/live-shaped and raw historical inputs",
);
const poisonedFuture = [
  ...historicalBars,
  {
    ticker: "MU",
    date: "2026-12-31",
    open: 9999,
    high: 9999,
    low: 9999,
    close: 9999,
    volume: 9999,
    source: "future-poison",
  },
];
const historicalSnapshot = buildFactorSnapshotAsOf({
  ticker: "MU",
  asOf: historicalBars.at(-1).date,
  bars: poisonedFuture,
  historicalRegime: { date: historicalBars.at(-1).date, bucket: "宏观中性", risk_score: 50 },
});
assert.equal(historicalSnapshot.factorSnapshot.ignoredFutureRows, 1, "Historical snapshot must reject post-asOf rows");
assert.notEqual(
  historicalSnapshot.factorSnapshot.rawInputs.latestBar.close,
  9999,
  "Future poison close must not enter the as-of raw inputs",
);
assert.equal(
  historicalSnapshot.factorSnapshot.factors.qualityGrowth.score,
  50,
  "Non-reconstructable historical factors must remain neutral 50",
);
assert.equal(
  historicalSnapshot.factorSnapshot.factors.qualityGrowth.missingReason,
  "not-reconstructable",
  "Non-reconstructable historical factors should carry an explicit missing reason",
);
assert.equal(
  historicalSnapshot.recommendationScore.schemaVersion,
  "recommendation-score-v2",
  "Historical factor snapshots must score through recommender_core",
);
assert.ok(
  historicalSnapshot.recommendationScore.contributions.some((item) => item.id === "momentum"),
  "Historical recommendation score should include standard recommender factor contributions",
);
const pitBeforeRestatement = buildFactorSnapshotAsOf({
  ticker: "MU",
  asOf: "2026-03-15",
  bars: historicalBars,
  pitFundamentals: [
    { ticker: "MU", filed_at: "2026-02-01", period: "2025-12-31", field: "eps_diluted", value: 2 },
    { ticker: "MU", filed_at: "2026-02-01", period: "2025-12-31", field: "revenue", value: 10_000 },
    { ticker: "MU", filed_at: "2026-02-01", period: "2025-12-31", field: "net_income", value: 2_000 },
    { ticker: "MU", filed_at: "2026-05-01", period: "2025-12-31", field: "eps_diluted", value: 0.2 },
  ],
});
assert.equal(
  pitBeforeRestatement.factorSnapshot.factors.valuationExpectation.raw.epsDiluted,
  2,
  "PIT fundamentals must use the originally filed value before a later restatement date",
);
assert.notEqual(
  pitBeforeRestatement.factorSnapshot.factors.qualityGrowth.missingReason,
  "not-reconstructable",
  "PIT fundamentals should enable qualityGrowth when filed facts exist as of the date",
);

const historicalBacktestBars = ["SPY", "XLK", "AAPL", "MSFT"].flatMap((ticker, tickerIndex) =>
  Array.from({ length: 80 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10);
    const drift = ticker === "SPY" ? 0.25 : ticker === "XLK" ? 0.35 : ticker === "AAPL" ? 0.8 : 0.45;
    const base = 100 + tickerIndex * 25 + index * drift;
    return {
      ticker,
      date,
      open: base,
      high: base + 1.5,
      low: base - 1,
      close: base + 0.8,
      volume: 1_000_000 + index * 20_000 + tickerIndex * 10_000,
      source: "fixture",
    };
  }),
);
const historicalWalkForward = runHistoricalWalkForwardFromRows({
  bars: historicalBacktestBars,
  regimes: [{ date: "2026-01-01", bucket: "宏观顺风", risk_score: 38 }],
  config: {
    minLookback: 20,
    maxDates: 4,
    topN: 2,
    horizons: [1, 3],
    primaryHorizon: 1,
    costBps: 1,
    slippageBps: 1,
    securityMasterExt: [
      { ticker: "AAPL", sector: "Information Technology", industry_group: "Technology Hardware & Equipment", industry: "Technology Hardware" },
      { ticker: "MSFT", sector: "Information Technology", industry_group: "Software & Services", industry: "Software" },
    ],
  },
});
const handComputedDrawdown = historicalMaxDrawdownFromReturns([10, -5, -5, 2, 4, -1, 3, -2, 1, 1]);
assertApprox(
  handComputedDrawdown.pct,
  -9.750000000000004,
  1e-12,
  "Historical MaxDD fixture should match the exact hand-computed 10-day equity path",
);
assert.equal(historicalWalkForward.run.status, "ok", "Historical walk-forward fixture should produce a runnable backtest");
assert.ok(historicalWalkForward.run.decisions.length > 0, "Historical walk-forward should freeze pseudo-decisions");
assert.ok(
  historicalWalkForward.run.decisions.some((item) => item.sectorBasketStatus === "sector_mapping_ok" && item.benchmarkBasket.some((basket) => basket.ticker === "XLK")),
  "Historical walk-forward should use security_master_ext sector ETF baskets when sector bars exist",
);
assert.ok(
  historicalWalkForward.run.decisions.every((item) => !["SPY", "QQQ", "XLK", "XLE", "XLF", "XLV", "XLY", "XLP", "XLI", "XLB", "XLU", "XLRE", "XLC", "SMH"].includes(item.ticker)),
  "Historical walk-forward should exclude benchmark tickers from pseudo-decisions",
);
assert.ok(
  historicalWalkForward.run.outcomes.some((item) => Number.isFinite(item.sectorBenchmarkReturnPct)),
  "Historical outcomes should expose sectorBenchmarkReturnPct when benchmark basket components are available",
);
assert.ok(
  historicalWalkForward.run.decisions.every((item) => item.decisionSource === "historical-backtest"),
  "Historical pseudo-decisions should be labeled separately from live decisions",
);
assert.ok(historicalWalkForward.run.outcomes.length > 0, "Historical walk-forward should compute outcomes");
assert.ok(
  historicalWalkForward.run.daily.some((row) => Number.isFinite(row.portfolioReturnPct)),
  "Historical daily book should expose equal-weight open-position portfolio returns",
);
const missingBenchmarkWalkForward = runHistoricalWalkForwardFromRows({
  bars: historicalBacktestBars.filter((row) => !["SPY", "XLK"].includes(row.ticker)),
  regimes: [{ date: "2026-01-01", bucket: "宏观顺风", risk_score: 38 }],
  config: {
    minLookback: 20,
    maxDates: 2,
    topN: 1,
    horizons: [1],
    primaryHorizon: 1,
    securityMasterExt: [
      { ticker: "AAPL", sector: "Information Technology", industry_group: "Technology Hardware & Equipment", industry: "Technology Hardware" },
      { ticker: "MSFT", sector: "Information Technology", industry_group: "Software & Services", industry: "Software" },
    ],
  },
});
assert.ok(
  missingBenchmarkWalkForward.run.outcomes.length > 0,
  "Missing-benchmark fixture should still create raw outcomes for audit visibility",
);
assert.ok(
  missingBenchmarkWalkForward.run.outcomes.every((item) => item.benchmarkStatus === "missing_benchmark" && item.excessPct === null && item.outcomeUsable === false),
  "Missing benchmark rows must be unusable and must not treat raw return as excess",
);
assert.ok(
  Number(missingBenchmarkWalkForward.run.metrics.missingBenchmark?.count || 0) > 0 && Number(missingBenchmarkWalkForward.run.metrics.missingBenchmark?.n || 0) > 0,
  "Historical metrics should report missing benchmark counts with sample size",
);
assert.ok(
  historicalWalkForward.run.metrics.maxDrawdown.value > -100,
  "Historical MaxDD should be computed from the daily equity book and not collapse to -100%",
);
assert.equal(
  historicalWalkForward.run.metrics.hitRate.n,
  historicalWalkForward.run.metrics.sampleCount,
  "Every surfaced historical metric should carry its sample count",
);
assert.equal(
  historicalWalkForward.run.weightOutputs.candidateWeights.status,
  "candidate-only",
  "Historical learned weights should remain candidate-only",
);
assert.ok(
  historicalWalkForward.run.factorAnalysis.correlationMatrix.rows.length > 0,
  "Historical factor analysis should include a cross-factor correlation matrix",
);
assert.ok(
  Object.values(historicalWalkForward.run.factorAnalysis.factorStats).some((row) => Object.keys(row.horizons || {}).length > 0),
  "Historical factor stats should include per-horizon cells with n",
);
assert.ok(
  Object.values(historicalWalkForward.run.factorAnalysis.factorStats).some((row) => Number(row.effectiveN) < Number(row.n || row.samples)),
  "Historical factor stats should include effectiveN below raw n when multiple horizons overlap",
);
assert.ok(
  Object.values(historicalWalkForward.run.factorAnalysis.factorStats).some((row) => Object.keys(row.subSignals || {}).length > 0),
  "Historical factor stats should include per-sub-signal stats when reconstructable",
);
assert.ok(
  Object.values(historicalWalkForward.run.factorAnalysis.factorStats).every((row) => row.winsorization?.enabled === true),
  "Historical factor stats should report winsorization audit fields",
);
assert.equal(
  historicalWalkForward.run.provenance.engine,
  "native-js",
  "Historical backtest report should include engine provenance",
);
assert.equal(
  historicalWalkForward.report.provenance.strategyHash,
  historicalWalkForward.run.strategyHash,
  "Historical report should preserve frozen strategy provenance",
);

const disabledWatcher = await runIntradayWatcherOnce({ db: { watchlist: ["NVDA"] } }, { config: { enabled: false } });
assert.equal(disabledWatcher.status, "disabled", "Intraday watcher must default to disabled");

const watcherDb = {
  watchlist: ["MU"],
  alerts: [],
  allStockAgent: { runs: [{ buyCandidates: [{ ticker: "NVDA" }] }], decisions: [] },
  consensusSnapshots: [],
};
const watcherRun = await runIntradayWatcherOnce(
  {
    db: watcherDb,
    latestRun: {
      eventCalendar: { earnings: [{ ticker: "MU", date: "2026-07-02" }] },
      researchPacks: [{ ticker: "MU", provider: "fixture-research", summary: { epsEstimate: 1.23, revenueEstimate: 9000 } }],
      alerts: [],
    },
    collectQuotes: async () => ({
      quotes: [{ ticker: "MU", price: 100, previousClose: 95, volume: 4000000, timestamp: "2026-07-01T15:00:00.000Z" }],
      errors: [],
    }),
    collectTechnicalData: async () => ({
      technicals: [{
        ticker: "MU",
        latestClose: 100,
        atr14: 1.8,
        chart: Array.from({ length: 20 }, (_, index) => ({ close: 90 + index, volume: 1000000 })),
        keyLevels: { week52High: 99 },
      }],
      errors: [],
    }),
    collectEdgarCurrentFilings: async () => ({
      filings: [{ ticker: "MU", form: "8-K", item: "2.02", filed_at: "2026-07-01", severity: "high" }],
      errors: [],
    }),
  },
  {
    force: true,
    now: "2026-07-01T15:00:00.000Z",
    config: { enabled: true, universeLimit: 10, edgar: { enabled: true, limit: 5 }, push: { enabled: false, provider: "", target: "", minSeverity: "high", cooldownMs: 0 } },
    simulatedSignals: [{
      ticker: "NVDA",
      movePercent: 5,
      moveZ: 3,
      headline: "NVDA 8-K guidance update",
      source: "fixture-filing",
      membership: ["today_candidate"],
    }],
  },
);
assert.equal(watcherRun.status, "ok", "Forced watcher fixture should run");
assert.ok(watcherRun.alerts.length >= 1, "Forced watcher fixture should create alerts");
assert.ok(watcherRun.auditEvents.every((event) => event.payload?.llmCriticalPath === false || event.eventType === "intraday_watcher.consensus_snapshot"), "Watcher critical path audit should be LLM-free");
assert.equal(watcherRun.consensusSnapshots.length, 1, "Day-before earnings should snapshot consensus data");
assert.equal(watcherRun.consensusSnapshots[0].epsEstimate, 1.23, "Consensus snapshot should persist EPS estimate");
assert.equal(watcherRun.edgarFilings.length, 1, "EDGAR watcher seam should collect current filings when explicitly enabled");
assert.ok(
  watcherRun.alerts.some((alert) => alert.rawSignal?.source === "edgar-current-filings"),
  "EDGAR current filings should be converted into watcher alerts",
);

console.log("core_regression_tests: ok");
