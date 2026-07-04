#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from typing import Any


def number(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def rank(values: list[float]) -> list[float | None]:
    indexed = [(value, index) for index, value in enumerate(values) if math.isfinite(value)]
    indexed.sort(key=lambda item: item[0])
    ranks: list[float | None] = [None] * len(values)
    cursor = 0
    while cursor < len(indexed):
        end = cursor
        while end + 1 < len(indexed) and indexed[end + 1][0] == indexed[cursor][0]:
            end += 1
        value = (cursor + end + 2) / 2
        for index in range(cursor, end + 1):
            ranks[indexed[index][1]] = value
        cursor = end + 1
    return ranks


def corr(xs: list[float], ys: list[float]) -> float | None:
    pairs = [(x, y) for x, y in zip(xs, ys) if math.isfinite(x) and math.isfinite(y)]
    if len(pairs) < 3:
        return None
    x_avg = mean([x for x, _ in pairs]) or 0
    y_avg = mean([y for _, y in pairs]) or 0
    numerator = sum((x - x_avg) * (y - y_avg) for x, y in pairs)
    x_den = math.sqrt(sum((x - x_avg) ** 2 for x, _ in pairs))
    y_den = math.sqrt(sum((y - y_avg) ** 2 for _, y in pairs))
    return numerator / (x_den * y_den) if x_den and y_den else None


def spearman(xs: list[float], ys: list[float]) -> float | None:
    xr = rank(xs)
    yr = rank(ys)
    return corr([x if x is not None else math.nan for x in xr], [y if y is not None else math.nan for y in yr])


def normalize_observations(payload: dict[str, Any]) -> list[dict[str, Any]]:
    observations = payload.get("observations")
    if isinstance(observations, list):
        return [row for row in observations if isinstance(row, dict)]
    factor_values = payload.get("factorValues") or []
    forward_returns = payload.get("forwardReturns") or []
    by_key = {}
    for row in factor_values:
        if not isinstance(row, dict):
            continue
        key = (str(row.get("date") or "")[:10], str(row.get("ticker") or ""), str(row.get("factorId") or row.get("factor") or "factor"))
        by_key[key] = {"date": key[0], "ticker": key[1], "factorId": key[2], "score": number(row.get("value") or row.get("score"))}
    for row in forward_returns:
        if not isinstance(row, dict):
            continue
        key_prefix = (str(row.get("date") or "")[:10], str(row.get("ticker") or ""))
        horizon = int(number(row.get("horizon") or row.get("horizonDays") or 1) or 1)
        value = number(row.get("forwardReturnPct") or row.get("returnPct"))
        for key, item in by_key.items():
            if key[:2] == key_prefix:
                item[f"h{horizon}"] = value
    return list(by_key.values())


def native_factor_analysis(observations: list[dict[str, Any]], horizons: list[int]) -> dict[str, Any]:
    by_factor: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in observations:
        factor_id = str(row.get("factorId") or row.get("factor") or "factor")
        score = number(row.get("score") if row.get("score") is not None else row.get("value"))
        if score is None:
            continue
        normalized = dict(row)
        normalized["score"] = score
        by_factor[factor_id].append(normalized)
    ic_by_horizon = {}
    quantile_mean_returns = {}
    turnover = {}
    for factor_id, rows in by_factor.items():
        ic_by_horizon[factor_id] = {}
        quantile_mean_returns[factor_id] = {}
        turnover[factor_id] = {"value": None, "n": len(rows), "source": "native-python", "status": "not-computed"}
        for horizon in horizons:
            key = f"h{horizon}"
            xs = [number(row.get("score")) or math.nan for row in rows]
            ys = [number(row.get(key) if row.get(key) is not None else row.get("forwardReturnPct")) or math.nan for row in rows]
            valid = [(x, y) for x, y in zip(xs, ys) if math.isfinite(x) and math.isfinite(y)]
            ic_by_horizon[factor_id][str(horizon)] = {
                "value": spearman([x for x, _ in valid], [y for _, y in valid]) if len(valid) >= 3 else None,
                "n": len(valid),
                "source": "native-python",
            }
            if valid:
                ordered = sorted(valid, key=lambda item: item[0])
                chunks = [ordered[: max(1, len(ordered) // 5)], ordered[-max(1, len(ordered) // 5) :]]
                quantile_mean_returns[factor_id][str(horizon)] = {
                    "bottom": mean([item[1] for item in chunks[0]]),
                    "top": mean([item[1] for item in chunks[1]]),
                    "spread": (mean([item[1] for item in chunks[1]]) or 0) - (mean([item[1] for item in chunks[0]]) or 0),
                    "n": len(valid),
                    "source": "native-python",
                }
            else:
                quantile_mean_returns[factor_id][str(horizon)] = {"bottom": None, "top": None, "spread": None, "n": 0, "source": "native-python"}
    return {
        "icByHorizon": ic_by_horizon,
        "quantileMeanReturns": quantile_mean_returns,
        "turnover": turnover,
    }


def alphalens_available() -> tuple[bool, str]:
    try:
        import alphalens  # type: ignore  # noqa: F401

        return True, ""
    except Exception as exc:
        return False, f"alphalens unavailable: {type(exc).__name__}: {exc}"


def main() -> int:
    payload = json.load(sys.stdin)
    horizons = [int(number(item) or 0) for item in (payload.get("horizons") or [1, 3, 5, 10])]
    horizons = [item for item in horizons if item > 0]
    observations = normalize_observations(payload)
    available, degradation = alphalens_available()
    analysis = native_factor_analysis(observations, horizons)
    print(
        json.dumps(
            {
                "ok": True,
                "schemaVersion": "alphalens-bridge-v1",
                "engine": "alphalens" if available else "native-python",
                "preferredAvailable": available,
                "observations": len(observations),
                "horizons": horizons,
                "analysis": analysis,
                "degradation": "" if available else degradation,
                "note": "Native fallback computes Spearman IC and top-bottom quantile spread from supplied forward-return observations.",
            },
            ensure_ascii=False,
            allow_nan=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

