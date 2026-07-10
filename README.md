# Market Pulse AI

Market Pulse AI 是一个本地运行的美股投研工作台：多源采集行情、新闻正文、SEC 文件、社交热度、期权链、宏观数据，用**确定性因子引擎 + 硬规则 Agent**产出每日候选建议，用**冻结决策 + 基准相对 outcome**对每条建议追责，用 LLM 做摘要、叙事、辩论和复盘。所有页面为中文，服务跑在 `localhost:5173`。

> 本项目只做信息聚合、研究辅助和模拟建议，不构成个性化投资建议，**没有任何自动下单代码路径**。

---

## 一、系统总逻辑（The Whole Logic）

整条流水线是一个闭环，每一步的输出都是下一步的可审计输入：

```
① 采集 Collect        盘前/盘后定时抓取：新闻(多源+正文抽取)、SEC、行情/K线、
                      基本面、期权链、宏观(FRED)、社交热度、Longbridge 研报代理
        │
② 归一 & 质量 Audit    去重、canonical URL、语义归属、翻译/摘要(LLM)、
                      每个数据块打质量分 → dataQualityAudit（缺失>造假）
        │
③ 因子快照 Snapshot    每只候选生成 10 因子快照（动量/质量成长/估值预期差/
                      盈利修正/新闻催化/产业链/宏观 regime/期权流/聪明钱/社交热度），
                      同业基线归一化，缺数据的因子记 50 分中性 + missingReason
        │
④ 确定性打分 Score     alphaScore = Σ(权重×归一因子) × 数据质量乘数 × regime 乘数
                      + 组合适配 − 风险惩罚。LLM 不在这条算式里
        │
⑤ 硬规则决策 Decide    skill(strategies/all_stock_agent_skill.md) 的买/卖规则 +
                      硬 veto/cap 闸门 + 反过度交易闸门(见下) → 每日 ≤3 正式买入、
                      观察买入、卖出、持有检查；辩论 harness 只作 shadow gate
        │
⑥ 冻结记录 Record     决策落盘即冻结：因子快照、价格、基准篮子、策略版本哈希
                      (strategyVersion)、宏观 regime 标签、证据引用、数据质量审计。
                      事后永不重算（修正只追加）
        │
⑦ 追责 Track          T+1/3/5/10/20/60 冻结 outcome：相对 SPY/行业篮子的超额收益、
                      deadband 判胜负、MAE/MFE → 按规则×周期×regime 累积统计
        │
⑧ 机械学习 Learn      纯统计通道：因子差分优势(命中 vs 未命中)、rankIC、命中率，
                      样本 ≥20 才动，每步 ≤2%，样本不足的因子冻结。
                      LLM 的文字教训被隔离在 harness 记忆里，永远不写权重
        │
⑨ 复盘 Review         IBKR Flex 导入 + FIFO 交易日志 + 行为分析 +
                      交易↔建议对账（aligned / contrarian / uncovered）+
                      paper book 和用户 accept-a-call 纸面组合
        └──────────────→ 回到 ① 次日循环
```

核心设计原则：**确定性内核，LLM 外围**。买卖分数由可回放的算式产生；同一份冻结快照 + 同一个策略版本，永远得到同一个分数。这是所有追责、回测和学习能成立的前提。

## 二、LLM 的角色边界：不写分数，策略怎么进化？

LLM 在本系统里**被禁止**写 `factorSnapshot` 因子分、gate 决策和因子权重（每条决策记录里都带 `llmGovernance` 戳记声明这一点）。它负责：新闻/财报摘要与翻译、叙事与论点合成、多空辩论（bull/bear/risk/coordinator）、失效条件提示、交易复盘报告、聊天问答（注入 ≤4 个只读工具结果）。

策略进化走三条相互隔离的通道：

1. **机械权重通道（统计驱动）**：⑥⑦ 的冻结记录让每个因子的真实预测力可以被测量——某因子命中的建议是否跑赢未命中的？rankIC 是否显著？满足样本门槛后，权重按 ≤2%/步 机械微调。改进权重的是 outcome 统计，不是任何模型的"感觉"。路线图的下一步是把学到的权重先写成**候选策略版本**，walk-forward 验证胜过现役版本才允许采纳（含一键回滚）。
2. **规则通道（人类驱动）**：按 regime/周期切分的规则统计和回测暴露哪条买卖规则在赚钱、哪个闸门在救命。**人**据此修改 skill JSON；每次修改产生新的 configHash 策略版本，后续表现可归因到这次修改。LLM 可以*提议*（"估值因子在 risk_off 里失效"），采纳永远是人的动作。
3. **知识通道（LLM 的正确席位）**：LLM 改进的是*输入质量和解释质量*——更好的正文抽取和催化剂识别喂给确定性解析器；辩论作为 shadow gate 运行，只有当它 veto 的名字在 ≥50 个决策、跨 ≥2 个 regime 中被证明确实更差，才逐级升格为 cap → 硬 veto（**用证据赢得权限，而不是被授予权限**）；复盘教训写入 harness 情景记忆，作为未来分析的上下文被召回，永不直接改参数。

