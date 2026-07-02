import json
import time
from dataclasses import dataclass

from ..invoker.mock import MockInvoker
from .budget import Budget
from .protocol import parse_protocol, tool_protocol
from .trace import AgentTrace, utc_now_iso


@dataclass
class RunContext:
    invoker: object
    tools: object
    knowledge: object = None
    memory: object = None
    fallback_invoker: object = None


@dataclass
class AgentResult:
    output: dict
    trace: AgentTrace
    rawText: str = ""

    def to_dict(self):
        return {"output": self.output, "trace": self.trace.to_dict(), "rawText": self.rawText}


def _clip(value, max_chars=6000):
    text = json.dumps(value, ensure_ascii=False, default=str)
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "...[truncated]"


def _render_context(task_input, knowledge, memories):
    payload = {
        "taskInput": task_input,
        "knowledge": [
            {"id": chunk.id, "title": chunk.title, "text": chunk.text, "source": chunk.source}
            for chunk in (knowledge or [])
        ],
        "memory": memories or [],
    }
    return "INPUT_JSON:\n%s" % json.dumps(payload, ensure_ascii=False, default=str, indent=2)


def _is_final_payload(parsed):
    if not isinstance(parsed, dict):
        return False
    action = parsed.get("action")
    if action == "final":
        return True
    if action:
        return False
    return any(key in parsed for key in ("finalDecision", "answer", "stance", "riskVeto", "outcomeLabel"))


def _coerce_final(parsed, raw_text):
    if isinstance(parsed, dict):
        if parsed.get("action") == "final":
            next_payload = dict(parsed)
            next_payload.pop("action", None)
            return next_payload
        return parsed
    return {"answer": raw_text or "", "sources": []}


def _fallback_result(spec, task_input, trace, reason):
    trace.mark_degraded(reason)
    trace.completedAt = utc_now_iso()
    return AgentResult(
        output={
            "schemaVersion": getattr(spec, "output_schema", "") or "agent-fallback-v1",
            "degraded": True,
            "degradeReason": str(reason),
            "ticker": task_input.get("ticker"),
            "answer": "Agent harness 已降级：%s" % reason,
        },
        trace=trace,
    )


def _finalize_budget(trace, steps, budget, started):
    trace.completedAt = utc_now_iso()
    trace.budget = {"steps": steps, "toolCalls": budget.tool_calls, "ms": int((time.time() - started) * 1000)}


def _force_final(spec, task_input, ctx, active_invoker, history, tool_specs, trace, budget, started, reason):
    if not any(str(item).startswith("TOOL_RESULT ") for item in history):
        trace.budget = {"steps": spec.max_steps, "toolCalls": budget.tool_calls, "ms": int((time.time() - started) * 1000)}
        return _fallback_result(spec, task_input, trace, reason)
    system = "%s\n\n%s\n\n现在工具/步数预算已用完，禁止继续调用工具；必须基于已有 TOOL_RESULT 输出 final JSON。" % (
        spec.system_prompt,
        tool_protocol([]),
    )
    user = "\n\n".join(history + ["SYSTEM_FINAL_REQUEST: 请只输出 final JSON，不要再 call_tool。"])
    for invoker, label in ((active_invoker, "force_final"), (ctx.fallback_invoker or MockInvoker(), "force_final_fallback")):
        try:
            turn = invoker.invoke(system, user, tier=spec.tier, timeout_ms=spec.timeout_ms)
        except Exception as exc:
            trace.add(label, ok=False, error=str(exc))
            continue
        parsed = parse_protocol(turn.text)
        trace.invoker = turn.provider
        trace.add("llm_turn", step=spec.max_steps, provider=turn.provider, parsedAction=parsed.get("action") if isinstance(parsed, dict) else None, textPreview=(turn.text or "")[:500], forced=True)
        if _is_final_payload(parsed):
            trace.add("final", step=spec.max_steps, forced=True)
            _finalize_budget(trace, spec.max_steps + 1, budget, started)
            return AgentResult(output=_coerce_final(parsed, turn.text), trace=trace, rawText=turn.text)
    trace.budget = {"steps": spec.max_steps, "toolCalls": budget.tool_calls, "ms": int((time.time() - started) * 1000)}
    return _fallback_result(spec, task_input, trace, reason)


