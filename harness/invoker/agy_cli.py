import json
import subprocess
import tempfile

from .base import InvokerError, LlmResult, safe_subprocess_env
from ..config import DEFAULT_AGY_COMMAND, DEFAULT_MODELS, DEFAULT_TIMEOUTS_MS, agy_args_template


def _parse_agy_stdout(stdout):
    text = (stdout or "").strip()
    if not text:
        return ""
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return text
    if isinstance(payload, dict):
        if any(key in payload for key in ("action", "schemaVersion", "finalDecision", "answer", "stance", "riskVeto", "outcomeLabel")):
            return json.dumps(payload, ensure_ascii=False)
        for key in ("response", "text", "output", "content", "message"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return json.dumps(payload, ensure_ascii=False)
    if isinstance(payload, str):
        return payload.strip()
    return text


class AgyCliInvoker:
    def __init__(self, command=None, args_template=None, models=None, timeouts_ms=None):
        self.command = command or DEFAULT_AGY_COMMAND
        self.args_template = list(args_template or agy_args_template())
        self.models = dict(models or DEFAULT_MODELS)
        self.timeouts_ms = dict(timeouts_ms or DEFAULT_TIMEOUTS_MS)

    def invoke(self, system, user, tier="standard", timeout_ms=None):
        model = self.models.get(tier) or self.models.get("standard") or "gemini-3.1-flash-lite"
        prompt = "%s\n\n%s" % (system or "", user or "")
        args = [
            item.replace("{prompt}", prompt).replace("{model}", model)
            for item in self.args_template
        ]
        env = safe_subprocess_env()
        configured_timeout = self.timeouts_ms.get(tier) or self.timeouts_ms["standard"]
        effective_timeout = min(int(timeout_ms), int(configured_timeout)) if timeout_ms else int(configured_timeout)
        timeout_s = effective_timeout / 1000.0
        try:
            proc = subprocess.run(
                [self.command] + args,
                capture_output=True,
                text=True,
                stdin=subprocess.DEVNULL,
                cwd=tempfile.gettempdir(),
                env=env,
                timeout=timeout_s,
            )
        except FileNotFoundError as exc:
            raise InvokerError("agy-cli 不在 PATH: %s" % self.command) from exc
        except subprocess.TimeoutExpired as exc:
            raise InvokerError("agy-cli 超时: %sms" % int(timeout_s * 1000)) from exc
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "").strip()
            raise InvokerError(detail or "agy-cli 退出码 %s" % proc.returncode)
        text = _parse_agy_stdout(proc.stdout)
        if not text:
            raise InvokerError((proc.stderr or "").strip() or "agy-cli 没有返回文本")
        return LlmResult(text=text, provider="agy-cli:%s:%s" % (model, tier), raw=proc.stdout)
