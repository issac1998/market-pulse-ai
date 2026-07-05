#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


def iso_date(value: Any) -> str:
    return str(value)[:10]


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a NYSE reference calendar from pandas-market-calendars.")
    parser.add_argument("--start", default="2019-01-01")
    parser.add_argument("--end", default="2028-12-31")
    parser.add_argument("--output", default="data/reference/nyse_calendar_2019_2028.json")
    args = parser.parse_args()

    try:
      import pandas_market_calendars as mcal
    except Exception as exc:
      raise SystemExit(
          "pandas_market_calendars is required. Install it in the bridge environment, e.g. "
          "python3 -m pip install pandas_market_calendars"
      ) from exc

    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end)
    nyse = mcal.get_calendar("NYSE")
    schedule = nyse.schedule(start_date=args.start, end_date=args.end)
    trading_dates = {iso_date(index.date() if hasattr(index, "date") else index): row for index, row in schedule.iterrows()}
    sessions = []
    cursor = start
    while cursor <= end:
        key = cursor.isoformat()
        row = trading_dates.get(key)
        weekday = cursor.weekday()
        if row is None:
            sessions.append({
                "date": key,
                "isTradingDay": False,
                "isHalfDay": False,
                "label": "非交易日" if weekday >= 5 else "休市",
                "reason": "Weekend" if weekday >= 5 else "NYSE closed by pandas_market_calendars",
            })
        else:
            close_ts = row["market_close"]
            close_hour = int(close_ts.tz_convert("America/New_York").hour)
            close_minute = int(close_ts.tz_convert("America/New_York").minute)
            is_half_day = close_hour < 16
            sessions.append({
                "date": key,
                "isTradingDay": True,
                "isHalfDay": bool(is_half_day),
                "label": "半日市" if is_half_day else "正常交易日",
                "reason": f"market_close={close_hour:02d}:{close_minute:02d} America/New_York" if is_half_day else "",
            })
        cursor += timedelta(days=1)

    payload = {
        "schemaVersion": "nyse-calendar-reference-v1",
        "provider": "pandas_market_calendars",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "start": args.start,
        "end": args.end,
        "sessions": sessions,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "output": str(output),
        "sessions": len(sessions),
        "tradingDays": sum(1 for row in sessions if row["isTradingDay"]),
        "halfDays": sum(1 for row in sessions if row["isHalfDay"]),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
