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
        ("factor_researcher", "你是 Market Pulse AI 的因子研究员"),
        ("trader_mirror", "你是 Market Pulse AI 的操作画像叙述员"),
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
        if role == "trader_mirror":
            payload = {
                "action": "final",
                "schemaVersion": "trader-mirror-report-v1",
                "styleNarrative": "mock 画像叙述：当前只验证 Trader Mirror 输出协议，不代表真实交易风格。",
                "habits": [
                    {
                        "title": "样本纪律",
                        "observation": "mock 引用 results.roundTrips，n=0；样本不足时只能提示继续积累。",
                        "metricIds": ["results.roundTrips"],
                        "n": 0,
                    }
                ],
                "resultsSummary": "mock 结果摘要：没有足够样本，不生成真实结论。",
                "coachingInstructions": [
                    {
                        "rule": "如果闭合交易段不足 20，则只记录交易并等待样本成熟。",
                        "why": "results.roundTrips n=0，未达到画像门槛。",
                        "metricIds": ["results.roundTrips"],
                        "n": 0,
                    }
                ],
                "disclaimers": [
                    "该报告只做交易行为复盘，不构成投资建议。",
                    "LLM 只负责叙述，不写入任何评分、门控或权重。",
                ],
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
            elif role == "factor_researcher":
                tool = "get_factor_performance_report"
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
        elif role == "factor_researcher":
            user_text = user or ""
            if "postmortem" in user_text.lower():
                payload = {
                    "action": "final",
                    "schemaVersion": "factor-postmortem-v1",
                    "factorId": ticker if ticker != "NVDA" else "activeDecayFixture",
                    "hypothesis": "mock 因子假设用于验证 postmortem ingest 链路。",
                    "evidenceShowed": "mock 工具结果显示该因子进入降级复盘流程。",
                    "transferableLesson": "因子降级后只沉淀可迁移教训，不由 LLM 改状态、分数或权重。",
                    "tags": ["mock", "factor-postmortem"],
                }
            else:
                payload = {
                    "action": "final",
                    "schemaVersion": "factor-proposal-v1",
                    "proposals": [
                        {
                            "factorId": "volumeAccumulation63",
                            "family": "smartMoney",
                            "hypothesis": "成交量在中期窗口持续累积时，可能代表增量资金关注，预期 20/60 日超额收益为正；若 RankIC 在多个 regime 不为正则证伪。",
                            "expectedSign": 1,
                            "horizons": [20, 60],
                            "novelty": "mock 提案引用 correlation matrix：不同于 week52HighProximity 的纯价格位置，使用成交量累积，不替换现有因子，仅进入 shadow 前候选观察。",
                            "replacesFactorId": "",
                            "spec": {
                                "schemaVersion": "factor-spec-v1",
                                "factorId": "volumeAccumulation63",
                                "family": "smartMoney",
                                "hypothesis": "成交量在中期窗口持续累积时，可能代表增量资金关注，预期 20/60 日超额收益为正；若 RankIC 在多个 regime 不为正则证伪。",
                                "expectedSign": 1,
                                "horizons": [20, 60],
                                "pipeline": [
                                    {"op": "ref", "input": "bars.volume"},
                                    {"op": "ts_sum", "window": 63},
                                    {"op": "ts_rank", "window": 126},
                                ],
                            },
                        }
                    ],
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
