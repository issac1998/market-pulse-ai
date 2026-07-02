# Market Pulse AI

Market Pulse AI 是一个本地运行的美股投研工作台。它把行情、新闻正文、SEC 文件、社交热度、期权链、宏观数据、交易记录和多 Agent 分析合在一个中文网页里，目标是每天盘前/盘后自动生成可读报告，并帮助复盘选股和操作建议。

本项目只做信息聚合、研究辅助和模拟建议，不构成个性化投资建议，也不会自动下单。

## 当前能力

- 中文首页：大盘状态、重要新闻、数据新鲜度、数据源健康、邮件/调度状态。
- 个股详情页：自由输入 ticker，拉取行情、K 线、MA10/MA20、估值、新闻、SEC、研报代理、同业和上下游、期权链/GEX。
- 新闻正文摘要：抽取新闻正文后生成中文事实、影响、核验点和投资观察；LLM 失败时标明本地规则兜底。
- 市场热闻：宏观、市场、个股三类展示，过滤低价值旧闻和重复新闻。
- 社交热议：支持 ApeWisdom、Stocktwits、Reddit/RSS、自定义源、小红书 CLI、X/TrendRadar 可选接入。
- 候选池 Agent：扫描全市场候选，输出买入、观察、卖出、持有检查，并记录命中规则。
- 因子学习：按超额收益、Rank IC、命中率、MAE/MFE 做机械归因，冻结样本不足因子，避免权重漂移。
- 多 Agent harness：可在个股页手动运行 LLM 多空辩论，并回灌到当前报告。
- 交易日志：记录每笔操作，支持 FIFO 复盘、持仓、paper book、T+1/3/5/10 追责。
- 期权模块：优先 IBKR Socket，fallback 到 Nasdaq/Yahoo/Finnhub，展示期权链、GEX、OI/Volume、异常期权。
- 定时任务：NYSE 交易日盘前、盘后、候选池 Agent 定时运行；盘中告警可选开启。
- 邮件报告：支持 Resend 或 SMTP，把盘前/盘后摘要发到邮箱。
- 存储：主存 `data/store.json`，旧 run 归档，SQLite mirror 用于查询、回测和 harness 工具。

## 技术栈

- 后端：Node.js ESM，单进程 HTTP 服务，入口 `server.mjs`。
- 前端：原生 HTML/CSS/JavaScript，入口 `public/index.html`、`public/app.js`。
- Python 工具：AkShare/OpenBB/IBKR/文章抽取/Agent harness 通过脚本桥接。
- 本地 LLM 调用：Codex CLI、Antigravity CLI、Gemini CLI/API、OpenAI API，均有本地规则兜底。

核心目录：

```text
server.mjs                  主服务和 API 路由
server/                     网络、邮件、CLI、HTTP、静态文件等后端模块
lib/                        金融数学、市场日历、推荐器核心纯函数
public/                     前端页面
scripts/                    AkShare、OpenBB、IBKR、正文抽取、SQLite sync 等脚本
harness/                    Python 多 Agent 辩论和复盘框架
strategies/                 美股策略配置和全市场 Agent skill
docs/                       设计、配置、审计和演进文档
data/                       本地运行数据，已被 .gitignore 忽略
```

## 快速启动

项目核心服务不依赖 npm 包安装，直接用 Node 运行。

```bash
cd /Users/a/Desktop/codes/market-pulse-ai
cp .env.example .env
node server.mjs
```

打开：

```text
http://localhost:5173/
```

配置中心：

```text
http://localhost:5173/configuration.html
```

如果要后台运行：

```bash
screen -dmS market-pulse-ai bash -lc 'cd /Users/a/Desktop/codes/market-pulse-ai && exec node server.mjs'
screen -ls
```

停止 screen：

```bash
screen -S market-pulse-ai -X quit
```

## 最小配置

所有密钥写入 `.env`，不要提交 `.env`。当前 `.gitignore` 已忽略 `.env`、`data/`、SQLite、日志、harness artifacts 和虚拟环境。

推荐先配置这些：

```env
LLM_PROVIDER=codex-cli
SCHEDULE_LLM_PROVIDER=codex-cli
ARTICLE_LLM_PROVIDER=antigravity-cli

FINNHUB_API_KEY=你的_finnhub_key
SEC_USER_AGENT=MarketPulseAI/0.1 your_email@example.com

REPORT_EMAIL_ENABLED=true
REPORT_EMAIL_TO=你的邮箱@example.com
RESEND_API_KEY=你的_resend_key
RESEND_FROM=Market Pulse AI <onboarding@resend.dev>
```

如果要用 Longbridge：

```env
LONG_BRIDGE_ENABLED=true
LONG_BRIDGE_COMMAND=longbridge
```

如果要用 IBKR Gateway：

```env
IBKR_GATEWAY_ENABLED=true
IBKR_GATEWAY_HOST=127.0.0.1
IBKR_GATEWAY_PORT=4001
OPTIONS_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub
```

完整配置步骤见：

- [配置攻略](docs/CONFIGURATION_GUIDE.md)
- [外部研究源](docs/RESEARCH_SOURCES.md)

## LLM 路由

当前推荐路由：

