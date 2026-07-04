import assert from "node:assert/strict";
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
  nyseSessionForYmd,
  scoreFredMacroRegime,
  semanticNewsOwnership,
} from "../lib/market_core.mjs";
import {
  buildBenchmarkBasket,
  classifyOutcomeQuality,
  learnRecommendationFactorWeights,
  normalizeRecommendationFactorWeights,
  normalizeFactorValue,
  outcomeFromExcess,
  outcomeIsUsable,
  pathExcursions,
  scoreRecommendationFromFactorSnapshot,
  stockHistoryPricePath,
} from "../lib/recommender_core.mjs";
import { storyFingerprint, triageIntradaySignal } from "../lib/alert_triage.mjs";
import {
  alpha158Subset,
  buildFactorSnapshotAsOf,
  normalizeHistoricalBars,
} from "../lib/historical_features.mjs";
import { runIntradayWatcherOnce } from "../server/intraday_watcher.mjs";
import { proxyFetchResponse } from "../server/network_fetch.mjs";

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
  "recommendation-score-v1",
  "Historical factor snapshots must score through recommender_core",
);
assert.ok(
  historicalSnapshot.recommendationScore.contributions.some((item) => item.id === "momentum"),
  "Historical recommendation score should include standard recommender factor contributions",
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
  },
  {
    force: true,
    now: "2026-07-01T15:00:00.000Z",
    config: { enabled: true, universeLimit: 10, push: { enabled: false, provider: "", target: "", minSeverity: "high", cooldownMs: 0 } },
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

console.log("core_regression_tests: ok");
