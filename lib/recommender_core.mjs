import { numberOrNull } from "./market_core.mjs";

export const DEFAULT_RECOMMENDER_FACTOR_WEIGHTS = Object.freeze({
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
});

function clampUnit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1, Math.min(1, n));
}

function roundWeight(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(6)) : 0;
}

function factorWeightBounds(previousWeight, maxStepWeight) {
  return {
    min: Math.max(-maxStepWeight, 0.005 - previousWeight),
    max: maxStepWeight,
  };
}

function rebalanceFactorDeltas(items = [], maxStepWeight = 0.01) {
  const rows = items.map((item) => {
    const bounds = factorWeightBounds(item.previousWeight, maxStepWeight);
    return {
      ...item,
      balancedDeltaWeight: Math.max(bounds.min, Math.min(bounds.max, item.rawDeltaWeight)),
      minDeltaWeight: bounds.min,
      maxDeltaWeight: bounds.max,
    };
  });
  let drift = rows.reduce((sum, item) => sum + item.balancedDeltaWeight, 0);
  for (let pass = 0; pass < 8 && Math.abs(drift) > 1e-10; pass += 1) {
    const direction = drift > 0 ? -1 : 1;
    const candidates = rows
      .map((item) => {
        const capacity = direction < 0
          ? item.balancedDeltaWeight - item.minDeltaWeight
          : item.maxDeltaWeight - item.balancedDeltaWeight;
        return { item, capacity: Math.max(0, capacity) };
      })
      .filter((row) => row.capacity > 1e-12);
    const totalCapacity = candidates.reduce((sum, row) => sum + row.capacity, 0);
    if (totalCapacity <= 1e-12) break;
    const target = Math.min(Math.abs(drift), totalCapacity);
    for (const row of candidates) {
      const adjustment = target * (row.capacity / totalCapacity) * direction;
      row.item.balancedDeltaWeight += adjustment;
    }
    drift = rows.reduce((sum, item) => sum + item.balancedDeltaWeight, 0);
  }
  return {
    rows,
    residualDrift: rows.reduce((sum, item) => sum + item.balancedDeltaWeight, 0),
  };
}

export function normalizeRecommendationFactorWeights(weights = {}, fallback = DEFAULT_RECOMMENDER_FACTOR_WEIGHTS) {
  const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_RECOMMENDER_FACTOR_WEIGHTS;
  const factorIds = [...new Set([...Object.keys(base), ...Object.keys(weights || {})])];
  const rows = {};
  for (const id of factorIds) {
    const raw = numberOrNull(weights?.[id] ?? base[id]);
    rows[id] = Number.isFinite(raw) && raw > 0 ? raw : 0;
  }
  let total = Object.values(rows).reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return { ...DEFAULT_RECOMMENDER_FACTOR_WEIGHTS };
  }
  const normalized = {};
  for (const [id, value] of Object.entries(rows)) {
    normalized[id] = roundWeight(value / total);
  }
  const normalizedTotal = Object.values(normalized).reduce((sum, value) => sum + value, 0);
  const drift = roundWeight(1 - normalizedTotal);
  const firstId = Object.keys(normalized)[0];
  if (firstId && Math.abs(drift) > 0) {
    normalized[firstId] = roundWeight(normalized[firstId] + drift);
  }
  return normalized;
}

