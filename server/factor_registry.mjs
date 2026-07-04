import {
  evaluateFactorSpec,
  factorSpecOpSequence,
  parseFactorSpec,
} from "../lib/factor_spec.mjs";
import { numberOrNull } from "../lib/market_core.mjs";

const REGISTRY_SCHEMA = "factor-registry-v1";
const STATES = new Set(["candidate", "shadow", "active", "decayed", "retired", "rejected"]);

function nowIso() {
  return new Date().toISOString();
}

function text(value = "") {
  return String(value || "").trim();
}

function compactId(prefix = "factor") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function seedFactor(factorId, family, spec, extra = {}) {
  return {
    factorId,
    family,
    spec,
    hypothesis: extra.hypothesis || spec.hypothesis || "",
    expectedSign: spec.expectedSign || 1,
    horizons: spec.horizons || [20],
    prior: extra.prior || "literature",
    state: extra.state || "candidate",
    createdBy: extra.createdBy || "system:wp13-seed",
    createdAt: extra.createdAt || "2026-07-05T00:00:00.000Z",
    implementation: extra.implementation || "dsl",
    stateHistory: [
      {
        at: extra.createdAt || "2026-07-05T00:00:00.000Z",
        from: "",
        to: extra.state || "candidate",
        reason: "WP13 default seed",
        actor: "system",
      },
    ],
    evidence: extra.evidence || { status: "pending-evaluation", n: 0 },
  };
}

export function defaultFactorRegistrySeeds() {
  const specs = [
    seedFactor("revisionMomentum", "earningsRevision", parseFactorSpec({
      factorId: "revisionMomentum",
      family: "earningsRevision",
      hypothesis: "分析师评级或盈利预期上修后的股票在下一财报窗口前更容易获得估值重估。",
      expectedSign: 1,
      horizons: [10, 20, 60],
      pipeline: [
        { op: "ref", input: "revisions.upgrades" },
        { op: "delta", window: 21 },
      ],
    }), { evidence: { status: "insufficient-data", reason: "Requires populated analyst_revision_history.", n: 0 } }),
    seedFactor("sueScore", "earningsRevision", parseFactorSpec({
      factorId: "sueScore",
      family: "earningsRevision",
      hypothesis: "标准化盈利惊喜具有短中期延续效应。",
      expectedSign: 1,
      horizons: [1, 5, 20],
      pipeline: [{ op: "ref", input: "pit.sue_score" }],
    }), { evidence: { status: "insufficient-data", reason: "Requires sue_history rows.", n: 0 } }),
    seedFactor("shortInterestDelta", "smartMoney", parseFactorSpec({
      factorId: "shortInterestDelta",
      family: "smartMoney",
      hypothesis: "空头仓位快速上升会提高未来下行和挤压波动风险。",
      expectedSign: -1,
      horizons: [5, 20],
      pipeline: [
        { op: "ref", input: "shortInterest.short_interest" },
        { op: "delta", window: 21 },
      ],
    }), { evidence: { status: "insufficient-data", reason: "Requires short_interest_history.", n: 0 } }),
    seedFactor("daysToCover", "smartMoney", parseFactorSpec({
      factorId: "daysToCover",
      family: "smartMoney",
      hypothesis: "days-to-cover 过高说明拥挤空头，可能放大事件后波动。",
      expectedSign: -1,
      horizons: [5, 20],
      pipeline: [{ op: "ref", input: "shortInterest.days_to_cover" }],
    }), { evidence: { status: "insufficient-data", reason: "Requires short_interest_history.", n: 0 } }),
    seedFactor("ivRank252", "optionsFlow", parseFactorSpec({
      factorId: "ivRank252",
      family: "optionsFlow",
      hypothesis: "隐含波动率处于一年高位时，买入方向信号的赔率需要更严格。",
      expectedSign: -1,
      horizons: [5, 20],
      pipeline: [
        { op: "ref", input: "ivHistory.iv_atm" },
        { op: "ts_rank", window: 252 },
      ],
    }), { evidence: { status: "insufficient-data", reason: "Requires accumulated options_snapshots iv_atm.", n: 0 } }),
    seedFactor("ivRvSpread", "optionsFlow", {
      schemaVersion: "factor-spec-v1",
      factorId: "ivRvSpread",
      family: "optionsFlow",
      hypothesis: "IV 明显高于实现波动率时，方向交易需要更高催化确认。",
      expectedSign: -1,
      horizons: [5, 20],
      pipeline: [],
      reason: "DSL v1 cannot combine iv_atm with realized volatility from bars without a native multi-input evaluator.",
    }, {
      implementation: "native",
      evidence: { status: "insufficient-data", reason: "Native evaluator not yet wired; do not fabricate IV/RV spread.", n: 0 },
    }),
    seedFactor("putCallRatio", "optionsFlow", parseFactorSpec({
      factorId: "putCallRatio",
      family: "optionsFlow",
      hypothesis: "Put/Call 比率异常升高通常代表保护需求或下行预期升温。",
      expectedSign: -1,
      horizons: [1, 5, 20],
      pipeline: [{ op: "ref", input: "ivHistory.put_call_ratio" }],
    }), { evidence: { status: "insufficient-data", reason: "Requires options_snapshots put_call_ratio.", n: 0 } }),
  ];
  return specs;
}

