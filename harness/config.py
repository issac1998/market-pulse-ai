import json
import os
from pathlib import Path


HARNESS_DIR = Path(__file__).resolve().parent
REPO_ROOT = HARNESS_DIR.parent
DATA_DIR = REPO_ROOT / "data"
ARTIFACTS_DIR = HARNESS_DIR / "artifacts"
AGENTS_DIR = HARNESS_DIR / "agents"
KNOWLEDGE_DIR = HARNESS_DIR / "knowledge" / "files"

BASE_URL = os.environ.get("MARKET_PULSE_BASE_URL", "http://localhost:5173").rstrip("/")
SQLITE_DB_FILE = Path(os.environ.get("SQLITE_DB_FILE", str(DATA_DIR / "market_pulse.sqlite")))
MEMORY_DB_FILE = Path(os.environ.get("AGENT_MEMORY_DB_FILE", str(DATA_DIR / "agent_memory.sqlite")))

DEFAULT_AGY_COMMAND = os.environ.get("ANTIGRAVITY_CLI_COMMAND", "agy")
DEFAULT_AGY_ARGS = ["--print", "{prompt}", "--model", "{model}"]
DEFAULT_CODEX_COMMAND = os.environ.get("CODEX_CLI_COMMAND", "codex")
DEFAULT_CODEX_ARGS = [
    "exec",
    "--color",
    "never",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--output-last-message",
    "{output_file}",
    "-",
]

DEFAULT_MODELS = {
    "light": os.environ.get("ANTIGRAVITY_CLI_MODEL_LIGHT", "gemini-3.1-flash-lite"),
    "standard": os.environ.get("ANTIGRAVITY_CLI_MODEL_STANDARD", "gemini-3.1-flash-lite"),
    "reasoning": os.environ.get("ANTIGRAVITY_CLI_MODEL_REASONING", "gemini-3.1-pro-preview"),
    "heavy": os.environ.get("ANTIGRAVITY_CLI_MODEL_HEAVY", "gemini-3.1-pro-preview"),
}

DEFAULT_TIMEOUTS_MS = {
    "light": int(os.environ.get("ANTIGRAVITY_CLI_TIMEOUT_LIGHT_MS", "180000")),
    "standard": int(os.environ.get("ANTIGRAVITY_CLI_TIMEOUT_STANDARD_MS", "300000")),
    "reasoning": int(os.environ.get("ANTIGRAVITY_CLI_TIMEOUT_REASONING_MS", "600000")),
    "heavy": int(os.environ.get("ANTIGRAVITY_CLI_TIMEOUT_HEAVY_MS", "600000")),
}

CODEX_MODELS = {
    "light": os.environ.get("CODEX_CLI_MODEL_LIGHT", ""),
    "standard": os.environ.get("CODEX_CLI_MODEL_STANDARD", ""),
    "reasoning": os.environ.get("CODEX_CLI_MODEL_REASONING", ""),
    "heavy": os.environ.get("CODEX_CLI_MODEL_HEAVY", ""),
}

CODEX_TIMEOUTS_MS = {
    "light": int(os.environ.get("CODEX_CLI_TIMEOUT_LIGHT_MS", "180000")),
    "standard": int(os.environ.get("CODEX_CLI_TIMEOUT_STANDARD_MS", "300000")),
    "reasoning": int(os.environ.get("CODEX_CLI_TIMEOUT_REASONING_MS", "600000")),
    "heavy": int(os.environ.get("CODEX_CLI_TIMEOUT_HEAVY_MS", "600000")),
}


def agy_args_template():
    raw = os.environ.get("ANTIGRAVITY_CLI_ARGS_JSON")
    if not raw:
        return list(DEFAULT_AGY_ARGS)
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list) and all(isinstance(item, str) for item in parsed):
            return parsed
    except json.JSONDecodeError:
        pass
    return list(DEFAULT_AGY_ARGS)


def codex_args_template():
    raw = os.environ.get("CODEX_CLI_ARGS_JSON")
    if not raw:
        return list(DEFAULT_CODEX_ARGS)
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list) and all(isinstance(item, str) for item in parsed):
            return parsed
    except json.JSONDecodeError:
        pass
    return list(DEFAULT_CODEX_ARGS)
