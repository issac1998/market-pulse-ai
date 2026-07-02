#!/usr/bin/env python3
import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from harness.invoker import build_invoker  # noqa: E402


EVAL_CASES = [
    {
        "id": "earnings_memo_mu",
        "tier": "standard",
        "title": "财报/指引摘要",
        "system": (
            "你是美股投研评估 agent。只根据输入材料输出中文 JSON，不调用外部工具，不编造输入外的数字。"
            "输出字段：summary, thesis, risks, watchItems, actionBias, evidenceIds。"
        ),
        "user": {
            "ticker": "MU",
            "company": "Micron Technology",
            "materials": [
                {"id": "quote", "text": "股价盘后上涨 13.2%，成交量为 20 日均量的 2.4 倍。"},
                {"id": "earnings", "text": "最新季度收入 88.5 亿美元，同比 +61%；调整后 EPS 2.81 美元。"},
                {"id": "guidance", "text": "公司指引下一季度收入中值 104 亿美元，市场一致预期 98 亿美元。"},
                {"id": "business", "text": "HBM 与数据中心 DRAM 需求强，管理层称 2026 年 HBM 产能已基本售罄。"},
                {"id": "risk", "text": "NAND 价格恢复慢，资本开支上行可能压制自由现金流。"},
            ],
            "question": "请生成一段能放进个股日报的中文投资观察，强调哪些事实最重要。",
        },
        "required_terms": ["88.5", "61", "2.81", "104", "HBM", "NAND"],
        "risk_terms": ["NAND", "资本开支", "现金流"],
    },
    {
        "id": "social_heat_asml",
        "tier": "standard",
        "title": "社交热度原因解释",
        "system": (
            "你是社交热议股票解释器。只根据输入材料输出中文 JSON，不调用外部工具，不臆造新闻。"
            "输出字段：whyHot, businessContext, debate, risk, evidenceIds。"
        ),
        "user": {
            "ticker": "ASML",
            "social": {
                "mentions24h": 114,
                "uniqueUsers": 88,
                "positivePct": 54,
                "negativePct": 46,
                "keywords": ["machines", "china", "euv", "machine", "engineer"],
            },
            "company": {
                "business": "EUV/DUV 光刻设备，客户包括台积电、三星、英特尔等先进制程晶圆厂。",
                "supplyChain": "上游依赖 Zeiss 光学、精密零部件与高端供应链；下游是先进逻辑与存储晶圆厂 capex。",
            },
            "news": [
                {"id": "export", "text": "市场讨论点集中在对华出口限制可能影响部分 DUV/EUV 设备出货节奏。"},
                {"id": "capex", "text": "AI 芯片需求带动先进制程扩产，晶圆厂 capex 预期影响 ASML 订单。"},
            ],
        },
        "required_terms": ["EUV", "DUV", "中国", "出口", "晶圆厂", "capex"],
        "risk_terms": ["出口限制", "capex", "订单"],
    },
    {
        "id": "review_attribution_meta",
        "tier": "reasoning",
        "title": "事后复盘归因",
        "system": (
            "你是交易复盘归因师。只根据输入材料输出中文 JSON，不调用外部工具，不给新的买卖指令。"
            "输出字段：outcomeLabel, attribution, whatWorked, whatFailed, lesson, tags。"
            "必须用相对基准超额收益判断成败。"
        ),
        "user": {
            "decision": {
                "ticker": "META",
                "side": "buy",
                "entryDate": "2026-06-24",
                "entryPrice": 700,
                "thesis": "AI 广告工具提升转化率，技术面上穿 20 日线。",
            },
            "outcomeT5": {
                "stockReturnPct": 2.0,
                "benchmarkBasket": [{"ticker": "QQQ", "weight": 0.7, "returnPct": 3.5}, {"ticker": "SPY", "weight": 0.3, "returnPct": 2.8}],
                "excessReturnPct": -1.29,
                "maePct": -3.2,
                "mfePct": 4.1,
            },
            "factorStats": {
                "momentum": {"samples": 34, "rankIC": 0.09},
                "newsCatalyst": {"samples": 18, "rankIC": -0.03},
            },
        },
        "required_terms": ["-1.29", "超额", "QQQ", "SPY", "MAE", "MFE"],
        "risk_terms": ["基准", "beta", "alpha", "样本"],
    },
]


def first_json_object(text):
    start = (text or "").find("{")
    if start < 0:
        return ""
    depth = 0
    in_string = False
    escape = False
    for idx in range(start, len(text)):
        ch = text[idx]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : idx + 1]
    return ""


def parse_json_output(text):
    for candidate in ((text or "").strip(), first_json_object(text)):
        if not candidate:
            continue
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload
    return None


