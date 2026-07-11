import json
import os
import subprocess
import tempfile

from .base import InvokerError, LlmResult, safe_subprocess_env
from ..config import CODEX_MODELS, CODEX_TIMEOUTS_MS, DEFAULT_CODEX_COMMAND, codex_args_template


def _first_json_object(text):
    start = (text or "").find("{")
    if start < 0:
        return ""
    depth = 0
    in_string = False
    escape = False
    for idx in range(start, len(text)):
        ch = text[idx]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : idx + 1]
    return ""


def _parse_codex_stdout(stdout, last_message=""):
    text = (last_message or "").strip()
    if text:
        return text
    raw = (stdout or "").strip()
    if not raw:
        return ""
    for candidate in (raw, _first_json_object(raw)):
        if not candidate:
            continue
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return json.dumps(payload, ensure_ascii=False)
        if isinstance(payload, str):
            return payload.strip()
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    return lines[0] if lines else raw


class CodexCliInvoker:
    def __init__(self, command=None, args_template=None, models=None, timeouts_ms=None):
        self.command = command or DEFAULT_CODEX_COMMAND
        self.args_template = list(args_template or codex_args_template())
        self.models = dict(models or CODEX_MODELS)
        self.timeouts_ms = dict(timeouts_ms or CODEX_TIMEOUTS_MS)

    def _args(self, prompt, model, output_file):
        args = [
            item.replace("{prompt}", prompt).replace("{model}", model or "").replace("{output_file}", output_file)
            for item in self.args_template
        ]
        if model and "{model}" not in " ".join(self.args_template):
            insert_at = 1 if args and args[0] == "exec" else 0
            args[insert_at:insert_at] = ["--model", model]
        return args

    def invoke(self, system, user, tier="standard", timeout_ms=None):
        model = self.models.get(tier) or self.models.get("standard") or ""
        prompt = "%s\n\n%s" % (system or "", user or "")
        configured_timeout = self.timeouts_ms.get(tier) or self.timeouts_ms["standard"]
        effective_timeout = min(int(timeout_ms), int(configured_timeout)) if timeout_ms else int(configured_timeout)
        timeout_s = effective_timeout / 1000.0
        output_file = tempfile.NamedTemporaryFile(prefix="market-pulse-codex-", suffix=".txt", delete=False)
        output_path = output_file.name
        output_file.close()
        env = safe_subprocess_env()
        try:
            proc = subprocess.run(
                [self.command] + self._args(prompt, model, output_path),
                input=prompt,
                capture_output=True,
                text=True,
                cwd=tempfile.gettempdir(),
                env=env,
                timeout=timeout_s,
            )
        except FileNotFoundError as exc:
            raise InvokerError("codex-cli 不在 PATH: %s" % self.command) from exc
        except subprocess.TimeoutExpired as exc:
            raise InvokerError("codex-cli 超时: %sms" % int(timeout_s * 1000)) from exc
        finally:
            try:
                with open(output_path, "r", encoding="utf-8") as handle:
                    last_message = handle.read()
            except OSError:
                last_message = ""
            try:
                os.unlink(output_path)
            except OSError:
                pass
        if proc.returncode != 0:
            detail = (proc.stderr or proc.stdout or "").strip()
            raise InvokerError(detail or "codex-cli 退出码 %s" % proc.returncode)
        text = _parse_codex_stdout(proc.stdout, last_message)
        if not text:
            raise InvokerError((proc.stderr or "").strip() or "codex-cli 没有返回文本")
        provider_model = model or "default"
        return LlmResult(text=text, provider="codex-cli:%s:%s" % (provider_model, tier), raw=proc.stdout)