export function learnRecommendationFactorWeights(factorStats = {}, options = {}) {
  const previousWeights = normalizeRecommendationFactorWeights(
    options.currentWeights || DEFAULT_RECOMMENDER_FACTOR_WEIGHTS,
    DEFAULT_RECOMMENDER_FACTOR_WEIGHTS,
  );
  const minSamples = Math.max(1, Number(options.minSamples) || 20);
  const rawStepPct = numberOrNull(options.maxStepPct) ?? 1;
  const maxStepPct = Math.max(0, Math.min(2, rawStepPct));
  const maxStepWeight = maxStepPct / 100;
  const eligible = [];
  const skipped = [];
  for (const factorId of Object.keys(previousWeights)) {
    const row = factorStats?.[factorId] || {};
    const samples = Number(row.samples || 0);
    if (samples < minSamples) {
      skipped.push({
        factorId,
        label: row.label || factorId,
        samples,
        reason: `样本 ${samples} 低于最小门槛 ${minSamples}`,
      });
      continue;
    }
    const avgExcessPct = numberOrNull(row.avgExcessPct);
    const rankIC = numberOrNull(row.rankIC);
    const hitRate = numberOrNull(row.hitRate);
    if (!Number.isFinite(rankIC)) {
      skipped.push({
        factorId,
        label: row.label || factorId,
        samples,
        reason: "缺少 rankIC，暂不参与机械因子调权",
      });
      continue;
    }
    const normalizedAvgExcessReturn = clampUnit((avgExcessPct || 0) / 5);
    const normalizedRankIC = clampUnit((rankIC || 0) / 0.12);
    const normalizedHitRate = Number.isFinite(hitRate) ? clampUnit((hitRate - 0.5) / 0.2) : 0;
    const drawdownPenalty = Number.isFinite(numberOrNull(row.avgMaePct))
      ? Math.max(0, Math.min(1, Math.abs(Number(row.avgMaePct)) / 10))
      : 0;
    const factorEdge =
      0.45 * normalizedAvgExcessReturn +
      0.25 * normalizedRankIC +
      0.2 * normalizedHitRate -
      0.1 * drawdownPenalty;
    eligible.push({
      factorId,
      label: row.label || factorId,
      samples,
      rankIC: Number.isFinite(rankIC) ? rankIC : null,
      avgExcessPct: Number.isFinite(avgExcessPct) ? avgExcessPct : null,
      hitRate: Number.isFinite(hitRate) ? hitRate : null,
      factorEdge,
      previousWeight: previousWeights[factorId],
    });
  }
  const totalSamples = eligible.reduce((sum, item) => sum + item.samples, 0);
  const weightedMeanEdge = totalSamples > 0
    ? eligible.reduce((sum, item) => sum + item.factorEdge * item.samples, 0) / totalSamples
    : 0;
  const deltas = [];
  for (const item of eligible) {
    const relativeEdge = item.factorEdge - weightedMeanEdge;
    const deltaWeight = Math.max(-maxStepWeight, Math.min(maxStepWeight, relativeEdge * maxStepWeight));
    if (Math.abs(deltaWeight) < 0.000001) {
      skipped.push({
        factorId: item.factorId,
        label: item.label,
        samples: item.samples,
        reason: "相对归因边际接近 0，本轮不调权",
      });
      continue;
    }
    deltas.push({
      factorId: item.factorId,
      label: item.label,
      samples: item.samples,
      rankIC: item.rankIC,
      avgExcessPct: item.avgExcessPct,
      hitRate: item.hitRate,
      factorEdge: roundWeight(item.factorEdge),
      relativeEdge: roundWeight(relativeEdge),
      previousWeight: item.previousWeight,
      rawDeltaWeight: deltaWeight,
      rawDeltaPct: roundWeight(deltaWeight * 100),
    });
  }
  const rebalanced = rebalanceFactorDeltas(deltas, maxStepWeight);
  const learnedWeights = { ...previousWeights };
  for (const item of rebalanced.rows) {
    learnedWeights[item.factorId] = item.previousWeight + item.balancedDeltaWeight;
  }
  const roundedWeights = {};
  for (const [factorId, value] of Object.entries(learnedWeights)) {
    roundedWeights[factorId] = roundWeight(value);
  }
  const roundedDrift = roundWeight(1 - Object.values(roundedWeights).reduce((sum, value) => sum + value, 0));
  const driftTarget = rebalanced.rows
    .slice()
    .sort((a, b) => Math.abs(b.balancedDeltaWeight) - Math.abs(a.balancedDeltaWeight))[0];
  if (driftTarget && Math.abs(roundedDrift) > 0) {
    roundedWeights[driftTarget.factorId] = roundWeight(roundedWeights[driftTarget.factorId] + roundedDrift);
  }
  const stepViolations = [];
  for (const [factorId, learned] of Object.entries(roundedWeights)) {
    const delta = learned - previousWeights[factorId];
    if (Math.abs(delta) > maxStepWeight + 0.000001) {
      stepViolations.push({ factorId, deltaWeight: roundWeight(delta) });
    }
  }
  const changes = rebalanced.rows
    .map((item) => {
      const learned = roundedWeights[item.factorId];
      const normalizedDelta = roundWeight(learned - item.previousWeight);
      return {
        ...item,
        rawDeltaWeight: roundWeight(item.rawDeltaWeight),
        balancedDeltaWeight: roundWeight(item.balancedDeltaWeight),
        balancedDeltaPct: roundWeight(item.balancedDeltaWeight * 100),
        learnedWeight: learned,
        normalizedDeltaWeight: normalizedDelta,
        normalizedDeltaPct: roundWeight(normalizedDelta * 100),
        direction: normalizedDelta > 0 ? "up" : normalizedDelta < 0 ? "down" : "flat",
      };
    })
    .filter((item) => item.direction !== "flat");
  return {
    schemaVersion: "factor-weight-learning-v1",
    generatedAt: options.generatedAt || new Date().toISOString(),
    source: options.source || "",
    status: changes.length ? "updated" : "unchanged",
    settings: {
      minSamples,
      maxStepPct,
      freezeSkippedFactors: true,
      formula: "relativeEdge = factorEdge - sampleWeightedMean(factorEdge); factorEdge = 0.45*avgExcess + 0.25*rankIC + 0.20*hitRate - 0.10*drawdownPenalty",
    },
    previousWeights,
    learnedWeights: roundedWeights,
    changes,
    skipped,
    audit: {
      skippedWeightsFrozen: true,
      residualDrift: roundWeight(rebalanced.residualDrift),
      roundedDrift,
      stepViolations,
    },
    note: "这是机械因子归因调权，只读取 factorStats，不读取 LLM review_attributor 经验教训；样本不足或缺 rankIC 的 skipped 因子权重保持冻结，不参与归一化漂移。",
  };
}

