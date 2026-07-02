# Market Pulse AI 调研记录

更新时间：2026-06-20

## 现成能力结论

### OpenBB

- 来源：https://github.com/OpenBB-finance/OpenBB
- 定位：开源金融数据平台，适合把行情、历史 K 线、基本面、新闻、期权等 provider route 统一成 Python/REST 接口。
- 当前项目使用方式：`scripts/openbb_bridge.py` 和页面 OpenBB route 调用已经接入；主报告默认只跑稳定 route，避免 Python/provider 超时拖垮整轮报告。
- 可继续借鉴：route 标准化、provider fallback、数据质量标记、同业/基本面字段归一。
- 不直接照搬原因：OpenBB 是数据平台，不是“已完成中文投研摘要”的完整应用；不同 provider 的新闻正文权限和限流仍需本项目自己的正文抽取、LLM 摘要和风险标记。

### Longbridge AI Skill / CLI / MCP

- 来源：https://open.longbridge.cn/skill/install.md、https://github.com/longbridge/skills
- 定位：面向 AI Agent 的市场数据 skill，提供 Longbridge CLI/MCP、行情、K线、新闻、筛股、组合等能力。
- 当前项目使用方式：Longbridge 已作为行情、K线、新闻正文、全市场热股/异动原因、基本面、估值、分析师数据和财报日历源接入；期权链仍按用户要求优先走 IBKR。官方 Codex plugin 已安装：`longbridge@longbridge-skills 2.0.0`，安装目录 `/Users/a/.codex/plugins/cache/longbridge-skills/longbridge/2.0.0`。
- 可继续借鉴：AI Agent 的问法设计、跨市场筛选、情绪追踪、基本面/业绩报告入口。
- 不直接完全替换原因：Longbridge 更偏数据和交易能力入口；新闻正文、中文投研摘要、社交热议解释、IBKR 期权链和本地日报仍需要本项目自己的业务逻辑。

### Finnhub Economic Calendar 替代源

- 当前结论：Finnhub Economic Calendar 对当前 key 返回 `403 {"error":"You don't have access to this resource."}`，这是资源权限/套餐问题，不应绕过。系统保留 Finnhub earnings calendar；宏观经济日历改成“能用则用 Finnhub，不可用则使用官方免费源”。
- 已接入免费官方源：
  - Federal Reserve 官方月度 Calendar：动态读取 Speeches/Testimony，用于 Fed 讲话和证词。
  - New York Fed Economic Indicators Calendar：动态读取美国关键经济数据发布日期，覆盖 Employment Situation、CPI、PPI、PCE/GDP、JOLTS、Initial Claims、Durable Goods、ISM/PMI 等。
  - Fed/BLS/BEA 静态兜底：当 Finnhub 和动态源不可用时仍能给出核心美股宏观节点。
- 取舍：这些源覆盖美国核心宏观/Fed 节点，但不是完整全球经济日历。完整全球日历可继续评估 Trading Economics、Financial Modeling Prep、EODHD 等免费/试用 API；它们通常需要账号 key、额度限制或付费计划，不能当作无授权免费源。

### 新闻摘要与正文抽取

- 当前项目使用方式：优先从新闻详情页/源站正文抽取，再走 LLM 结构化摘要；LLM 超时则使用本地正文规则摘要，不让报告空白。
- 已加防护：
  - 每条新闻输出中文摘要、关键数据、投资观察和核验动作。
  - 所有新闻先做重要性排序，再输出今日主线、风险和接下来观察。
  - Antigravity/Gemini 翻译和摘要调用有批次超时、整轮预算和失败降级。
  - 对 SPCX/SpaceX 这类身份不清材料做误导性表述清洗，避免把映射标的写成普通股上市。
- 现成仓库取舍：宽泛的 GitHub 搜索没有找到可直接替代本项目的高质量“美股新闻正文读取 + 中文投研摘要 + 社交热议解释 + 本地页面”的成品 skill；因此当前路线是用 OpenBB/Longbridge/Finnhub/IBKR 做数据源，摘要和展示逻辑在本项目内实现。

### ApeWisdom 社交详情

- 来源：https://apewisdom.io/api/、https://apewisdom.io/stocks/ASML/
- 当前项目使用方式：列表 API 用来发现全市场 Reddit 热榜；详情页 HTML 用来补充 24h 提及、讨论用户数、正负面比例和 nearby keywords。关键词会先作为社交热议解释的一层证据，再用 Google News RSS 做公开新闻搜索验证，并与 Longbridge 新闻、公司画像、基本面、技术面交叉验证。
- 取舍：ApeWisdom 关键词能解释“讨论在围绕什么”，但不能单独证明基本面变化。系统现在会把关键词线索分成两类：搜到近期公开新闻时标为“新闻搜索已找到相关线索”，搜不到时只标为“仅按社交关键词初步推断”。详情页和关键词搜索均默认低频串行，遇到 429 会按 `Retry-After` 或本地冷却配置慢速重试。

## 当前验证点

- 关键日历已合并：
  - 重点股票财报：来自 Longbridge/Finnhub 基本面与 Finnhub earnings calendar。
  - 宏观/Fed：Finnhub economic calendar 可用时优先使用；不可用时用 Federal Reserve、New York Fed、Fed/BLS/BEA 官方日历兜底。
  - Fed 讲话：动态解析 Federal Reserve 官方月度 Calendar 的 Speeches/Testimony 区块。
  - 美国关键经济指标：动态解析 New York Fed Economic Indicators Calendar。
- 最新验证 run `1781894788798-manual` 已包含：
  - 2026-06-22 Governor Christopher J. Waller 讲话。
  - 2026-06-25 PCE、GDP、Initial Claims、Durable Goods。
  - 2026-06-30 JOLTS。
  - 2026-07-02 非农。
  - 2026-07-01 ADP、ISM Manufacturing。
  - New York Fed 动态事件 37 条。

## 仍需继续关注

- Finnhub Economic Calendar 当前 key 返回 403；官方兜底能覆盖核心美股宏观节点，但不是完整全球经济日历。
- 新闻摘要质量仍依赖正文抽取可读性；被反爬、付费墙或登录态限制的原文只能降级为标题/摘要源。
- Longbridge 官方 Codex plugin 已安装，但当前 Codex 会话需要重启或新线程后才能自动触发新 skills；本项目应用侧仍继续使用已接好的 Longbridge CLI。
