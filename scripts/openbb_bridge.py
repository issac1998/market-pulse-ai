#!/usr/bin/env python3
"""Small JSON bridge between the Node app and OpenBB Platform.

The bridge intentionally avoids hard-failing when a route/provider is missing:
OpenBB routes vary by version and installed provider extensions.  Each route
returns either normalized records or a per-route error so the Chinese UI can
show what is available on this machine.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import math
import signal
import sys
import traceback
from datetime import date, timedelta
from typing import Any, Callable

JSON_STDOUT = sys.stdout
ROUTE_TIMEOUT_SECONDS = 0


class RouteTimeoutError(TimeoutError):
    pass


@contextlib.contextmanager
def route_timeout(seconds: int):
    if not seconds or seconds <= 0:
        yield
        return

    def handle_timeout(_signum, _frame):
        raise RouteTimeoutError(f"OpenBB route timed out after {seconds}s")

    old_handler = signal.signal(signal.SIGALRM, handle_timeout)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old_handler)


def print_json(payload: dict[str, Any]) -> None:
    JSON_STDOUT.write(json.dumps(payload, ensure_ascii=False, default=str, allow_nan=False))
    JSON_STDOUT.write("\n")
    JSON_STDOUT.flush()


def import_openbb():
    try:
        import openbb  # type: ignore
        from openbb import obb  # type: ignore

        return openbb, obb, None
    except Exception as exc:  # pragma: no cover - depends on local env
        return None, None, exc


def jsonable(value: Any) -> Any:
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (date,)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(v) for v in value]
    if hasattr(value, "model_dump"):
        return jsonable(value.model_dump())
    if hasattr(value, "dict"):
        try:
            return jsonable(value.dict())
        except Exception:
            pass
    return str(value)


def to_records(result: Any, limit: int = 200) -> list[dict[str, Any]]:
    if result is None:
        return []
    for attr in ("to_df", "to_dataframe"):
        method = getattr(result, attr, None)
        if callable(method):
            try:
                df = method()
                return jsonable(df.head(limit).reset_index().to_dict(orient="records"))
            except Exception:
                pass
    results = getattr(result, "results", None)
    if results is not None:
        rows = jsonable(results)
        if isinstance(rows, list):
            return [row if isinstance(row, dict) else {"value": row} for row in rows[:limit]]
        if isinstance(rows, dict):
            return [rows]
    payload = jsonable(result)
    if isinstance(payload, list):
        return [row if isinstance(row, dict) else {"value": row} for row in payload[:limit]]
    if isinstance(payload, dict):
        return [payload]
    return [{"value": payload}]


def route_callable(obb: Any, route: str) -> Callable[..., Any]:
    current = obb
    for part in route.split("."):
        current = getattr(current, part)
    if not callable(current):
        raise TypeError(f"OpenBB route is not callable: {route}")
    return current


def call_route(obb: Any, route: str, params: dict[str, Any], limit: int = 200) -> dict[str, Any]:
    try:
        fn = route_callable(obb, route)
        with route_timeout(ROUTE_TIMEOUT_SECONDS):
            result = fn(**params)
        return {"route": route, "status": "ok", "params": params, "records": to_records(result, limit)}
    except Exception as exc:
        return {
            "route": route,
            "status": "error",
            "params": params,
            "error": f"{type(exc).__name__}: {exc}",
        }


def with_provider(params: dict[str, Any], provider: str) -> dict[str, Any]:
    return {**params, **({"provider": provider} if provider else {})}


def route_first_ok(obb: Any, routes: list[tuple[str, dict[str, Any]]], limit: int = 200) -> dict[str, Any]:
    errors = []
    for route, params in routes:
        result = call_route(obb, route, params, limit)
        if result["status"] == "ok" and result.get("records"):
            return result
        errors.append({"route": route, "error": result.get("error"), "status": result.get("status")})
    return {"status": "error", "errors": errors, "records": []}


def collect_discovery(obb: Any, provider: str = "", limit: int = 25) -> dict[str, Any]:
    route_specs = {
        "active": ("equity.discovery.active", {"sort": "desc", "limit": limit}),
        "gainers": ("equity.discovery.gainers", {"sort": "desc", "limit": limit}),
        "losers": ("equity.discovery.losers", {"sort": "desc", "limit": limit}),
    }
    routes: dict[str, Any] = {}
    errors = []
    for key, (route, params) in route_specs.items():
        result = call_route(obb, route, with_provider(params, provider), limit)
        routes[key] = result
        if result.get("status") != "ok":
            errors.append({"section": key, "route": route, "error": result.get("error")})
    return {"status": "ok", "routes": routes, "errors": errors}


def probe() -> dict[str, Any]:
    openbb, obb, error = import_openbb()
    if error:
        return {
            "status": "missing",
            "installed": False,
            "error": f"{type(error).__name__}: {error}",
            "install": "python -m pip install openbb",
            "python": sys.version,
        }
    return {
        "status": "ok",
        "installed": True,
        "openbbVersion": getattr(openbb, "__version__", "unknown"),
        "python": sys.version,
        "routesAvailable": {
            "equity": hasattr(obb, "equity"),
            "economy": hasattr(obb, "economy"),
            "derivatives": hasattr(obb, "derivatives"),
            "index": hasattr(obb, "index"),
            "etf": hasattr(obb, "etf"),
            "currency": hasattr(obb, "currency"),
            "crypto": hasattr(obb, "crypto"),
        },
    }


def bundle(symbols: list[str], provider: str = "", limit: int = 80, sections: list[str] | None = None) -> dict[str, Any]:
    openbb, obb, error = import_openbb()
    if error:
        return {"status": "missing", "probe": probe(), "symbols": symbols, "data": [], "errors": []}

    requested_sections = sections or []
    per_symbol_sections = [section for section in requested_sections if section != "discovery"]
    discovery = collect_discovery(obb, provider, min(limit, 40)) if not requested_sections or "discovery" in requested_sections else None
    start = (date.today() - timedelta(days=120)).isoformat()
    end = date.today().isoformat()
    data = []
    errors = []
    for symbol in symbols:
        symbol = symbol.upper().strip()
        if not symbol:
            continue
        rows: dict[str, Any] = {"symbol": symbol, "routes": {}}
        route_sets = {
            "identity": [
                ("equity.search", {"query": symbol, "is_symbol": True, "provider": "sec"}),
            ],
            "filings": [
                ("equity.fundamental.filings", {"symbol": symbol, "provider": "sec"}),
            ],
            "quote": [
                ("equity.price.quote", with_provider({"symbol": symbol}, provider)),
            ],
            "historical": [
                ("equity.price.historical", with_provider({"symbol": symbol, "start_date": start, "end_date": end}, provider)),
            ],
            "profile": [
                ("equity.profile", with_provider({"symbol": symbol}, provider)),
                ("equity.fundamental.profile", with_provider({"symbol": symbol}, provider)),
            ],
            "metrics": [
                ("equity.fundamental.metrics", with_provider({"symbol": symbol}, provider)),
                ("equity.fundamental.ratios", with_provider({"symbol": symbol}, provider)),
            ],
            "news": [
                ("news.company", with_provider({"symbol": symbol}, provider)),
                ("equity.news", with_provider({"symbol": symbol}, provider)),
                ("equity.news.company", with_provider({"symbol": symbol}, provider)),
            ],
            "options": [
                ("derivatives.options.chains", with_provider({"symbol": symbol}, provider)),
                ("equity.options.chains", with_provider({"symbol": symbol}, provider)),
            ],
        }
        for key, routes in route_sets.items():
            if requested_sections and key not in per_symbol_sections:
                continue
            result = route_first_ok(obb, routes, limit)
            rows["routes"][key] = result
            if result.get("status") != "ok":
                errors.append({"symbol": symbol, "section": key, "errors": result.get("errors", [])})
        data.append(rows)
    return {
        "status": "ok",
        "probe": probe(),
        "provider": provider,
        "sections": sections or ["discovery", *list(route_sets.keys())],
        "discovery": discovery,
        "symbols": symbols,
        "data": data,
        "errors": errors,
    }


def main() -> int:
    # OpenBB may print extension build logs on first import. Keep stdout clean
    # so the Node process always receives exactly one JSON document.
    sys.stdout = sys.stderr
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("probe")

    bundle_parser = sub.add_parser("bundle")
    bundle_parser.add_argument("--symbols", required=True)
    bundle_parser.add_argument("--provider", default="")
    bundle_parser.add_argument("--limit", type=int, default=80)
    bundle_parser.add_argument("--sections", default="")
    bundle_parser.add_argument("--discovery-limit", type=int, default=25)
    bundle_parser.add_argument("--route-timeout", type=int, default=0)

    call_parser = sub.add_parser("call")
    call_parser.add_argument("--route", required=True)
    call_parser.add_argument("--params", default="{}")
    call_parser.add_argument("--limit", type=int, default=200)
    call_parser.add_argument("--route-timeout", type=int, default=0)

    discovery_parser = sub.add_parser("discovery")
    discovery_parser.add_argument("--provider", default="")
    discovery_parser.add_argument("--limit", type=int, default=25)
    discovery_parser.add_argument("--route-timeout", type=int, default=0)

    args = parser.parse_args()
    global ROUTE_TIMEOUT_SECONDS
    ROUTE_TIMEOUT_SECONDS = max(0, int(getattr(args, "route_timeout", 0) or 0))
    try:
        if args.command == "probe":
            print_json(probe())
        elif args.command == "bundle":
            symbols = [item.strip().upper() for item in args.symbols.split(",") if item.strip()]
            sections = [item.strip() for item in args.sections.split(",") if item.strip()]
            payload = bundle(symbols, args.provider, args.limit, sections or None)
            if payload.get("discovery") and args.discovery_limit != min(args.limit, 40):
                _, obb, error = import_openbb()
                if not error:
                    payload["discovery"] = collect_discovery(obb, args.provider, args.discovery_limit)
            print_json(payload)
        elif args.command == "call":
            _, obb, error = import_openbb()
            if error:
                print_json({"status": "missing", "probe": probe()})
            else:
                print_json(call_route(obb, args.route, json.loads(args.params), args.limit))
        elif args.command == "discovery":
            _, obb, error = import_openbb()
            if error:
                print_json({"status": "missing", "probe": probe(), "routes": {}, "errors": []})
            else:
                print_json({"probe": probe(), **collect_discovery(obb, args.provider, args.limit)})
        return 0
    except Exception as exc:
        print_json({"status": "fatal", "error": f"{type(exc).__name__}: {exc}", "trace": traceback.format_exc()})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
