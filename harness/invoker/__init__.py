from .agy_cli import AgyCliInvoker
from .codex_cli import CodexCliInvoker
from .mock import MockInvoker


def build_invoker(name="agy-cli"):
    normalized = (name or "agy-cli").strip().lower()
    if normalized in {"mock", "offline"}:
        return MockInvoker()
    if normalized in {"agy", "agy-cli", "antigravity", "antigravity-cli"}:
        return AgyCliInvoker()
    if normalized in {"codex", "codex-cli"}:
        return CodexCliInvoker()
    raise ValueError("未知 invoker: %s" % name)
