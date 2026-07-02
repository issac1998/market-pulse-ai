import json
import re

from .base import LlmResult


def _ticker_from_text(text):
    match = re.search(r'"ticker"\s*:\s*"([A-Za-z0-9.\-]+)"', text or "")
    if match:
        return match.group(1).upper()
    match = re.search(r"\b([A-Z]{1,5}(?:\.[A-Z]{1,3})?)\b", text or "")
    return (match.group(1) if match else "NVDA").upper()


def _has_tool_result(text):
    return "TOOL_RESULT" in (text or "")


def _role_from_system(system):
    text = system or ""
    checks = [
        ("chat", "你是 Market Pulse AI 的聊天分析师"),
        ("review", "你是 Market Pulse AI 的复盘归因师"),
        ("bull", "你是 Market Pulse AI 的多方研究员"),
        ("bear", "你是 Market Pulse AI 的空方研究员"),
        ("risk", "你是 Market Pulse AI 的风险经理"),
        ("coordinator", "你是 Market Pulse AI 的辩论协调者"),
    ]
    for role, needle in checks:
        if needle in text:
            return role
    if "trading-agents-llm-v2" in text:
        return "coordinator"
    return "chat"


class MockInvoker:
    """Deterministic offline invoker for smoke tests and provider fallback."""

    def invoke(self, system, user, tier="standard", timeout_ms=None):
        joined = "%s\n%s" % (system or "", user or "")
        ticker = _ticker_from_text(joined)
        role = _role_from_system(system)
        if role == "coordinator":
            payload = {
                "schemaVersion": "trading-agents-llm-v2",
                "framework": "Python harness mock 多轮辩论",
                "ticker": ticker,
                "agents": [],
                "debateRounds": [],
                "finalDecision": {
                    "action": "信息不足：保持观察",
                    "riskVeto": False,
                    "confidence": 55,
                    "rationale": ["mock 汇总：已验证协调者输出兼容字段。"],
                },
            }
            return LlmResult(json.dumps(payload, ensure_ascii=False), "mock:%s" % tier)

        if not _has_tool_result(joined):
            if role == "chat":
                tool = "get_stock_snapshot"
                args = {"ticker": ticker}
            elif role == "review":
                tool = "get_decision_outcomes"
                args = {"ticker": ticker, "limit": 5}
            elif role == "bull":
                tool = "get_stock_snapshot"
                args = {"ticker": ticker}
            elif role == "bear":
                tool = "get_news_catalyst"
                args = {"ticker": ticker}
            elif role == "risk":
                tool = "get_macro_regime"
                args = {}
            else:
                tool = "get_stock_snapshot"
                args = {"ticker": ticker}
            payload = {"action": "call_tool", "thought": "mock 先取一个可核验数据块。", "tool": tool, "args": args}
            return LlmResult(json.dumps(payload, ensure_ascii=False), "mock:%s" % tier)

        if role == "chat":
            payload = {
                "action": "final",
                "answer": "%s 的 mock 回答：工具调用链路已跑通，结果仅用于 smoke test。" % ticker,
                "sources": ["mock-tool-result"],
            }
        elif role == "review":
            payload = {
                "action": "final",
                "outcomeLabel": "neutral",
                "attribution": "insufficient-data",
                "whatWorked": ["mock 已完成 outcome 工具链路验证。"],
                "whatFailed": ["真实归因需要已到期的 outcome 样本。"],
                "lesson": "%s 的复盘需用超额收益、MAE/MFE 与原始 thesis 同时验证。" % ticker,
                "tags": ["mock", "review"],
            }
        elif role == "risk":
            payload = {
                "action": "final",
                "riskVeto": False,
                "disagreement": False,
                "severity": "low",
                "rationale": ["mock 已读取宏观/风险工具结果，未触发硬否决。"],
            }
        elif role == "bear":
            payload = {
                "action": "final",
                "stance": "中性偏空",
                "confidence": 52,
                "argument": "%s 的 mock 空方结论：已验证新闻催化工具链路，真实运行需基于返回新闻正文判断风险。" % ticker,
                "evidence": ["get_news_catalyst 已返回工具结果。"],
                "risks": ["mock 不代表真实投资结论。"],
            }
        elif role == "bull":
            payload = {
                "action": "final",
                "stance": "中性偏多",
                "confidence": 58,
                "argument": "%s 的 mock 多方结论：已验证行情快照工具链路，真实运行需结合研究包和新闻正文。" % ticker,
                "evidence": ["get_stock_snapshot 已返回工具结果。"],
                "risks": ["mock 不代表真实投资结论。"],
            }
        else:
            payload = {"action": "final", "answer": "%s 的 mock 回答：工具调用链路已跑通。" % ticker, "sources": ["mock"]}
        return LlmResult(json.dumps(payload, ensure_ascii=False), "mock:%s" % tier)