为什么这样设计：LLM 输出不可复现（无法回测一段心情）、易受生动叙事影响、无法归因。让它写分数会同时毁掉可回放性、可追责性和学习回路本身。类比：LLM 是研究员团队，因子引擎是量化模型，硬规则+人是投委会——研究员靠更好的证据和质疑提升决策质量，公司靠度量哪些信号真的有效来改模型，但没有人允许研究员在情绪激动的一周后直接改模型系数。

## 三、反过度交易与风控闸门

每天全市场扫描会产出很多"看起来能买"的名字，闸门把它们压到人能消化、账户能承受的量级：

| 闸门 | 默认 | 作用 |
|---|---|---|
| 正式买入上限 | 3/天 | 超出部分降级为研究/观察 |
| Actionable 数据质量门槛 | DQ ≥ 60 | 数据不够真实的名字不允许成为正式买入 |
| 单票冷却 | 5 个交易日 | 同一票短期不重复推荐 |
| 失败 thesis 冷却 | 20 个交易日 | 上次跑输基准的票冷却更久 |
| 财报黑窗 | ±2 天 | 财报附近不出新买入 |
| 组合暴露动态阈值 | 暴露越高，买入分门槛越高 | 仓位重时提高入场标准 |
| 硬 veto/cap | 无趋势数据、流动性差、社交-only 催化等 | 直接拦截或降档 |

被闸门拦下的名字不会消失——它们带着被拦原因进入研究列表，继续可见、可追踪。

## 四、追责与审计

- **策略版本**：skill JSON 每次变化都产生 `sha256` configHash 版本（如 `all-stock-bcb68ff291cc`），每条决策/outcome 都盖章，性能可按版本归因。
- **Regime 标签**：每条决策/outcome/因子统计带宏观 regime 桶（risk_on / neutral / risk_off / high_risk），学习和评估必须能按 regime 切分——一个 regime 里学到的东西不自动适用于另一个。
- **冻结不可变**：决策和 outcome 落盘后永不重算；基准篮子在决策时刻锁定，事后不换。
- **审计事件**：采集运行、Agent 运行、配置修改、纸面接受、订单草稿全部写 `audit_events`。
- **订单草稿双锁**：`/api/order-drafts` 只生成草稿、不调用 broker API，且必须同时满足 `IBKR_TRADING_ENABLED=true` **和**存在 `data/ALLOW_LIVE_TRADING` 文件，否则一律拦截并留审计记录。默认两把锁都是关的。

## 五、架构与目录

```text
server.mjs                  主服务：54+ API 路由、调度器、采集器、分析器、推荐 Agent
server/                     网络/邮件/CLI/HTTP/静态文件等后端模块 + all_stock 辩论闸门
lib/                        纯函数核心：finance_math(RSI/ATR/BS-IV)、market_core(日历/FIFO)、
                            recommender_core(因子权重/归一/打分/学习/outcome) ← 推荐大脑
public/                     原生 JS SPA，7 个 hash 页面
scripts/                    Python 桥(AkShare/OpenBB/IBKR/正文抽取) + sqlite_store_sync +
                            generate_route_inventory + 回归测试
harness/                    Python 多 Agent 运行时：bull/bear/risk/coordinator 辩论、
                            复盘归因 → SQLite 情景记忆；只读工具，结果 opt-in 回灌
strategies/                 all_stock_agent_skill.md：硬规则 skill(JSON + changelog)，策略状态的唯一来源
docs/                       设计/审计/路线图文档（见文末链接）
data/                       本地数据（.gitignore），store.json 主存 + market_pulse.sqlite 镜像
```

## 六、数据层

- **主存**：`data/store.json`（当前 ~100 MB，单文件 JSON）。路线图 P0 正在推进把 news/runs 迁到 SQLite 为主、store.json 降级为导出格式。
- **SQLite 镜像**：`data/market_pulse.sqlite`，保存时自动防抖同步，供查询/回测/harness 工具使用。核心表：

