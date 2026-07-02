from ..agents.loader import load_agent
from ..memory.base import MemoryItem
from ..runtime.loop import run_agent_loop


def _used_cross_ticker_review(trace, ticker):
    if not ticker:
        return False
    for step in getattr(trace, "steps", []) or []:
        if step.get("kind") != "tool_call":
            continue
        if step.get("tool") not in ("get_recent_decisions", "get_decision_outcomes"):
            continue
        args = step.get("args") or {}
        if "ticker" in args and not str(args.get("ticker") or "").strip():
            return True
    return False


def run_review(ticker, ctx, decision_id=""):
    task = {"ticker": str(ticker or "").upper(), "decisionId": decision_id or ""}
    result = run_agent_loop(load_agent("review_attributor"), task, ctx)
    out = result.output or {}
    if _used_cross_ticker_review(result.trace, task["ticker"]):
        out = {
            "outcomeLabel": "insufficient_data",
            "attribution": "unknown",
            "whatWorked": [],
            "whatFailed": ["指定 ticker 暂无可复盘 outcome；已阻止复盘 Agent 借用其他股票或全市场样本。"],
            "lesson": "等待 T+N 追责数据；在该 ticker outcome 生成前，不沉淀可迁移交易教训。",
            "tags": ["pending", "ticker-boundary"],
        }
        result.output = out
    lesson = out.get("lesson")
    outcome_label = str(out.get("outcomeLabel") or "").lower()
    if lesson and ctx.memory and outcome_label not in ("pending", "insufficient_data"):
        ctx.memory.write_episodic(
            MemoryItem(
                kind="episodic",
                ticker=task["ticker"],
                lesson=lesson,
                sourceDecisionId=decision_id or "",
                outcome=out.get("outcomeLabel", ""),
                tags=out.get("tags") or [],
            )
        )
    return {"review": out, "trace": result.trace.to_dict()}