def run_agent_loop(spec, task_input, ctx):
    allowed_tools = list(getattr(spec, "tools", []) or [])
    tool_specs = ctx.tools.specs(allowed_tools)
    kb_chunks = ctx.knowledge.retrieve(spec, task_input) if ctx.knowledge else []
    memories = ctx.memory.recall(spec, task_input) if ctx.memory else []
    history = [_render_context(task_input, kb_chunks, memories)]
    trace = AgentTrace(agent=spec.id, ticker=str(task_input.get("ticker") or ""))
    budget = Budget(spec.max_steps, spec.max_tool_calls, spec.timeout_ms)
    invalid_count = 0
    active_invoker = ctx.invoker
    fallback_used = False
    started = time.time()

    for step in range(spec.max_steps):
        if not budget.step_allowed(step):
            break
        system = "%s\n\n%s" % (spec.system_prompt, tool_protocol(tool_specs))
        user = "\n\n".join(history)
        try:
            turn = active_invoker.invoke(system, user, tier=spec.tier, timeout_ms=spec.timeout_ms)
        except Exception as exc:
            if not fallback_used:
                trace.mark_degraded("invoker_error:%s" % exc)
                active_invoker = ctx.fallback_invoker or MockInvoker()
                fallback_used = True
                try:
                    turn = active_invoker.invoke(system, user, tier=spec.tier, timeout_ms=spec.timeout_ms)
                except Exception as fallback_exc:
                    return _fallback_result(spec, task_input, trace, "fallback_invoker_error:%s" % fallback_exc)
            else:
                return _fallback_result(spec, task_input, trace, "invoker_error:%s" % exc)

        trace.invoker = turn.provider
        parsed = parse_protocol(turn.text)
        trace.add(
            "llm_turn",
            step=step,
            provider=turn.provider,
            parsedAction=parsed.get("action") if isinstance(parsed, dict) else None,
            textPreview=(turn.text or "")[:500],
        )

        if _is_final_payload(parsed):
            trace.add("final", step=step)
            _finalize_budget(trace, step + 1, budget, started)
            return AgentResult(output=_coerce_final(parsed, turn.text), trace=trace, rawText=turn.text)

        if not isinstance(parsed, dict) or parsed.get("action") != "call_tool":
            invalid_count += 1
            if invalid_count >= 2:
                return _fallback_result(spec, task_input, trace, "protocol_parse_failed")
            history.append("SYSTEM_CORRECTION: 请只输出约定 JSON：call_tool 或 final。")
            continue

        invalid_count = 0
        tool_name = parsed.get("tool")
        tool_args = parsed.get("args") or {}
        if tool_name not in allowed_tools or not ctx.tools.has(tool_name):
            trace.add("tool_blocked", step=step, tool=tool_name, reason="not_allowed")
            history.append("TOOL_RESULT %s:\n%s" % (tool_name, json.dumps({"status": "error", "error": "工具不可用或未授权"}, ensure_ascii=False)))
            continue
        if not budget.tool_allowed():
            trace.add("tool_blocked", step=step, tool=tool_name, reason="budget_exhausted")
            history.append("SYSTEM_CORRECTION: 工具预算已用完，请基于已有信息 final。")
            continue
        budget.count_tool()
        result = ctx.tools.call(tool_name, tool_args)
        trace.add("tool_call", step=step, tool=tool_name, args=tool_args)
        trace.add("tool_result", step=step, tool=tool_name, ok=result.get("status") != "error", bytes=len(json.dumps(result, ensure_ascii=False, default=str)))
        history.append("ASSISTANT_JSON:\n%s" % (turn.text or ""))
        history.append("TOOL_RESULT %s:\n%s" % (tool_name, _clip(result)))

    return _force_final(spec, task_input, ctx, active_invoker, history, tool_specs, trace, budget, started, "max_steps_reached")