| 表 | 内容 |
|---|---|
| `runs` | 每次采集运行（含 slim_json 摘要 + 校验哈希） |
| `news_items` | 按 URL 去重的新闻条目（ticker/来源/时间/摘要） |
| `recommendation_decisions` | 冻结决策（含 strategy_version、regime、evidence_refs） |
| `recommendation_outcomes` | T+h 冻结 outcome（超额收益/MAE/MFE/regime） |
| `factor_stats` | 因子×周期统计（rankIC/命中率/样本数/regime） |
| `strategy_versions` | 策略版本注册表（configHash/变更原因） |
| `data_quality_audits` | 每条决策的数据质量审计块 |
| `options_snapshots` | 期权链快照累积（为将来的 IV rank 攒历史） |
| `pit_universe_snapshots` | 每日运行时观察到的 universe 快照（缓解回测幸存者偏差） |
| `audit_events` | 全量审计事件 |
| `user_paper_acceptances` | 用户 accept-a-call 纸面组合记录 |

累积类表（options/pit/regime）的价值在日历时间里增长，**断一天少一天**，因此它们在路线图里被最先启动。

### Google Drive 历史报告冷归档

- 最近 30 天的 `data/runs/<run-id>.json` 保留在本地；更早的报告由 `rclone` 上传到 `market-pulse-drive:MarketPulseAI/runs/`。
- 系统逐份核对远端文件大小和 MD5，只有校验成功才删除本地归档；历史列表摘要仍留在本地。
- 网页打开远端报告时会按需下载并校验 SHA256/MD5，下载缓存默认保留 24 小时。Drive 暂时不可用时只显示明确错误，不会覆盖或删除归档。
- 配置中心的“存储健康”会显示远端独占、待归档和失败数量，也可手动触发一轮维护。
- 首次配置：安装 `rclone`，创建名为 `market-pulse-drive` 的 Google Drive remote，再设置 `DRIVE_ARCHIVE_ENABLED=true`。OAuth 凭据保存在 `~/.config/rclone/rclone.conf`，不得提交到 Git。

当前配置使用 `drive.file` 最小权限。rclone 的公共 Google OAuth client 正在退出服务，长期运行应按 rclone 官方说明换成自己的 Google client id；这不会改变项目端的归档协议。

## 七、快速启动

核心服务不依赖 npm 安装，直接 Node 运行：

```bash
cd /Users/a/Desktop/codes/market-pulse-ai
cp .env.example .env   # 首次
node server.mjs
```

- 主页：`http://localhost:5173/`
- 配置中心：`http://localhost:5173/configuration.html`

后台运行：

```bash
screen -dmS market-pulse-ai bash -lc 'cd /Users/a/Desktop/codes/market-pulse-ai && exec node server.mjs'
```

可靠运行：

- 服务启动会写入 `data/server.lock`；SIGINT/SIGTERM 正常退出会清理。若上次进程 OOM 或 `kill -9`，下次启动会写入高严重度 alert 和 `server.crash_detected` 审计事件。
- 当前存储路径已避免每次保存全量 `structuredClone`；默认 2GB Node heap 应可完成常规采集。若做大规模历史回测或压力排查，可临时用 `NODE_OPTIONS=--max-old-space-size=6144 node server.mjs`。
- 需要登录后自启动和异常退出自动拉起时，优先把项目放到非 Desktop 隐私目录后执行：

```bash
./scripts/install_launch_agent.sh --replace-screen
./scripts/launch_agent_status.sh
```

### 最小配置（写入 `.env`，勿提交）

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

# Longbridge（行情/新闻/研报代理主源）
LONG_BRIDGE_ENABLED=true
LONG_BRIDGE_COMMAND=longbridge

# IBKR Gateway（只读；下单默认永久关闭）
IBKR_GATEWAY_ENABLED=true
IBKR_GATEWAY_HOST=127.0.0.1
IBKR_GATEWAY_PORT=4001
OPTIONS_PROVIDER_ORDER=ibkr,nasdaq,yahoo,finnhub

# 反过度交易（可选覆盖）
ALL_STOCK_AGENT_ACTIONABLE_BUY_LIMIT=3
ALL_STOCK_AGENT_MIN_ACTIONABLE_DQ=60
```

完整配置见 [配置攻略](docs/CONFIGURATION_GUIDE.md) 和 [外部研究源](docs/RESEARCH_SOURCES.md)。

## 八、常用 API

```bash
# 页面状态 / 手动运行 / 运行状态
curl -s http://localhost:5173/api/state
curl -s -X POST http://localhost:5173/api/run -H 'Content-Type: application/json' --data '{"session":"manual","async":true}'
curl -s http://localhost:5173/api/run/status