export function clampScore(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function safeTicker(value = "") {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 16);
}

function text(value = "") {
  return String(value || "").trim();
}

function normalizeMarketCapUsd(value) {
  const n = numberOrNull(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 10_000_000 ? n * 1_000_000 : n;
}

function benchmarkSectorTicker(industryText = "", businessText = "") {
  const value = `${industryText} ${businessText}`.toLowerCase();
  if (/semiconductor|chip|半导体|芯片|euv|memory|dram|nand|foundry|晶圆|光刻/i.test(value)) return "SMH";
  if (/software|cloud|internet|technology|ai|人工智能|软件|云|数据中心/i.test(value)) return "XLK";
  if (/health|pharma|biotech|drug|医疗|医药|生物/i.test(value)) return "XLV";
  if (/energy|oil|gas|能源|石油|天然气/i.test(value)) return "XLE";
  if (/bank|financial|insurance|金融|银行|保险/i.test(value)) return "XLF";
  if (/consumer discretionary|retail|auto|ecommerce|消费|零售|汽车|电商/i.test(value)) return "XLY";
  if (/communication|media|telecom|通信|传媒|广告/i.test(value)) return "XLC";
  if (/industrial|aerospace|defense|manufacturing|工业|航天|国防|制造/i.test(value)) return "XLI";
  if (/utility|utilities|电力|公用事业/i.test(value)) return "XLU";
  if (/consumer staple|food|beverage|日用品|食品|饮料/i.test(value)) return "XLP";
  return "";
}

const FACTOR_BASELINES = Object.freeze({
  momentum: { median: 52, mad: 14 },
  qualityGrowth: { median: 51, mad: 15 },
  valuationExpectation: { median: 50, mad: 16 },
  earningsRevision: { median: 51, mad: 13 },
  newsCatalyst: { median: 50, mad: 16 },
  industryChain: { median: 50, mad: 13 },
  macroRegime: { median: 50, mad: 18 },
  optionsFlow: { median: 50, mad: 15 },
  smartMoney: { median: 50, mad: 12 },
  socialAttention: { median: 50, mad: 18 },
});

function peerBaselineForFactor(factorId = "", peerGroup = {}) {
  const base = FACTOR_BASELINES[factorId] || { median: 50, mad: 15 };
  let median = numberOrNull(peerGroup.median);
  let mad = numberOrNull(peerGroup.mad);
  if (!Number.isFinite(median)) median = base.median;
  if (!Number.isFinite(mad) || mad <= 0) mad = base.mad;

  const industry = text(peerGroup.industry).toLowerCase();
  if (factorId === "valuationExpectation" && /semiconductor|software|technology|ai|半导体|软件|科技|数据中心/.test(industry)) {
    median += 3;
  }
  if (factorId === "qualityGrowth" && /bank|financial|金融|银行/.test(industry)) {
    median -= 2;
  }
  if (factorId === "momentum" && peerGroup.liquidityBucket === "thin") {
    mad += 4;
  }
  if (factorId === "socialAttention" && peerGroup.sizeBucket === "mega") {
    median += 4;
  }
  return { median, mad };
}

export function normalizeFactorValue(factorId, rawValue, peerGroup = {}) {
  const value = numberOrNull(rawValue);
  if (!Number.isFinite(value)) {
    return { score: 50, zScore: null, method: "missing", factorId };
  }
  const baseline = peerBaselineForFactor(factorId, peerGroup);
  const zScore = Math.max(-4, Math.min(4, (value - baseline.median) / baseline.mad));
  return {
    score: clampScore(Math.round(50 + 12 * zScore)),
    zScore,
    method: Number.isFinite(numberOrNull(peerGroup.median)) && Number.isFinite(numberOrNull(peerGroup.mad))
      ? "peer-median-mad"
      : "factor-peer-baseline",
    factorId,
    peerGroup: {
      industry: peerGroup.industry || "",
      sizeBucket: peerGroup.sizeBucket || "",
      liquidityBucket: peerGroup.liquidityBucket || "",
      median: baseline.median,
      mad: baseline.mad,
    },
  };
}

export function normalizeFactorMap(factors = {}, peerGroup = {}) {
  const normalized = {};
  for (const [id, factor] of Object.entries(factors || {})) {
    const heuristicScore = numberOrNull(factor?.score) ?? 50;
    const normalization = normalizeFactorValue(id, heuristicScore, peerGroup);
    normalized[id] = {
      ...factor,
      heuristicScore,
      score: normalization.score,
      normalization,
    };
  }
  return normalized;
}

export function dataQualityMultiplier(score) {
  const value = numberOrNull(score) ?? 0;
  if (value >= 85) return 1;
  if (value >= 70) return 0.92;
  if (value >= 55) return 0.78;
  return 0.55;
}

export function regimeMultiplierFromSnapshot(snapshot = {}) {
  const macro = snapshot.factors?.macroRegime;
  const marketRisk = numberOrNull(macro?.raw?.marketRisk);
  if (!Number.isFinite(marketRisk)) return 1;
  if (marketRisk < 45) return 1.05;
  if (marketRisk < 65) return 1;
  if (marketRisk < 80) return 0.85;
  return 0.65;
}

export function scoreRecommendationFromFactorSnapshot(factorSnapshot = {}, options = {}) {
  const weights = options.weights || DEFAULT_RECOMMENDER_FACTOR_WEIGHTS;
  const factors = factorSnapshot.factors || {};
  const weightedScore = Object.entries(weights).reduce((sum, [id, weight]) => {
    const score = numberOrNull(factors[id]?.score) ?? 50;
    return sum + score * weight;
  }, 0);
  const alphaScore = clampScore(Math.round(weightedScore));
  const qualityMultiplier = dataQualityMultiplier(factorSnapshot.dataQualityScore);
  const regimeMultiplier = regimeMultiplierFromSnapshot(factorSnapshot);
  const gates = options.gates || [];
  const hardVeto = gates.some((gate) => gate.action === "veto_buy");
  const capBuy = gates.some((gate) => gate.action === "cap_buy" || gate.action === "shadow_cap_buy");
  const shadowDownweight = gates.some((gate) => gate.action === "shadow_downweight");
  const portfolioFit = options.portfolioFit || null;
  const riskPenalty =
    (hardVeto ? 100 : 0) +
    (capBuy ? 10 : 0) +
    (shadowDownweight ? 4 : 0) +
    ((options.hasPosition && !options.allowAddToExisting && !portfolioFit) ? 6 : 0);
  const portfolioFitScore = numberOrNull(portfolioFit?.score) ?? (options.hasPosition ? -4 : 0);
  const actionScore = hardVeto
    ? 0
    : clampScore(Math.round(alphaScore * qualityMultiplier * regimeMultiplier + portfolioFitScore - riskPenalty));
  const contributions = Object.entries(weights).map(([id, weight]) => {
    const factor = factors[id] || {};
    const score = numberOrNull(factor.score) ?? 50;
    return {
      id,
      label: factor.label || id,
      score,
      weight,
      contribution: (score - 50) * weight,
      quality: numberOrNull(factor.quality) ?? 0,
      missingReason: factor.missingReason || "",
    };
  });
  const topPositiveFactors = contributions.filter((item) => item.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 3);
  const topRiskFactors = contributions
    .filter((item) => item.contribution < 0 || item.quality < 35)
    .sort((a, b) => a.contribution - b.contribution || a.quality - b.quality)
    .slice(0, 3);
  const recommendedAction = hardVeto
    ? "回避"
    : actionScore >= 76 && !capBuy
      ? "买入候选"
      : actionScore >= 66
        ? "观察买入"
        : actionScore >= 55
          ? "等待触发"
          : actionScore >= 40
            ? "持有/中性"
            : "回避/卖出检查";
  return {
    schemaVersion: "recommendation-score-v1",
    alphaScore,
    actionScore,
    dataQualityScore: factorSnapshot.dataQualityScore,
    dataQualityMultiplier: qualityMultiplier,
    regimeMultiplier,
    portfolioFitScore,
    portfolioFit,
    riskPenalty,
    hardVeto,
    capBuy,
    recommendedAction,
    contributions,
    topPositiveFactors,
    topRiskFactors,
    matchedFactors: contributions.filter((item) => item.score >= 62 && item.quality >= 35).map((item) => item.id),
  };
}

export function normalizeBenchmarkBasket(items = []) {
  const rows = (items || [])
    .map((item) => ({ ticker: safeTicker(item.ticker || item.symbol), weight: Number(item.weight) }))
    .filter((item) => item.ticker && Number.isFinite(item.weight) && item.weight > 0);
  const seen = new Map();
  for (const item of rows) {
    seen.set(item.ticker, (seen.get(item.ticker) || 0) + item.weight);
  }
  const total = [...seen.values()].reduce((sum, value) => sum + value, 0);
  return [...seen.entries()].map(([ticker, weight]) => ({ ticker, weight: total ? weight / total : 0 }));
}

export function buildBenchmarkBasket(ticker = "", profile = {}, industryText = "") {
  const symbol = safeTicker(ticker);
  const industry = text(industryText || profile.industry || "");
  const business = text(profile.mainBusiness || "");
  const marketCap = normalizeMarketCapUsd(profile.marketCapitalization ?? profile.marketCap ?? profile.totalMarketCap);
  const sectorTicker = benchmarkSectorTicker(industry, business);
  const rows = [];
  if (Number.isFinite(marketCap) && marketCap > 0 && marketCap < 2_000_000_000) {
    rows.push({ ticker: "IWM", weight: 0.5 });
    if (sectorTicker) rows.push({ ticker: sectorTicker, weight: 0.3 });
    rows.push({ ticker: "SPY", weight: sectorTicker ? 0.2 : 0.5 });
    return normalizeBenchmarkBasket(rows);
  }
  if (sectorTicker === "SMH") return normalizeBenchmarkBasket([{ ticker: "QQQ", weight: 0.4 }, { ticker: "SMH", weight: 0.4 }, { ticker: "SPY", weight: 0.2 }]);
  if (sectorTicker) return normalizeBenchmarkBasket([{ ticker: "SPY", weight: 0.5 }, { ticker: sectorTicker, weight: 0.3 }, { ticker: "QQQ", weight: 0.2 }]);
  return normalizeBenchmarkBasket([{ ticker: "SPY", weight: 0.5 }, { ticker: "QQQ", weight: 0.3 }, { ticker: "VTI", weight: 0.2 }]);
}

export function outcomeFromExcess(excessPct, deadbandPct = 0.5) {
  const value = numberOrNull(excessPct);
  if (!Number.isFinite(value)) return "pending";
  const deadband = Math.max(0, Number(deadbandPct) || 0);
  if (value > deadband) return "win";
  if (value < -deadband) return "loss";
  return "flat";
}

export function classifyOutcomeQuality(outcome = {}, options = {}) {
  const suspectReturnPct = Math.max(20, Number(options.suspectReturnPct ?? options.excessOutlierPct) || 100);
  const entryPrice = numberOrNull(outcome.entryPrice);
  const exitPrice = numberOrNull(outcome.exitPrice);
  const tickerReturnPct = numberOrNull(outcome.tickerReturnPct ?? outcome.rawReturnPct ?? outcome.performancePct);
  const horizonDays = numberOrNull(outcome.horizonDays);
  const reasons = [];
  let status = "ok";

  if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(exitPrice) || exitPrice <= 0) {
    status = "suspect_price";
    reasons.push("entry_or_exit_price_missing");
  }
  if (Number.isFinite(entryPrice) && entryPrice < 0.5) {
    status = "suspect_price";
    reasons.push("sub_50c_entry_price");
  }
  const shortHorizon = !Number.isFinite(horizonDays) || horizonDays <= 10;
  if (shortHorizon && Number.isFinite(tickerReturnPct) && Math.abs(tickerReturnPct) > suspectReturnPct) {
    status = "suspect_price";
    reasons.push("short_horizon_ticker_return_outlier");
  }
  if (shortHorizon && Number.isFinite(entryPrice) && entryPrice > 0 && Number.isFinite(exitPrice) && exitPrice > 0) {
    const ratio = exitPrice / entryPrice;
    if (ratio > 3 || ratio < 1 / 3) {
      status = "suspect_price";
      reasons.push("short_horizon_price_ratio_outlier");
    }
  }

  return {
    status,
    usable: status === "ok",
    reasons: [...new Set(reasons)],
    suspectReturnPct,
  };
}

