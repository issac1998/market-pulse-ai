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

function percentile(sortedValues = [], pct = 0) {
  const rows = sortedValues.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!rows.length) return null;
  const position = (Math.max(0, Math.min(100, pct)) / 100) * (rows.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return rows[lower];
  return rows[lower] + (rows[upper] - rows[lower]) * (position - lower);
}

export function winsorizeSeries(values = [], options = {}) {
  const enabled = options.enabled !== false;
  const lowerPct = Number.isFinite(Number(options.lowerPct)) ? Number(options.lowerPct) : 1;
  const upperPct = Number.isFinite(Number(options.upperPct)) ? Number(options.upperPct) : 99;
  const numeric = (values || []).map((value) => numberOrNull(value));
  if (!enabled) {
    return { values: numeric, lower: null, upper: null, clipCount: 0, enabled: false };
  }
  const lower = percentile(numeric, lowerPct);
  const upper = percentile(numeric, upperPct);
  let clipCount = 0;
  const clipped = numeric.map((value) => {
    if (!Number.isFinite(value) || !Number.isFinite(lower) || !Number.isFinite(upper)) return value;
    if (value < lower) {
      clipCount += 1;
      return lower;
    }
    if (value > upper) {
      clipCount += 1;
      return upper;
    }
    return value;
  });
  return { values: clipped, lower, upper, clipCount, enabled: true, lowerPct, upperPct };
}

export function winsorizeFactorSnapshots(snapshots = [], options = {}) {
  const enabled = options.enabled !== false;
  const rows = (snapshots || []).map((snapshot) => ({ ...snapshot, factors: { ...(snapshot?.factors || {}) } }));
  const clipCounts = {};
  const factorIds = [...new Set(rows.flatMap((snapshot) => Object.keys(snapshot.factors || {})))];
  for (const factorId of factorIds) {
    const values = rows.map((snapshot) => snapshot.factors?.[factorId]?.score);
    const clipped = winsorizeSeries(values, { enabled, lowerPct: options.lowerPct, upperPct: options.upperPct });
    clipCounts[factorId] = clipped.clipCount;
    rows.forEach((snapshot, index) => {
      if (!snapshot.factors?.[factorId] || !Number.isFinite(clipped.values[index])) return;
      snapshot.factors[factorId] = {
        ...snapshot.factors[factorId],
        preWinsorScore: numberOrNull(snapshot.factors[factorId].score),
        score: clipped.values[index],
        winsorization: {
          enabled: clipped.enabled,
          lower: clipped.lower,
          upper: clipped.upper,
          clipped: clipped.values[index] !== numberOrNull(values[index]),
        },
      };
    });
  }
  return {
    snapshots: rows,
    clipCounts,
    enabled,
    schemaVersion: "factor-winsorization-v1",
  };
}

function finiteMean(values = []) {
  const rows = (values || []).map(numberOrNull).filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

export function buildSubSignalCompositePlan(factorStats = {}, options = {}) {
  const minSamples = Math.max(1, Number(options.minSamples || 50));
  const factors = {};
  for (const [factorId, row] of Object.entries(factorStats || {})) {
    const subSignals = {};
    const eligible = [];
    for (const [subSignalId, sub] of Object.entries(row?.subSignals || {})) {
      const effectiveN = Number(sub.effectiveN ?? sub.n ?? sub.samples ?? 0) || 0;
      const rankIC = numberOrNull(sub.rankIC);
      const rawWeight = effectiveN >= minSamples ? Math.max(0, rankIC || 0) : 0;
      subSignals[subSignalId] = {
        subSignalId,
        label: sub.label || subSignalId,
        n: Number(sub.n ?? sub.samples ?? 0) || 0,
        effectiveN,
        rankIC: Number.isFinite(rankIC) ? rankIC : null,
        eligible: rawWeight > 0,
        rawWeight,
      };
      if (rawWeight > 0) eligible.push(subSignals[subSignalId]);
    }
    const total = eligible.reduce((sum, item) => sum + item.rawWeight, 0);
    if (total <= 0) continue;
    for (const item of eligible) {
      subSignals[item.subSignalId].weight = item.rawWeight / total;
    }
    factors[factorId] = {
      factorId,
      mode: "ic-weighted",
      minSamples,
      subSignals,
      eligibleCount: eligible.length,
      evidence: "positive-rankIC-effectiveN",
    };
  }
  return {
    schemaVersion: "subsignal-composite-plan-v1",
    generatedAt: options.generatedAt || new Date().toISOString(),
    mode: "ic-weighted",
    minSamples,
    factors,
    factorCount: Object.keys(factors).length,
    note: "子信号 composite 计划只由机械 factorStats 生成；进入 live scoring 需要 strategy-version promote。",
  };
}

function rankValues(values = []) {
  const sorted = values
    .map((value, index) => ({ value: numberOrNull(value), index }))
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length).fill(null);
  for (let index = 0; index < sorted.length; index += 1) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1].value === sorted[index].value) end += 1;
    const rank = (index + end) / 2 + 1;
    for (let cursor = index; cursor <= end; cursor += 1) ranks[sorted[cursor].index] = rank;
    index = end;
  }
  return ranks;
}

