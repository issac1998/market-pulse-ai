import {
  DEFAULT_RECOMMENDER_FACTOR_WEIGHTS,
  clampScore,
  normalizeFactorValue,
  scoreRecommendationFromFactorSnapshot,
} from "./recommender_core.mjs";
import { numberOrNull } from "./market_core.mjs";

const FACTOR_IDS = Object.keys(DEFAULT_RECOMMENDER_FACTOR_WEIGHTS);
const OHLCV_SOURCE = "historical_bars";

function safeTicker(value = "") {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 16);
}

function ymd(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[^\d]/g, "");
  if (/^\d{8}$/.test(compact)) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw.slice(0, 10);
}

function finite(value, fallback = null) {
  const n = numberOrNull(value);
  return Number.isFinite(n) ? n : fallback;
}

function mean(values = []) {
  const rows = values.filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

function std(values = []) {
  const rows = values.filter(Number.isFinite);
  if (rows.length < 2) return null;
  const avg = mean(rows);
  const variance = rows.reduce((sum, value) => sum + (value - avg) ** 2, 0) / rows.length;
  return Math.sqrt(variance);
}

function corr(a = [], b = []) {
  const pairs = a.map((value, index) => [value, b[index]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const ax = mean(pairs.map(([x]) => x));
  const by = mean(pairs.map(([, y]) => y));
  const cov = pairs.reduce((sum, [x, y]) => sum + (x - ax) * (y - by), 0);
  const sx = Math.sqrt(pairs.reduce((sum, [x]) => sum + (x - ax) ** 2, 0));
  const sy = Math.sqrt(pairs.reduce((sum, [, y]) => sum + (y - by) ** 2, 0));
  return sx > 0 && sy > 0 ? cov / (sx * sy) : null;
}

function ratio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0 ? numerator / denominator : null;
}

function roundFeature(value) {
  return Number.isFinite(value) ? Number(value.toFixed(8)) : null;
}

function windowRows(rows = [], window) {
  return rows.slice(Math.max(0, rows.length - window));
}

function returns(rows = []) {
  const out = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]?.close;
    const current = rows[index]?.close;
    out.push(Number.isFinite(previous) && previous !== 0 && Number.isFinite(current) ? current / previous - 1 : null);
  }
  return out;
}

