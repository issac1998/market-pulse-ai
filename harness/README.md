# Market Pulse AI Agent Harness

独立 Python Agent 运行时，按 `docs/AGENT_HARNESS_DESIGN.md` 实现。

常用命令：

```bash
python3 -m harness run --agent chat_analyst --ticker NVDA --invoker mock
python3 -m harness chat --ticker NVDA --question "看一下主要风险" --invoker mock
python3 -m harness debate --ticker NVDA --invoker mock
python3 -m harness review --ticker NVDA --invoker mock
python3 -m harness chat --ticker NVDA --question "看一下主要风险" --invoker codex-cli
```

默认 invoker 是 `agy-cli`，也可显式使用 `codex-cli`。可用环境变量覆盖：

- `ANTIGRAVITY_CLI_COMMAND`
- `ANTIGRAVITY_CLI_ARGS_JSON`
- `ANTIGRAVITY_CLI_MODEL_LIGHT`
- `ANTIGRAVITY_CLI_MODEL_STANDARD`
- `ANTIGRAVITY_CLI_MODEL_REASONING`
- `ANTIGRAVITY_CLI_MODEL_HEAVY`
- `CODEX_CLI_COMMAND`
- `CODEX_CLI_ARGS_JSON`
- `CODEX_CLI_MODEL_LIGHT`
- `CODEX_CLI_MODEL_STANDARD`
- `CODEX_CLI_MODEL_REASONING`
- `CODEX_CLI_MODEL_HEAVY`
- `CODEX_CLI_TIMEOUT_LIGHT_MS`
- `CODEX_CLI_TIMEOUT_STANDARD_MS`
- `CODEX_CLI_TIMEOUT_REASONING_MS`
- `CODEX_CLI_TIMEOUT_HEAVY_MS`
- `MARKET_PULSE_BASE_URL`
- `SQLITE_DB_FILE`

所有工具只读：HTTP 工具读取 Node API，SQLite 工具读取 `data/market_pulse.sqlite`。