export function rankCorrelation(xs = [], ys = []) {
  const pairs = [];
  for (let index = 0; index < Math.min(xs.length, ys.length); index += 1) {
    const x = numberOrNull(xs[index]);
    const y = numberOrNull(ys[index]);
    if (Number.isFinite(x) && Number.isFinite(y)) pairs.push({ x, y });
  }
  if (pairs.length < 3) return null;
  const rx = rankValues(pairs.map((item) => item.x));
  const ry = rankValues(pairs.map((item) => item.y));
  const mx = finiteMean(rx);
  const my = finiteMean(ry);
  if (!Number.isFinite(mx) || !Number.isFinite(my)) return null;
  let numerator = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let index = 0; index < pairs.length; index += 1) {
    const dx = rx[index] - mx;
    const dy = ry[index] - my;
    numerator += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  return dx2 > 0 && dy2 > 0 ? numerator / Math.sqrt(dx2 * dy2) : null;
}

function outcomeUsable(row = {}) {
  return row && row.outcomeUsable !== false && row.qualityStatus !== "suspect_price" && row.outcomeQualityStatus !== "suspect_price";
}

function metricAccumulator(id = "", label = "") {
  return {
    id,
    label: label || id,
    n: 0,
    samples: 0,
    wins: 0,
    losses: 0,
    avgExcessPct: 0,
    avgScore: 0,
    hitRate: null,
    rankIC: null,
    ic: null,
    scores: [],
    returns: [],
    effectiveKeys: [],
    calendarSamples: [],
    trackingReasonSplit: {},
    entryFunnelSplit: {},
    horizons: {},
  };
}

function trackingReasonKey(value = "") {
  const raw = String(value || "").trim();
  return raw || "primary";
}

function addTrackingReasonSample(row = {}, outcome = {}, value, deadbandPct = 0.5) {
  const reason = trackingReasonKey(outcome.trackingReason);
  const split = row.trackingReasonSplit || {};
  const cell = split[reason] || {
    reason,
    n: 0,
    samples: 0,
    wins: 0,
    losses: 0,
    flats: 0,
    totalExcessPct: 0,
    avgExcessPct: null,
  };
  cell.n += 1;
  cell.samples = cell.n;
  cell.wins += outcome.outcome === "win" || value > deadbandPct ? 1 : 0;
  cell.losses += outcome.outcome === "loss" || value < -deadbandPct ? 1 : 0;
  cell.flats += Math.abs(value) <= deadbandPct ? 1 : 0;
  cell.totalExcessPct += value;
  cell.avgExcessPct = cell.totalExcessPct / cell.n;
  split[reason] = cell;
  row.trackingReasonSplit = split;
}

function addEntryFunnelSample(row = {}, outcome = {}, value, deadbandPct = 0.5) {
  if (!Object.prototype.hasOwnProperty.call(outcome, "entryFunnel")) return;
  const funnel = String(outcome.entryFunnel || "").trim() || "attention-or-mixed";
  const split = row.entryFunnelSplit || {};
  const cell = split[funnel] || {
    funnel,
    n: 0,
    samples: 0,
    wins: 0,
    losses: 0,
    flats: 0,
    totalExcessPct: 0,
    avgExcessPct: null,
  };
  cell.n += 1;
  cell.samples = cell.n;
  cell.wins += outcome.outcome === "win" || value > deadbandPct ? 1 : 0;
  cell.losses += outcome.outcome === "loss" || value < -deadbandPct ? 1 : 0;
  cell.flats += Math.abs(value) <= deadbandPct ? 1 : 0;
  cell.totalExcessPct += value;
  cell.avgExcessPct = cell.totalExcessPct / cell.n;
  split[funnel] = cell;
  row.entryFunnelSplit = split;
}

function ymd(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[^\d]/g, "");
  if (/^\d{8}$/.test(compact)) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : raw.slice(0, 10);
}

