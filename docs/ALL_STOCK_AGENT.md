# 候选池 Skill Agent 实现说明

## 参考方案

- [TradingAgents](https://github.com/TauricResearch/TradingAgents)：采用基本面、情绪、新闻、技术、交易、风控和组合经理等角色拆分，并保存 decision log，把后续收益反馈回下一次决策。
- [ai-hedge-fund](https://github.com/virattt/ai-hedge-fund)：采用多风格投资人/估值/情绪/基本面/技术/风控/组合经理协作，强调只做教育研究，不直接真实下单。
- [FinGPT](https://github.com/AI4Finance-Foundation/FinGPT)：重点是金融文本、情绪和 RAG，适合做新闻/公告/社区讨论的语义层增强。
- [OpenBB](https://github.com/OpenBB-finance/OpenBB)：更像数据基础设施层，适合把多 provider 数据统一给研究 dashboard、MCP、REST 或 AI agent 消费。

## 当前落地

- Skill 文档：`strategies/all_stock_agent_skill.md`。
- 后端 API：
  - `GET /api/all-stock-agent`
  - `POST /api/all-stock-agent/run`
- 前端入口：`#/actions` 的“候选池 Skill Agent”。
- 定时任务：纽约时间每个交易日 17:05，使用当天最新报告运行。

## 候选池来源

当前扫描的是“可获取候选池”，不是无遗漏全市场数据库；系统会用 Nasdaq Symbol Directory 过滤 ETF/测试标的，并用静态黑名单过滤常见指数代理。候选来源包括：

- Longbridge 异动榜、热度榜和行情榜。
- Global Stock Data 市场扫描。
- ApeWisdom / 社交热议榜、新闻相关 ticker、因子候选池。
- 自选股、真实持仓、Agent 虚拟持仓。
- 已采集的行情、K线、基本面覆盖列表。

## 决策闭环

1. 从候选池取最多 `maxCandidates` 个 ticker。
2. 每个 ticker 读取 skill 中的买入、卖出、风控规则。
3. 只有满足最低价格、K线/均线、基本面、数据覆盖和风险门槛的股票才会进入买入候选；否则只进入观察或缺失数据说明。
4. 生成买入候选、持仓卖出检查、持仓继续观察。
5. 记录每条买入/卖出建议命中的规则和当时价格。
6. 后续运行时用当前价复盘历史建议表现。
7. 若某条规则样本数足够且收益显著好/差，则每天最多小幅调整一次规则权重，并写回 skill 文档。

## 仍缺的数据

- 完整 point-in-time 美股 security master：用于真正无遗漏扫描全部上市股票和历史退市股票。
- 批量盘口/逐笔/资金流：目前主要是单股页按需拉取。
- 批量期权链和 option time-and-sales：当前不作为全市场批量打分输入。
- 更稳定的全文新闻/研报授权源：当前已有多源新闻和正文抓取，但付费墙和限流仍会影响覆盖。
- 真实交易执行/成交回报：当前是研究建议和虚拟持仓记录，不会真实下单。
