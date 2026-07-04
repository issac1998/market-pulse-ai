import crypto from "node:crypto";

import { buildSubSignalCompositePlan, normalizeRecommendationFactorWeights } from "../lib/recommender_core.mjs";

function cloneValue(value) {
  if (!value || typeof value !== "object") return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function maxDrawdownMagnitude(value) {
  const n = numberOrNull(value);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

function metricValue(metric) {
  if (metric && typeof metric === "object") return numberOrNull(metric.value ?? metric.avgExcessPct ?? metric.maxDrawdownPct);
  return numberOrNull(metric);
}

function metricSampleCount(metric) {
  if (metric && typeof metric === "object") return Number(metric.n ?? metric.samples ?? metric.sampleCount ?? 0) || 0;
  return 0;
}

function statusRank(status = "") {
  if (status === "active") return 0;
  if (status === "candidate") return 1;
  if (status === "retired") return 2;
  return 3;
}

export function normalizeStrategyVersions(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row === "object" && row.id)
    .map((row) => {
      const weights = row.weights || row.json?.weights || row.json?.factorWeights || row.json?.settings?.factorWeights || null;
      return {
        ...row,
        schemaVersion: row.schemaVersion || "strategy-version-v2",
        id: String(row.id),
        strategyType: row.strategyType || "all-stock-agent",
        configHash: row.configHash || hashObject({ id: row.id, weights, json: row.json || null }).slice(0, 64),
        createdAt: row.createdAt || row.activeFrom || row.generatedAt || "",
        activeFrom: row.activeFrom || row.createdAt || row.generatedAt || "",
        activeTo: row.activeTo || "",
        changeReason: row.changeReason || "",
        evaluationSummary: row.evaluationSummary || null,
        sourceFile: row.sourceFile || "",
        source: row.source || row.sourceFile || "",
        sourceRunId: row.sourceRunId || row.runId || "",
        status: row.status || "active",
        active: row.active !== undefined ? Boolean(row.active) : (row.status || "active") === "active",
        weights: weights ? normalizeRecommendationFactorWeights(weights) : null,
        validationRecords: Array.isArray(row.validationRecords) ? row.validationRecords.slice(0, 50) : [],
        json: row.json && typeof row.json === "object" ? row.json : null,
      };
    })
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || String(b.createdAt || b.activeFrom).localeCompare(String(a.createdAt || a.activeFrom)))
    .slice(0, 200);
}

export function activeStrategyVersion(rows = []) {
  return normalizeStrategyVersions(rows).find((row) => row.status === "active" || row.active) || null;
}

export function activeStrategyWeights(rows = [], fallbackWeights = {}) {
  const active = activeStrategyVersion(rows);
  return normalizeRecommendationFactorWeights(
    active?.weights || active?.json?.weights || active?.json?.factorWeights || active?.json?.settings?.factorWeights || fallbackWeights,
    fallbackWeights,
  );
}

export function upsertStrategyVersion(rows = [], version = null) {
  if (!version?.id) return normalizeStrategyVersions(rows);
  const normalized = normalizeStrategyVersions(rows);
  const next = normalizeStrategyVersions([version])[0];
  const existing = normalized.find((item) => item.id === next.id);
  if (!existing) return normalizeStrategyVersions([next, ...normalized]);
  return normalizeStrategyVersions(
    normalized.map((item) =>
      item.id === next.id
        ? {
            ...item,
            ...next,
            createdAt: item.createdAt || next.createdAt,
            activeFrom: item.activeFrom || next.activeFrom,
            validationRecords: item.validationRecords?.length ? item.validationRecords : next.validationRecords,
          }
        : item,
    ),
  );
}

