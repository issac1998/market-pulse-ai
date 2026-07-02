from dataclasses import dataclass


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    handler: object
    read_only: bool = True
    max_calls_per_run: int = 3
    timeout_ms: int = 15000


class ToolRegistry:
    def __init__(self):
        self._tools = {}

    def register(self, tool):
        if not tool.read_only:
            raise ValueError("harness 只允许注册只读工具: %s" % tool.name)
        self._tools[tool.name] = tool

    def specs(self, allowed=None):
        names = set(allowed or self._tools.keys())
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
                "readOnly": tool.read_only,
            }
            for name, tool in sorted(self._tools.items())
            if name in names
        ]

    def has(self, name):
        return name in self._tools

    def call(self, name, args):
        tool = self._tools.get(name)
        if not tool:
            return {"status": "error", "error": "未知工具: %s" % name}
        clean_args = self._validate(tool.parameters, args or {})
        try:
            result = tool.handler(**clean_args)
            if isinstance(result, dict):
                return result
            return {"status": "ok", "result": result}
        except Exception as exc:
            return {"status": "error", "tool": name, "error": str(exc)}

    def _validate(self, schema, args):
        if not isinstance(args, dict):
            args = {}
        props = (schema or {}).get("properties") or {}
        required = (schema or {}).get("required") or []
        clean = {}
        for key, spec in props.items():
            if key in args:
                value = args[key]
                expected = spec.get("type")
                if expected == "integer":
                    try:
                        value = int(value)
                    except (TypeError, ValueError):
                        value = spec.get("default")
                elif expected == "number":
                    try:
                        value = float(value)
                    except (TypeError, ValueError):
                        value = spec.get("default")
                elif expected == "boolean":
                    value = bool(value)
                elif expected == "string":
                    value = str(value)
                clean[key] = value
            elif key in required and "default" in spec:
                clean[key] = spec.get("default")
        missing = [key for key in required if key not in clean]
        if missing:
            raise ValueError("缺少参数: %s" % ", ".join(missing))
        return clean


def build_default_registry(base_url=None, sqlite_path=None):
    from .http_tools import http_tools
    from .sqlite_tools import sqlite_tools

    registry = ToolRegistry()
    for tool in http_tools(base_url=base_url):
        registry.register(tool)
    for tool in sqlite_tools(sqlite_path=sqlite_path):
        registry.register(tool)
    return registry