export function normalizeFactorRegistry(value = {}) {
  const registry = value && typeof value === "object" ? value : {};
  const existing = Array.isArray(registry.factors) ? registry.factors : [];
  const byId = new Map();
  for (const factor of [...defaultFactorRegistrySeeds(), ...existing]) {
    if (!factor?.factorId) continue;
    byId.set(factor.factorId, {
      ...factor,
      state: STATES.has(factor.state) ? factor.state : "candidate",
      stateHistory: Array.isArray(factor.stateHistory) ? factor.stateHistory : [],
      evidence: factor.evidence && typeof factor.evidence === "object" ? factor.evidence : {},
    });
  }
  const trialEntries = Array.isArray(registry.trialLedger?.entries) ? registry.trialLedger.entries : [];
  return {
    schemaVersion: REGISTRY_SCHEMA,
    generatedAt: registry.generatedAt || nowIso(),
    trialLedger: {
      count: Number(registry.trialLedger?.count || trialEntries.length || 0),
      entries: trialEntries.slice(0, 1000),
    },
    factors: [...byId.values()],
    performanceReport: registry.performanceReport || null,
  };
}

function opSimilarity(left = [], right = []) {
  const max = Math.max(left.length, right.length, 1);
  let matches = 0;
  for (let index = 0; index < max; index += 1) {
    if (left[index] && left[index] === right[index]) matches += 1;
  }
  return matches / max;
}