export function candidateStrategyVersionFromLearning(learning = null, options = {}) {
  if (!learning || typeof learning !== "object" || !learning.learnedWeights) return null;
  const weights = normalizeRecommendationFactorWeights(learning.learnedWeights, options.fallbackWeights || {});
  const previousWeights = normalizeRecommendationFactorWeights(learning.previousWeights || options.previousWeights || options.fallbackWeights || {});
  const source = String(options.source || learning.source || "factor-weight-learning");
  const sourceRunId = String(options.sourceRunId || options.runId || "");
  const baseVersion = options.baseVersion && typeof options.baseVersion === "object" ? options.baseVersion : null;
  const configHash = hashObject({
    strategyType: options.strategyType || "all-stock-agent",
    weights,
    baseVersionId: baseVersion?.id || options.baseVersionId || "",
    learningSource: source,
  });
  return {
    schemaVersion: "strategy-version-v2",
    id: `candidate-${configHash.slice(0, 12)}`,
    strategyType: options.strategyType || "all-stock-agent",
    configHash,
    createdAt: options.createdAt || nowIso(),
    activeFrom: "",
    activeTo: "",
    status: "candidate",
    active: false,
    source,
    sourceRunId,
    baseVersionId: baseVersion?.id || options.baseVersionId || "",
    baseConfigHash: baseVersion?.configHash || options.baseConfigHash || "",
    changeReason: options.changeReason || "mechanical-factor-weight-learning-candidate",
    evaluationSummary: options.evaluationSummary || null,
    weights,
    previousWeights,
    factorWeightLearning: {
      ...cloneValue(learning),
      note: "候选版本只保存机械学习结果；不会自动成为 active，必须通过 promote + validation。",
    },
    validationRecords: [],
    validationStatus: "pending_validation",
    llmWritable: false,
    json: {
      schemaVersion: "all-stock-agent-weight-overlay-v1",
      weights,
      baseVersionId: baseVersion?.id || options.baseVersionId || "",
      source,
    },
  };
}

export function candidateStrategyVersionFromSubSignalComposites(factorStats = {}, options = {}) {
  const plan = options.plan || buildSubSignalCompositePlan(factorStats, {
    minSamples: options.minSamples || 50,
    generatedAt: options.createdAt,
  });
  if (!plan?.factorCount) return null;
  const baseVersion = options.baseVersion && typeof options.baseVersion === "object" ? options.baseVersion : null;
  const weights = normalizeRecommendationFactorWeights(
    baseVersion?.weights || options.previousWeights || options.fallbackWeights || {},
    options.fallbackWeights || {},
  );
  const source = String(options.source || "subsignal-ic-composite-learning");
  const configHash = hashObject({
    strategyType: options.strategyType || "all-stock-agent",
    baseVersionId: baseVersion?.id || options.baseVersionId || "",
    subSignalCompositePlan: plan,
    weights,
  });
  return {
    schemaVersion: "strategy-version-v2",
    id: `candidate-subsignal-${configHash.slice(0, 12)}`,
    strategyType: options.strategyType || "all-stock-agent",
    configHash,
    createdAt: options.createdAt || nowIso(),
    activeFrom: "",
    activeTo: "",
    status: "candidate",
    active: false,
    source,
    sourceRunId: String(options.sourceRunId || ""),
    baseVersionId: baseVersion?.id || options.baseVersionId || "",
    baseConfigHash: baseVersion?.configHash || options.baseConfigHash || "",
    changeReason: "mechanical-subsig-ic-composite-candidate",
    changelog: [
      {
        at: options.createdAt || nowIso(),
        type: "subsignal-composite",
        summary: `启用 IC 加权子信号 composite 候选，覆盖 ${plan.factorCount} 个因子；仍需人工 validate/promote 后才会进入 active scoring。`,
        sampleRule: `effectiveN >= ${plan.minSamples}, weight ∝ max(0, rankIC)`,
      },
    ],
    evaluationSummary: {
      schemaVersion: "subsignal-composite-candidate-summary-v1",
      source,
      sourceRunId: String(options.sourceRunId || ""),
      factorCount: plan.factorCount,
      minSamples: plan.minSamples,
      mode: plan.mode,
    },
    weights,
    previousWeights: weights,
    subSignalCompositePlan: plan,
    validationRecords: [],
    validationStatus: "pending_validation",
    llmWritable: false,
    json: {
      schemaVersion: "all-stock-agent-weight-overlay-v1",
      weights,
      baseVersionId: baseVersion?.id || options.baseVersionId || "",
      source,
      settings: {
        subSignalCompositeMode: "ic-weighted",
        subSignalCompositePlan: plan,
      },
    },
  };
}

export function attachValidationRecord(rows = [], candidateId = "", record = {}) {
  const id = String(candidateId || record.candidateId || "").trim();
  return normalizeStrategyVersions(rows).map((row) => {
    if (row.id !== id) return row;
    const validationRecords = [
      {
        ...record,
        id: record.id || `validation-${hashObject({ id, record, at: nowIso() }).slice(0, 12)}`,
        candidateId: id,
        generatedAt: record.generatedAt || nowIso(),
      },
      ...(row.validationRecords || []),
    ].slice(0, 50);
    return {
      ...row,
      validationRecords,
      validationStatus: validationRecords[0]?.status || row.validationStatus || "",
    };
  });
}