export function normalizeHistoricalBars(rows = []) {
  return (rows || [])
    .map((row) => {
      const ticker = safeTicker(row.ticker || row.symbol);
      const date = ymd(row.date || row.timestamp || row.time || row.capturedAt);
      const open = finite(row.open ?? row.o);
      const high = finite(row.high ?? row.h);
      const low = finite(row.low ?? row.l);
      const close = finite(row.close ?? row.c ?? row.price);
      const volume = finite(row.volume ?? row.v, 0);
      return {
        ticker,
        date,
        open,
        high,
        low,
        close,
        volume,
        source: String(row.source || row.provider || OHLCV_SOURCE),
      };
    })
    .filter((row) => row.date && Number.isFinite(row.open) && Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function alpha158Subset(inputRows = [], options = {}) {
  const rows = normalizeHistoricalBars(inputRows);
  if (!rows.length) {
    return {
      schemaVersion: "alpha158-subset-v1",
      sampleCount: 0,
      windows: [5, 20, 60],
      features: {},
    };
  }
  const latest = rows.at(-1);
  const features = {};
  const open = latest.open;
  const close = latest.close;
  const high = latest.high;
  const low = latest.low;
  features.KMID = roundFeature(ratio(close - open, open));
  features.KLEN = roundFeature(ratio(high - low, open));
  features.KUP = roundFeature(ratio(high - Math.max(open, close), open));
  features.KLOW = roundFeature(ratio(Math.min(open, close) - low, open));
  features.KSFT = roundFeature(ratio(2 * close - high - low, open));

  const windows = options.windows || [5, 20, 60];
  for (const window of windows) {
    const subset = windowRows(rows, window);
    const previous = rows.length > window ? rows[rows.length - window - 1] : null;
    const closes = subset.map((row) => row.close);
    const highs = subset.map((row) => row.high);
    const lows = subset.map((row) => row.low);
    const vols = subset.map((row) => row.volume);
    const subsetReturns = returns(subset);
    const closeMean = mean(closes);
    const lowMin = lows.length ? Math.min(...lows) : null;
    const highMax = highs.length ? Math.max(...highs) : null;
    const maxIndex = highs.indexOf(highMax);
    const minIndex = lows.indexOf(lowMin);
    const vwapDenominator = vols.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
    const vwap = vwapDenominator > 0
      ? subset.reduce((sum, row) => sum + row.close * (Number.isFinite(row.volume) ? row.volume : 0), 0) / vwapDenominator
      : null;
    const rankDenominator = Math.max(1, closes.length - 1);
    const lowerOrEqualCount = closes.filter((value) => Number.isFinite(value) && value <= close).length - 1;
    const positives = subsetReturns.filter((value) => Number.isFinite(value) && value > 0).length;
    const negatives = subsetReturns.filter((value) => Number.isFinite(value) && value < 0).length;
    const returnCount = subsetReturns.filter(Number.isFinite).length;

    features[`ROC${window}`] = roundFeature(previous && previous.close ? close / previous.close - 1 : null);
    features[`MA${window}`] = roundFeature(Number.isFinite(closeMean) ? close / closeMean - 1 : null);
    features[`STD${window}`] = roundFeature(std(subsetReturns));
    features[`RSV${window}`] = roundFeature(Number.isFinite(highMax) && Number.isFinite(lowMin) && highMax !== lowMin ? (close - lowMin) / (highMax - lowMin) : null);
    features[`RANK${window}`] = roundFeature(closes.length > 1 ? lowerOrEqualCount / rankDenominator : null);
    features[`IMAX${window}`] = roundFeature(maxIndex >= 0 && closes.length > 1 ? maxIndex / rankDenominator : null);
    features[`IMIN${window}`] = roundFeature(minIndex >= 0 && closes.length > 1 ? minIndex / rankDenominator : null);
    features[`CORR${window}`] = roundFeature(corr(closes, vols));
    features[`CNTP${window}`] = roundFeature(returnCount ? positives / returnCount : null);
    features[`CNTN${window}`] = roundFeature(returnCount ? negatives / returnCount : null);
    features[`WVMA${window}`] = roundFeature(Number.isFinite(vwap) && vwap !== 0 ? close / vwap - 1 : null);
  }

  return {
    schemaVersion: "alpha158-subset-v1",
    sampleCount: rows.length,
    latestDate: latest.date,
    latestClose: latest.close,
    windows,
    features,
  };
}

function factorRow(id, label, score, raw = {}, quality = 0, source = [], missingReason = "") {
  const isNeutralMissing = missingReason === "not-reconstructable";
  const normalization = isNeutralMissing
    ? { score: 50, zScore: null, method: "missing", factorId: id }
    : normalizeFactorValue(id, score);
  return {
    id,
    label,
    raw,
    heuristicScore: clampScore(score),
    score: normalization.score,
    normalization,
    quality: clampScore(quality),
    source,
    missingReason,
  };
}

function neutralNotReconstructable(id) {
  return factorRow(
    id,
    ({
      qualityGrowth: "质量成长",
      valuationExpectation: "估值预期",
      earningsRevision: "盈利预期修正",
      newsCatalyst: "新闻催化",
      industryChain: "产业链",
      optionsFlow: "期权资金",
      socialAttention: "社交热度",
    })[id] || id,
    50,
    {},
    0,
    [],
    "not-reconstructable",
  );
}

function momentumScoreFromAlpha(alpha = {}) {
  const f = alpha.features || {};
  const score =
    50 +
    (finite(f.ROC20, 0) * 120) +
    (finite(f.ROC60, 0) * 85) +
    (finite(f.MA20, 0) * 130) +
    (finite(f.MA60, 0) * 75) +
    ((finite(f.RSV20, 0.5) - 0.5) * 22) +
    ((finite(f.CNTP20, 0.5) - finite(f.CNTN20, 0.5)) * 10) -
    (finite(f.STD20, 0) * 120);
  return clampScore(Math.round(score));
}

function liquidityScore(rows = []) {
  const latest = rows.at(-1);
  const subset = windowRows(rows, Math.min(60, rows.length));
  const dollarVolumes = subset.map((row) => (Number.isFinite(row.close) && Number.isFinite(row.volume) ? row.close * row.volume : null)).filter(Number.isFinite);
  const avgDollarVolume = mean(dollarVolumes);
  let score = 50;
  if (Number.isFinite(avgDollarVolume)) {
    if (avgDollarVolume >= 1_000_000_000) score = 78;
    else if (avgDollarVolume >= 250_000_000) score = 70;
    else if (avgDollarVolume >= 50_000_000) score = 62;
    else if (avgDollarVolume >= 10_000_000) score = 54;
    else score = 42;
  }
  return {
    score,
    raw: {
      avgDollarVolume60d: Number.isFinite(avgDollarVolume) ? Math.round(avgDollarVolume) : null,
      latestDollarVolume: latest && Number.isFinite(latest.close) && Number.isFinite(latest.volume) ? Math.round(latest.close * latest.volume) : null,
    },
  };
}

function macroFactorFromRegime(historicalRegime = null) {
  if (!historicalRegime) {
    return factorRow("macroRegime", "宏观环境", 50, {}, 0, [], "not-reconstructable");
  }
  const riskScore = finite(historicalRegime.risk_score ?? historicalRegime.riskScore ?? historicalRegime.score);
  if (!Number.isFinite(riskScore)) {
    return factorRow("macroRegime", "宏观环境", 50, historicalRegime, 0, ["historical_regimes"], "not-reconstructable");
  }
  return factorRow(
    "macroRegime",
    "宏观环境",
    100 - riskScore,
    {
      marketRisk: riskScore,
      bucket: historicalRegime.bucket || historicalRegime.regime || "",
      date: historicalRegime.date || "",
    },
    80,
    ["historical_regimes", "FRED"],
    "",
  );
}

function latestPitFacts(pitFundamentals = [], asOf = "") {
  const asOfDate = ymd(asOf);
  const byField = new Map();
  const rows = (pitFundamentals || [])
    .map((row) => ({
      ...row,
      filed_at: ymd(row.filed_at || row.filedAt || row.filed_date || row.date),
      period: ymd(row.period || row.period_end || row.periodEnd),
      field: String(row.field || "").trim(),
      value: finite(row.value),
      form: row.form || "",
    }))
    .filter((row) => row.field && row.filed_at && (!asOfDate || row.filed_at <= asOfDate))
    .sort((a, b) => String(b.filed_at).localeCompare(String(a.filed_at)) || String(b.period).localeCompare(String(a.period)));
  for (const row of rows) {
    if (!byField.has(row.field)) byField.set(row.field, row);
  }
  return { rows, facts: Object.fromEntries([...byField.entries()].map(([field, row]) => [field, row.value])) };
}

function qualityGrowthFromPit(pitFundamentals = [], asOf = "") {
  const pit = latestPitFacts(pitFundamentals, asOf);
  if (!pit.rows.length) return neutralNotReconstructable("qualityGrowth");
  const revenue = pit.facts.revenue;
  const netIncome = pit.facts.net_income;
  const grossProfit = pit.facts.gross_profit;
  const assets = pit.facts.assets;
  const liabilities = pit.facts.liabilities;
  const operatingCashFlow = pit.facts.operating_cash_flow;
  const sharesDiluted = pit.facts.shares_diluted;
  const netMargin = Number.isFinite(revenue) && revenue > 0 && Number.isFinite(netIncome) ? netIncome / revenue : null;
  const grossMargin = Number.isFinite(revenue) && revenue > 0 && Number.isFinite(grossProfit) ? grossProfit / revenue : null;
  const debtToAssets = Number.isFinite(assets) && assets > 0 && Number.isFinite(liabilities) ? liabilities / assets : null;
  const cashConversion = Number.isFinite(netIncome) && netIncome !== 0 && Number.isFinite(operatingCashFlow) ? operatingCashFlow / Math.abs(netIncome) : null;
  const accrualsRatio = Number.isFinite(assets) && assets > 0 && Number.isFinite(netIncome) && Number.isFinite(operatingCashFlow)
    ? (netIncome - operatingCashFlow) / assets
    : null;
  const altmanZApprox = Number.isFinite(assets) && assets > 0 && Number.isFinite(liabilities) && Number.isFinite(netIncome) && Number.isFinite(revenue)
    ? 3.3 * (netIncome / assets) + 0.999 * (revenue / assets) + 0.6 * ((assets - liabilities) / Math.max(liabilities, 1))
    : null;
  const piotroskiPartial = [
    Number.isFinite(netIncome) ? netIncome > 0 : null,
    Number.isFinite(operatingCashFlow) ? operatingCashFlow > 0 : null,
    Number.isFinite(cashConversion) ? cashConversion > 1 : null,
    Number.isFinite(debtToAssets) ? debtToAssets < 0.65 : null,
    Number.isFinite(grossMargin) ? grossMargin > 0.3 : null,
  ].filter((value) => value !== null).reduce((sum, value) => sum + (value ? 1 : 0), 0);
  const score =
    50 +
    (Number.isFinite(netMargin) ? Math.max(-14, Math.min(18, netMargin * 70)) : 0) +
    (Number.isFinite(grossMargin) ? Math.max(-8, Math.min(12, (grossMargin - 0.35) * 30)) : 0) +
    (Number.isFinite(cashConversion) ? Math.max(-8, Math.min(10, (cashConversion - 1) * 8)) : 0) -
    (Number.isFinite(debtToAssets) ? Math.max(-4, Math.min(10, (debtToAssets - 0.55) * 20)) : 0) -
    (Number.isFinite(accrualsRatio) ? Math.max(-3, Math.min(6, accrualsRatio * 80)) : 0);
  return factorRow(
    "qualityGrowth",
    "质量成长",
    Math.round(score),
    {
      netMargin,
      grossMargin,
      debtToAssets,
      accrualsRatio,
      cashConversion,
      piotroskiPartial,
      altmanZApprox,
      dilutionTrend: Number.isFinite(sharesDiluted) ? { latestDilutedShares: sharesDiluted, status: "single-point" } : { latestDilutedShares: null, status: "missing" },
      factCount: pit.rows.length,
    },
    pit.rows.length >= 3 ? 72 : 45,
    ["pit_fundamentals", "edgartools"],
    "",
  );
}

function valuationFromPit(pitFundamentals = [], asOf = "", latestClose = null) {
  const pit = latestPitFacts(pitFundamentals, asOf);
  if (!pit.rows.length) return neutralNotReconstructable("valuationExpectation");
  const eps = pit.facts.eps_diluted;
  const pe = Number.isFinite(latestClose) && latestClose > 0 && Number.isFinite(eps) && eps > 0 ? latestClose / eps : null;
  const score = Number.isFinite(pe)
    ? pe < 15
      ? 68
      : pe < 25
        ? 58
        : pe < 45
          ? 50
          : 42
    : 50;
  return factorRow(
    "valuationExpectation",
    "估值预期",
    score,
    { peFromFiledEps: pe, epsDiluted: eps, latestClose, factCount: pit.rows.length },
    Number.isFinite(pe) ? 60 : 35,
    ["pit_fundamentals", "historical_bars", "edgartools"],
    Number.isFinite(pe) ? "" : "missing-filed-eps-or-price",
  );
}

function dataQualityFromFactors(factors = {}) {
  const weightRows = Object.entries(DEFAULT_RECOMMENDER_FACTOR_WEIGHTS);
  const weightSum = weightRows.reduce((sum, [, weight]) => sum + weight, 0);
  if (!weightSum) return 0;
  return clampScore(Math.round(weightRows.reduce((sum, [id, weight]) => sum + (finite(factors[id]?.quality, 0) || 0) * weight, 0) / weightSum));
}

export function buildFactorSnapshotAsOf({ ticker = "", asOf = "", bars = [], historicalRegime = null, pitFundamentals = [], peerGroup = null, weights = null } = {}) {
  const symbol = safeTicker(ticker);
  const asOfDate = ymd(asOf);
  const normalized = normalizeHistoricalBars(bars).filter((row) => !symbol || safeTicker(row.ticker) === symbol || !row.ticker);
  const eligible = normalized.filter((row) => !asOfDate || row.date <= asOfDate);
  const ignoredFutureRows = normalized.length - eligible.length;
  const alpha = alpha158Subset(eligible);
  const liquidity = liquidityScore(eligible);
  const factors = Object.fromEntries(FACTOR_IDS.map((id) => [id, neutralNotReconstructable(id)]));
  const latest = eligible.at(-1) || null;

  const momentumQuality = eligible.length >= 60 ? 90 : eligible.length >= 20 ? 65 : eligible.length >= 5 ? 35 : 0;
  factors.momentum = factorRow(
    "momentum",
    "动量/技术面",
    momentumScoreFromAlpha(alpha),
    {
      alpha158Subset: alpha.features,
      latestClose: alpha.latestClose,
      latestDate: alpha.latestDate,
      sampleCount: alpha.sampleCount,
    },
    momentumQuality,
    [OHLCV_SOURCE],
    eligible.length >= 20 ? "" : "insufficient-historical-bars",
  );
  factors.macroRegime = macroFactorFromRegime(historicalRegime);
  const tickerPit = (pitFundamentals || []).filter((row) => !row.ticker || safeTicker(row.ticker) === symbol);
  if (tickerPit.length) {
    factors.qualityGrowth = qualityGrowthFromPit(tickerPit, asOfDate);
    factors.valuationExpectation = valuationFromPit(tickerPit, asOfDate, latest?.close);
  }
  factors.smartMoney = factorRow(
    "smartMoney",
    "流动性/交易质量",
    liquidity.score,
    {
      ...liquidity.raw,
      note: "历史 Tier-1 只能重构流动性，机构持仓/内部人交易留给 WP6。",
    },
    eligible.length >= 20 ? 55 : eligible.length >= 5 ? 30 : 0,
    [OHLCV_SOURCE],
    eligible.length >= 5 ? "" : "insufficient-historical-bars",
  );

  const factorSnapshot = {
    schemaVersion: "historical-factor-snapshot-v1",
    ticker: symbol,
    asOf: asOfDate || latest?.date || "",
    universe: "us_equity",
    source: [OHLCV_SOURCE, historicalRegime ? "historical_regimes" : ""].filter(Boolean),
    peerGroup: peerGroup || { source: "historical", liquidityBucket: liquidity.score >= 62 ? "liquid" : liquidity.score >= 54 ? "normal" : "thin" },
    rawInputs: {
      latestBar: latest,
      alpha158Subset: alpha,
      liquidity: liquidity.raw,
      historicalRegime,
      pitFundamentals: { rows: tickerPit.length, latestFields: Object.keys(latestPitFacts(tickerPit, asOfDate).facts) },
    },
    factors,
    dataQualityScore: dataQualityFromFactors(factors),
    ignoredFutureRows,
  };
  return {
    factorSnapshot,
    recommendationScore: scoreRecommendationFromFactorSnapshot(factorSnapshot, weights ? { weights } : {}),
  };
}