def flatten_text(value):
    if isinstance(value, dict):
        return " ".join(flatten_text(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(flatten_text(item) for item in value)
    return str(value or "")


def score_output(case, text, elapsed_ms, error=""):
    parsed = parse_json_output(text)
    body = flatten_text(parsed if parsed is not None else text)
    score = 0
    checks = {}
    checks["returned"] = bool((text or "").strip()) and not error
    checks["jsonValid"] = isinstance(parsed, dict)
    checks["chinese"] = len(re.findall(r"[\u4e00-\u9fff]", body)) >= 30
    checks["requiredEvidenceHits"] = sum(1 for term in case["required_terms"] if term.lower() in body.lower())
    checks["riskHits"] = sum(1 for term in case["risk_terms"] if term.lower() in body.lower())
    checks["concise"] = len(body) <= 1600
    checks["notOverDirective"] = not re.search(r"立即买入|必须买入|保证|稳赚|确定会涨", body)
    checks["latencyMs"] = elapsed_ms
    if checks["returned"]:
        score += 10
    if checks["jsonValid"]:
        score += 20
    if checks["chinese"]:
        score += 15
    score += min(30, checks["requiredEvidenceHits"] * 5)
    score += min(15, checks["riskHits"] * 5)
    if checks["concise"]:
        score += 5
    if checks["notOverDirective"]:
        score += 5
    return {
        "score": score,
        "checks": checks,
        "parsed": parsed,
        "text": text,
        "error": error,
    }


def run_case(provider_name, case, timeout_ms):
    invoker = build_invoker(provider_name)
    user = "INPUT_JSON:\n%s" % json.dumps(case["user"], ensure_ascii=False, indent=2)
    started = time.time()
    try:
        result = invoker.invoke(case["system"], user, tier=case["tier"], timeout_ms=timeout_ms)
        elapsed_ms = int((time.time() - started) * 1000)
        scored = score_output(case, result.text, elapsed_ms)
        scored.update({"provider": provider_name, "providerRaw": result.provider, "elapsedMs": elapsed_ms})
        return scored
    except Exception as exc:
        elapsed_ms = int((time.time() - started) * 1000)
        scored = score_output(case, "", elapsed_ms, str(exc))
        scored.update({"provider": provider_name, "providerRaw": "", "elapsedMs": elapsed_ms})
        return scored


def markdown_report(payload):
    lines = [
        "# LLM Invoker 质量对比报告",
        "",
        f"- 生成时间：{payload['generatedAt']}",
        f"- Providers：{', '.join(payload['providers'])}",
        f"- 样本数：{len(payload['cases'])}",
        "",
        "## 总结",
        "",
    ]
    totals = {}
    for provider in payload["providers"]:
        rows = [row for row in payload["results"] if row["provider"] == provider]
        if rows:
            totals[provider] = {
                "avgScore": round(sum(row["score"] for row in rows) / len(rows), 1),
                "avgLatencyMs": round(sum(row["elapsedMs"] for row in rows) / len(rows)),
                "errors": sum(1 for row in rows if row.get("error")),
            }
    winner = ""
    if totals:
        winner = max(totals, key=lambda key: (totals[key]["avgScore"], -totals[key]["avgLatencyMs"]))
    for provider, row in totals.items():
        lines.append(f"- `{provider}`：平均分 {row['avgScore']}，平均耗时 {row['avgLatencyMs']}ms，错误 {row['errors']}。")
    if winner:
        lines.append(f"- 当前样本下综合胜出：`{winner}`。")
    lines.extend(["", "## 明细", ""])
    for case in payload["cases"]:
        lines.append(f"### {case['title']}（{case['id']}）")
        for row in [item for item in payload["results"] if item["caseId"] == case["id"]]:
            checks = row["checks"]
            lines.append(
                f"- `{row['provider']}`：score={row['score']}，elapsed={row['elapsedMs']}ms，"
                f"json={checks['jsonValid']}，证据命中={checks['requiredEvidenceHits']}，风险命中={checks['riskHits']}。"
            )
            if row.get("error"):
                lines.append(f"  - 错误：`{row['error'][:220]}`")
            else:
                preview = flatten_text(row.get("parsed") or row.get("text", "")).replace("\n", " ")[:420]
                lines.append(f"  - 摘要预览：{preview}")
        lines.append("")
    lines.extend([
        "## 评估口径",
        "",
        "- JSON 合规：输出必须能被 agent runtime 解析为 JSON。",
        "- 证据引用：必须复用输入里的关键数字、公司/业务/事件线索。",
        "- 风险覆盖：必须提到输入中的主要风险或基准约束。",
        "- 可操作性：要求形成研究结论、验证清单或归因，但不得给保证收益或强制买卖指令。",
        "- 延迟：只记录，不直接扣分；因为不同 provider 的默认模型/推理档可能不同。",
        "",
    ])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Compare harness LLM invokers on fixed investment-analysis prompts.")
    parser.add_argument("--providers", default="codex-cli,agy-cli")
    parser.add_argument("--timeout-ms", type=int, default=300000)
    parser.add_argument("--json-out", default="data/llm_invoker_eval_latest.json")
    parser.add_argument("--report-out", default="docs/LLM_INVOKER_EVAL_REPORT.md")
    args = parser.parse_args()
    providers = [item.strip() for item in args.providers.split(",") if item.strip()]
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "providers": providers,
        "cases": [{"id": case["id"], "title": case["title"], "tier": case["tier"]} for case in EVAL_CASES],
        "results": [],
    }
    for case in EVAL_CASES:
        for provider in providers:
            row = run_case(provider, case, args.timeout_ms)
            row["caseId"] = case["id"]
            row["caseTitle"] = case["title"]
            payload["results"].append(row)
            print(
                "%s %s score=%s elapsed=%sms error=%s"
                % (case["id"], provider, row["score"], row["elapsedMs"], bool(row.get("error"))),
                flush=True,
            )
    json_path = REPO_ROOT / args.json_out
    report_path = REPO_ROOT / args.report_out
    json_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    report_path.write_text(markdown_report(payload), encoding="utf-8")
    print("wrote %s" % json_path)
    print("wrote %s" % report_path)


if __name__ == "__main__":
    main()