export function buildPromotionValidationRecord(candidate = {}, active = {}, input = {}) {
  const candidateExcessPct = metricValue(input.candidateExcessPct ?? input.candidateAvgExcessPct ?? input.candidate?.excessVsSpy ?? input.candidate?.avgExcessPct);
  const activeExcessPct = metricValue(input.activeExcessPct ?? input.activeAvgExcessPct ?? input.active?.excessVsSpy ?? input.active?.avgExcessPct);
  const candidateMaxDrawdownPct = metricValue(input.candidateMaxDrawdownPct ?? input.candidateMaxDDPct ?? input.candidate?.maxDrawdown ?? input.candidate?.maxDrawdownPct);
  const activeMaxDrawdownPct = metricValue(input.activeMaxDrawdownPct ?? input.activeMaxDDPct ?? input.active?.maxDrawdown ?? input.active?.maxDrawdownPct);
  const n =
    Number(input.n ?? input.sampleCount ?? 0) ||
    metricSampleCount(input.candidate?.excessVsSpy) ||
    metricSampleCount(input.active?.excessVsSpy) ||
    0;
  const candidateBeatsExcess = Number.isFinite(candidateExcessPct) && Number.isFinite(activeExcessPct) && candidateExcessPct >= activeExcessPct;
  const candidateDrawdown = maxDrawdownMagnitude(candidateMaxDrawdownPct);
  const activeDrawdown = maxDrawdownMagnitude(activeMaxDrawdownPct);
  const candidateNoWorseDrawdown = Number.isFinite(candidateDrawdown) && Number.isFinite(activeDrawdown) && candidateDrawdown <= activeDrawdown;
  const status = n > 0 && candidateBeatsExcess && candidateNoWorseDrawdown ? "passed" : "failed";
  const missing = [
    Number.isFinite(candidateExcessPct) ? "" : "candidateExcessPct",
    Number.isFinite(activeExcessPct) ? "" : "activeExcessPct",
    Number.isFinite(candidateMaxDrawdownPct) ? "" : "candidateMaxDrawdownPct",
    Number.isFinite(activeMaxDrawdownPct) ? "" : "activeMaxDrawdownPct",
    n > 0 ? "" : "n",
  ].filter(Boolean);
  return {
    schemaVersion: "strategy-promotion-validation-v1",
    id: input.id || `validation-${hashObject({ candidateId: candidate?.id || "", activeId: active?.id || "", input }).slice(0, 12)}`,
    generatedAt: input.generatedAt || nowIso(),
    source: input.source || "walk-forward-validation",
    candidateId: candidate?.id || input.candidateId || "",
    activeId: active?.id || input.activeId || "",
    candidateExcessPct,
    activeExcessPct,
    candidateMaxDrawdownPct,
    activeMaxDrawdownPct,
    n,
    status: missing.length ? "missing" : status,
    passed: !missing.length && status === "passed",
    checks: {
      candidateBeatsExcess,
      candidateNoWorseDrawdown,
      missing,
    },
    rule: "candidateAvgExcessPct >= activeAvgExcessPct AND abs(candidateMaxDrawdownPct) <= abs(activeMaxDrawdownPct), with n > 0.",
  };
}

export function promoteStrategyVersion(rows = [], candidateId = "", options = {}) {
  const normalized = normalizeStrategyVersions(rows);
  const candidate = normalized.find((row) => row.id === candidateId && row.status === "candidate");
  if (!candidate) return { ok: false, error: "candidate_not_found", rows: normalized };
  const active = activeStrategyVersion(normalized);
  const latestValidation = options.validationRecord || candidate.validationRecords?.[0] || null;
  if (!latestValidation || latestValidation.status !== "passed" || latestValidation.passed !== true) {
    return { ok: false, error: "validation_required", rows: normalized, candidate, active };
  }
  const promotedAt = options.promotedAt || nowIso();
  const rowsAfter = normalized.map((row) => {
    if (row.id === candidate.id) {
      return {
        ...row,
        status: "active",
        active: true,
        activeFrom: promotedAt,
        activeTo: "",
        promotedAt,
        promotedBy: options.promotedBy || "human",
        promotionValidationId: latestValidation.id || "",
      };
    }
    if (row.status === "active" || row.active) {
      return {
        ...row,
        status: "retired",
        active: false,
        activeTo: row.activeTo || promotedAt,
        retiredByPromotionId: candidate.id,
      };
    }
    return row;
  });
  return { ok: true, rows: normalizeStrategyVersions(rowsAfter), candidate, previousActive: active, validationRecord: latestValidation };
}