function calendarNonOverlapEffectiveN(samples = [], horizonDays = 1) {
  const horizon = Math.max(1, Math.ceil(Number(horizonDays) || 1));
  const byTicker = new Map();
  for (const sample of samples || []) {
    const date = ymd(sample.date);
    const ticker = safeTicker(sample.ticker || "");
    if (!date) continue;
    const key = ticker || "__all__";
    if (!byTicker.has(key)) byTicker.set(key, []);
    byTicker.get(key).push(date);
  }
  let count = 0;
  for (const dates of byTicker.values()) {
    const sorted = [...new Set(dates)].sort();
    let lastMs = null;
    for (const date of sorted) {
      const ms = new Date(`${date}T00:00:00Z`).getTime();
      if (!Number.isFinite(ms)) continue;
      if (lastMs === null || (ms - lastMs) / (24 * 60 * 60 * 1000) >= horizon) {
        count += 1;
        lastMs = ms;
      }
    }
  }
  return count || 0;
}

function addMetricSample(row, score, value, outcome = {}, deadbandPct = 0.5) {
  const s = numberOrNull(score);
  const v = numberOrNull(value);
  if (!Number.isFinite(s) || !Number.isFinite(v)) return;
  row.n += 1;
  row.samples = row.n;
  row.wins += outcome.outcome === "win" || v > deadbandPct ? 1 : 0;
  row.losses += outcome.outcome === "loss" || v < -deadbandPct ? 1 : 0;
  row.avgExcessPct = ((row.avgExcessPct * (row.n - 1)) + v) / row.n;
  row.avgScore = ((row.avgScore * (row.n - 1)) + s) / row.n;
  row.hitRate = row.n ? row.wins / row.n : null;
  row.scores.push(s);
  row.returns.push(v);
  const effectiveKey =
    outcome.decisionId ||
    outcome.id ||
    `${outcome.ticker || ""}:${outcome.decisionAt || outcome.generatedAt || outcome.asOf || ""}:${outcome.action || ""}`;
  row.effectiveKeys.push(effectiveKey || `${row.id}:${row.n}`);
  row.calendarSamples.push({
    ticker: outcome.ticker || "",
    date: outcome.decisionAt || outcome.generatedAt || outcome.asOf || outcome.date || "",
  });
  addTrackingReasonSample(row, outcome, v, deadbandPct);
  addEntryFunnelSample(row, outcome, v, deadbandPct);
  const horizon = Number(outcome.horizonDays || outcome.horizon || 0);
  if (Number.isFinite(horizon) && horizon > 0) {
    const key = String(horizon);
    const h = row.horizons[key] || metricAccumulator(key, `${horizon}d`);
    h.horizonDays = horizon;
    row.horizons[key] = h;
    addMetricSample(h, s, v, { ...outcome, calendarHorizonDays: horizon, horizonDays: null }, deadbandPct);
  }
}

function finalizeMetricRow(row, source = "") {
  row.rankIC = rankCorrelation(row.scores, row.returns);
  row.ic = row.rankIC;
  const uniqueDecisionEffectiveN = new Set((row.effectiveKeys || []).filter(Boolean)).size || row.n;
  const calendarEffectiveN = calendarNonOverlapEffectiveN(row.calendarSamples || [], row.horizonDays || 1) || uniqueDecisionEffectiveN;
  row.effectiveNUniqueDecision = Math.min(uniqueDecisionEffectiveN, row.n);
  row.effectiveNUniqueDecisionMethod = "unique-decision-non-overlap";
  row.effectiveNCalendarNonOverlap = Math.min(calendarEffectiveN, row.n);
  row.effectiveNCalendarNonOverlapMethod = `calendar-non-overlap-${Math.max(1, Math.ceil(Number(row.horizonDays || 1)))}d`;
  row.effectiveNVariants = {
    uniqueDecision: {
      value: row.effectiveNUniqueDecision,
      method: row.effectiveNUniqueDecisionMethod,
      n: row.n,
    },
    calendarNonOverlap: {
      value: row.effectiveNCalendarNonOverlap,
      method: row.effectiveNCalendarNonOverlapMethod,
      n: row.n,
    },
  };
  row.effectiveN = row.effectiveNCalendarNonOverlap;
  row.effectiveNMethod = row.effectiveNCalendarNonOverlapMethod;
  row.tStat = Number.isFinite(row.rankIC) && row.effectiveN > 2 ? row.rankIC * Math.sqrt(row.effectiveN) : null;
  row.tStatMethod = "rankIC*sqrt(effectiveN)";
  row.source = source || row.source || "";
  for (const horizon of Object.values(row.horizons || {})) {
    horizon.rankIC = rankCorrelation(horizon.scores, horizon.returns);
    horizon.ic = horizon.rankIC;
    horizon.hitRate = horizon.n ? horizon.wins / horizon.n : null;
    const horizonUniqueEffectiveN = new Set((horizon.effectiveKeys || []).filter(Boolean)).size || horizon.n;
    const horizonCalendarEffectiveN = calendarNonOverlapEffectiveN(horizon.calendarSamples || [], horizon.horizonDays || Number(horizon.id) || 1) || horizonUniqueEffectiveN;
    horizon.effectiveNUniqueDecision = Math.min(horizonUniqueEffectiveN, horizon.n);
    horizon.effectiveNUniqueDecisionMethod = "unique-decision-non-overlap";
    horizon.effectiveNCalendarNonOverlap = Math.min(horizonCalendarEffectiveN, horizon.n);
    horizon.effectiveNCalendarNonOverlapMethod = `calendar-non-overlap-${Math.max(1, Math.ceil(Number(horizon.horizonDays || horizon.id || 1)))}d`;
    horizon.effectiveNVariants = {
      uniqueDecision: {
        value: horizon.effectiveNUniqueDecision,
        method: horizon.effectiveNUniqueDecisionMethod,
        n: horizon.n,
      },
      calendarNonOverlap: {
        value: horizon.effectiveNCalendarNonOverlap,
        method: horizon.effectiveNCalendarNonOverlapMethod,
        n: horizon.n,
      },
    };
    horizon.effectiveN = horizon.effectiveNCalendarNonOverlap;
    horizon.effectiveNMethod = horizon.effectiveNCalendarNonOverlapMethod;
    horizon.tStat = Number.isFinite(horizon.rankIC) && horizon.effectiveN > 2 ? horizon.rankIC * Math.sqrt(horizon.effectiveN) : null;
    horizon.tStatMethod = "rankIC*sqrt(effectiveN)";
    horizon.source = source || row.source || "";
    delete horizon.scores;
    delete horizon.returns;
    delete horizon.effectiveKeys;
    delete horizon.calendarSamples;
  }
  delete row.scores;
  delete row.returns;
  delete row.effectiveKeys;
  delete row.calendarSamples;
  return row;
}