- 新闻正文摘要：`ARTICLE_LLM_PROVIDER=antigravity-cli`，适合用 Gemini Pro 档做长正文总结。
- 聊天：用户在前端主动触发，按页面选择的 provider。
- 其他自动任务：默认 `codex-cli`，包括市场总结、候选池 Agent、投资建议、回测复盘和邮件摘要。
- 失败处理：外部 LLM 超时会进入 provider/tier 冷却，页面会显示 `LLM 摘要`、`LLM 失败·本地兜底` 或 `已读原文·规则摘要`。

常用诊断：

```bash
curl -s http://localhost:5173/api/source-diagnostics
curl -s -X POST http://localhost:5173/api/external-provider-smoke-test
```

## 常用 API

```bash
# 当前页面状态
curl -s http://localhost:5173/api/state

# 手动运行报告
curl -s -X POST http://localhost:5173/api/run \
  -H 'Content-Type: application/json' \
  --data '{"session":"manual","async":true}'

# 查看运行状态
curl -s http://localhost:5173/api/run/status

# 拉取单股 Longbridge 快照
curl -s -X POST http://localhost:5173/api/stocks/snapshot \
  -H 'Content-Type: application/json' \
  --data '{"ticker":"NVDA"}'

# 运行候选池 Agent
curl -s -X POST http://localhost:5173/api/all-stock-agent/run

# 运行 Agent harness 辩论并回灌
curl -s -X POST http://localhost:5173/api/agent-debate/run \
  -H 'Content-Type: application/json' \
  --data '{"ticker":"NVDA","invoker":"codex-cli"}'

# 发送最新报告邮件
curl -s -X POST http://localhost:5173/api/report-email
```

## 定时任务

默认计划基于 NYSE 交易日和纽约时间：

- 盘前报告：`.env` 的 `SCHEDULE_PRE_NEW_YORK_TIME`，默认 `07:45`。
- 盘后报告：默认 `16:30`。
- 候选池 Agent：默认 `17:05`。
- 盘中告警：默认关闭；开启：

```env
INTRADAY_ALERTS_ENABLED=true
INTRADAY_ALERTS_NEW_YORK_TIME=12:30
```

页面会显示最近报告、最近邮件、下一次计划任务和数据新鲜度。

## 数据源概览

核心源：

- Longbridge：行情、K 线、新闻、基本面、日历、研报代理、行业/同业。
- IBKR Gateway：行情、历史、期权链、账户/交易同步能力，取决于权限和订阅。
- Finnhub：新闻、报价、公司资料、部分 fallback。
- SEC EDGAR：8-K、10-Q、10-K、Form 4 等官方文件。
- OpenBB：可选扩展源。
- AkShare：中文新闻、估值历史、K 线 fallback、全球指数和美债收益率。
- FRED：宏观 regime、收益率、信用利差、通胀预期、VIX。
- RSS/Google News/财经站点：市场热闻候选和正文抽取。
- ApeWisdom/Stocktwits/Reddit/XHS/X/TrendRadar：社交热议和主题雷达。

数据源失败不会让整份报告空白。系统会记录 provider 错误、超时、权限限制和本地 fallback。

## 测试

提交前建议跑：

```bash
node --check server.mjs
node --check public/app.js
node --check server/network_fetch.mjs
node scripts/core_regression_tests.mjs
python3 -m unittest harness.tests.test_harness
```

可选诊断：

```bash
curl -s http://localhost:5173/api/sqlite/status
curl -s -X POST http://localhost:5173/api/ibkr/socket-smoke-test \
  -H 'Content-Type: application/json' \
  --data '{"ticker":"AAPL"}'
```

## Git 和隐私

已经忽略：

```text
.env
data/
logs/
harness/artifacts/
.venv-openbb/
.tools/
node_modules/
```

推送前建议检查：

```bash
git status --short
git ls-files | rg '(^|/)(\\.env$|data/|node_modules/|\\.venv|__pycache__|\\.DS_Store|credentials|secret|token|cookie|store\\.json|\\.sqlite|runs/)'
git grep -n -I -E '(API_KEY=|COOKIE=|PASSWORD=|SECRET=|TOKEN=)' -- . ':!.env.example'
```

远端仓库：

```text
https://github.com/issac1998/market-pulse-ai.git
```

## 重要限制

- 新闻正文会受到付费墙、登录态、反爬和脚本渲染影响。
- IBKR 行情、历史和期权字段取决于账户权限、订阅和 Gateway 连接状态。
- Finnhub、NewsAPI、Polygon、Alpha Vantage 等第三方 API 有免费额度和权限限制。
- LLM 输出必须结合原始来源、价格、成交量、财报和风险管理复核。
- 任何买入、卖出、持有建议都只是研究辅助，不是财务顾问意见。

## 相关文档

- [配置攻略](docs/CONFIGURATION_GUIDE.md)
- [全市场 Agent](docs/ALL_STOCK_AGENT.md)
- [Agent harness 设计](docs/AGENT_HARNESS_DESIGN.md)
- [股票推荐系统演进](docs/STOCK_RECOMMENDER_EVOLUTION_DESIGN.md)
- [审计与加固 V4](docs/AUDIT_AND_HARDENING_V4.md)
- [完成度记录](docs/COMPLETION_REPORT.md)