export function rollbackStrategyVersions(currentRows = [], rollbackStack = []) {
  const stack = Array.isArray(rollbackStack) ? rollbackStack.slice() : [];
  const latest = stack[0] || null;
  if (!latest?.snapshot) {
    return { ok: false, error: "rollback_snapshot_missing", rows: normalizeStrategyVersions(currentRows), rollbackStack: stack };
  }
  return {
    ok: true,
    rows: normalizeStrategyVersions(latest.snapshot),
    rollbackStack: stack.slice(1),
    restoredSnapshotId: latest.id || "",
  };
}

function outcomeSource(row = {}, fallback = "live") {
  return row.decisionSource || row.source || fallback;
}

function outcomeRegime(row = {}) {
  return row.regime || row.regimeTag?.bucket || row.factorSnapshot?.regimeTag?.bucket || "unknown";
}

function groupOutcomeMetrics(outcomes = [], source = "live") {
  const byKey = new Map();
  for (const row of outcomes || []) {
    if (!row || row.outcome === "pending" || row.outcomeUsable === false || row.outcomeQualityStatus === "suspect_price") continue;
    const horizon = Number(row.horizonDays) || 0;
    const regime = outcomeRegime(row);
    const key = `${horizon}:${regime}`;
    const bucket = byKey.get(key) || {
      horizonDays: horizon,
      regime,
      source,
      n: 0,
      wins: 0,
      losses: 0,
      flats: 0,
      totalExcessPct: 0,
      totalMaePct: 0,
      totalMfePct: 0,
    };
    const excess = numberOrNull(row.excessPct ?? row.performancePct);
    if (!Number.isFinite(excess)) continue;
    bucket.n += 1;
    bucket.wins += row.outcome === "win" ? 1 : 0;
    bucket.losses += row.outcome === "loss" ? 1 : 0;
    bucket.flats += row.outcome === "flat" ? 1 : 0;
    bucket.totalExcessPct += excess;
    bucket.totalMaePct += numberOrNull(row.maePct) || 0;
    bucket.totalMfePct += numberOrNull(row.mfePct) || 0;
    byKey.set(key, bucket);
  }
  return [...byKey.values()]
    .sort((a, b) => a.horizonDays - b.horizonDays || String(a.regime).localeCompare(String(b.regime)))
    .map((row) => ({
      horizonDays: row.horizonDays,
      regime: row.regime,
      source: row.source,
      n: row.n,
      wins: row.wins,
      losses: row.losses,
      flats: row.flats,
      avgExcessPct: { value: row.totalExcessPct / row.n, n: row.n, source: row.source },
      hitRate: { value: row.wins / row.n, n: row.n, source: row.source },
      avgMaePct: { value: row.totalMaePct / row.n, n: row.n, source: row.source },
      avgMfePct: { value: row.totalMfePct / row.n, n: row.n, source: row.source },
    }));
}

export function buildRegimeSplitEvaluationPayload({ liveOutcomes = [], historicalRuns = [] } = {}) {
  const historicalOutcomes = (historicalRuns || []).flatMap((run) =>
    (run.outcomes || []).map((row) => ({ ...row, source: outcomeSource(row, "historical-backtest") })),
  );
  const liveRows = groupOutcomeMetrics(liveOutcomes, "live-outcomes");
  const historicalRows = groupOutcomeMetrics(historicalOutcomes, "historical-backtest");
  return {
    schemaVersion: "regime-split-evaluation-v1",
    generatedAt: nowIso(),
    panels: {
      live: {
        source: "live-outcomes",
        n: liveRows.reduce((sum, row) => sum + row.n, 0),
        rows: liveRows,
      },
      historical: {
        source: "historical-backtest",
        n: historicalRows.reduce((sum, row) => sum + row.n, 0),
        rows: historicalRows,
      },
    },
    note: "live 与 historical 分开展示，禁止混合样本计算同一个指标。",
  };
}

function summarizeFactorScores(items = [], source = "live") {
  const byFactor = new Map();
  for (const item of items || []) {
    const factors = item.factorSnapshot?.factors || {};
    for (const [factorId, factor] of Object.entries(factors)) {
      const score = numberOrNull(factor.score);
      if (!Number.isFinite(score)) continue;
      const row = byFactor.get(factorId) || { factorId, source, n: 0, total: 0, min: score, max: score };
      row.n += 1;
      row.total += score;
      row.min = Math.min(row.min, score);
      row.max = Math.max(row.max, score);
      byFactor.set(factorId, row);
    }
  }
  return Object.fromEntries(
    [...byFactor.values()].map((row) => [
      row.factorId,
      {
        mean: { value: row.total / row.n, n: row.n, source: row.source },
        min: { value: row.min, n: row.n, source: row.source },
        max: { value: row.max, n: row.n, source: row.source },
      },
    ]),
  );
}

