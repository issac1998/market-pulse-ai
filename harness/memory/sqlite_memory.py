import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from ..config import MEMORY_DB_FILE
from .base import MemoryItem


class SQLiteMemory:
    def __init__(self, path=None):
        self.path = Path(path or MEMORY_DB_FILE)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _init(self):
        with sqlite3.connect(str(self.path)) as conn:
            conn.execute(
                """
                create table if not exists agent_memory (
                  id integer primary key autoincrement,
                  kind text not null,
                  ticker text,
                  as_of text,
                  regime text,
                  lesson text not null,
                  source_decision_id text,
                  outcome text,
                  tags_json text,
                  created_at text not null
                )
                """
            )
            conn.execute("create index if not exists idx_agent_memory_ticker on agent_memory(ticker, created_at desc)")

    def recall(self, spec, task_input, k=5):
        ticker = str(task_input.get("ticker") or "").upper()
        if not ticker:
            return []
        with sqlite3.connect(str(self.path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "select * from agent_memory where ticker=? or ticker='' order by created_at desc limit ?",
                (ticker, int(k or 5)),
            ).fetchall()
        items = []
        for row in rows:
            item = dict(row)
            try:
                item["tags"] = json.loads(item.get("tags_json") or "[]")
            except json.JSONDecodeError:
                item["tags"] = []
            item.pop("tags_json", None)
            items.append(item)
        return items

    def write_episodic(self, item):
        if isinstance(item, dict):
            item = MemoryItem(**item)
        with sqlite3.connect(str(self.path)) as conn:
            conn.execute(
                """
                insert into agent_memory
                (kind, ticker, as_of, regime, lesson, source_decision_id, outcome, tags_json, created_at)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item.kind or "episodic",
                    item.ticker,
                    item.asOf,
                    item.regime,
                    item.lesson,
                    item.sourceDecisionId,
                    item.outcome,
                    json.dumps(item.tags or [], ensure_ascii=False),
                    datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                ),
            )

    def promote_to_semantic(self, items):
        return None
