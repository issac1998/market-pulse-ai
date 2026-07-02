from dataclasses import dataclass
from pathlib import Path

from ..config import AGENTS_DIR


@dataclass
class AgentSpec:
    id: str
    name: str
    tier: str
    tools: list
    max_steps: int
    max_tool_calls: int
    timeout_ms: int
    output_schema: str
    veto_power: bool
    system_prompt: str
    path: str


def _parse_value(value):
    raw = str(value).strip()
    if raw.lower() in {"true", "false"}:
        return raw.lower() == "true"
    if raw.startswith("[") and raw.endswith("]"):
        inside = raw[1:-1].strip()
        if not inside:
            return []
        return [item.strip().strip("'\"") for item in inside.split(",") if item.strip()]
    try:
        return int(raw)
    except ValueError:
        return raw.strip("'\"")


def _parse_frontmatter(text):
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end < 0:
        return {}, text
    block = text[3:end].strip()
    body = text[end + 4 :].lstrip()
    meta = {}
    for line in block.splitlines():
        if not line.strip() or line.strip().startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = _parse_value(value)
    return meta, body


def _extract_system_prompt(body):
    marker = "## System Prompt"
    start = body.find(marker)
    if start < 0:
        return body.strip()
    rest = body[start + len(marker) :].lstrip()
    next_header = rest.find("\n## ")
    if next_header >= 0:
        rest = rest[:next_header]
    return rest.strip()


def load_agent(agent_id, agents_dir=None):
    directory = Path(agents_dir or AGENTS_DIR)
    path = directory / ("%s.md" % agent_id)
    if not path.exists():
        raise FileNotFoundError("找不到 agent 定义: %s" % path)
    text = path.read_text(encoding="utf-8")
    meta, body = _parse_frontmatter(text)
    return AgentSpec(
        id=str(meta.get("id") or agent_id),
        name=str(meta.get("name") or agent_id),
        tier=str(meta.get("tier") or "standard"),
        tools=list(meta.get("tools") or []),
        max_steps=int(meta.get("max_steps") or 4),
        max_tool_calls=int(meta.get("max_tool_calls") or 4),
        timeout_ms=int(meta.get("timeout_ms") or 60000),
        output_schema=str(meta.get("output_schema") or ""),
        veto_power=bool(meta.get("veto_power") or False),
        system_prompt=_extract_system_prompt(body),
        path=str(path),
    )
