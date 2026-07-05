import {
  evaluateFactorSpec,
  factorSpecOpSequence,
  parseFactorSpec,
} from "../lib/factor_spec.mjs";
import { numberOrNull } from "../lib/market_core.mjs";
import { execFile } from "node:child_process";
import crypto from "node:crypto";

const REGISTRY_SCHEMA = "factor-registry-v1";
const STATES = new Set(["candidate", "shadow", "active", "decayed", "retired", "rejected"]);

function nowIso() {
  return new Date().toISOString();
}

function text(value = "") {
  return String(value || "").trim();
}

function safeTicker(value = "") {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 16);
}

function ymd(value = "") {
  const raw = text(value);
  if (!raw) return "";
  const compact = raw.replace(/[^\d]/g, "");
  if (/^\d{8}$/.test(compact)) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : raw.slice(0, 10);
}

function compactId(prefix = "factor") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function factorSpecHash(factorOrSpec = {}) {
  const spec = factorOrSpec.spec || factorOrSpec;
  return hashObject(spec);
}

function sqlText(value = "") {
  return String(value || "").replace(/'/g, "''");
}

function sqliteJson(dbPath, sql, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    execFile("sqlite3", ["-json", dbPath, sql], { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}${stderr ? `; ${stderr}` : ""}`));
        return;
      }
      const raw = String(stdout || "").trim();
      if (!raw) {
        resolve([]);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (parseError) {
        reject(new Error(`sqlite3 JSON parse failed: ${parseError.message}; output=${raw.slice(0, 300)}`));
      }
    });
  });
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
    seedFactor("residualMomentum", "momentum", {
      schemaVersion: "factor-spec-v1",
      factorId: "residualMomentum",
      family: "momentum",
      hypothesis: "剔除市场和行业后的残差动量比裸动量更接近个股 alpha。",
      expectedSign: 1,
      horizons: [20, 60],
      pipeline: [],
      reason: "DSL v1 cannot regress returns against SPY + sector basket.",
    }, { implementation: "native", evidence: { status: "insufficient-data", reason: "Requires native residual regression evaluator.", n: 0 } }),
    seedFactor("week52HighProximity", "momentum", parseFactorSpec({
      factorId: "week52HighProximity",
      family: "momentum",
      hypothesis: "接近 52 周高点的股票更可能延续趋势。",
      expectedSign: 1,
      horizons: [20, 60],
      pipeline: [
        { op: "ref", input: "bars.close" },
        { op: "ts_rank", window: 252 },
      ],
    }), { evidence: { status: "insufficient-data", reason: "Requires historical factor/outcome evaluation.", n: 0 } }),
    seedFactor("shortTermReversal", "momentum", parseFactorSpec({
      factorId: "shortTermReversal",
      family: "momentum",
      hypothesis: "极短期上涨后更容易均值回归，适合 1-5 日反转视角。",
      expectedSign: -1,
      horizons: [1, 5],
      pipeline: [
        { op: "ref", input: "bars.close" },
        { op: "delta", window: 5 },
      ],
    }), { evidence: { status: "insufficient-data", reason: "Requires historical factor/outcome evaluation.", n: 0 } }),
    seedFactor("idioVol21", "optionsFlow", parseFactorSpec({
      factorId: "idioVol21",
      family: "optionsFlow",
      hypothesis: "短期波动过高会降低趋势信号的可执行性。",
      expectedSign: -1,
      horizons: [5, 20],
      pipeline: [
        { op: "overnight_return" },
        { op: "ts_std", window: 21 },
      ],
    }), { evidence: { status: "insufficient-data", reason: "Uses overnight-return volatility until residual vol evaluator exists.", n: 0 } }),
    seedFactor("maxDailyReturn21", "momentum", parseFactorSpec({
      factorId: "maxDailyReturn21",
      family: "momentum",
      hypothesis: "近期单日最大涨幅过高常对应拥挤和回撤风险。",
      expectedSign: -1,
      horizons: [5, 20],
      pipeline: [
        { op: "overnight_return" },
        { op: "ts_max", window: 21 },
      ],
    }), { evidence: { status: "insufficient-data", reason: "Requires historical factor/outcome evaluation.", n: 0 } }),
    seedFactor("amihudIlliquidity21", "smartMoney", {
      schemaVersion: "factor-spec-v1",
      factorId: "amihudIlliquidity21",
      family: "smartMoney",
      hypothesis: "高 Amihud 非流动性会放大滑点并降低信号可执行性。",
      expectedSign: -1,
      horizons: [5, 20],
      pipeline: [],
      reason: "DSL v1 cannot combine absolute return with dollar volume in a rolling expression without native evaluator.",
    }, { implementation: "native", evidence: { status: "insufficient-data", reason: "Requires native Amihud evaluator.", n: 0 } }),
    seedFactor("overnightGapBias21", "momentum", parseFactorSpec({
      factorId: "overnightGapBias21",
      family: "momentum",
      hypothesis: "持续隔夜跳空代表资金定价偏移，但也可能暴露隔夜风险。",
      expectedSign: 1,
      horizons: [5, 20],
      pipeline: [
        { op: "overnight_return" },
        { op: "ts_mean", window: 21 },
      ],
    }), { evidence: { status: "insufficient-data", reason: "Requires historical factor/outcome evaluation.", n: 0 } }),
    seedFactor("netShareIssuance", "qualityGrowth", parseFactorSpec({
      factorId: "netShareIssuance",
      family: "qualityGrowth",
      hypothesis: "持续增发会稀释每股价值并压制未来超额收益；若发行后仍能维持正超额则证伪。",
      expectedSign: -1,
      horizons: [60, 126],
      pipeline: [
        { op: "ref", input: "pit.shares_outstanding" },
        { op: "delta", window: 252 },
      ],
    }), { evidence: { status: "insufficient-data", reason: "Requires at least two PIT shares_outstanding periods.", n: 0 } }),
    seedFactor("grossProfitability", "qualityGrowth", parseFactorSpec({
      factorId: "grossProfitability",
      family: "qualityGrowth",
      hypothesis: "高毛利资产效率通常代表更强产品力和资本效率，预期中期超额为正。",
      expectedSign: 1,
      horizons: [60, 126],
      pipeline: [{ op: "ref", input: "pit.gross_profitability" }],
    }), { evidence: { status: "insufficient-data", reason: "Requires PIT gross_profitability or gross_profit/assets field.", n: 0 } }),
    seedFactor("assetGrowth", "qualityGrowth", parseFactorSpec({
      factorId: "assetGrowth",
      family: "qualityGrowth",
      hypothesis: "资产扩张过快可能对应低质量增长和未来回报回落，预期中期超额为负。",
      expectedSign: -1,
      horizons: [60, 126],
      pipeline: [
        { op: "ref", input: "pit.total_assets" },
        { op: "delta", window: 252 },
      ],
    }), { evidence: { status: "insufficient-data", reason: "Requires at least two PIT total_assets periods.", n: 0 } }),
    seedFactor("insiderClusterBuy", "smartMoney", {
      schemaVersion: "factor-spec-v1",
      factorId: "insiderClusterBuy",
      family: "smartMoney",
      hypothesis: "30 日内至少两位不同内部人公开市场买入，通常比单一 Form 4 更有信息含量。",
      expectedSign: 1,
      horizons: [20, 60],
      pipeline: [],
      reason: "DSL v1 cannot count distinct Form 4 insiders in a rolling 30d window.",
    }, { implementation: "native", evidence: { status: "insufficient-data", reason: "Requires normalized Form 4 transaction rows with distinct insider identity.", n: 0 } }),
    seedFactor("institutionalBreadthDelta", "smartMoney", {
      schemaVersion: "factor-spec-v1",
      factorId: "institutionalBreadthDelta",
      family: "smartMoney",
      hypothesis: "机构持有人广度提升可能代表基本面共识扩散，预期中期超额为正。",
      expectedSign: 1,
      horizons: [60, 126],
      pipeline: [],
      reason: "Blocked: current 13F sync is filing-level only and does not provide point-in-time holder breadth by ticker.",
    }, { implementation: "native", evidence: { status: "blocked-data-depth", reason: "13F mirror is filing-level-only; cannot compute institutional breadth delta without holdings-level PIT sync.", n: 0 } }),
  ];
  return specs;
}

function ledgerEntryCountsAsTrial(entry = {}, seenAdmissionSpecs = new Set()) {
  if (entry.type === "candidate-submission" || String(entry.id || "").startsWith("factor-trial")) return true;
  if (entry.type === "admission-evaluation") {
    const specHash = text(entry.specHash || "");
    if (!specHash || seenAdmissionSpecs.has(specHash)) return false;
    seenAdmissionSpecs.add(specHash);
    return true;
  }
  return false;
}

function normalizeTrialLedger(ledgerInput = {}) {
  const entries = Array.isArray(ledgerInput.entries) ? ledgerInput.entries : [];
  const rawCount = Number(ledgerInput.count ?? entries.length ?? 0) || 0;
  const seenAdmissionSpecs = new Set();
  let correctedCount = 0;
  for (const entry of entries.slice().reverse()) {
    if (ledgerEntryCountsAsTrial(entry, seenAdmissionSpecs)) correctedCount += 1;
  }
  const hasCorrection = entries.some((entry) => entry.type === "ledger-correction" && entry.rule === "wp19-trial-honesty");
  const nextEntries = rawCount !== correctedCount && !hasCorrection
    ? [
        {
          id: compactId("factor-ledger-correction"),
          type: "ledger-correction",
          rule: "wp19-trial-honesty",
          at: nowIso(),
          oldCount: rawCount,
          newCount: correctedCount,
          reason: "Routine evaluator and decay-monitor entries no longer count as distinct factor trials.",
          appendOnly: true,
        },
        ...entries,
      ]
    : entries;
  return {
    count: correctedCount,
    entries: nextEntries.slice(0, 1000),
  };
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
      specHash: factor.specHash || factorSpecHash(factor),
    });
  }
  const trialLedger = normalizeTrialLedger(registry.trialLedger || {});
  return {
    schemaVersion: REGISTRY_SCHEMA,
    generatedAt: registry.generatedAt || nowIso(),
    memory: registry.memory && typeof registry.memory === "object"
      ? {
          schemaVersion: registry.memory.schemaVersion || "factor-episodic-memory-v1",
          lessons: Array.isArray(registry.memory.lessons) ? registry.memory.lessons.slice(0, 500) : [],
        }
      : { schemaVersion: "factor-episodic-memory-v1", lessons: [] },
    trialLedger: {
      count: trialLedger.count,
      entries: trialLedger.entries,
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

function alignedSeriesRankCorrelation(left = [], right = []) {
  const rightMap = new Map(
    (right || [])
      .map((row) => [`${safeTicker(row.ticker)}|${ymd(row.date)}`, numberOrNull(row.score ?? row.value)])
      .filter(([, value]) => Number.isFinite(value)),
  );
  const xs = [];
  const ys = [];
  for (const row of left || []) {
    const key = `${safeTicker(row.ticker)}|${ymd(row.date)}`;
    const rv = rightMap.get(key);
    const lv = numberOrNull(row.score ?? row.value);
    if (Number.isFinite(lv) && Number.isFinite(rv)) {
      xs.push(lv);
      ys.push(rv);
    }
  }
  return {
    rho: rankCorrelation(xs, ys),
    n: xs.length,
  };
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
      const aligned = alignedSeriesRankCorrelation(candidateEval.values, existingEval.values);
      const rho = aligned.rho;
      checks.push({ factorId: factor.factorId, type: "score-series", rho, n: aligned.n, alignment: "ticker-date" });
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
  const conflict = registry.factors.find((item) => item.factorId === factorId && item.state !== "rejected");
  if (conflict) {
    gate = {
      ok: false,
      reason: `factorId conflict with existing ${conflict.state} factor ${factorId}`,
      checks: [{ type: "factor-id-conflict", factorId, state: conflict.state }],
    };
  }
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
    specHash: parsed ? factorSpecHash(parsed) : factorSpecHash(payload.spec || payload),
    stateHistory: [{ at: now, from: "", to: gate.ok ? "candidate" : "rejected", reason: gate.reason, actor: options.actor || "human" }],
    evidence: { status: gate.ok ? "pending-evaluation" : "rejected", originality: gate, n: 0 },
  };
  const trialEntry = {
    id: compactId("factor-trial"),
    type: "candidate-submission",
    at: now,
    factorId,
    specHash: factor.specHash,
    actor: options.actor || "human",
    accepted: gate.ok,
    reason: gate.reason,
    checks: gate.checks,
  };
  if (conflict) {
    const next = {
      ...registry,
      trialLedger: {
        count: registry.trialLedger.count + 1,
        entries: [trialEntry, ...(registry.trialLedger.entries || [])].slice(0, 1000),
      },
      factors: registry.factors,
    };
    return { registry: next, factor, trialEntry, gate };
  }
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

function proposalSpecFromPayload(proposal = {}) {
  const spec = proposal.spec && typeof proposal.spec === "object" ? proposal.spec : proposal;
  return {
    ...spec,
    factorId: text(proposal.factorId || spec.factorId),
    family: text(proposal.family || spec.family || "custom"),
    hypothesis: text(proposal.hypothesis || spec.hypothesis || ""),
    expectedSign: proposal.expectedSign ?? spec.expectedSign ?? 1,
    horizons: Array.isArray(proposal.horizons) && proposal.horizons.length ? proposal.horizons : spec.horizons || [20],
  };
}

export function ingestFactorResearcherOutput(registryInput = {}, output = {}, options = {}) {
  let registry = normalizeFactorRegistry(registryInput);
  const payload = output?.output && typeof output.output === "object" ? output.output : output;
  const proposals = (Array.isArray(payload?.proposals) ? payload.proposals : [])
    .filter((item) => item && typeof item === "object")
    .slice(0, 3);
  const results = [];
  for (const proposal of proposals) {
    const spec = proposalSpecFromPayload(proposal);
    const result = addFactorCandidate(registry, {
      ...proposal,
      factorId: spec.factorId,
      family: spec.family,
      hypothesis: spec.hypothesis,
      prior: "generated",
      createdBy: "llm:factor_researcher",
      spec,
    }, {
      ...options,
      actor: "llm:factor_researcher",
      createdBy: "llm:factor_researcher",
    });
    const factor = {
      ...result.factor,
      researcherProposal: {
        schemaVersion: "factor-researcher-proposal-v1",
        novelty: text(proposal.novelty || proposal.noveltyArgument || ""),
        replacesFactorId: text(proposal.replacesFactorId || ""),
        economicRationale: text(proposal.economicRationale || proposal.rationale || proposal.hypothesis || ""),
        sourceRunId: text(options.sourceRunId || ""),
        invoker: text(options.invoker || ""),
      },
    };
    registry = {
      ...result.registry,
      factors: [factor, ...result.registry.factors.filter((item) => item.factorId !== factor.factorId)],
    };
    results.push({ factor, gate: result.gate, trialEntry: result.trialEntry });
  }
  return {
    registry,
    accepted: results.filter((item) => item.gate.ok),
    rejected: results.filter((item) => !item.gate.ok),
    results,
    proposalCount: proposals.length,
  };
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

function mean(values = []) {
  const rows = values.filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

function rankScoreRows(rows = []) {
  const sorted = rows
    .map((row, index) => ({ ...row, index, rawValue: numberOrNull(row.rawValue ?? row.value) }))
    .filter((row) => Number.isFinite(row.rawValue))
    .sort((a, b) => a.rawValue - b.rawValue);
  const out = [];
  for (let index = 0; index < sorted.length; index += 1) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1].rawValue === sorted[index].rawValue) end += 1;
    const score = sorted.length > 1 ? ((index + end) / 2 / (sorted.length - 1)) * 100 : 50;
    for (let cursor = index; cursor <= end; cursor += 1) out.push({ ...sorted[cursor], score });
    index = end;
  }
  return out.sort((a, b) => a.index - b.index).map(({ index, ...row }) => row);
}

function dateGridFromBars(bars = [], options = {}) {
  const step = Math.max(1, Number(options.stepDays || 5));
  const maxDates = Math.max(1, Number(options.maxDates || 120));
  const dates = [...new Set((bars || []).map((row) => ymd(row.date)).filter(Boolean))].sort();
  const selected = [];
  for (let index = 0; index < dates.length; index += step) selected.push(dates[index]);
  if (dates.length && selected.at(-1) !== dates.at(-1)) selected.push(dates.at(-1));
  return selected.slice(-maxDates);
}

function latestRowsByDate(values = [], dateGrid = [], universe = []) {
  const byTicker = new Map();
  for (const row of values || []) {
    const ticker = safeTicker(row.ticker);
    const date = ymd(row.date);
    const value = numberOrNull(row.value);
    if (!ticker || !date || !Number.isFinite(value)) continue;
    if (!byTicker.has(ticker)) byTicker.set(ticker, []);
    byTicker.get(ticker).push({ ticker, date, rawValue: value });
  }
  for (const rows of byTicker.values()) rows.sort((a, b) => a.date.localeCompare(b.date));
  const tickers = (universe || []).map(safeTicker).filter(Boolean);
  const out = [];
  for (const date of dateGrid || []) {
    const crossSection = [];
    for (const ticker of tickers) {
      const rows = byTicker.get(ticker) || [];
      let latest = null;
      for (const row of rows) {
        if (row.date <= date) latest = row;
        else break;
      }
      if (latest) crossSection.push({ ticker, date, rawValue: latest.rawValue, valueDate: latest.date });
    }
    out.push(...rankScoreRows(crossSection));
  }
  return out;
}

function factorScoreRowsForDataset(specInput = {}, dataset = {}, options = {}) {
  const spec = parseFactorSpec(specInput);
  const bars = Array.isArray(dataset.bars) ? dataset.bars : [];
  const universe = (options.universe?.length ? options.universe : [...new Set(bars.map((row) => safeTicker(row.ticker)).filter(Boolean))]).map(safeTicker).filter(Boolean);
  const dateGrid = (options.dateGrid?.length ? options.dateGrid : dateGridFromBars(bars, options)).map(ymd).filter(Boolean);
  const asOf = dateGrid.at(-1) || options.asOf || "";
  const evaluation = evaluateFactorSpec(spec, dataset, { asOf });
  const scoreRows = latestRowsByDate(evaluation.values, dateGrid, universe);
  const byDate = new Map();
  for (const row of scoreRows) {
    if (!byDate.has(row.date)) byDate.set(row.date, 0);
    byDate.set(row.date, byDate.get(row.date) + 1);
  }
  const coverageByDate = dateGrid.map((date) => ({
    date,
    n: byDate.get(date) || 0,
    coverage: universe.length ? (byDate.get(date) || 0) / universe.length : 0,
  }));
  return {
    spec,
    evaluation,
    scoreRows,
    coverageByDate,
    coverage: mean(coverageByDate.map((row) => row.coverage)) ?? 0,
    universe,
    dateGrid,
  };
}

function summarizeHorizonPairs(pairs = [], expectedSign = 1) {
  const xs = pairs.map((row) => row.score);
  const ys = pairs.map((row) => row.excessPct);
  const rankIC = rankCorrelation(xs, ys);
  const uniqueDecisionKeys = new Set(pairs.map((row) => `${row.ticker}|${row.decisionAt}`)).size;
  const horizonDays = Number(pairs.find((row) => Number.isFinite(Number(row.horizonDays)))?.horizonDays || 1);
  const calendarEffectiveN = calendarNonOverlapEffectiveN(pairs.map((row) => ({ ticker: row.ticker, date: row.decisionAt })), horizonDays);
  const effectiveN = Math.min(pairs.length, calendarEffectiveN || uniqueDecisionKeys);
  const tStat = Number.isFinite(rankIC) && effectiveN > 2 ? rankIC * Math.sqrt(effectiveN) : null;
  return {
    rankIC: Number.isFinite(rankIC) ? rankIC : null,
    n: pairs.length,
    effectiveN,
    effectiveNMethod: `calendar-non-overlap-${Math.max(1, Math.ceil(horizonDays || 1))}d`,
    effectiveNVariants: {
      uniqueDecision: {
        value: Math.min(pairs.length, uniqueDecisionKeys),
        method: "unique-ticker-date",
        n: pairs.length,
      },
      calendarNonOverlap: {
        value: Math.min(pairs.length, calendarEffectiveN || uniqueDecisionKeys),
        method: `calendar-non-overlap-${Math.max(1, Math.ceil(horizonDays || 1))}d`,
        n: pairs.length,
      },
    },
    tStat: Number.isFinite(tStat) ? tStat : null,
    tStatMethod: "rankIC*sqrt(effectiveN)",
    signOk: Number.isFinite(rankIC) ? rankIC * expectedSign > 0 : false,
  };
}

function calendarNonOverlapEffectiveN(samples = [], horizonDays = 1) {
  const horizon = Math.max(1, Math.ceil(Number(horizonDays) || 1));
  const byTicker = new Map();
  for (const sample of samples || []) {
    const ticker = safeTicker(sample.ticker);
    const date = ymd(sample.date);
    if (!date) continue;
    const key = ticker || "__all__";
    if (!byTicker.has(key)) byTicker.set(key, []);
    byTicker.get(key).push(date);
  }
  let count = 0;
  for (const dates of byTicker.values()) {
    let lastMs = null;
    for (const date of [...new Set(dates)].sort()) {
      const ms = new Date(`${date}T00:00:00Z`).getTime();
      if (!Number.isFinite(ms)) continue;
      if (lastMs === null || (ms - lastMs) / (24 * 60 * 60 * 1000) >= horizon) {
        count += 1;
        lastMs = ms;
      }
    }
  }
  return count;
}

function corpusDatasetFromObject(db = {}) {
  return {
    bars: Array.isArray(db.bars) ? db.bars : Array.isArray(db.historical_bars) ? db.historical_bars : [],
    pit: Array.isArray(db.pit) ? db.pit : Array.isArray(db.pit_fundamentals) ? db.pit_fundamentals : [],
    revisions: Array.isArray(db.revisions) ? db.revisions : Array.isArray(db.analyst_revision_history) ? db.analyst_revision_history : [],
    shortInterest: Array.isArray(db.shortInterest) ? db.shortInterest : Array.isArray(db.short_interest_history) ? db.short_interest_history : [],
    ivHistory: Array.isArray(db.ivHistory) ? db.ivHistory : Array.isArray(db.options_snapshots) ? db.options_snapshots : [],
    consensus: Array.isArray(db.consensus) ? db.consensus : Array.isArray(db.consensus_snapshots) ? db.consensus_snapshots : [],
    historicalOutcomes: Array.isArray(db.historicalOutcomes) ? db.historicalOutcomes : Array.isArray(db.historical_outcomes) ? db.historical_outcomes : [],
    historicalRegimes: Array.isArray(db.historicalRegimes) ? db.historicalRegimes : Array.isArray(db.historical_regimes) ? db.historical_regimes : [],
    diagnostics: [],
  };
}

async function optionalSqliteJson(dbPath, sql, diagnostics, label, timeoutMs) {
  try {
    return await sqliteJson(dbPath, sql, timeoutMs);
  } catch (error) {
    diagnostics.push({ label, status: "unavailable", error: error.message });
    return [];
  }
}

async function corpusDatasetFromSqlite(dbPath = "", options = {}) {
  const timeoutMs = Number(options.timeoutMs || 60000);
  const diagnostics = [];
  const universeInput = (options.universe || []).map(safeTicker).filter(Boolean);
  let universe = universeInput;
  if (!universe.length) {
    const tickerRows = await sqliteJson(
      dbPath,
      `SELECT DISTINCT ticker FROM historical_bars ORDER BY ticker LIMIT ${Math.max(1, Number(options.maxTickers || 80))};`,
      timeoutMs,
    );
    universe = tickerRows.map((row) => safeTicker(row.ticker)).filter(Boolean);
  }
  const tickerList = universe.map((ticker) => `'${sqlText(ticker)}'`).join(",");
  if (!tickerList) return { ...corpusDatasetFromObject({}), diagnostics: [{ label: "universe", status: "empty" }] };
  const bars = await sqliteJson(
    dbPath,
    `SELECT ticker,date,open,high,low,close,volume,source FROM historical_bars WHERE ticker IN (${tickerList}) ORDER BY ticker,date;`,
    timeoutMs,
  );
  const historicalOutcomes = await optionalSqliteJson(
    dbPath,
    `SELECT ticker,horizon_days,decision_at,excess_pct,regime,outcome_quality_status,json FROM historical_outcomes WHERE ticker IN (${tickerList}) ORDER BY decision_at,ticker,horizon_days;`,
    diagnostics,
    "historical_outcomes",
    timeoutMs,
  );
  const historicalRegimes = await optionalSqliteJson(
    dbPath,
    "SELECT date,bucket,risk_score,json FROM historical_regimes ORDER BY date;",
    diagnostics,
    "historical_regimes",
    timeoutMs,
  );
  const pit = await optionalSqliteJson(
    dbPath,
    `SELECT ticker,filed_at AS date,period,field,value,form,json FROM pit_fundamentals WHERE ticker IN (${tickerList}) ORDER BY ticker,filed_at,period;`,
    diagnostics,
    "pit_fundamentals",
    timeoutMs,
  );
  const revisions = await optionalSqliteJson(
    dbPath,
    `SELECT ticker,captured_at AS date,upgrades,downgrades,buy_ratio,consensus_eps,json FROM analyst_revision_history WHERE ticker IN (${tickerList}) ORDER BY ticker,captured_at;`,
    diagnostics,
    "analyst_revision_history",
    timeoutMs,
  );
  const shortInterest = await optionalSqliteJson(
    dbPath,
    `SELECT ticker,captured_at AS date,short_interest,days_to_cover,json FROM short_interest_history WHERE ticker IN (${tickerList}) ORDER BY ticker,captured_at;`,
    diagnostics,
    "short_interest_history",
    timeoutMs,
  );
  const ivHistory = await optionalSqliteJson(
    dbPath,
    `SELECT ticker,captured_at AS date,iv_atm,put_call_ratio,json FROM options_snapshots WHERE ticker IN (${tickerList}) ORDER BY ticker,captured_at;`,
    diagnostics,
    "options_snapshots",
    timeoutMs,
  );
  const consensus = await optionalSqliteJson(
    dbPath,
    `SELECT ticker,captured_at AS date,eps,revenue,json FROM consensus_snapshots WHERE ticker IN (${tickerList}) ORDER BY ticker,captured_at;`,
    diagnostics,
    "consensus_snapshots",
    timeoutMs,
  );
  return { bars, pit, revisions, shortInterest, ivHistory, consensus, historicalOutcomes, historicalRegimes, diagnostics };
}

async function loadCorpusDataset(db = null, options = {}) {
  if (!db) return corpusDatasetFromObject({});
  if (typeof db === "string") return corpusDatasetFromSqlite(db, options);
  if (typeof db === "object" && db.sqlitePath) return corpusDatasetFromSqlite(db.sqlitePath, options);
  return corpusDatasetFromObject(db);
}

function normalizeOutcomeRows(rows = []) {
  return (rows || [])
    .map((row) => ({
      ticker: safeTicker(row.ticker),
      horizonDays: Number(row.horizonDays ?? row.horizon_days),
      decisionAt: ymd(row.decisionAt ?? row.decision_at ?? row.date),
      excessPct: numberOrNull(row.excessPct ?? row.excess_pct),
      regime: text(row.regime || row.bucket || ""),
      outcomeQualityStatus: text(row.outcomeQualityStatus || row.outcome_quality_status || "ok"),
    }))
    .filter((row) => row.ticker && row.decisionAt && Number.isFinite(row.horizonDays) && Number.isFinite(row.excessPct) && row.outcomeQualityStatus !== "suspect_price");
}

function regimeForDate(regimes = [], date = "") {
  const target = ymd(date);
  return (regimes || [])
    .map((row) => ({ date: ymd(row.date), bucket: text(row.bucket || row.regime || ""), riskScore: numberOrNull(row.risk_score ?? row.riskScore) }))
    .filter((row) => row.date && row.date <= target)
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

function adjacentSignCount(horizonStats = {}, targetHorizons = [], expectedSign = 1) {
  const targets = (targetHorizons || []).map(Number).filter(Number.isFinite);
  if (!targets.length) return 0;
  const available = Object.entries(horizonStats)
    .map(([horizon, stat]) => ({ horizon: Number(horizon), signOk: stat.signOk, rankIC: stat.rankIC }))
    .filter((row) => Number.isFinite(row.horizon) && Number.isFinite(row.rankIC));
  let count = 0;
  for (const target of targets) {
    const neighbors = available
      .filter((row) => row.horizon !== target)
      .sort((a, b) => Math.abs(a.horizon - target) - Math.abs(b.horizon - target))
      .slice(0, 2);
    if (neighbors.some((row) => row.rankIC * expectedSign > 0)) count += 1;
  }
  return count;
}

function scoreRowsCorrelation(left = [], right = []) {
  return alignedSeriesRankCorrelation(left, right);
}

export async function evaluateFactorSpecOverCorpus(specInput = {}, options = {}) {
  const factor = options.factor || {};
  if (factor.implementation && factor.implementation !== "dsl") {
    return {
      schemaVersion: "factor-corpus-evidence-v1",
      factorId: text(factor.factorId || specInput.factorId),
      status: factor.evidence?.status || "insufficient-data",
      source: "historical-corpus",
      reason: factor.evidence?.reason || "native evaluator required",
      n: 0,
      effectiveN: 0,
    };
  }
  const dataset = await loadCorpusDataset(options.db, options);
  const parsed = parseFactorSpec(specInput);
  const universe = (options.universe?.length
    ? options.universe
    : [...new Set((dataset.bars || []).map((row) => safeTicker(row.ticker)).filter(Boolean))]
  ).map(safeTicker).filter(Boolean);
  const dateGrid = (options.dateGrid?.length ? options.dateGrid : dateGridFromBars(dataset.bars, options)).map(ymd).filter(Boolean);
  const scored = factorScoreRowsForDataset(parsed, dataset, {
    ...options,
    universe,
    dateGrid,
  });
  const scoreMap = new Map(scored.scoreRows.map((row) => [`${row.ticker}|${row.date}`, row]));
  const horizons = (parsed.horizons || [20]).map(Number).filter(Number.isFinite);
  const outcomeRows = normalizeOutcomeRows(dataset.historicalOutcomes)
    .filter((row) => !horizons.length || horizons.includes(row.horizonDays));
  const horizonPairs = {};
  for (const outcome of outcomeRows) {
    const score = scoreMap.get(`${outcome.ticker}|${outcome.decisionAt}`);
    if (!score) continue;
    const regime = outcome.regime || regimeForDate(dataset.historicalRegimes, outcome.decisionAt)?.bucket || "unknown";
    const pair = {
      ticker: outcome.ticker,
      decisionAt: outcome.decisionAt,
      horizonDays: outcome.horizonDays,
      score: score.score,
      rawValue: score.rawValue,
      excessPct: outcome.excessPct,
      regime,
    };
    if (!horizonPairs[outcome.horizonDays]) horizonPairs[outcome.horizonDays] = [];
    horizonPairs[outcome.horizonDays].push(pair);
  }
  const horizonsSummary = {};
  const regimeBuckets = {};
  for (const [horizon, pairs] of Object.entries(horizonPairs)) {
    horizonsSummary[horizon] = summarizeHorizonPairs(pairs, parsed.expectedSign);
    for (const pair of pairs) {
      const bucket = pair.regime || "unknown";
      const key = `${horizon}|${bucket}`;
      if (!regimeBuckets[key]) regimeBuckets[key] = [];
      regimeBuckets[key].push(pair);
    }
  }
  const regimes = {};
  for (const [key, pairs] of Object.entries(regimeBuckets)) {
    const [horizon, bucket] = key.split("|");
    if (!regimes[horizon]) regimes[horizon] = {};
    regimes[horizon][bucket] = summarizeHorizonPairs(pairs, parsed.expectedSign);
  }
  const primaryHorizon = horizons.find((horizon) => horizonsSummary[horizon]?.n) || Number(Object.keys(horizonsSummary)[0]);
  const primary = horizonsSummary[primaryHorizon] || { rankIC: null, n: 0, effectiveN: 0, tStat: null };
  const regimeSigns = Object.values(regimes[primaryHorizon] || {}).filter((row) => Number.isFinite(row.rankIC) && row.rankIC * parsed.expectedSign > 0).length;
  const comparisonFactors = (options.comparisonFactors || []).filter((item) => item?.implementation === "dsl" && item.spec?.pipeline?.length);
  const correlations = [];
  for (const existing of comparisonFactors) {
    try {
      const existingRows = factorScoreRowsForDataset(existing.spec, dataset, { ...options, universe, dateGrid }).scoreRows;
      const aligned = scoreRowsCorrelation(scored.scoreRows, existingRows);
      correlations.push({ factorId: existing.factorId, rho: aligned.rho, n: aligned.n, alignment: "ticker-date" });
    } catch (error) {
      correlations.push({ factorId: existing.factorId, rho: null, n: 0, error: error.message, alignment: "ticker-date" });
    }
  }
  const finiteCorrelations = correlations.map((row) => Math.abs(numberOrNull(row.rho))).filter(Number.isFinite);
  const maxCorrelation = finiteCorrelations.length ? Math.max(...finiteCorrelations) : 0;
  const totalN = Object.values(horizonsSummary).reduce((sum, row) => sum + Number(row.n || 0), 0);
  const status = totalN ? "ok" : "insufficient-data";
  return {
    schemaVersion: "factor-corpus-evidence-v1",
    factorId: parsed.factorId,
    generatedAt: nowIso(),
    source: "historical-corpus",
    status,
    n: primary.n || 0,
    effectiveN: primary.effectiveN || 0,
    rankIC: primary.rankIC,
    tStat: primary.tStat,
    tStatMethod: primary.tStatMethod || "rankIC*sqrt(effectiveN)",
    primaryHorizon,
    horizons: horizonsSummary,
    regimes,
    regimeSigns,
    adjacentHorizonSigns: adjacentSignCount(horizonsSummary, horizons, parsed.expectedSign),
    coverage: scored.coverage,
    coverageByDate: scored.coverageByDate.slice(-20),
    maxCorrelation,
    correlations,
    scoreSeries: scored.scoreRows.slice(0, Number(options.persistScoreSeriesLimit || 5000)),
    diagnostics: dataset.diagnostics || [],
    universeCount: universe.length,
    dateCount: dateGrid.length,
    outcomeCount: outcomeRows.length,
    reason: status === "ok" ? "" : "No aligned historical_outcomes rows for factor score series.",
  };
}

function admissionEvidenceForFactor(factor = {}, context = {}) {
  const override = context.evidenceOverrides?.[factor.factorId];
  const corpus = context.corpusEvidence?.[factor.factorId];
  const liveStats = context.performanceReport?.factorStats?.[factor.factorId] || context.factorStats?.[factor.factorId] || {};
  const evidence = override || corpus || factor.evidence?.admission || factor.evidence?.latestAdmission || factor.evidence || {};
  const rankIC = numberOrNull(evidence.rankIC ?? liveStats.rankIC);
  const n = numberOrNull(evidence.n ?? evidence.samples ?? liveStats.n ?? liveStats.samples);
  const effectiveN = numberOrNull(evidence.effectiveN ?? liveStats.effectiveN) ?? n;
  const tStat = numberOrNull(evidence.tStat) ?? (Number.isFinite(rankIC) && Number.isFinite(effectiveN) && effectiveN > 2 ? rankIC * Math.sqrt(effectiveN) : null);
  const coverage = numberOrNull(evidence.coverage ?? evidence.coveragePct) ?? 0;
  const maxCorrelation = Math.abs(numberOrNull(evidence.maxCorrelation ?? evidence.maxAbsCorrelation) ?? 1);
  const regimeSigns = numberOrNull(evidence.regimeSigns) ?? 0;
  const adjacentHorizonSigns = numberOrNull(evidence.adjacentHorizonSigns) ?? 0;
  const trialCount = Number(context.trialCount || 0);
  const baseHurdle = factor.prior === "generated" ? 3.5 : 3.0;
  const hurdle = baseHurdle + (trialCount > 8 ? Math.floor(Math.log2(trialCount / 8)) * 0.1 : 0);
  const signOk = Number.isFinite(rankIC) && rankIC * (factor.expectedSign || 1) > 0;
  const pass =
    signOk &&
    Number.isFinite(tStat) &&
    tStat >= hurdle &&
    regimeSigns >= 2 &&
    adjacentHorizonSigns >= 1 &&
    maxCorrelation < 0.6 &&
    coverage >= 0.6;
  return {
    status: pass ? "passed" : "failed",
    source: override ? "manual-evidence-override" : corpus ? "historical-corpus" : liveStats.samples || liveStats.n ? "live-factor-stats" : "stored-evidence",
    rankIC: Number.isFinite(rankIC) ? rankIC : null,
    n: Number.isFinite(n) ? n : 0,
    effectiveN: Number.isFinite(effectiveN) ? effectiveN : Number.isFinite(n) ? n : 0,
    tStatMethod: "rankIC*sqrt(effectiveN)",
    tStat: Number.isFinite(tStat) ? tStat : null,
    hurdle,
    regimeSigns,
    adjacentHorizonSigns,
    maxCorrelation,
    coverage,
    checks: {
      signOk,
      tStatOk: Number.isFinite(tStat) && tStat >= hurdle,
      regimeOk: regimeSigns >= 2,
      adjacentHorizonOk: adjacentHorizonSigns >= 1,
      correlationOk: maxCorrelation < 0.6,
      coverageOk: coverage >= 0.6,
    },
  };
}

function decayEvidenceForFactor(factor = {}, context = {}) {
  const liveStats = context.performanceReport?.factorStats?.[factor.factorId] || context.factorStats?.[factor.factorId] || {};
  const rows = factorOutcomeRowsForDecay(factor.factorId, context);
  const windows = decayWindows(rows, factor.expectedSign || 1);
  const trailing = windows.at(-1) || null;
  const previous = windows.at(-2) || null;
  const n = numberOrNull(trailing?.n ?? liveStats.n ?? liveStats.samples);
  const rankIC = numberOrNull(trailing?.rankIC ?? liveStats.rankIC);
  const avgExcessPct = numberOrNull(trailing?.avgExcessPct ?? liveStats.avgExcessPct);
  const twoBadWindows = Boolean(previous?.negative && trailing?.negative);
  const shouldDecay = factor.state === "active" && twoBadWindows;
  const shouldRecover = factor.state === "decayed" && Boolean(trailing?.rankICPositive);
  const redundancy = redundancyEvidenceForFactor(factor.factorId, liveStats, context);
  return {
    status: shouldDecay ? "decay" : shouldRecover ? "recover" : "hold",
    n: Number.isFinite(n) ? n : 0,
    rankIC: Number.isFinite(rankIC) ? rankIC : null,
    avgExcessPct: Number.isFinite(avgExcessPct) ? avgExcessPct : null,
    windows,
    twoBadWindows,
    redundancy,
    reason: rows.length
      ? shouldDecay
        ? "two-consecutive-negative-60-outcome-windows"
        : shouldRecover
          ? "trailing-60-window-ic-positive"
          : "decay-window-gates-not-met"
      : "missing-factor-outcome-rows",
  };
}

function factorOutcomeRowsForDecay(factorId = "", context = {}) {
  const id = text(factorId);
  const explicit = context.factorOutcomes?.[id] || context.factorOutcomeRows?.[id] || [];
  const sourceRows = explicit.length ? explicit : context.outcomeSnapshots || context.outcomes || [];
  return (sourceRows || [])
    .map((row) => {
      const factor = row.factorSnapshot?.factors?.[id] || row.factors?.[id] || {};
      return {
        ticker: safeTicker(row.ticker),
        date: ymd(row.decisionAt || row.generatedAt || row.asOf || row.completedAt || row.date),
        score: numberOrNull(row.score ?? factor.score),
        excessPct: numberOrNull(row.excessPct ?? row.performancePct ?? row.returnPct),
        outcomeQualityStatus: text(row.outcomeQualityStatus || row.qualityStatus || ""),
        outcomeUsable: row.outcomeUsable !== false,
      };
    })
    .filter((row) =>
      row.date &&
      row.outcomeUsable !== false &&
      row.outcomeQualityStatus !== "suspect_price" &&
      Number.isFinite(row.score) &&
      Number.isFinite(row.excessPct),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.ticker.localeCompare(b.ticker));
}

function decayWindows(rows = [], expectedSign = 1) {
  const windowSize = 60;
  const usable = rows.slice(-windowSize * 2);
  const chunks = [];
  if (usable.length > windowSize) chunks.push(usable.slice(0, Math.max(0, usable.length - windowSize)));
  if (usable.length >= windowSize) chunks.push(usable.slice(-windowSize));
  return chunks
    .filter((chunk) => chunk.length >= windowSize)
    .map((chunk) => {
      const rankIC = rankCorrelation(chunk.map((row) => row.score), chunk.map((row) => row.excessPct));
      const avgExcessPct = mean(chunk.map((row) => row.excessPct));
      const contribution = chunk.reduce((sum, row) => sum + ((row.score - 50) / 50) * row.excessPct * expectedSign, 0);
      const negative = Number.isFinite(rankIC) && rankIC <= 0 && Number.isFinite(contribution) && contribution < 0;
      return {
        n: chunk.length,
        startDate: chunk[0]?.date || "",
        endDate: chunk.at(-1)?.date || "",
        rankIC: Number.isFinite(rankIC) ? rankIC : null,
        avgExcessPct: Number.isFinite(avgExcessPct) ? avgExcessPct : null,
        cumulativeWeightedContribution: Number.isFinite(contribution) ? contribution : null,
        negative,
        rankICPositive: Number.isFinite(rankIC) && rankIC > 0,
      };
    });
}

function redundancyEvidenceForFactor(factorId = "", liveStats = {}, context = {}) {
  const correlations = context.factorCorrelationMatrix || context.performanceReport?.correlationMatrix || context.correlationMatrix || null;
  const stats = context.performanceReport?.factorStats || context.factorStats || {};
  const id = text(factorId);
  const row = (correlations?.rows || []).find((item) => item.factorId === id);
  let best = null;
  for (const [otherId, cell] of Object.entries(row?.correlations || {})) {
    if (otherId === id) continue;
    const rho = Math.abs(numberOrNull(cell?.rho));
    const otherRankIC = numberOrNull(stats[otherId]?.rankIC);
    const selfRankIC = numberOrNull(liveStats.rankIC);
    if (Number.isFinite(rho) && rho > 0.85 && Number.isFinite(otherRankIC) && (!Number.isFinite(selfRankIC) || Math.abs(otherRankIC) > Math.abs(selfRankIC))) {
      if (!best || rho > best.rho) best = { factorId: otherId, rho, n: Number(cell?.n || 0), otherRankIC, selfRankIC: Number.isFinite(selfRankIC) ? selfRankIC : null };
    }
  }
  return best ? { status: "retirement-recommended", ...best } : { status: "none" };
}

function trialLedgerHasAdmissionEvaluation(registry = {}, specHash = "") {
  const hash = text(specHash);
  if (!hash) return false;
  return (registry.trialLedger?.entries || []).some((entry) => entry.type === "admission-evaluation" && entry.specHash === hash);
}

export function evaluateFactorRegistry(registryInput = {}, context = {}) {
  const registry = normalizeFactorRegistry(registryInput);
  const now = context.now || nowIso();
  const trialEntries = [];
  const transitions = [];
  const factors = registry.factors.map((factor) => {
    if (factor.state === "candidate") {
      const specHash = factor.specHash || factorSpecHash(factor);
      const shouldRecordTrial = !trialLedgerHasAdmissionEvaluation(registry, specHash);
      const evidence = admissionEvidenceForFactor(factor, { ...context, trialCount: registry.trialLedger.count + (shouldRecordTrial ? 1 : 0) });
      if (shouldRecordTrial) {
        trialEntries.push({
          id: compactId("factor-eval"),
          type: "admission-evaluation",
          at: now,
          factorId: factor.factorId,
          specHash,
          actor: context.actor || "system:evaluator",
          accepted: evidence.status === "passed",
          reason: evidence.status === "passed" ? "candidate admitted to shadow" : "candidate gate failed",
          checks: [evidence],
        });
      }
      if (evidence.status === "passed") {
        transitions.push({ factorId: factor.factorId, from: factor.state, to: "shadow", evidence });
        return {
          ...factor,
          state: "shadow",
          evidence: { ...(factor.evidence || {}), admission: evidence, status: "shadow" },
          stateHistory: [{ at: now, from: factor.state, to: "shadow", reason: `mechanical admission gates passed via ${evidence.source}`, actor: context.actor || "system:evaluator" }, ...(factor.stateHistory || [])],
        };
      }
      return { ...factor, evidence: { ...(factor.evidence || {}), latestAdmission: evidence } };
    }
    if (factor.state === "active" || factor.state === "decayed") {
      const decay = decayEvidenceForFactor(factor, context);
      if (decay.status === "decay") {
        transitions.push({ factorId: factor.factorId, from: factor.state, to: "decayed", evidence: decay });
        return {
          ...factor,
          state: "decayed",
          evidence: { ...(factor.evidence || {}), latestDecay: decay },
          stateHistory: [{ at: now, from: factor.state, to: "decayed", reason: "two consecutive trailing 60-outcome windows had non-positive IC and negative weighted contribution", actor: context.actor || "system:evaluator" }, ...(factor.stateHistory || [])],
        };
      }
      if (decay.status === "recover") {
        transitions.push({ factorId: factor.factorId, from: factor.state, to: "shadow", evidence: decay });
        return {
          ...factor,
          state: "shadow",
          evidence: { ...(factor.evidence || {}), latestDecay: decay },
          stateHistory: [{ at: now, from: factor.state, to: "shadow", reason: "decayed factor recovered positive IC", actor: context.actor || "system:evaluator" }, ...(factor.stateHistory || [])],
        };
      }
      return { ...factor, evidence: { ...(factor.evidence || {}), latestDecay: decay } };
    }
    return factor;
  });
  const next = {
    ...registry,
    trialLedger: {
      count: registry.trialLedger.count + trialEntries.length,
      entries: [...trialEntries.reverse(), ...(registry.trialLedger.entries || [])].slice(0, 1000),
    },
    factors,
  };
  return {
    registry: next,
    transitions,
    trialEntries,
    report: {
      schemaVersion: "factor-evaluation-report-v1",
      generatedAt: now,
      llmGovernance: {
        llmWritesScores: false,
        llmWritesWeights: false,
        llmWritesStates: false,
        stateTransitions: "mechanical evaluator or human override only",
      },
      transitions,
      evaluated: factors.length,
      trialEntries: trialEntries.length,
    },
  };
}

export async function evaluateFactorRegistryWithCorpus(registryInput = {}, context = {}) {
  const registry = normalizeFactorRegistry(registryInput);
  const corpusEvidence = { ...(context.corpusEvidence || {}) };
  const corpusDb = context.corpusDb || context.db || context.sqlitePath || null;
  const comparisonFactors = registry.factors.filter((factor) => ["active", "shadow"].includes(factor.state));
  const candidates = registry.factors.filter((factor) => factor.state === "candidate" && !corpusEvidence[factor.factorId]);
  const corpusDiagnostics = [];
  if (corpusDb) {
    const maxFactors = Math.max(1, Number(context.maxCorpusFactors || candidates.length || 1));
    for (const factor of candidates.slice(0, maxFactors)) {
      try {
        corpusEvidence[factor.factorId] = await evaluateFactorSpecOverCorpus(factor.spec, {
          db: corpusDb,
          factor,
          comparisonFactors,
          universe: context.universe,
          dateGrid: context.dateGrid,
          maxDates: context.maxDates || 120,
          maxTickers: context.maxTickers || 80,
          timeoutMs: context.corpusTimeoutMs || context.timeoutMs || 60000,
        });
      } catch (error) {
        corpusEvidence[factor.factorId] = {
          schemaVersion: "factor-corpus-evidence-v1",
          factorId: factor.factorId,
          source: "historical-corpus",
          status: "error",
          n: 0,
          effectiveN: 0,
          error: error.message,
        };
        corpusDiagnostics.push({ factorId: factor.factorId, status: "error", error: error.message });
      }
    }
  } else {
    corpusDiagnostics.push({ status: "skipped", reason: "missing-corpus-db" });
  }
  const result = evaluateFactorRegistry(registry, { ...context, corpusEvidence });
  return {
    ...result,
    corpusEvidence,
    corpusDiagnostics,
    report: {
      ...result.report,
      corpusEvidence: Object.fromEntries(Object.entries(corpusEvidence).map(([factorId, evidence]) => [
        factorId,
        {
          status: evidence.status,
          source: evidence.source,
          n: evidence.n || 0,
          effectiveN: evidence.effectiveN || 0,
          primaryHorizon: evidence.primaryHorizon || null,
          rankIC: Number.isFinite(evidence.rankIC) ? evidence.rankIC : null,
          tStat: Number.isFinite(evidence.tStat) ? evidence.tStat : null,
          coverage: Number.isFinite(evidence.coverage) ? evidence.coverage : null,
        },
      ])),
      corpusDiagnostics,
    },
  };
}

export function appendFactorPostmortem(registryInput = {}, factorId = "", postmortem = {}, options = {}) {
  const registry = normalizeFactorRegistry(registryInput);
  const now = options.now || nowIso();
  const payload = postmortem?.output && typeof postmortem.output === "object" ? postmortem.output : postmortem;
  const lesson = {
    schemaVersion: "factor-postmortem-v1",
    id: compactId("factor-postmortem"),
    at: now,
    factorId: text(factorId || payload.factorId),
    transition: options.transition || null,
    hypothesis: text(payload.hypothesis || ""),
    evidenceShowed: text(payload.evidenceShowed || payload.evidence || ""),
    transferableLesson: text(payload.transferableLesson || payload.lesson || ""),
    tags: Array.isArray(payload.tags) ? payload.tags.map(text).filter(Boolean).slice(0, 10) : [],
    source: text(options.source || "factor_researcher"),
    invoker: text(options.invoker || ""),
    llmGovernance: {
      writesScores: false,
      writesWeights: false,
      writesStates: false,
      purpose: "postmortem narrative memory only",
    },
  };
  const factors = registry.factors.map((factor) => {
    if (factor.factorId !== factorId) return factor;
    return {
      ...factor,
      postMortems: [lesson, ...(Array.isArray(factor.postMortems) ? factor.postMortems : [])].slice(0, 50),
    };
  });
  return {
    registry: {
      ...registry,
      factors,
      memory: {
        schemaVersion: "factor-episodic-memory-v1",
        lessons: [lesson, ...(registry.memory?.lessons || [])].slice(0, 500),
      },
    },
    lesson,
  };
}

export function buildFactorPerformanceReport(registryInput = {}, context = {}) {
  const registry = normalizeFactorRegistry(registryInput);
  const latestRun = context.latestRun || {};
  const factorStats = latestRun.factorStats || context.factorStats || {};
  return {
    schemaVersion: "factor-performance-report-v1",
    generatedAt: nowIso(),
    llmGovernance: {
      llmWritesScores: false,
      llmWritesWeights: false,
      llmWritesStates: false,
      reportSource: "mechanical registry + stored stats",
    },
    registrySummary: {
      total: registry.factors.length,
      byState: registry.factors.reduce((acc, factor) => {
        acc[factor.state] = (acc[factor.state] || 0) + 1;
        return acc;
      }, {}),
      trialCount: registry.trialLedger.count,
      admissionHurdle: {
        schemaVersion: "factor-admission-hurdle-v1",
        trialCount: registry.trialLedger.count,
        formula: "base 3.0 for literature or 3.5 for generated, plus 0.1 per doubling of honest trialCount beyond 8",
        literature: 3.0 + (registry.trialLedger.count > 8 ? Math.floor(Math.log2(registry.trialLedger.count / 8)) * 0.1 : 0),
        generated: 3.5 + (registry.trialLedger.count > 8 ? Math.floor(Math.log2(registry.trialLedger.count / 8)) * 0.1 : 0),
      },
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