export function buildFactorStatsFromOutcomes(outcomes = [], options = {}) {
  const source = options.source || "";
  const deadbandPct = Math.max(0, Number(options.deadbandPct ?? 0.5) || 0);
  const returnField = options.returnField || "excessPct";
  const stats = {};
  for (const outcome of outcomes || []) {
    if (!outcomeUsable(outcome)) continue;
    const value = numberOrNull(outcome[returnField] ?? outcome.excessPct ?? outcome.performancePct);
    if (!Number.isFinite(value)) continue;
    for (const [id, factor] of Object.entries(outcome.factorSnapshot?.factors || {})) {
      const row = stats[id] || {
        ...metricAccumulator(id, factor.label || id),
        schemaMix: {},
        subSignals: {},
      };
      addMetricSample(row, factor.score, value, outcome, deadbandPct);
      const scoreSchema = outcome.scoreSchema || outcome.factorSnapshot?.scoreSchema || outcome.factorSnapshot?.schemaVersion || "unknown";
      row.schemaMix[scoreSchema] = (row.schemaMix[scoreSchema] || 0) + 1;
      for (const sub of factor.subSignals || []) {
        const subId = sub.id || "";
        if (!subId) continue;
        const subRow = row.subSignals[subId] || metricAccumulator(subId, sub.label || subId);
        addMetricSample(subRow, sub.score, value, outcome, deadbandPct);
        row.subSignals[subId] = subRow;
      }
      stats[id] = row;
    }
  }
  for (const row of Object.values(stats)) {
    finalizeMetricRow(row, source);
    for (const [id, subRow] of Object.entries(row.subSignals || {})) {
      row.subSignals[id] = finalizeMetricRow(subRow, source);
    }
  }
  return stats;
}

export function selectStarvationBackfillEvaluations(evaluations = [], options = {}) {
  const minNeeded = Math.max(0, Number(options.minNeeded || 0));
  if (!minNeeded) return [];
  const minDataQuality = Math.max(0, Math.min(100, Number(options.minDataQuality ?? 42)));
  const existingTickers = new Set((options.existingTickers || []).map(safeTicker).filter(Boolean));
  const cooldownGateIds = new Set(options.cooldownGateIds || ["ticker_cooldown", "failed_thesis_cooldown"]);
  const gateBlocked = (item = {}) => [
    ...(Array.isArray(item.gates) ? item.gates : []),
    ...(Array.isArray(item.actionability?.gates) ? item.actionability.gates : []),
  ].some((gate) => cooldownGateIds.has(gate?.id));
  return (evaluations || [])
    .filter((item) => {
      const ticker = safeTicker(item?.ticker);
      if (!ticker || existingTickers.has(ticker)) return false;
      if (gateBlocked(item)) return false;
      if (!Number.isFinite(numberOrNull(item.actionScore))) return false;
      return (numberOrNull(item.dataQualityScore) ?? 0) >= minDataQuality;
    })
    .sort((a, b) =>
      (numberOrNull(b.actionScore) ?? -Infinity) - (numberOrNull(a.actionScore) ?? -Infinity) ||
      (numberOrNull(b.alphaScore) ?? -Infinity) - (numberOrNull(a.alphaScore) ?? -Infinity) ||
      (numberOrNull(b.dataQualityScore) ?? -Infinity) - (numberOrNull(a.dataQualityScore) ?? -Infinity) ||
      (numberOrNull(b.buyScore) ?? -Infinity) - (numberOrNull(a.buyScore) ?? -Infinity) ||
      (numberOrNull(b.confidence) ?? -Infinity) - (numberOrNull(a.confidence) ?? -Infinity),
    )
    .slice(0, minNeeded);
}

