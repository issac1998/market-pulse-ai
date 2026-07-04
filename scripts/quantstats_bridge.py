#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any


def number(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def metric(value: float | None, n: int, source: str) -> dict[str, Any]:
    return {"value": value if value is not None and math.isfinite(value) else None, "n": n, "source": source}


def mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def std(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    avg = mean(values) or 0.0
    return math.sqrt(sum((value - avg) ** 2 for value in values) / (len(values) - 1))


def max_drawdown(returns_pct: list[float]) -> float:
    equity = 1.0
    peak = 1.0
    drawdown = 0.0
    for value in returns_pct:
        equity *= 1 + value / 100
        if equity > peak:
            peak = equity
        if peak > 0:
            drawdown = min(drawdown, (equity / peak - 1) * 100)
    return drawdown


def native_metrics(returns_pct: list[float], benchmark_pct: list[float]) -> dict[str, Any]:
    n = len(returns_pct)
    avg = mean(returns_pct)
    vol = std(returns_pct)
    downside = std([value for value in returns_pct if value < 0])
    excess = [
        value - benchmark_pct[index]
        for index, value in enumerate(returns_pct)
        if index < len(benchmark_pct) and math.isfinite(value) and math.isfinite(benchmark_pct[index])
    ]
    avg_excess = mean(excess)
    wins = len([value for value in returns_pct if value > 0])
    losses = len([value for value in returns_pct if value < 0])
    positive = [value for value in returns_pct if value > 0]
    negative = [value for value in returns_pct if value < 0]
    profit = sum(positive)
    loss = abs(sum(negative))
    annual_scale = math.sqrt(252)
    return {
        "n": n,
        "avgReturnPct": metric(avg, n, "native-python"),
        "avgExcessPct": metric(avg_excess, len(excess), "native-python"),
        "sharpe": metric((avg / vol) * annual_scale if avg is not None and vol and vol > 0 else None, n, "native-python"),
        "sortino": metric((avg / downside) * annual_scale if avg is not None and downside and downside > 0 else None, n, "native-python"),
        "volatility": metric(vol, n, "native-python"),
        "maxDrawdown": metric(max_drawdown(returns_pct), n, "native-python"),
        "hitRate": metric(wins / n if n else None, n, "native-python"),
        "payoff": metric((mean(positive) or 0) / abs(mean(negative) or 0) if positive and negative else None, n, "native-python"),
        "profitFactor": metric(profit / loss if loss > 0 else None, n, "native-python"),
        "losses": losses,
        "wins": wins,
    }


def parse_returns(payload: dict[str, Any]) -> tuple[list[float], list[float]]:
    rows = payload.get("daily") or payload.get("returns") or []
    returns: list[float] = []
    benchmark: list[float] = []
    for row in rows:
        if isinstance(row, dict):
            value = number(row.get("returnPct") if row.get("returnPct") is not None else row.get("avgExcessPct"))
            bench = number(row.get("benchmarkReturnPct") or row.get("benchmarkPct") or 0)
        else:
            value = number(row)
            bench = 0.0
        if value is not None:
            returns.append(value)
            benchmark.append(bench or 0.0)
    return returns, benchmark


def maybe_quantstats_metrics(returns_pct: list[float], benchmark_pct: list[float]) -> tuple[dict[str, Any] | None, str]:
    try:
        import pandas as pd  # type: ignore
        import quantstats as qs  # type: ignore
    except Exception as exc:
        return None, f"quantstats unavailable: {type(exc).__name__}: {exc}"
    returns = pd.Series([value / 100 for value in returns_pct])
    benchmark = pd.Series([value / 100 for value in benchmark_pct]) if benchmark_pct else None
    n = int(returns.count())
    try:
        metrics = {
            "n": n,
            "sharpe": metric(float(qs.stats.sharpe(returns)), n, "quantstats"),
            "sortino": metric(float(qs.stats.sortino(returns)), n, "quantstats"),
            "maxDrawdown": metric(float(qs.stats.max_drawdown(returns)) * 100, n, "quantstats"),
            "volatility": metric(float(qs.stats.volatility(returns)) * 100, n, "quantstats"),
            "avgReturnPct": metric(float(returns.mean()) * 100, n, "quantstats"),
            "avgExcessPct": metric(float((returns - benchmark).mean()) * 100 if benchmark is not None and len(benchmark) == len(returns) else None, n, "quantstats"),
        }
        return metrics, ""
    except Exception as exc:
        return None, f"quantstats failed: {type(exc).__name__}: {exc}"


def main() -> int:
    payload = json.load(sys.stdin)
    returns_pct, benchmark_pct = parse_returns(payload)
    native = native_metrics(returns_pct, benchmark_pct)
    quantstats_metrics, degradation = maybe_quantstats_metrics(returns_pct, benchmark_pct)
    html_path = None
    if quantstats_metrics and payload.get("htmlPath"):
        try:
            import pandas as pd  # type: ignore
            import quantstats as qs  # type: ignore

            out = Path(str(payload["htmlPath"]))
            out.parent.mkdir(parents=True, exist_ok=True)
            qs.reports.html(pd.Series([value / 100 for value in returns_pct]), output=str(out), title="Market Pulse Historical Backtest")
            html_path = str(out)
        except Exception as exc:
            degradation = f"{degradation}; html failed: {type(exc).__name__}: {exc}" if degradation else f"html failed: {type(exc).__name__}: {exc}"
    engine = "quantstats" if quantstats_metrics else "native-python"
    result = {
        "ok": True,
        "schemaVersion": "quantstats-bridge-v1",
        "engine": engine,
        "preferredAvailable": bool(quantstats_metrics),
        "metrics": quantstats_metrics or native,
        "nativeMetrics": native,
        "htmlPath": html_path,
        "degradation": degradation,
    }
    print(json.dumps(result, ensure_ascii=False, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