export function outcomeIsUsable(outcome = {}, options = {}) {
  const existing = String(outcome.outcomeQualityStatus || outcome.qualityStatus || "").trim();
  if (existing === "ok") return true;
  if (existing === "suspect_price") return false;
  return classifyOutcomeQuality(outcome, options).usable;
}

export function stockHistoryPricePath(stockHistory = [], ticker = "", fromAt = "", toAt = "") {
  const symbol = safeTicker(ticker);
  const fromMs = new Date(fromAt || 0).getTime();
  const toMs = new Date(toAt || 0).getTime();
  if (!symbol || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return [];
  return (stockHistory || [])
    .map((row) => {
      const capturedMs = new Date(row?.capturedAt || 0).getTime();
      const price = numberOrNull(row?.quote?.price ?? row?.latestClose ?? row?.price ?? row?.close);
      return safeTicker(row?.ticker) === symbol && Number.isFinite(capturedMs) && capturedMs >= fromMs && capturedMs <= toMs && Number.isFinite(price) && price > 0
        ? {
            ticker: symbol,
            price,
            capturedAt: row.capturedAt,
            provider: row.quote?.provider || row.provider || "stockHistory",
            capturedMs,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.capturedMs - b.capturedMs);
}

export function pathExcursions(path = [], entryPrice, action = "买入") {
  const entry = numberOrNull(entryPrice);
  if (!Number.isFinite(entry) || entry <= 0 || !path.length) {
    return {
      maePct: null,
      mfePct: null,
      timeToProfitDays: null,
      pathSamples: 0,
    };
  }
  const direction = action === "卖出" ? -1 : 1;
  let maePct = Infinity;
  let mfePct = -Infinity;
  let timeToProfitDays = null;
  const startMs = new Date(path[0]?.capturedAt || 0).getTime();
  for (const point of path) {
    const rawReturnPct = ((point.price - entry) / entry) * 100;
    const directionalReturnPct = rawReturnPct * direction;
    maePct = Math.min(maePct, directionalReturnPct);
    mfePct = Math.max(mfePct, directionalReturnPct);
    if (timeToProfitDays === null && directionalReturnPct > 0) {
      const pointMs = new Date(point.capturedAt || 0).getTime();
      if (Number.isFinite(pointMs) && Number.isFinite(startMs)) {
        timeToProfitDays = Math.max(0, (pointMs - startMs) / (24 * 60 * 60 * 1000));
      }
    }
  }
  return {
    maePct: Number.isFinite(maePct) ? maePct : null,
    mfePct: Number.isFinite(mfePct) ? mfePct : null,
    timeToProfitDays,
    pathSamples: path.length,
  };
}

export function estimateThesisHit(decision = {}, outcome = "", process = {}, deadbandPct = 0.5) {
  const mae = numberOrNull(process.maePct);
  const mfe = numberOrNull(process.mfePct);
  if (process.stopTriggered || (Number.isFinite(mae) && mae <= -7)) return false;
  if (outcome === "win" && Number.isFinite(mfe) && mfe >= Math.max(2, deadbandPct)) return true;
  if (outcome === "loss" && Number.isFinite(mfe) && mfe < Math.max(1, deadbandPct)) return false;
  if (outcome === "loss" && Number.isFinite(mae) && mae <= -Math.max(2, deadbandPct)) return false;
  const invalidations = Array.isArray(decision.invalidations) ? decision.invalidations : [];
  if (outcome === "win" && invalidations.length && Number.isFinite(mfe)) return true;
  return null;
}