export function buildFactorCorrelationMatrix(snapshots = [], options = {}) {
  const minN = Math.max(3, Number(options.minN || 3));
  const factorIds = [...new Set((snapshots || []).flatMap((snapshot) => Object.keys(snapshot?.factors || {})))];
  const labels = Object.fromEntries(
    factorIds.map((id) => [id, (snapshots || []).find((snapshot) => snapshot?.factors?.[id]?.label)?.factors?.[id]?.label || id]),
  );
  const valuesByFactor = Object.fromEntries(
    factorIds.map((id) => [id, (snapshots || []).map((snapshot) => numberOrNull(snapshot?.factors?.[id]?.score))]),
  );
  const rows = factorIds.map((left) => ({
    factorId: left,
    label: labels[left],
    n: valuesByFactor[left].filter(Number.isFinite).length,
    correlations: Object.fromEntries(
      factorIds.map((right) => {
        const leftValues = valuesByFactor[left] || [];
        const rightValues = valuesByFactor[right] || [];
        const n = leftValues.filter((value, index) => Number.isFinite(value) && Number.isFinite(rightValues[index])).length;
        return [right, { rho: left === right ? 1 : rankCorrelation(leftValues, rightValues), n }];
      }),
    ),
  }));
  const highCorrelationPairs = [];
  for (let i = 0; i < factorIds.length; i += 1) {
    for (let j = i + 1; j < factorIds.length; j += 1) {
      const left = factorIds[i];
      const right = factorIds[j];
      const cell = rows[i]?.correlations?.[right] || {};
      if (Number(cell.n || 0) >= minN && Number.isFinite(cell.rho) && Math.abs(cell.rho) > 0.6) {
        highCorrelationPairs.push({ left, right, rho: cell.rho, n: cell.n });
      }
    }
  }
  return {
    schemaVersion: "factor-correlation-matrix-v1",
    n: snapshots.length,
    rows,
    highCorrelationPairs: highCorrelationPairs.sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho)),
  };
}

export function newsRecencyDecayWeight(publishedAt = "", now = new Date(), halfLifeHours = 36) {
  const ms = new Date(publishedAt || 0).getTime();
  const nowMs = new Date(now || Date.now()).getTime();
  if (!Number.isFinite(ms) || ms <= 0 || !Number.isFinite(nowMs)) return 0.5;
  const ageHours = Math.max(0, (nowMs - ms) / (60 * 60 * 1000));
  return Math.max(0, Math.min(1, 2 ** (-ageHours / Math.max(1, Number(halfLifeHours) || 36))));
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
  if (/consumer discretionary|automobiles|retail|auto|ecommerce|消费|零售|汽车|电商/i.test(value)) return "XLY";
  if (/consumer staples|consumer staple|food|beverage|tobacco|household|personal products|日用品|食品|饮料/i.test(value)) return "XLP";
  if (/communication|media|telecom|通信|传媒|广告/i.test(value)) return "XLC";
  if (/industrial|industrials|transportation|aerospace|defense|manufacturing|工业|航天|国防|制造/i.test(value)) return "XLI";
  if (/materials|chemical|metals|mining|paper|包装|材料|化工|金属|矿业/i.test(value)) return "XLB";
  if (/real estate|reit|房地产|不动产/i.test(value)) return "XLRE";
  if (/utility|utilities|电力|公用事业/i.test(value)) return "XLU";
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
    score: clampScore(50 + 12 * zScore),
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

function crossSectionalRanks(values = []) {
  const sorted = values
    .map((value, index) => ({ value: numberOrNull(value), index }))
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length).fill(null);
  for (let index = 0; index < sorted.length; index += 1) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1].value === sorted[index].value) end += 1;
    const rank = (index + end) / 2;
    for (let cursor = index; cursor <= end; cursor += 1) ranks[sorted[cursor].index] = rank;
    index = end;
  }
  return { ranks, validCount: sorted.length };
}

