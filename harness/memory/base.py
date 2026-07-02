from dataclasses import dataclass, field


@dataclass
class MemoryItem:
    kind: str
    lesson: str
    ticker: str = ""
    asOf: str = ""
    regime: str = ""
    sourceDecisionId: str = ""
    outcome: str = ""
    tags: list = field(default_factory=list)
