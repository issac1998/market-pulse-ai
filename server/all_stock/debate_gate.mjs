export function allStockAgentDebateGate(ctx = {}, helpers = {}) {
  const { normalizeDisplayText = (value) => String(value || ""), numberOrNull = Number, formatReportNumber = String } = helpers;
  const decision = ctx.agentDebate?.finalDecision || null;
  if (!decision) return null;
  const action = normalizeDisplayText(decision.action || "");
  const rationale = (decision.rationale || []).map(normalizeDisplayText).filter(Boolean).slice(0, 2).join("；");
  const confidence = numberOrNull(decision.confidence);
  const riskVeto = Boolean(decision.riskVeto) || /风险经理否决|否决/i.test(action);
  const disagreement = /多空分歧|等待确认/i.test(action);
  if (!riskVeto && !disagreement) return null;
  return {
    id: riskVeto ? "debate_risk_veto_shadow" : "debate_disagreement_shadow",
    label: riskVeto ? "多智能体风险经理否决（影子闸门）" : "多智能体多空分歧（影子闸门）",
    condition: riskVeto ? "debate_risk_veto_shadow" : "debate_disagreement_shadow",
    action: riskVeto ? "shadow_cap_buy" : "shadow_downweight",
    severity: riskVeto ? "high" : "medium",
    evidence:
      rationale ||
      [
        action || "多智能体合议未放行正式买入。",
        Number.isFinite(confidence) ? `合议置信度 ${formatReportNumber(confidence, 0)}。` : "",
      ].filter(Boolean).join(" "),
  };
}

export function applyAllStockAgentShadowGates(buyScore, shadowGates = [], buyThreshold = 64) {
  let score = Number.isFinite(buyScore) ? buyScore : 0;
  const penalties = [];
  for (const gate of shadowGates || []) {
    if (gate.action === "shadow_cap_buy") {
      const nextScore = Math.min(score - 8, buyThreshold - 1);
      penalties.push({ id: gate.id, label: gate.label, penalty: score - nextScore });
      score = nextScore;
    } else if (gate.action === "shadow_downweight") {
      score -= 4;
      penalties.push({ id: gate.id, label: gate.label, penalty: 4 });
    }
  }
  return {
    score: Math.max(0, Math.round(score)),
    penalties,
  };
}
