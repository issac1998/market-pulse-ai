from dataclasses import dataclass


class InvokerError(Exception):
    """Raised when an LLM invoker cannot produce usable text."""


@dataclass
class LlmResult:
    text: str
    provider: str
    raw: str = ""
