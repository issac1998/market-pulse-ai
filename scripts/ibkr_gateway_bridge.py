#!/usr/bin/env python3
"""JSON bridge for the IB Gateway / TWS Socket API.

This script keeps the Node app away from the IB binary protocol.  It uses the
official ibapi package and returns one JSON document for each command.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Any

try:
    from ibapi.client import EClient
    from ibapi.contract import Contract
    from ibapi.wrapper import EWrapper
except Exception as exc:  # pragma: no cover - depends on local runtime
    print(json.dumps({"status": "missing", "error": f"{type(exc).__name__}: {exc}", "install": "python -m pip install ibapi"}))
    raise SystemExit(0)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def finite(value: Any) -> float | None:
    try:
        number = float(value)
        if not math.isfinite(number) or abs(number) > 1e100:
            return None
        return number
    except Exception:
        return None


def finite_size(value: Any) -> float | None:
    number = finite(value)
    return number if number is not None and number >= 0 else None


def stock_contract(symbol: str) -> Contract:
    contract = Contract()
    contract.symbol = symbol.upper().strip()
    contract.secType = "STK"
    contract.exchange = "SMART"
    contract.currency = "USD"
    return contract


INDEX_CONTRACTS: dict[str, dict[str, str]] = {
    "^GSPC": {"symbol": "SPX", "exchange": "CBOE", "label": "S&P 500 Stock Index"},
    "SPX": {"symbol": "SPX", "exchange": "CBOE", "label": "S&P 500 Stock Index"},
    "^VIX": {"symbol": "VIX", "exchange": "CBOE", "label": "CBOE Volatility Index"},
    "VIX": {"symbol": "VIX", "exchange": "CBOE", "label": "CBOE Volatility Index"},
    "^IXIC": {"symbol": "COMP", "exchange": "NASDAQ", "label": "NASDAQ Composite Index"},
    "COMP": {"symbol": "COMP", "exchange": "NASDAQ", "label": "NASDAQ Composite Index"},
    "^NDX": {"symbol": "NDX", "exchange": "NASDAQ", "label": "NASDAQ 100 Stock Index"},
    "NDX": {"symbol": "NDX", "exchange": "NASDAQ", "label": "NASDAQ 100 Stock Index"},
    "^RUT": {"symbol": "RUT", "exchange": "RUSSELL", "label": "Russell 2000 Stock Index"},
    "RUT": {"symbol": "RUT", "exchange": "RUSSELL", "label": "Russell 2000 Stock Index"},
}


def index_contract(symbol: str) -> Contract:
    key = symbol.upper().strip()
    spec = INDEX_CONTRACTS.get(key) or INDEX_CONTRACTS.get(key.replace(".", ""))
    if not spec:
        raise ValueError(f"Unsupported index symbol: {symbol}")
    contract = Contract()
    contract.symbol = spec["symbol"]
    contract.secType = "IND"
    contract.exchange = spec["exchange"]
    contract.currency = "USD"
    return contract


def option_contract(
    symbol: str,
    expiration: str,
    strike: float,
    right: str,
    exchange: str = "SMART",
    multiplier: str = "100",
    trading_class: str = "",
) -> Contract:
    contract = Contract()
    contract.symbol = symbol.upper().strip()
    contract.secType = "OPT"
    contract.exchange = exchange or "SMART"
    contract.currency = "USD"
    contract.lastTradeDateOrContractMonth = expiration
    contract.strike = float(strike)
    contract.right = right
    contract.multiplier = str(multiplier or "100")
    if trading_class:
        contract.tradingClass = trading_class
    return contract


class GatewayApp(EWrapper, EClient):
    def __init__(self) -> None:
        EClient.__init__(self, self)
        self.ready = threading.Event()
        self.accounts_event = threading.Event()
        self.positions_event = threading.Event()
        self.open_orders_event = threading.Event()
        self.quote_events: dict[int, threading.Event] = {}
        self.history_events: dict[int, threading.Event] = {}
        self.contract_events: dict[int, threading.Event] = {}
        self.secdef_events: dict[int, threading.Event] = {}
        self.next_req_id = 1000
        self.next_order_id = None
        self.accounts = ""
        self.positions: list[dict[str, Any]] = []
        self.open_orders: list[dict[str, Any]] = []
        self.quotes: dict[int, dict[str, Any]] = {}
        self.history: dict[int, list[dict[str, Any]]] = {}
        self.contract_details: dict[int, list[dict[str, Any]]] = {}
        self.secdefs: dict[int, list[dict[str, Any]]] = {}
        self.errors: list[dict[str, Any]] = []

    def next_id(self) -> int:
        self.next_req_id += 1
        return self.next_req_id

    def nextValidId(self, orderId: int) -> None:
        self.next_order_id = orderId
        self.ready.set()

    def managedAccounts(self, accountsList: str) -> None:
        self.accounts = accountsList or ""
        self.accounts_event.set()

    def position(self, account, contract, position, avgCost) -> None:
        if position:
            self.positions.append(
                {
                    "account": account,
                    "accountMasked": f"...{str(account)[-4:]}",
                    "symbol": getattr(contract, "symbol", ""),
                    "secType": getattr(contract, "secType", ""),
                    "currency": getattr(contract, "currency", ""),
                    "exchange": getattr(contract, "exchange", ""),
                    "position": finite(position),
                    "avgCost": finite(avgCost),
                    "conId": getattr(contract, "conId", None),
                }
            )

    def positionEnd(self) -> None:
        self.positions_event.set()

    def openOrder(self, orderId, contract, order, orderState) -> None:
        self.open_orders.append(
            {
                "orderId": orderId,
                "symbol": getattr(contract, "symbol", ""),
                "secType": getattr(contract, "secType", ""),
                "action": getattr(order, "action", ""),
                "orderType": getattr(order, "orderType", ""),
                "totalQuantity": finite(getattr(order, "totalQuantity", None)),
                "status": getattr(orderState, "status", ""),
            }
        )

    def openOrderEnd(self) -> None:
        self.open_orders_event.set()

    def tickPrice(self, reqId, tickType, price, attrib) -> None:
        row = self.quotes.setdefault(reqId, {})
        mapping = {
            1: "bid",
            2: "ask",
            4: "last",
            6: "high",
            7: "low",
            9: "previousClose",
            14: "open",
            66: "bid",
            67: "ask",
            68: "last",
            72: "high",
            73: "low",
            75: "previousClose",
            76: "open",
        }
        if tickType in mapping and price is not None and price >= 0:
            row[mapping[tickType]] = finite(price)
            row["timestamp"] = now_iso()

    def tickSize(self, reqId, tickType, size) -> None:
        row = self.quotes.setdefault(reqId, {})
        if tickType == 8:
            row["volume"] = finite_size(size)
        if tickType == 0:
            row["bidSize"] = finite_size(size)
        if tickType == 3:
            row["askSize"] = finite_size(size)
        if tickType == 5:
            row["lastSize"] = finite_size(size)
        if tickType == 69:
            row["bidSize"] = finite_size(size)
        if tickType == 70:
            row["askSize"] = finite_size(size)
        if tickType == 71:
            row["lastSize"] = finite_size(size)
        if tickType == 74:
            row["volume"] = finite_size(size)
        if tickType in {27, 28}:
            row["openInterest"] = finite_size(size)
            row["callOpenInterest" if tickType == 27 else "putOpenInterest"] = finite_size(size)
        if tickType in {29, 30}:
            row["optionVolume"] = finite_size(size)
            row["callVolume" if tickType == 29 else "putVolume"] = finite_size(size)

    def tickOptionComputation(self, reqId, tickType, *values) -> None:
        row = self.quotes.setdefault(reqId, {})
        if len(values) < 8:
            return
        implied_vol, delta, opt_price, pv_dividend, gamma, vega, theta, und_price = values[-8:]
        computed = {
            "impliedVolatility": finite(implied_vol),
            "delta": finite(delta),
            "optionPrice": finite(opt_price),
            "pvDividend": finite(pv_dividend),
            "gamma": finite(gamma),
            "vega": finite(vega),
            "theta": finite(theta),
            "undPrice": finite(und_price),
        }
        row.update({key: value for key, value in computed.items() if value is not None})
        row["optionComputationTickType"] = tickType
        row["timestamp"] = now_iso()

    def tickSnapshotEnd(self, reqId: int) -> None:
        event = self.quote_events.get(reqId)
        if event:
            event.set()

    def historicalData(self, reqId, bar) -> None:
        self.history.setdefault(reqId, []).append(
            {
                "date": str(bar.date)[:10],
                "open": finite(bar.open),
                "high": finite(bar.high),
                "low": finite(bar.low),
                "close": finite(bar.close),
                "volume": finite(bar.volume) or 0,
            }
        )

    def historicalDataEnd(self, reqId, start, end) -> None:
        event = self.history_events.get(reqId)
        if event:
            event.set()

    def contractDetails(self, reqId, contractDetails) -> None:
        contract = getattr(contractDetails, "contract", None)
        self.contract_details.setdefault(reqId, []).append(
            {
                "conId": getattr(contract, "conId", None),
                "symbol": getattr(contract, "symbol", ""),
                "secType": getattr(contract, "secType", ""),
                "exchange": getattr(contract, "exchange", ""),
                "primaryExchange": getattr(contract, "primaryExchange", ""),
                "currency": getattr(contract, "currency", ""),
                "localSymbol": getattr(contract, "localSymbol", ""),
                "tradingClass": getattr(contract, "tradingClass", ""),
                "longName": getattr(contractDetails, "longName", ""),
                "marketName": getattr(contractDetails, "marketName", ""),
                "minTick": finite(getattr(contractDetails, "minTick", None)),
            }
        )

    def contractDetailsEnd(self, reqId) -> None:
        event = self.contract_events.get(reqId)
        if event:
            event.set()

    def securityDefinitionOptionParameter(
        self,
        reqId,
        exchange,
        underlyingConId,
        tradingClass,
        multiplier,
        expirations,
        strikes,
    ) -> None:
        expiration_rows = sorted(str(item) for item in expirations or [] if item)
        strike_rows = sorted((finite(item) for item in strikes or []), key=lambda item: item or 0)
        self.secdefs.setdefault(reqId, []).append(
            {
                "exchange": exchange,
                "underlyingConId": underlyingConId,
                "tradingClass": tradingClass,
                "multiplier": multiplier,
                "expirations": expiration_rows,
                "strikes": [item for item in strike_rows if item is not None],
            }
        )

    def securityDefinitionOptionParameterEnd(self, reqId) -> None:
        event = self.secdef_events.get(reqId)
        if event:
            event.set()

    def error(self, reqId, errorCode, errorString, advancedOrderRejectJson="") -> None:
        if errorCode in {300, 2104, 2106, 2119, 2158, 2107, 2108}:
            return
        self.errors.append({"reqId": reqId, "code": errorCode, "message": errorString})


def connect_app(args) -> tuple[GatewayApp, threading.Thread]:
    app = GatewayApp()
    app.connect(args.host, args.port, clientId=args.client_id)
    thread = threading.Thread(target=app.run, daemon=True)
    thread.start()
    if not app.ready.wait(args.timeout):
        app.disconnect()
        raise TimeoutError(f"IB Gateway socket did not become ready within {args.timeout}s")
    return app, thread


def account_payload(app: GatewayApp, timeout: float) -> dict[str, Any]:
    app.reqManagedAccts()
    app.accounts_event.wait(timeout)
    app.reqPositions()
    app.positions_event.wait(timeout)
    app.reqAllOpenOrders()
    app.open_orders_event.wait(timeout)
    accounts = [item for item in app.accounts.split(",") if item]
    return {
        "accountsCount": len(accounts),
        "accountsMasked": [f"...{account[-4:]}" for account in accounts],
        "positions": [{key: value for key, value in row.items() if key != "account"} for row in app.positions],
        "openOrders": app.open_orders,
    }


def quote_payload(app: GatewayApp, symbols: list[str], timeout: float, market_data_type: int) -> list[dict[str, Any]]:
    app.reqMarketDataType(market_data_type)
    req_to_symbol: dict[int, str] = {}
    for symbol in symbols:
        req_id = app.next_id()
        req_to_symbol[req_id] = symbol
        app.quote_events[req_id] = threading.Event()
        app.quotes[req_id] = {}
        app.reqMktData(req_id, stock_contract(symbol), "", True, False, [])
    deadline = time.time() + timeout
    for req_id, event in list(app.quote_events.items()):
        event.wait(max(0.1, deadline - time.time()))
        with contextlib_suppress(Exception):
            app.cancelMktData(req_id)
    rows = []
    for req_id, symbol in req_to_symbol.items():
        row = app.quotes.get(req_id, {})
        bid = finite(row.get("bid"))
        ask = finite(row.get("ask"))
        last = finite(row.get("last"))
        price = last if last is not None else ((bid + ask) / 2 if bid is not None and ask is not None and ask >= bid else bid or ask)
        rows.append({"symbol": symbol, **row, "price": price, "timestamp": row.get("timestamp") or now_iso()})
    return rows


def history_payload(app: GatewayApp, symbols: list[str], timeout: float, duration: str, bar_size: str, market_data_type: int) -> list[dict[str, Any]]:
    app.reqMarketDataType(market_data_type)
    req_to_symbol: dict[int, str] = {}
    for symbol in symbols:
        req_id = app.next_id()
        req_to_symbol[req_id] = symbol
        app.history_events[req_id] = threading.Event()
        app.history[req_id] = []
        app.reqHistoricalData(req_id, stock_contract(symbol), "", duration, bar_size, "TRADES", 1, 1, False, [])
    deadline = time.time() + timeout
    rows = []
    for req_id, event in list(app.history_events.items()):
        event.wait(max(0.1, deadline - time.time()))
        rows.append({"symbol": req_to_symbol[req_id], "bars": app.history.get(req_id, [])})
    return rows


def index_history_payload(app: GatewayApp, symbols: list[str], timeout: float, duration: str, bar_size: str, market_data_type: int) -> list[dict[str, Any]]:
    app.reqMarketDataType(market_data_type)
    rows = []
    for symbol in symbols:
        key = symbol.upper().strip()
        spec = INDEX_CONTRACTS.get(key) or INDEX_CONTRACTS.get(key.replace(".", ""))
        if not spec:
            rows.append({"symbol": symbol, "status": "unsupported", "error": f"Unsupported index symbol: {symbol}", "bars": []})
            continue
        req_id = app.next_id()
        app.history_events[req_id] = threading.Event()
        app.history[req_id] = []
        app.reqHistoricalData(req_id, index_contract(key), "", duration, bar_size, "TRADES", 1, 1, False, [])
        app.history_events[req_id].wait(timeout)
        bars = app.history.get(req_id, [])
        latest = bars[-1] if bars else {}
        previous = bars[-2] if len(bars) >= 2 else {}
        price = finite(latest.get("close"))
        previous_close = finite(previous.get("close"))
        change_percent = (
            ((price - previous_close) / previous_close) * 100
            if price is not None and previous_close is not None and previous_close > 0
            else None
        )
        rows.append(
            {
                "symbol": key,
                "ibkrSymbol": spec["symbol"],
                "exchange": spec["exchange"],
                "label": spec.get("label") or spec["symbol"],
                "status": "ok" if bars else "empty",
                "price": price,
                "previousClose": previous_close,
                "open": finite(latest.get("open")),
                "high": finite(latest.get("high")),
                "low": finite(latest.get("low")),
                "changePercent": change_percent,
                "timestamp": f"{latest.get('date')}T21:00:00.000Z" if latest.get("date") else now_iso(),
                "bars": bars,
            }
        )
    return rows


def normalize_ib_expiration(value: Any) -> str:
    text = str(value or "").strip()
    if len(text) == 8 and text.isdigit():
        return text
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        return text.replace("-", "")
    return ""


def request_contract_details(app: GatewayApp, contract: Contract, timeout: float) -> list[dict[str, Any]]:
    req_id = app.next_id()
    app.contract_events[req_id] = threading.Event()
    app.contract_details[req_id] = []
    app.reqContractDetails(req_id, contract)
    app.contract_events[req_id].wait(timeout)
    return app.contract_details.get(req_id, [])


def request_option_secdefs(app: GatewayApp, symbol: str, underlying_conid: int, timeout: float) -> list[dict[str, Any]]:
    req_id = app.next_id()
    app.secdef_events[req_id] = threading.Event()
    app.secdefs[req_id] = []
    app.reqSecDefOptParams(req_id, symbol.upper(), "", "STK", int(underlying_conid))
    app.secdef_events[req_id].wait(timeout)
    return app.secdefs.get(req_id, [])


def pick_strikes_around_spot(strikes: list[float], spot: float | None, limit: int) -> list[float]:
    unique = sorted({float(strike) for strike in strikes if finite(strike) is not None and float(strike) > 0})
    if not unique or limit <= 0:
        return []
    if spot is None or not math.isfinite(float(spot)) or float(spot) <= 0:
        center = len(unique) // 2
        half = max(1, limit // 2)
        return unique[max(0, center - half): center + half + (limit % 2)]
    selected = sorted(unique, key=lambda strike: abs(strike - float(spot)))[:limit]
    return sorted(selected)


def option_snapshot_payload(app: GatewayApp, contracts: list[dict[str, Any]], timeout: float) -> list[dict[str, Any]]:
    req_to_contract: dict[int, dict[str, Any]] = {}
    for item in contracts:
        req_id = app.next_id()
        req_to_contract[req_id] = item
        app.quote_events[req_id] = threading.Event()
        app.quotes[req_id] = {}
        app.reqMktData(
            req_id,
            option_contract(
                item["symbol"],
                item["expirationRaw"],
                item["strike"],
                item["right"],
                exchange=item.get("exchange") or "SMART",
                multiplier=item.get("multiplier") or "100",
                trading_class=item.get("tradingClass") or "",
            ),
            "100,101,104,106",
            False,
            False,
            [],
        )
    deadline = time.time() + timeout
    for req_id, event in list(app.quote_events.items()):
        if req_id not in req_to_contract:
            continue
        event.wait(max(0.1, deadline - time.time()))
        with contextlib_suppress(Exception):
            app.cancelMktData(req_id)
    rows: list[dict[str, Any]] = []
    for req_id, item in req_to_contract.items():
        quote = app.quotes.get(req_id, {})
        bid = finite(quote.get("bid"))
        ask = finite(quote.get("ask"))
        last = finite(quote.get("last"))
        mark = (bid + ask) / 2 if bid is not None and ask is not None and ask >= bid else last
        right = item["right"]
        option_volume = finite(quote.get("optionVolume"))
        if option_volume is None:
            option_volume = finite(quote.get("callVolume" if right == "C" else "putVolume"))
        rows.append(
            {
                **item,
                "bid": bid,
                "ask": ask,
                "last": last,
                "mark": mark,
                "previousClose": finite(quote.get("previousClose")),
                "volume": option_volume if option_volume is not None else finite(quote.get("volume")),
                "openInterest": finite(quote.get("openInterest") or quote.get("callOpenInterest" if right == "C" else "putOpenInterest")),
                "impliedVolatility": finite(quote.get("impliedVolatility")),
                "delta": finite(quote.get("delta")),
                "gamma": finite(quote.get("gamma")),
                "vega": finite(quote.get("vega")),
                "theta": finite(quote.get("theta")),
                "undPrice": finite(quote.get("undPrice")),
                "hasMarketData": any(
                    finite(quote.get(key)) is not None
                    for key in ["bid", "ask", "last", "openInterest", "optionVolume", "impliedVolatility", "gamma"]
                ),
                "timestamp": quote.get("timestamp") or now_iso(),
            }
        )
    return rows


def option_chain_for_symbol(
    app: GatewayApp,
    symbol: str,
    timeout: float,
    market_data_type: int,
    spot: float | None,
    expiration_limit: int,
    strike_limit: int,
    contract_limit: int,
    option_data_seconds: float,
) -> dict[str, Any]:
    started = time.time()
    def remaining(minimum: float = 0.5) -> float:
        return max(minimum, timeout - (time.time() - started))

    symbol = symbol.upper().strip()
    underlying_details = request_contract_details(app, stock_contract(symbol), min(remaining(2.0), 4.0))
    underlying = next((row for row in underlying_details if str(row.get("symbol", "")).upper() == symbol), None) or (underlying_details[0] if underlying_details else {})
    underlying_conid = finite(underlying.get("conId"))
    if underlying_conid is None:
        return {
            "symbol": symbol,
            "status": "no-underlying",
            "error": "IBKR Socket 未返回 underlying stock contract details。",
            "contracts": [],
            "expirations": [],
            "secdefsCount": 0,
        }
    if spot is None:
        quote_rows = quote_payload(app, [symbol], min(remaining(1.0), 3.0), market_data_type)
        spot = finite((quote_rows[0] if quote_rows else {}).get("price"))
    secdefs = request_option_secdefs(app, symbol, int(underlying_conid), min(remaining(2.0), 6.0))
    today_key = datetime.now(timezone.utc).strftime("%Y%m%d")
    all_expirations = sorted(
        {
            normalized
            for row in secdefs
            for normalized in [normalize_ib_expiration(item) for item in row.get("expirations", [])]
            if normalized
        }
    )
    expirations = [item for item in all_expirations if item > today_key] or all_expirations
    strikes = [
        strike
        for row in secdefs
        for strike in row.get("strikes", [])
        if finite(strike) is not None and float(strike) > 0
    ]
    if not expirations or not strikes:
        return {
            "symbol": symbol,
            "status": "no-options",
            "underlyingConId": int(underlying_conid),
            "longName": underlying.get("longName") or "",
            "underlyingPrice": spot,
            "contracts": [],
            "expirations": [],
            "secdefsCount": len(secdefs),
            "error": "IBKR Socket 已识别股票合约，但 reqSecDefOptParams 未返回可用期权定义。",
        }
    preferred = next(
        (
            row
            for name in ["SMART", "IBUSOPT", "CBOE", "NASDAQOM", "PHLX", "AMEX"]
            for row in secdefs
            if str(row.get("exchange", "")).upper() == name
        ),
        secdefs[0],
    )
    multiplier = str(preferred.get("multiplier") or "100")
    trading_class = str(preferred.get("tradingClass") or symbol)
    selected_expirations = expirations[: max(1, expiration_limit)]
    selected_strikes = pick_strikes_around_spot(strikes, spot, max(2, strike_limit))
    definitions: list[dict[str, Any]] = []
    for expiration in selected_expirations:
        for strike in selected_strikes:
            for right in ["C", "P"]:
                if len(definitions) >= max(2, contract_limit):
                    break
                definitions.append(
                    {
                        "symbol": symbol,
                        "expirationRaw": expiration,
                        "expiration": f"{expiration[:4]}-{expiration[4:6]}-{expiration[6:8]}",
                        "strike": strike,
                        "right": right,
                        "optionType": "call" if right == "C" else "put",
                        "exchange": "SMART",
                        "multiplier": multiplier,
                        "tradingClass": trading_class,
                        "contractSymbol": f"{symbol} {expiration} {right}{strike:g}",
                    }
                )
            if len(definitions) >= max(2, contract_limit):
                break
        if len(definitions) >= max(2, contract_limit):
            break
    contracts = option_snapshot_payload(app, definitions, min(remaining(2.0), max(1.0, option_data_seconds)))
    return {
        "symbol": symbol,
        "status": "ok",
        "underlyingConId": int(underlying_conid),
        "longName": underlying.get("longName") or "",
        "underlyingPrice": spot,
        "expirations": [f"{item[:4]}-{item[4:6]}-{item[6:8]}" for item in selected_expirations],
        "contracts": contracts,
        "contractsRequested": len(definitions),
        "secdefsCount": len(secdefs),
        "selectedExchange": preferred.get("exchange") or "",
        "tradingClass": trading_class,
        "generatedAt": now_iso(),
    }


def options_payload(
    app: GatewayApp,
    symbols: list[str],
    timeout: float,
    market_data_type: int,
    spot: float | None,
    expiration_limit: int,
    strike_limit: int,
    contract_limit: int,
    option_data_seconds: float,
) -> list[dict[str, Any]]:
    app.reqMarketDataType(market_data_type)
    rows = []
    for symbol in symbols:
        rows.append(
            option_chain_for_symbol(
                app,
                symbol,
                timeout,
                market_data_type,
                spot if len(symbols) == 1 else None,
                expiration_limit,
                strike_limit,
                contract_limit,
                option_data_seconds,
            )
        )
    return rows


class contextlib_suppress:
    def __init__(self, *exceptions):
        self.exceptions = exceptions or (Exception,)
    def __enter__(self):
        return None
    def __exit__(self, exc_type, exc, tb):
        return exc_type is not None and issubclass(exc_type, self.exceptions)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["probe", "accounts", "quote", "historical", "indices", "options"])
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4001)
    parser.add_argument("--client-id", type=int, default=77)
    parser.add_argument("--timeout", type=float, default=8)
    parser.add_argument("--symbols", default="")
    parser.add_argument("--market-data-type", type=int, default=3)
    parser.add_argument("--duration", default="6 M")
    parser.add_argument("--bar-size", default="1 day")
    parser.add_argument("--spot", type=float, default=None)
    parser.add_argument("--expiration-limit", type=int, default=3)
    parser.add_argument("--strike-limit", type=int, default=16)
    parser.add_argument("--contract-limit", type=int, default=96)
    parser.add_argument("--option-data-seconds", type=float, default=8)
    args = parser.parse_args()
    app = None
    try:
        app, _thread = connect_app(args)
        payload: dict[str, Any] = {
            "status": "ok",
            "host": args.host,
            "port": args.port,
            "serverVersion": app.serverVersion(),
            "nextValidId": app.next_order_id,
            "generatedAt": now_iso(),
        }
        symbols = [item.strip().upper() for item in args.symbols.split(",") if item.strip()]
        if args.command in {"probe", "accounts"}:
            payload.update(account_payload(app, args.timeout))
        if args.command == "quote":
            payload["quotes"] = quote_payload(app, symbols, args.timeout, args.market_data_type)
        if args.command == "historical":
            payload["historical"] = history_payload(app, symbols, args.timeout, args.duration, args.bar_size, args.market_data_type)
        if args.command == "indices":
            payload["indices"] = index_history_payload(app, symbols, args.timeout, args.duration, args.bar_size, args.market_data_type)
        if args.command == "options":
            payload["options"] = options_payload(
                app,
                symbols,
                args.timeout,
                args.market_data_type,
                args.spot,
                args.expiration_limit,
                args.strike_limit,
                args.contract_limit,
                args.option_data_seconds,
            )
        if app.errors:
            payload["errors"] = app.errors[:20]
        print(json.dumps(payload, ensure_ascii=False, allow_nan=False))
        return 0
    except Exception as exc:
        print(json.dumps({"status": "error", "error": f"{type(exc).__name__}: {exc}"}, ensure_ascii=False))
        return 1
    finally:
        if app:
            app.disconnect()


if __name__ == "__main__":
    raise SystemExit(main())
