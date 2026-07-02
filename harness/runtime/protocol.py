import json


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


def parse_protocol(text):
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    candidates = [raw]
    embedded = _first_json_object(raw)
    if embedded and embedded != raw:
        candidates.append(embedded)
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def tool_protocol(tool_specs):
    lines = [
        "工具调用协议：每轮只能输出一个 JSON 对象。",
        '调用工具：{"action":"call_tool","tool":"工具名","args":{...},"thought":"为什么需要"}',
        '最终答案：{"action":"final", ...}',
        "可用工具：",
    ]
    for spec in tool_specs:
        lines.append("- %s: %s 参数=%s" % (spec["name"], spec.get("description", ""), json.dumps(spec.get("parameters", {}), ensure_ascii=False)))
    return "\n".join(lines)
