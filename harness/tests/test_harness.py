import unittest
import os
from tempfile import TemporaryDirectory
from unittest.mock import patch

from harness.agents.loader import load_agent
from harness.invoker.agy_cli import _parse_agy_stdout
from harness.invoker.base import LlmResult, safe_subprocess_env
from harness.invoker.codex_cli import CodexCliInvoker, _parse_codex_stdout
from harness.invoker import build_invoker
from harness.invoker.mock import MockInvoker
from harness.knowledge.base import FileKnowledgeBase
from harness.memory.sqlite_memory import SQLiteMemory
from harness.runtime.loop import RunContext, run_agent_loop
from harness.tools.registry import Tool, ToolRegistry


class HarnessSmokeTest(unittest.TestCase):
    def test_agent_loader(self):
        spec = load_agent("chat_analyst")
        self.assertEqual(spec.id, "chat_analyst")
        self.assertIn("get_stock_snapshot", spec.tools)
        self.assertIn("工具", spec.system_prompt)

    def test_mock_loop_calls_tool(self):
        registry = ToolRegistry()
        registry.register(
            Tool(
                "get_stock_snapshot",
                "offline snapshot",
                {"type": "object", "required": ["ticker"], "properties": {"ticker": {"type": "string"}}},
                lambda ticker: {"status": "ok", "ticker": ticker, "quote": {"price": 100}},
            )
        )
        with TemporaryDirectory() as tmp:
            ctx = RunContext(
                invoker=MockInvoker(),
                fallback_invoker=MockInvoker(),
                tools=registry,
                knowledge=FileKnowledgeBase(),
                memory=SQLiteMemory(path=f"{tmp}/memory.sqlite"),
            )
            result = run_agent_loop(load_agent("chat_analyst"), {"ticker": "NVDA", "question": "看一下"}, ctx)
        self.assertIn("answer", result.output)
        kinds = [step["kind"] for step in result.trace.steps]
        self.assertIn("tool_call", kinds)
        self.assertIn("final", kinds)

    def test_factor_researcher_mock_proposes_factor(self):
        registry = ToolRegistry()
        registry.register(
            Tool(
                "get_factor_performance_report",
                "offline factor report",
                {"type": "object", "properties": {}},
                lambda: {
                    "status": "ok",
                    "correlationMatrix": {"highCorrelationPairs": []},
                    "factorStats": {},
                },
            )
        )
        registry.register(
            Tool(
                "get_factor_registry",
                "offline registry",
                {"type": "object", "properties": {}},
                lambda: {"status": "ok", "factors": [], "pastRejections": []},
            )
        )
        registry.register(
            Tool(
                "get_data_catalog",
                "offline data catalog",
                {"type": "object", "properties": {}},
                lambda: {"status": "ok", "availableBlocks": [{"key": "bars.volume"}]},
            )
        )
        registry.register(
            Tool(
                "get_lessons",
                "offline lessons",
                {"type": "object", "properties": {"ticker": {"type": "string", "default": ""}}},
                lambda ticker="": {"status": "ok", "lessons": {"rows": []}},
            )
        )
        with TemporaryDirectory() as tmp:
            ctx = RunContext(
                invoker=MockInvoker(),
                fallback_invoker=MockInvoker(),
                tools=registry,
                knowledge=FileKnowledgeBase(),
                memory=SQLiteMemory(path=f"{tmp}/memory.sqlite"),
            )
            result = run_agent_loop(load_agent("factor_researcher"), {"question": "proposal"}, ctx)
        self.assertEqual(result.output.get("schemaVersion"), "factor-proposal-v1")
        self.assertGreaterEqual(len(result.output.get("proposals", [])), 1)
        self.assertEqual(result.output["proposals"][0]["spec"]["pipeline"][0]["op"], "ref")

    def test_agy_stdout_preserves_protocol_json(self):
        raw = '{"action":"final","output":"should not be unwrapped","answer":"ok"}'
        parsed = _parse_agy_stdout(raw)
        self.assertIn('"action": "final"', parsed)
        self.assertIn('"output": "should not be unwrapped"', parsed)

    def test_codex_stdout_prefers_last_message(self):
        parsed = _parse_codex_stdout(
            'OpenAI Codex\\nnoise\\n{"action":"final","answer":"from stdout"}',
            '{"action":"final","answer":"from last message"}',
        )
        self.assertIn("from last message", parsed)

    def test_build_codex_invoker(self):
        self.assertIsInstance(build_invoker("codex-cli"), CodexCliInvoker)

    def test_llm_subprocess_env_excludes_server_secrets(self):
        with patch.dict(
            os.environ,
            {
                "PATH": "/usr/bin",
                "HTTPS_PROXY": "http://127.0.0.1:7890",
                "FINNHUB_API_KEY": "do-not-inherit",
                "RESEND_API_KEY": "do-not-inherit",
            },
            clear=True,
        ):
            env = safe_subprocess_env()
        self.assertEqual(env["PATH"], "/usr/bin")
        self.assertEqual(env["HTTPS_PROXY"], "http://127.0.0.1:7890")
        self.assertNotIn("FINNHUB_API_KEY", env)
        self.assertNotIn("RESEND_API_KEY", env)

    def test_force_final_after_max_steps_keeps_tool_evidence(self):
        class SequenceInvoker:
            def __init__(self):
                self.calls = 0

            def invoke(self, system, user, tier="standard", timeout_ms=None):
                self.calls += 1
                if self.calls == 1:
                    return LlmResult('{"action":"call_tool","tool":"get_stock_snapshot","args":{"ticker":"NVDA"}}', "sequence")
                return LlmResult('{"action":"final","answer":"基于已有工具结果收敛。","sources":["get_stock_snapshot"]}', "sequence")

        registry = ToolRegistry()
        registry.register(
            Tool(
                "get_stock_snapshot",
                "offline snapshot",
                {"type": "object", "required": ["ticker"], "properties": {"ticker": {"type": "string"}}},
                lambda ticker: {"status": "ok", "ticker": ticker, "quote": {"price": 100}},
            )
        )
        spec = load_agent("chat_analyst")
        spec.max_steps = 1
        with TemporaryDirectory() as tmp:
            invoker = SequenceInvoker()
            ctx = RunContext(
                invoker=invoker,
                fallback_invoker=MockInvoker(),
                tools=registry,
                knowledge=FileKnowledgeBase(),
                memory=SQLiteMemory(path=f"{tmp}/memory.sqlite"),
            )
            result = run_agent_loop(spec, {"ticker": "NVDA"}, ctx)
        self.assertEqual(result.output.get("answer"), "基于已有工具结果收敛。")
        self.assertFalse(result.trace.degraded)

    def test_protocol_invalid_count_is_consecutive(self):
        class SequenceInvoker:
            def __init__(self):
                self.outputs = [
                    "not json",
                    '{"action":"call_tool","tool":"get_stock_snapshot","args":{"ticker":"NVDA"}}',
                    "still not json",
                    '{"action":"final","answer":"ok after correction"}',
                ]

            def invoke(self, system, user, tier="standard", timeout_ms=None):
                text = self.outputs.pop(0)
                return LlmResult(text, "sequence")

        registry = ToolRegistry()
        registry.register(
            Tool(
                "get_stock_snapshot",
                "offline snapshot",
                {"type": "object", "required": ["ticker"], "properties": {"ticker": {"type": "string"}}},
                lambda ticker: {"status": "ok", "ticker": ticker},
            )
        )
        spec = load_agent("chat_analyst")
        spec.max_steps = 4
        with TemporaryDirectory() as tmp:
            ctx = RunContext(
                invoker=SequenceInvoker(),
                fallback_invoker=MockInvoker(),
                tools=registry,
                knowledge=FileKnowledgeBase(),
                memory=SQLiteMemory(path=f"{tmp}/memory.sqlite"),
            )
            result = run_agent_loop(spec, {"ticker": "NVDA"}, ctx)
        self.assertEqual(result.output.get("answer"), "ok after correction")
        self.assertFalse(result.trace.degraded)


if __name__ == "__main__":
    unittest.main()
