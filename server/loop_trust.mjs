function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mean(values = []) {
  const rows = values.filter(Number.isFinite);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

function metric(value, n, source = "live") {
  return { value: Number.isFinite(value) ? value : null, n: Number(n || 0), source };
}

function ymd(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : raw.slice(0, 10);
}

function daysBetween(a = "", b = "") {
  const start = new Date(`${ymd(a)}T00:00:00.000Z`);
  const end = new Date(`${ymd(b)}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  return Math.max(1, Math.ceil((end - start) / 86400000) + 1);
}

function outcomeIsUsable(row = {}) {
  return Boolean(
    row &&
      row.outcome &&
      row.outcome !== "pending" &&
      row.outcomeUsable !== false &&
      row.outcomeQualityStatus !== "suspect_price" &&
      Number.isFinite(numberOrNull(row.excessPct)),
  );
}

function summarizeOutcomeRows(rows = [], source = "live") {
  const usable = rows.filter(outcomeIsUsable);
  const excessRows = usable.map((row) => numberOrNull(row.excessPct)).filter(Number.isFinite);
  const wins = usable.filter((row) => row.outcome === "win" || numberOrNull(row.excessPct) > 0).length;
  return {
    n: usable.length,
    avgExcessPct: metric(mean(excessRows), usable.length, source),
    hitRate: metric(usable.length ? wins / usable.length : null, usable.length, source),
  };
}

function collectDecisionRows(state = {}) {
  const rows = [...(Array.isArray(state.decisions) ? state.decisions : [])];
  for (const run of Array.isArray(state.runs) ? state.runs : []) {
    for (const key of ["decisions", "buyCandidates", "sellCandidates", "watchBuyCandidates", "holdReviews"]) {
      for (const row of Array.isArray(run?.[key]) ? run[key] : []) {
        if (row?.id) rows.push(row);
      }
    }
  }
  const seen = new Set();
  return rows.filter((row) => {
    const id = String(row?.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function llmCounterfactuals(row = {}) {
  return Array.isArray(row.llmCounterfactuals)
    ? row.llmCounterfactuals
    : Array.isArray(row.llmKnowledgeCounterfactuals)
      ? row.llmKnowledgeCounterfactuals
      : [];
}

export function buildLlmKnowledgeScorecard(db = {}, options = {}) {
  const state = db.allStockAgent && typeof db.allStockAgent === "object" ? db.allStockAgent : {};
  const outcomes = Array.isArray(state.outcomeSnapshots) ? state.outcomeSnapshots : [];
  const outcomeByDecisionId = new Map();
  for (const row of outcomes) {
    const id = String(row?.decisionId || row?.id || "");
    if (id && outcomeIsUsable(row)) outcomeByDecisionId.set(id, row);
  }
  const decisions = collectDecisionRows(state);
  const withLlmDecisions = decisions.filter((row) => llmCounterfactuals(row).length > 0);
  const controlDecisions = decisions.filter((row) => !llmCounterfactuals(row).length);
  const withLlmOutcomes = withLlmDecisions.map((row) => outcomeByDecisionId.get(row.id)).filter(Boolean);
  const controlOutcomes = controlDecisions.map((row) => outcomeByDecisionId.get(row.id)).filter(Boolean);
  const withLlm = summarizeOutcomeRows(withLlmOutcomes, "llm-knowledge-channel");
  const withoutLlm = summarizeOutcomeRows(controlOutcomes, "non-llm-control");
  const minSamples = Math.max(1, Number(options.minSamples || 20));
  const hitRateDelta = Number.isFinite(withLlm.hitRate.value) && Number.isFinite(withoutLlm.hitRate.value)
    ? withLlm.hitRate.value - withoutLlm.hitRate.value
    : null;
  const avgExcessDeltaPct = Number.isFinite(withLlm.avgExcessPct.value) && Number.isFinite(withoutLlm.avgExcessPct.value)
    ? withLlm.avgExcessPct.value - withoutLlm.avgExcessPct.value
    : null;
  return {
    schemaVersion: "llm-knowledge-scorecard-v1",
    generatedAt: options.generatedAt || new Date().toISOString(),
    minSamples,
    status: withLlm.n >= minSamples && withoutLlm.n >= minSamples ? "ready" : "insufficient_evidence",
    applicationCount: withLlmDecisions.length,
    maturedApplicationCount: withLlm.n,
    withLlm,
    withoutLlm,
    deltas: {
      avgExcessPct: metric(avgExcessDeltaPct, Math.min(withLlm.n, withoutLlm.n), "llm-minus-control"),
      hitRate: metric(hitRateDelta, Math.min(withLlm.n, withoutLlm.n), "llm-minus-control"),
    },
    channels: withLlmDecisions
      .flatMap((row) => llmCounterfactuals(row).map((item) => item.channel || item.source || "unknown"))
      .reduce((acc, key) => {
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    note: "LLM channel scorecard is measurement-only; it never writes factor scores, gates, weights, or skill JSON.",
  };
}

function recentDailyRate(rows = [], dateKey = "generatedAt", lookbackDays = 14, now = new Date()) {
  const today = ymd(now.toISOString());
  const cutoff = new Date(`${today}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - Math.max(1, lookbackDays) + 1);
  const count = rows.filter((row) => {
    const day = ymd(row?.[dateKey] || row?.evaluatedAt || row?.decisionAt || row?.createdAt);
    return day && new Date(`${day}T00:00:00.000Z`) >= cutoff;
  }).length;
  return count / Math.max(1, lookbackDays);
}

function channelRow({ id, label, samples, minSamples, dailyRate, source }) {
  const remaining = Math.max(0, Number(minSamples || 0) - Number(samples || 0));
  const daysToMinSamples = remaining <= 0
    ? 0
    : dailyRate > 0
      ? Math.ceil(remaining / dailyRate)
      : null;
  return {
    id,
    label,
    samples: Number(samples || 0),
    minSamples: Number(minSamples || 0),
    dailyRate: Number.isFinite(dailyRate) ? Number(dailyRate.toFixed(3)) : null,
    daysToMinSamples,
    status: remaining <= 0 ? "ready" : dailyRate > 0 ? "accruing" : "stalled",
    source,
  };
}

export function buildGoLiveLearningStatus(db = {}, options = {}) {
  const state = db.allStockAgent && typeof db.allStockAgent === "object" ? db.allStockAgent : {};
  const outcomes = (Array.isArray(state.outcomeSnapshots) ? state.outcomeSnapshots : []).filter(outcomeIsUsable);
  const llmScorecard = options.llmScorecard || buildLlmKnowledgeScorecard(db, options.llm || {});
  const shadowDebates = Array.isArray(state.shadowDebates) ? state.shadowDebates : [];
  const registry = db.factorRegistry && typeof db.factorRegistry === "object" ? db.factorRegistry : {};
  const factorRows = Array.isArray(registry.factors) ? registry.factors : [];
  const factorResearchRows = factorRows.filter((row) => String(row.createdBy || row.source || "").includes("factor_researcher"));
  const switches = (options.switches || []).map((item) => ({
    key: item.key,
    label: item.label || item.key,
    enabled: Boolean(item.enabled),
    configured: item.configured === undefined ? Boolean(item.enabled) : Boolean(item.configured),
    status: item.enabled || item.configured ? "on" : "off",
    detail: item.detail || "",
  }));
  const channels = [
    channelRow({
      id: "liveRecommendationOutcomes",
      label: "实盘/纸面推荐 outcome",
      samples: outcomes.length,
      minSamples: options.minOutcomeSamples || 50,
      dailyRate: recentDailyRate(outcomes, "evaluatedAt", 14, options.now || new Date()),
      source: "allStockAgent.outcomeSnapshots",
    }),
    channelRow({
      id: "llmKnowledgeChannel",
      label: "LLM 影子知识通道",
      samples: llmScorecard.maturedApplicationCount || 0,
      minSamples: llmScorecard.minSamples || 20,
      dailyRate: recentDailyRate(
        outcomes.filter((row) => {
          const decision = collectDecisionRows(state).find((item) => item.id === row.decisionId);
          return decision && llmCounterfactuals(decision).length > 0;
        }),
        "evaluatedAt",
        14,
        options.now || new Date(),
      ),
      source: "llmCounterfactuals + outcomeSnapshots",
    }),
    channelRow({
      id: "shadowDebates",
      label: "每日 shadow debate",
      samples: shadowDebates.length,
      minSamples: options.minShadowDebates || 50,
      dailyRate: recentDailyRate(shadowDebates, "generatedAt", 14, options.now || new Date()),
      source: "allStockAgent.shadowDebates",
    }),
    channelRow({
      id: "factorResearcher",
      label: "因子研究员提案",
      samples: factorResearchRows.length,
      minSamples: options.minFactorResearcherSamples || 3,
      dailyRate: recentDailyRate(factorResearchRows, "createdAt", 30, options.now || new Date()),
      source: "factorRegistry.factors",
    }),
  ];
  const offSwitches = switches.filter((item) => item.status === "off");
  return {
    schemaVersion: "go-live-learning-status-v1",
    generatedAt: options.generatedAt || new Date().toISOString(),
    switches,
    channels,
    summary: offSwitches.length
      ? `${offSwitches.length} 个学习关键开关未启用；样本时钟会变慢。`
      : "学习关键开关均已启用；继续观察样本 accrual。",
    minSamplePolicy: "No metric is promoted without sample count; LLM channel is measurement-only until evidence gates pass.",
  };
}