function subSignalHeuristicScore(sub = null) {
  if (!sub || typeof sub !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(sub, "heuristicScore")) return numberOrNull(sub.heuristicScore);
  return numberOrNull(sub.score);
}

export function applyCrossSectionalNormalization(snapshots = [], options = {}) {
  const minCrossSection = Math.max(2, Number(options.minCrossSection || 30));
  const lowerPct = Number.isFinite(Number(options.lowerPct)) ? Number(options.lowerPct) : 1;
  const upperPct = Number.isFinite(Number(options.upperPct)) ? Number(options.upperPct) : 99;
  const subSignalCompositeMode = options.subSignalCompositeMode || (options.icWeightedSubSignalComposites ? "ic-weighted" : "equal-weight");
  const subSignalCompositePlan = options.subSignalCompositePlan || buildSubSignalCompositePlan(options.subSignalStats || {}, {
    minSamples: options.subSignalMinSamples || 50,
  });
  const rows = (snapshots || []).map((snapshot) => ({
    ...snapshot,
    schemaVersion: "factor-snapshot-v2",
    scoreSchema: "factor-snapshot-v2",
    factors: Object.fromEntries(
      Object.entries(snapshot?.factors || {}).map(([id, factor]) => [
        id,
        {
          ...factor,
          subSignals: Array.isArray(factor?.subSignals) ? factor.subSignals.map((sub) => ({ ...sub })) : factor?.subSignals,
        },
      ]),
    ),
  }));
  const factorIds = [...new Set(rows.flatMap((snapshot) => Object.keys(snapshot.factors || {})))];
  const diagnostics = {};
  for (const factorId of factorIds) {
    const subSignalIds = [
      ...new Set(
        rows.flatMap((snapshot) => (snapshot.factors?.[factorId]?.subSignals || []).map((sub) => sub?.id).filter(Boolean)),
      ),
    ];
    if (subSignalIds.length) {
      const subDiagnostics = {};
      for (const subSignalId of subSignalIds) {
        const rawValues = rows.map((snapshot) => {
          const sub = (snapshot.factors?.[factorId]?.subSignals || []).find((item) => item?.id === subSignalId);
          return subSignalHeuristicScore(sub);
        });
        const validCount = rawValues.filter(Number.isFinite).length;
        if (validCount < minCrossSection) {
          rows.forEach((snapshot, index) => {
            const factor = snapshot.factors?.[factorId];
            const subIndex = (factor?.subSignals || []).findIndex((item) => item?.id === subSignalId);
            if (!factor || subIndex < 0) return;
            const sub = factor.subSignals[subIndex];
            const heuristicScore = subSignalHeuristicScore(sub);
            const normalization = normalizeFactorValue(factorId, heuristicScore, snapshot.peerGroup || {});
            factor.subSignals[subIndex] = {
              ...sub,
              heuristicScore: Number.isFinite(heuristicScore) ? heuristicScore : null,
              score: Number.isFinite(heuristicScore) ? normalization.score : 50,
              normalization: Number.isFinite(heuristicScore)
                ? { ...normalization, subSignalId, method: normalization.method }
                : { method: "missing", factorId, subSignalId, n: validCount, score: 50 },
            };
          });
          subDiagnostics[subSignalId] = { method: "fallback-static-baseline", n: validCount };
          continue;
        }
        const clipped = winsorizeSeries(rawValues, { enabled: true, lowerPct, upperPct });
        const { ranks } = crossSectionalRanks(clipped.values);
        const denominator = Math.max(1, validCount - 1);
        rows.forEach((snapshot, index) => {
          const factor = snapshot.factors?.[factorId];
          const subIndex = (factor?.subSignals || []).findIndex((item) => item?.id === subSignalId);
          if (!factor || subIndex < 0) return;
          const sub = factor.subSignals[subIndex];
          const heuristicScore = subSignalHeuristicScore(sub);
          const rank = ranks[index];
          if (!Number.isFinite(rank)) {
            factor.subSignals[subIndex] = {
              ...sub,
              heuristicScore: Number.isFinite(heuristicScore) ? heuristicScore : null,
              score: 50,
              normalization: { method: "missing", factorId, subSignalId, n: validCount, score: 50 },
            };
            return;
          }
          const score = clampScore((rank / denominator) * 100);
          factor.subSignals[subIndex] = {
            ...sub,
            heuristicScore,
            preWinsorScore: numberOrNull(rawValues[index]),
            score,
            normalization: {
              method: "cross-sectional-rank",
              factorId,
              subSignalId,
              n: validCount,
              rank,
              score,
              winsorization: {
                enabled: true,
                lower: clipped.lower,
                upper: clipped.upper,
                clipped: clipped.values[index] !== numberOrNull(rawValues[index]),
                clipCount: clipped.clipCount,
              },
            },
          };
        });
        subDiagnostics[subSignalId] = { method: "cross-sectional-rank", n: validCount, clipCount: clipped.clipCount };
      }
      rows.forEach((snapshot) => {
        const factor = snapshot.factors?.[factorId];
        if (!factor) return;
        const usableSubSignals = (factor.subSignals || []).filter((sub) => Number.isFinite(numberOrNull(sub.heuristicScore)));
        const plan = subSignalCompositeMode === "ic-weighted" ? subSignalCompositePlan?.factors?.[factorId] : null;
        const weightedRows = usableSubSignals
          .map((sub) => ({
            sub,
            score: numberOrNull(sub.score),
            weight: numberOrNull(plan?.subSignals?.[sub.id]?.weight),
          }))
          .filter((row) => Number.isFinite(row.score) && Number.isFinite(row.weight) && row.weight > 0);
        const weightTotal = weightedRows.reduce((sum, row) => sum + row.weight, 0);
        const weightedComposite = weightTotal > 0
          ? weightedRows.reduce((sum, row) => sum + row.score * (row.weight / weightTotal), 0)
          : null;
        const composite = Number.isFinite(weightedComposite)
          ? weightedComposite
          : finiteMean(usableSubSignals.map((sub) => numberOrNull(sub.score)));
        snapshot.factors[factorId] = {
          ...factor,
          score: Number.isFinite(composite) ? composite : 50,
          quality: usableSubSignals.length ? factor.quality : 0,
          normalization: {
            method: Number.isFinite(weightedComposite) ? "ic-weighted-subsignal-composite" : "subsignal-composite",
            factorId,
            n: usableSubSignals.length,
            score: Number.isFinite(composite) ? composite : 50,
            subSignalCount: factor.subSignals?.length || 0,
            weights: Number.isFinite(weightedComposite)
              ? Object.fromEntries(weightedRows.map((row) => [row.sub.id, row.weight / weightTotal]))
              : null,
            strategyVersionControlled: Number.isFinite(weightedComposite),
          },
        };
      });
      diagnostics[factorId] = { method: "subsignal-composite", subSignals: subDiagnostics };
      continue;
    }
    const rawValues = rows.map((snapshot) => numberOrNull(snapshot.factors?.[factorId]?.heuristicScore ?? snapshot.factors?.[factorId]?.score));
    const validCount = rawValues.filter(Number.isFinite).length;
    if (validCount < minCrossSection) {
      rows.forEach((snapshot, index) => {
        const factor = snapshot.factors?.[factorId];
        if (!factor) return;
        const rawHeuristicScore = numberOrNull(factor.heuristicScore ?? rawValues[index]);
        const preserveMissingShadow = factor.lifecycleState === "shadow" && factor.weightEligible === false && !Number.isFinite(rawHeuristicScore);
        const heuristicScore = preserveMissingShadow ? null : rawHeuristicScore ?? 50;
        const normalization = normalizeFactorValue(factorId, heuristicScore, snapshot.peerGroup || {});
        snapshot.factors[factorId] = {
          ...factor,
          heuristicScore,
          score: preserveMissingShadow ? null : normalization.score,
          normalization: preserveMissingShadow ? { method: "missing", factorId, n: validCount, score: null } : normalization,
        };
      });
      diagnostics[factorId] = { method: "fallback-static-baseline", n: validCount };
      continue;
    }
    const clipped = winsorizeSeries(rawValues, { enabled: true, lowerPct, upperPct });
    const { ranks } = crossSectionalRanks(clipped.values);
    const denominator = Math.max(1, validCount - 1);
    rows.forEach((snapshot, index) => {
      const factor = snapshot.factors?.[factorId];
      if (!factor) return;
      const heuristicScore = numberOrNull(factor.heuristicScore ?? rawValues[index]);
      const rank = ranks[index];
      if (!Number.isFinite(rank)) {
        const preserveMissingShadow = factor.lifecycleState === "shadow" && factor.weightEligible === false;
        snapshot.factors[factorId] = {
          ...factor,
          heuristicScore: Number.isFinite(heuristicScore) ? heuristicScore : null,
          score: preserveMissingShadow ? null : 50,
          normalization: { method: "missing", factorId, n: validCount, score: preserveMissingShadow ? null : 50 },
        };
        return;
      }
      const score = clampScore((rank / denominator) * 100);
      snapshot.factors[factorId] = {
        ...factor,
        heuristicScore,
        preWinsorScore: numberOrNull(rawValues[index]),
        score,
        normalization: {
          method: "cross-sectional-rank",
          factorId,
          n: validCount,
          rank,
          score,
          winsorization: {
            enabled: true,
            lower: clipped.lower,
            upper: clipped.upper,
            clipped: clipped.values[index] !== numberOrNull(rawValues[index]),
            clipCount: clipped.clipCount,
          },
        },
      };
    });
    diagnostics[factorId] = { method: "cross-sectional-rank", n: validCount, clipCount: clipped.clipCount };
  }
  return {
    schemaVersion: "cross-sectional-normalization-v1",
    snapshots: rows,
    diagnostics,
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
  if (value >= 70) return 0.96;
  if (value >= 55) return 0.89;
  return 0.775;
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
    const quality = Math.max(0, Math.min(100, numberOrNull(factors[id]?.quality) ?? 0));
    const effectiveScore = 50 + (score - 50) * (quality / 100);
    return sum + effectiveScore * weight;
  }, 0);
  const alphaScore = clampScore(weightedScore);
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
    : clampScore(alphaScore * qualityMultiplier * regimeMultiplier + portfolioFitScore - riskPenalty);
  const contributions = Object.entries(weights).map(([id, weight]) => {
    const factor = factors[id] || {};
    const score = numberOrNull(factor.score) ?? 50;
    const quality = numberOrNull(factor.quality) ?? 0;
    const effectiveScore = 50 + (score - 50) * (Math.max(0, Math.min(100, quality)) / 100);
    return {
      id,
      label: factor.label || id,
      score,
      effectiveScore,
      weight,
      contribution: (effectiveScore - 50) * weight,
      quality,
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
    schemaVersion: "recommendation-score-v2",
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
  const industry = text(industryText || profile.industry || profile.industry_group || profile.industryGroup || profile.sector || "");
  const business = text(profile.mainBusiness || profile.summary || "");
  const marketCap = normalizeMarketCapUsd(profile.marketCapitalization ?? profile.marketCap ?? profile.market_cap ?? profile.totalMarketCap);
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
  const decisionAtMs = Date.parse(outcome.decisionAt || outcome.entryPriceAt || "");
  const dueAtMs = Date.parse(outcome.expectedDueAt || outcome.dueAt || "");
  const exitAtMs = Date.parse(outcome.exitPriceAt || outcome.exitAt || outcome.evaluatedAt || "");
  const reasons = [];
  let status = "ok";

  const mark = (nextStatus, reason) => {
    if (status === "ok" || nextStatus === "suspect_timing") status = nextStatus;
    reasons.push(reason);
  };

  if (!Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(exitPrice) || exitPrice <= 0) {
    mark("suspect_price", "entry_or_exit_price_missing");
  }
  if (Number.isFinite(entryPrice) && entryPrice < 0.5) {
    mark("suspect_price", "sub_50c_entry_price");
  }
  const shortHorizon = !Number.isFinite(horizonDays) || horizonDays <= 10;
  if (shortHorizon && Number.isFinite(tickerReturnPct) && Math.abs(tickerReturnPct) > suspectReturnPct) {
    mark("suspect_price", "short_horizon_ticker_return_outlier");
  }
  if (shortHorizon && Number.isFinite(entryPrice) && entryPrice > 0 && Number.isFinite(exitPrice) && exitPrice > 0) {
    const ratio = exitPrice / entryPrice;
    if (ratio > 3 || ratio < 1 / 3) {
      mark("suspect_price", "short_horizon_price_ratio_outlier");
    }
  }
  if (Number.isFinite(decisionAtMs) && Number.isFinite(exitAtMs) && exitAtMs <= decisionAtMs) {
    mark("suspect_timing", "exit_not_after_decision");
  }
  if (Number.isFinite(dueAtMs) && Number.isFinite(exitAtMs) && exitAtMs < dueAtMs) {
    mark("suspect_timing", "exit_before_required_session_close");
  }
  const components = Array.isArray(outcome.benchmarkComponents) ? outcome.benchmarkComponents : [];
  if (
    components.length &&
    components.some((item) => {
      const entryAt = Date.parse(item?.entryAt || "");
      const exitAt = Date.parse(item?.exitAt || "");
      return Number.isFinite(entryAt) && Number.isFinite(exitAt) && exitAt <= entryAt;
    })
  ) {
    mark("suspect_timing", "benchmark_entry_exit_not_sequential");
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
  if (existing && existing !== "ok") return false;
  const currentPolicy = classifyOutcomeQuality(outcome, options);
  if (!currentPolicy.usable) return false;
  return existing === "ok" || currentPolicy.usable;
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
