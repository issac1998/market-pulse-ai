from dataclasses import dataclass
import os


class InvokerError(Exception):
    """Raised when an LLM invoker cannot produce usable text."""


@dataclass
class LlmResult:
    text: str
    provider: str
    raw: str = ""


def safe_subprocess_env(extra=None):
    allowed = (
        "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TMP", "TEMP",
        "LANG", "LC_ALL", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
        "http_proxy", "https_proxy", "all_proxy", "no_proxy", "SSL_CERT_FILE",
        "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS", "XDG_CONFIG_HOME", "XDG_CACHE_HOME",
        "XDG_DATA_HOME", "CODEX_HOME", "ANTIGRAVITY_HOME", "AGY_CONFIG_HOME",
    )
    env = {key: os.environ[key] for key in allowed if key in os.environ}
    env.update({"NO_COLOR": "1", "TERM": os.environ.get("TERM") or "xterm-256color"})
    env.update(extra or {})
    return env
