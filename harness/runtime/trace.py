import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from ..config import ARTIFACTS_DIR


def utc_now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@dataclass
class AgentTrace:
    agent: str
    ticker: str = ""
    invoker: str = ""
    steps: list = field(default_factory=list)
    degraded: bool = False
    degradeReason: str = ""
    startedAt: str = field(default_factory=utc_now_iso)
    completedAt: str = ""
    budget: dict = field(default_factory=dict)

    def add(self, kind, **kwargs):
        row = {"kind": kind, "at": utc_now_iso()}
        row.update(kwargs)
        self.steps.append(row)

    def mark_degraded(self, reason):
        self.degraded = True
        self.degradeReason = str(reason or "")
        self.add("degraded", reason=self.degradeReason)

    def to_dict(self):
        return {
            "schemaVersion": "agent-trace-v1",
            "agent": self.agent,
            "ticker": self.ticker,
            "invoker": self.invoker,
            "steps": self.steps,
            "budget": self.budget,
            "degraded": self.degraded,
            "degradeReason": self.degradeReason,
            "startedAt": self.startedAt,
            "completedAt": self.completedAt or utc_now_iso(),
        }


def write_artifact(kind, name, payload):
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    directory = ARTIFACTS_DIR / stamp
    directory.mkdir(parents=True, exist_ok=True)
    safe_name = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in name)[:120] or "artifact"
    path = directory / ("%s.%s.json" % (safe_name, kind))
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return str(path)