function decisionRate(run = {}, source = "live") {
  const summary = run.summary || {};
  const evaluated = Number(summary.evaluated || run.evaluations?.length || 0);
  const buy = Number(summary.buy || run.buyCandidates?.length || 0);
  const actionable = Number(summary.actionableBuy ?? (run.buyCandidates || []).filter((item) => item.actionable !== false).length);
  const sell = Number(summary.sell || run.sellCandidates?.length || 0);
  return {
    source,
    n: evaluated,
    buyRate: { value: evaluated ? buy / evaluated : null, n: evaluated, source },
    actionableRate: { value: evaluated ? actionable / evaluated : null, n: evaluated, source },
    sellRate: { value: evaluated ? sell / evaluated : null, n: evaluated, source },
  };
}

function gateRates(items = [], source = "live") {
  const total = items.length;
  const counts = new Map();
  for (const item of items || []) {
    for (const gate of item.gates || item.actionability?.gates || []) {
      const id = String(gate.id || gate.condition || gate.label || "").trim();
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({
      id,
      count,
      rate: { value: total ? count / total : null, n: total, source },
      source,
    }));
}

export function buildLiveParityPayload({ liveRun = {}, historicalRuns = [] } = {}) {
  const liveItems = [
    ...(liveRun.evaluations || []),
    ...(liveRun.buyCandidates || []),
    ...(liveRun.watchBuyCandidates || []),
  ];
  const historicalItems = (historicalRuns || []).flatMap((run) => [...(run.decisions || []), ...(run.outcomes || [])]);
  const liveRate = decisionRate(liveRun, "live-outcomes");
  const historicalRateRows = (historicalRuns || []).map((run) => decisionRate(run, "historical-backtest")).filter((row) => row.n > 0);
  const avgHistoricalRate = historicalRateRows.length
    ? {
        source: "historical-backtest",
        n: historicalRateRows.reduce((sum, row) => sum + row.n, 0),
        buyRate: {
          value: historicalRateRows.reduce((sum, row) => sum + (row.buyRate.value || 0) * row.n, 0) / historicalRateRows.reduce((sum, row) => sum + row.n, 0),
          n: historicalRateRows.reduce((sum, row) => sum + row.n, 0),
          source: "historical-backtest",
        },
        actionableRate: {
          value: null,
          n: historicalRateRows.reduce((sum, row) => sum + row.n, 0),
          source: "historical-backtest",
          status: "not-recorded-in-historical-backtest",
        },
        sellRate: {
          value: historicalRateRows.reduce((sum, row) => sum + (row.sellRate.value || 0) * row.n, 0) / historicalRateRows.reduce((sum, row) => sum + row.n, 0),
          n: historicalRateRows.reduce((sum, row) => sum + row.n, 0),
          source: "historical-backtest",
        },
      }
    : { source: "historical-backtest", n: 0, buyRate: { value: null, n: 0, source: "historical-backtest" }, actionableRate: { value: null, n: 0, source: "historical-backtest" }, sellRate: { value: null, n: 0, source: "historical-backtest" } };
  const warnings = [];
  if (liveRate.n && avgHistoricalRate.n && Number.isFinite(liveRate.buyRate.value) && Number.isFinite(avgHistoricalRate.buyRate.value)) {
    const diff = liveRate.buyRate.value - avgHistoricalRate.buyRate.value;
    if (Math.abs(diff) > 0.08) warnings.push({ id: "decision_rate_divergence", message: "live 买入率与 historical 期望差异超过 8 个百分点。", value: diff, n: liveRate.n + avgHistoricalRate.n });
  }
  const liveGateRates = gateRates(liveItems, "live-outcomes");
  const historicalGateRates = gateRates(historicalItems, "historical-backtest");
  return {
    schemaVersion: "live-parity-dashboard-v1",
    generatedAt: nowIso(),
    panels: {
      live: {
        source: "live-outcomes",
        n: liveItems.length,
        factorDistributions: summarizeFactorScores(liveItems, "live-outcomes"),
        decisionRates: liveRate,
        gateFireRates: liveGateRates,
      },
      historical: {
        source: "historical-backtest",
        n: historicalItems.length,
        factorDistributions: summarizeFactorScores(historicalItems, "historical-backtest"),
        decisionRates: avgHistoricalRate,
        gateFireRates: historicalGateRates,
      },
    },
    warnings,
    warningBanner: warnings.length ? warnings.map((item) => item.message).join(" ") : "",
  };
}