function rankCorrelation(xs = [], ys = []) {
  const pairs = xs.map((x, index) => [numberOrNull(x), numberOrNull(ys[index])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const rank = (values) => values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value)
    .map((item, rankIndex) => ({ ...item, rank: rankIndex + 1 }))
    .sort((a, b) => a.index - b.index)
    .map((item) => item.rank);
  const rx = rank(pairs.map(([x]) => x));
  const ry = rank(pairs.map(([, y]) => y));
  const mx = rx.reduce((sum, value) => sum + value, 0) / rx.length;
  const my = ry.reduce((sum, value) => sum + value, 0) / ry.length;
  let numerator = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let index = 0; index < rx.length; index += 1) {
    const dx = rx[index] - mx;
    const dy = ry[index] - my;
    numerator += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  return dx2 && dy2 ? numerator / Math.sqrt(dx2 * dy2) : null;
}

export function factorOriginalityGate(registry = {}, candidateSpec = {}, dataset = null) {
  const parsed = parseFactorSpec(candidateSpec);
  const candidateOps = factorSpecOpSequence(parsed);
  const checks = [];
  for (const factor of registry.factors || []) {
    if (factor.implementation !== "dsl" || !factor.spec?.pipeline?.length) continue;
    const existingOps = factorSpecOpSequence(factor.spec);
    const similarity = opSimilarity(candidateOps, existingOps);
    checks.push({ factorId: factor.factorId, type: "op-sequence", similarity });
    if (similarity >= 0.8) {
      return { ok: false, reason: `op-sequence similarity ${similarity.toFixed(2)} vs ${factor.factorId}`, checks };
    }
  }
  if (dataset) {
    const candidateEval = evaluateFactorSpec(parsed, dataset, {});
    for (const factor of registry.factors || []) {
      if (factor.implementation !== "dsl" || !factor.spec?.pipeline?.length) continue;
      const existingEval = evaluateFactorSpec(factor.spec, dataset, {});
      const rho = rankCorrelation(candidateEval.values.map((row) => row.value), existingEval.values.map((row) => row.value));
      checks.push({ factorId: factor.factorId, type: "score-series", rho, n: Math.min(candidateEval.n, existingEval.n) });
      if (Number.isFinite(rho) && Math.abs(rho) > 0.9) {
        return { ok: false, reason: `score-series correlation ${rho.toFixed(2)} vs ${factor.factorId}`, checks };
      }
    }
  } else {
    checks.push({ type: "score-series", status: "skipped-no-corpus" });
  }
  return { ok: true, reason: "passed", checks };
}

export function addFactorCandidate(registryInput = {}, payload = {}, options = {}) {
  const registry = normalizeFactorRegistry(registryInput);
  let parsed;
  let gate;
  try {
    parsed = parseFactorSpec(payload.spec || payload);
    gate = factorOriginalityGate(registry, parsed, options.dataset || null);
  } catch (error) {
    parsed = null;
    gate = { ok: false, reason: error.message, checks: [] };
  }
  const factorId = text(payload.factorId || parsed?.factorId || `candidate_${registry.trialLedger.count + 1}`);
  const now = options.now || nowIso();
  const factor = {
    factorId,
    family: text(payload.family || parsed?.family || "custom"),
    spec: parsed || payload.spec || payload,
    hypothesis: text(payload.hypothesis || parsed?.hypothesis || ""),
    expectedSign: parsed?.expectedSign || 1,
    horizons: parsed?.horizons || [20],
    prior: payload.prior === "literature" ? "literature" : "generated",
    state: gate.ok ? "candidate" : "rejected",
    createdBy: options.createdBy || payload.createdBy || "human",
    createdAt: now,
    implementation: "dsl",
    stateHistory: [{ at: now, from: "", to: gate.ok ? "candidate" : "rejected", reason: gate.reason, actor: options.actor || "human" }],
    evidence: { status: gate.ok ? "pending-evaluation" : "rejected", originality: gate, n: 0 },
  };
  const trialEntry = {
    id: compactId("factor-trial"),
    at: now,
    factorId,
    actor: options.actor || "human",
    accepted: gate.ok,
    reason: gate.reason,
    checks: gate.checks,
  };
  const next = {
    ...registry,
    trialLedger: {
      count: registry.trialLedger.count + 1,
      entries: [trialEntry, ...(registry.trialLedger.entries || [])].slice(0, 1000),
    },
    factors: [factor, ...registry.factors.filter((item) => item.factorId !== factorId)],
  };
  return { registry: next, factor, trialEntry, gate };
}

export function advanceFactorState(registryInput = {}, factorId = "", nextState = "", options = {}) {
  const registry = normalizeFactorRegistry(registryInput);
  if (!STATES.has(nextState)) throw new Error(`Invalid factor state "${nextState}".`);
  const now = options.now || nowIso();
  let found = null;
  const factors = registry.factors.map((factor) => {
    if (factor.factorId !== factorId) return factor;
    found = factor;
    return {
      ...factor,
      state: nextState,
      stateHistory: [
        { at: now, from: factor.state, to: nextState, reason: options.reason || "human override", actor: options.actor || "human" },
        ...(factor.stateHistory || []),
      ],
    };
  });
  if (!found) throw new Error(`Factor ${factorId} not found.`);
  return { registry: { ...registry, factors }, factor: factors.find((item) => item.factorId === factorId) };
}

export function buildFactorPerformanceReport(registryInput = {}, context = {}) {
  const registry = normalizeFactorRegistry(registryInput);
  const latestRun = context.latestRun || {};
  const factorStats = latestRun.factorStats || context.factorStats || {};
  return {
    schemaVersion: "factor-performance-report-v1",
    generatedAt: nowIso(),
    registrySummary: {
      total: registry.factors.length,
      byState: registry.factors.reduce((acc, factor) => {
        acc[factor.state] = (acc[factor.state] || 0) + 1;
        return acc;
      }, {}),
      trialCount: registry.trialLedger.count,
    },
    factors: registry.factors.map((factor) => ({
      factorId: factor.factorId,
      family: factor.family,
      state: factor.state,
      prior: factor.prior,
      implementation: factor.implementation || "dsl",
      evidence: factor.evidence || {},
      liveStats: factorStats[factor.factorId] || null,
    })),
    factorStats,
    correlationMatrix: latestRun.factorCorrelationMatrix || null,
    source: latestRun.id ? "latest-all-stock-agent-run" : "registry-only",
  };
}
