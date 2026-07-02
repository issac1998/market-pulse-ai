import json
import sqlite3
from pathlib import Path

from ..config import SQLITE_DB_FILE
from .registry import Tool


def _ticker(value):
    return "".join(ch for ch in str(value or "").upper() if ch.isalnum() or ch in ".-")[:14]


class SqliteReader:
    def __init__(self, path=None):
        self.path = Path(path or SQLITE_DB_FILE)

    def _connect(self):
        if not self.path.exists():
            raise FileNotFoundError("SQLite 镜像不存在: %s" % self.path)
        return sqlite3.connect("file:%s?mode=ro" % self.path, uri=True)

    def _rows(self, sql, params=()):
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            return [dict(row) for row in conn.execute(sql, params).fetchall()]

    def _safe_rows(self, sql, params=()):
        try:
            return self._rows(sql, params)
        except Exception as exc:
            return {"status": "missing", "error": str(exc)}


def _parse_json_field(row):
    next_row = dict(row)
    for key in ("json", "summary_json", "full_json"):
        if key in next_row and isinstance(next_row[key], str):
            try:
                next_row[key.replace("_json", "") if key != "json" else "payload"] = json.loads(next_row[key])
            except json.JSONDecodeError:
                pass
            next_row.pop(key, None)
    return next_row


def get_recent_decisions(reader, ticker="", limit=10):
    symbol = _ticker(ticker)
    if symbol:
        rows = reader._safe_rows(
            "select * from recommendation_decisions where ticker=? order by generated_at desc limit ?",
            (symbol, int(limit or 10)),
        )
    else:
        rows = reader._safe_rows(
            "select * from recommendation_decisions order by generated_at desc limit ?",
            (int(limit or 10),),
        )
    if isinstance(rows, dict):
        return rows
    return {"status": "ok", "source": "sqlite.recommendation_decisions", "ticker": symbol, "items": [_parse_json_field(row) for row in rows]}


def get_decision_outcomes(reader, ticker="", decision_id="", limit=10):
    symbol = _ticker(ticker)
    decision_id = str(decision_id or "").strip()
    if decision_id:
        rows = reader._safe_rows(
            "select * from recommendation_outcomes where decision_id=? order by horizon_days asc limit ?",
            (decision_id, int(limit or 10)),
        )
    elif symbol:
        rows = reader._safe_rows(
            "select * from recommendation_outcomes where ticker=? order by evaluated_at desc limit ?",
            (symbol, int(limit or 10)),
        )
    else:
        rows = reader._safe_rows(
            "select * from recommendation_outcomes order by evaluated_at desc limit ?",
            (int(limit or 10),),
        )
    if isinstance(rows, dict):
        return rows
    return {"status": "ok", "source": "sqlite.recommendation_outcomes", "ticker": symbol, "items": [_parse_json_field(row) for row in rows]}


def get_factor_stats(reader, factor_id="", limit=20):
    factor_id = str(factor_id or "").strip()
    if factor_id:
        rows = reader._safe_rows(
            "select * from factor_stats where factor_id=? order by samples desc limit ?",
            (factor_id, int(limit or 20)),
        )
    else:
        rows = reader._safe_rows(
            "select * from factor_stats order by samples desc limit ?",
            (int(limit or 20),),
        )
    if isinstance(rows, dict):
        return rows
    return {"status": "ok", "source": "sqlite.factor_stats", "items": [_parse_json_field(row) for row in rows]}


def get_run_snapshot(reader, run_id="", limit=1):
    run_id = str(run_id or "").strip()
    if run_id:
        rows = reader._safe_rows("select * from runs where id=? limit 1", (run_id,))
    else:
        rows = reader._safe_rows("select * from runs order by completed_at desc limit ?", (int(limit or 1),))
    if isinstance(rows, dict):
        return rows
    return {"status": "ok", "source": "sqlite.runs", "items": [_parse_json_field(row) for row in rows]}


def sqlite_tools(sqlite_path=None):
    reader = SqliteReader(sqlite_path)
    ticker_limit_schema = {
        "type": "object",
        "properties": {
            "ticker": {"type": "string", "default": ""},
            "limit": {"type": "integer", "default": 10},
        },
    }
    return [
        Tool("get_recent_decisions", "读取近期买卖建议记录。", ticker_limit_schema, lambda ticker="", limit=10: get_recent_decisions(reader, ticker, limit)),
        Tool(
            "get_decision_outcomes",
            "读取建议的 T+N 追责 outcome、超额收益、MAE/MFE。",
            {
                "type": "object",
                "properties": {
                    "ticker": {"type": "string", "default": ""},
                    "decision_id": {"type": "string", "default": ""},
                    "limit": {"type": "integer", "default": 10},
                },
            },
            lambda ticker="", decision_id="", limit=10: get_decision_outcomes(reader, ticker, decision_id, limit),
        ),
        Tool(
            "get_factor_stats",
            "读取因子 rankIC、命中率和样本统计。",
            {"type": "object", "properties": {"factor_id": {"type": "string", "default": ""}, "limit": {"type": "integer", "default": 20}}},
            lambda factor_id="", limit=20: get_factor_stats(reader, factor_id, limit),
        ),
        Tool(
            "get_run_snapshot",
            "读取采集 run 快照。",
            {"type": "object", "properties": {"run_id": {"type": "string", "default": ""}, "limit": {"type": "integer", "default": 1}}},
            lambda run_id="", limit=1: get_run_snapshot(reader, run_id, limit),
        ),
    ]