# ── 每日助手（路线图新增）──
curl -s http://localhost:5173/api/recommendations/today                      # 今日：≤3 正式买入 + 研究列表 + 战绩
curl -s "http://localhost:5173/api/recommendations/track-record?horizon=20"  # 战绩：按周期/regime 过滤，永远带样本数
curl -s "http://localhost:5173/api/stocks/deep-dive?ticker=NVDA"             # 个股深研：因子瀑布/产业链/期权/新闻时间线
curl -s http://localhost:5173/api/trade-recommendation-reconciliation        # 你的交易 vs 系统同日建议对账
curl -s http://localhost:5173/api/strategy-versions                          # 策略版本注册表
curl -s http://localhost:5173/api/strategy-versions/validate                 # 候选权重验证状态（只读，不改 skill）
curl -s "http://localhost:5173/api/lessons/relevant?ticker=NVDA"             # 相关历史教训（只作上下文）
curl -s -X POST http://localhost:5173/api/paper-portfolio/accept -H 'Content-Type: application/json' --data '{"decisionId":"..."}'
curl -s -X POST http://localhost:5173/api/order-drafts -H 'Content-Type: application/json' --data '{"ticker":"NVDA","action":"buy","quantity":1}'   # 默认被双锁拦截

# ── 既有核心 ──
curl -s -X POST http://localhost:5173/api/all-stock-agent/run                # 运行候选池 Agent
curl -s -X POST http://localhost:5173/api/stocks/snapshot -H 'Content-Type: application/json' --data '{"ticker":"NVDA"}'
curl -s -X POST http://localhost:5173/api/agent-debate/run -H 'Content-Type: application/json' --data '{"ticker":"NVDA","invoker":"codex-cli"}'
curl -s -X POST http://localhost:5173/api/report-email
curl -s http://localhost:5173/api/sqlite/status
```

## 九、定时任务

基于 NYSE 交易日和纽约时间：盘前报告默认 `07:45`、盘后 `16:30`、候选池 Agent `17:05`；盘中告警默认关闭（`INTRADAY_ALERTS_ENABLED=true` 开启）。页面显示最近报告、下一次计划和数据新鲜度。

## 十、测试

```bash
node --check server.mjs
node --check public/app.js
node scripts/core_regression_tests.mjs
python3 -m unittest harness.tests.test_harness
node scripts/generate_route_inventory.mjs --check   # 路由清单与代码一致性
```

## 十一、当前状态与已知缺口

对照 [最终路线图](docs/INVESTMENT_ASSISTANT_ROADMAP_FINAL.md)（阶段/里程碑定义在此），Phase 0 基础已落地：策略版本+regime 盖章、T+20/60 周期、反过度交易闸门、审计事件、累积表、路由清单。尚未完成/需要日历时间的：

- **SQLite 为主的存储迁移（P0.4）未开始**：store.json 仍是 ~100 MB 主存，`/api/state` 约 1 秒（目标 <300ms）。
- **验证门尚未接管学习**：`/validate` 目前只读展示；机械权重更新仍走既有的样本门槛+步长上限通道，候选版本 walk-forward 采纳流程是 Phase 2 目标。
- **IV rank / regime 切分统计需要数月样本累积**；期权快照的 ATM IV 抽取需校验（详见 execution 文档）。
- 今日页/深研页/对账的**前端界面**属于 Phase 1（当前先以 API 提供）。

执行明细见 [路线图执行清单](docs/INVESTMENT_ASSISTANT_ROADMAP_FINAL_EXECUTION.md)。

## 十二、重要限制

- 新闻正文受付费墙、登录态、反爬影响；数据源失败会被记录并降级，不会让报告空白。
- IBKR 行情/期权字段取决于账户权限、订阅和 Gateway 连接状态。
- 免费层 API（Finnhub/NewsAPI/Polygon/Alpha Vantage）有额度限制。
- LLM 输出必须结合原始来源、价格、财报和风险管理复核。
- 任何买入/卖出/持有建议都只是研究辅助，不是财务顾问意见；系统战绩必须和建议显示在同一屏。

## 相关文档

- [最终投资助手路线图](docs/INVESTMENT_ASSISTANT_ROADMAP_FINAL.md) ·（综合自 [Claude](docs/INVESTMENT_ASSISTANT_ROADMAP.md) / [Codex](docs/INVESTMENT_ASSISTANT_ROADMAP_v2.md) / [Gemini](docs/INVESTMENT_ASSISTANT_ROADMAP_v1.md) 三版草稿）
- [路线图执行清单](docs/INVESTMENT_ASSISTANT_ROADMAP_FINAL_EXECUTION.md)
- [路由清单](docs/CODEBASE_ROUTE_INVENTORY.md)
- [配置攻略](docs/CONFIGURATION_GUIDE.md) · [全市场 Agent](docs/ALL_STOCK_AGENT.md) · [Agent harness 设计](docs/AGENT_HARNESS_DESIGN.md)
- [股票推荐系统演进](docs/STOCK_RECOMMENDER_EVOLUTION_DESIGN.md) · [审计与加固 V4](docs/AUDIT_AND_HARDENING_V4.md)
