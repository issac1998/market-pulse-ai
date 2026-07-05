from ..agents.loader import load_agent
from ..config import DEBATE_PERSONA_AGENT_IDS
from ..runtime.loop import run_agent_loop
from ..runtime.trace import utc_now_iso


def _agent_row(role, name, result):
    out = result.output or {}
    return {
        "role": role,
        "name": name,
        "stance": out.get("stance") or out.get("severity") or ("风险复核" if role == "risk" else "证据不足"),
        "confidence": out.get("confidence", 50),
        "view": out.get("argument") or "; ".join(out.get("rationale") or []) or out.get("answer") or "",
        "evidence": out.get("evidence") or out.get("rationale") or [],
    }


def _fallback_payload(ticker, bull, bear, risk):
    risk_veto = bool((risk.output or {}).get("riskVeto"))
    action = "风险经理否决：先补证据" if risk_veto else "信息不足：保持观察"
    return {
        "schemaVersion": "trading-agents-llm-v2",
        "framework": "Python harness 多轮 LLM 辩论（fallback 汇总）",
        "ticker": ticker,
        "generatedAt": utc_now_iso(),
        "agents": [
            _agent_row("bull", "多方研究员", bull),
            _agent_row("bear", "空方研究员", bear),
            _agent_row("risk", "风险经理", risk),
        ],
        "debateRounds": [
            {"title": "多方研究员", "speaker": "多方研究员", "stance": (bull.output or {}).get("stance", ""), "argument": (bull.output or {}).get("argument", "")},
            {"title": "空方研究员", "speaker": "空方研究员", "stance": (bear.output or {}).get("stance", ""), "argument": (bear.output or {}).get("argument", "")},
            {"title": "风险经理复核", "speaker": "风险经理", "stance": (risk.output or {}).get("severity", ""), "argument": "; ".join((risk.output or {}).get("rationale") or [])},
        ],
        "finalDecision": {
            "action": action,
            "riskVeto": risk_veto,
            "confidence": 52,
            "rationale": ["fallback 汇总：保留兼容字段，供 shadow 门控读取。"],
        },
    }


def run_debate(ticker, ctx):
    ticker = str(ticker or "").upper()
    bull = run_agent_loop(load_agent("bull_researcher"), {"ticker": ticker}, ctx)
    bear = run_agent_loop(load_agent("bear_researcher"), {"ticker": ticker}, ctx)
    risk = run_agent_loop(load_agent("risk_manager"), {"ticker": ticker, "bull": bull.output, "bear": bear.output}, ctx)
    coordinator = run_agent_loop(
        load_agent("coordinator"),
        {"ticker": ticker, "bull": bull.output, "bear": bear.output, "risk": risk.output},
        ctx,
    )
    final = coordinator.output if isinstance(coordinator.output, dict) else {}
    if not final.get("finalDecision"):
        final = _fallback_payload(ticker, bull, bear, risk)
    final.setdefault("schemaVersion", "trading-agents-llm-v2")
    final.setdefault("framework", "Python harness 多轮 LLM 辩论（可选 agy-cli/codex-cli/mock），工具取证")
    final.setdefault("ticker", ticker)
    persona_rows = []
    persona_traces = []
    for persona_id in DEBATE_PERSONA_AGENT_IDS:
        spec = load_agent(persona_id)
        result = run_agent_loop(spec, {"ticker": ticker, "bull": bull.output, "bear": bear.output, "risk": risk.output}, ctx)
        persona_rows.append(_agent_row("persona", spec.name, result))
        persona_traces.append(result.trace.to_dict())
    final["traces"] = [bull.trace.to_dict(), bear.trace.to_dict(), risk.trace.to_dict(), coordinator.trace.to_dict(), *persona_traces]
    if not final.get("agents"):
        final["agents"] = [
            _agent_row("bull", "多方研究员", bull),
            _agent_row("bear", "空方研究员", bear),
            _agent_row("risk", "风险经理", risk),
        ]
    final["agents"].extend(persona_rows)
    if not final.get("debateRounds"):
        final["debateRounds"] = _fallback_payload(ticker, bull, bear, risk)["debateRounds"]
    for row in persona_rows:
        final["debateRounds"].append({
            "title": row["name"],
            "speaker": row["name"],
            "stance": row["stance"],
            "argument": row["view"],
        })
    if persona_rows:
        final["personaConfig"] = {
            "enabled": True,
            "agentIds": DEBATE_PERSONA_AGENT_IDS,
            "defaultOff": True,
            "note": "Persona checklists are narrative-only and cannot override factor gates or risk vetoes.",
        }
    return final
