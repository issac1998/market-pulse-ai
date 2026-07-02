# 全市场选股 Agent Skill

这个 skill 是全市场选股 Agent 的唯一运行逻辑来源。人可以读前面的说明，程序读取下方 `json` 配置块。

## 设计原则

- 先筛候选池，再用规则评分；LLM 只能补充解释，不能绕过风险门控。
- 买入建议必须同时满足：价格/技术、新闻或基本面、数据覆盖、市场风险四类证据。
- 卖出建议优先看：趋势破坏、负面催化、持仓亏损或集中、市场风险抬升。
- 每天复盘历史买入/卖出建议，用后续股价变化统计规则命中效果。
- 自动更新 skill 只能小幅修改规则权重，不能删除规则、不能直接新增高风险规则。

```json
{
  "schemaVersion": "all-stock-agent-skill-v1",
  "name": "全市场选股 Agent",
  "settings": {
    "maxCandidates": 180,
    "buyLimit": 10,
    "buyThreshold": 64,
    "sellThreshold": 58,
    "minDataQuality": 42,
    "minBuyPrice": 1,
    "reviewAfterDays": [1, 3, 5, 10],
    "autoUpdate": true,
    "minSamplesForWeightUpdate": 20,
    "maxDailyWeightStep": 1,
    "promoteAvgReturnPct": 2.5,
    "demoteAvgReturnPct": -2.5,
    "allowAddToExisting": false
  },
  "buyRules": [
    {
      "id": "advisor_buy",
      "label": "投资建议 Agent 已给出买入或高分观察",
      "condition": "advisor_action_buy",
      "weight": 16
    },
    {
      "id": "score_strength",
      "label": "综合分达到买入区间",
      "condition": "score_above_buy_threshold",
      "weight": 12
    },
    {
      "id": "trend_confirmed",
      "label": "价格站上 10 日线和 20 日线",
      "condition": "price_above_sma10_sma20",
      "weight": 12
    },
    {
      "id": "momentum_not_overheated",
      "label": "RSI 不处于极端过热区",
      "condition": "rsi_not_overheated",
      "weight": 7
    },
    {
      "id": "material_positive_news",
      "label": "近期存在可解释的正向新闻或事件催化",
      "condition": "positive_material_news",
      "weight": 12
    },
    {
      "id": "fundamental_quality",
      "label": "基本面至少有增长或盈利质量支撑",
      "condition": "fundamental_growth_quality",
      "weight": 10
    },
    {
      "id": "expectation_gap_positive",
      "label": "一致预期或反向 DCF 显示正向预期差",
      "condition": "positive_expectation_gap",
      "weight": 9
    },
    {
      "id": "social_with_catalyst",
      "label": "社交热度有明确理由，不只是 ticker 提及",
      "condition": "social_heat_with_reason",
      "weight": 8
    },
    {
      "id": "industry_chain_supported",
      "label": "同业或上下游信息没有明显拖累",
      "condition": "industry_chain_supported",
      "weight": 8
    },
    {
      "id": "market_risk_ok",
      "label": "大盘风险不处于高风险区",
      "condition": "market_regime_not_high_risk",
      "weight": 8
    },
    {
      "id": "data_coverage_ok",
      "label": "数据覆盖达到最低要求",
      "condition": "data_coverage_min",
      "weight": 7
    }
  ],
  "sellRules": [
    {
      "id": "advisor_sell",
      "label": "投资建议 Agent 已给出卖出",
      "condition": "advisor_action_sell",
      "weight": 18
    },
    {
      "id": "technical_breakdown",
      "label": "价格跌破 20 日线或趋势转弱",
      "condition": "price_below_sma20",
      "weight": 14
    },
    {
      "id": "negative_news_cluster",
      "label": "出现中高材料性负面新闻聚集",
      "condition": "negative_material_news",
      "weight": 14
    },
    {
      "id": "agent_position_loss",
      "label": "历史买入建议后跌幅触发复盘止损",
      "condition": "position_loss_or_thesis_break",
      "weight": 12
    },
    {
      "id": "expectation_gap_high_risk",
      "label": "价格隐含增长明显高于基本面或一致预期",
      "condition": "high_expectation_risk",
      "weight": 9
    },
    {
      "id": "market_risk_high",
      "label": "大盘风险高，降低新增风险暴露",
      "condition": "market_high_risk",
      "weight": 8
    },
    {
      "id": "earnings_near_high_risk",
      "label": "财报临近且证据不足",
      "condition": "earnings_event_near",
      "weight": 6
    }
  ],
  "riskGates": [
    {
      "id": "missing_price_or_data",
      "label": "缺少价格或数据覆盖过低",
      "condition": "missing_price_or_data",
      "action": "veto_buy"
    },
    {
      "id": "low_price_or_penny_stock",
      "label": "股价低于最低买入价，疑似仙股/低流动性标的",
      "condition": "low_price_or_penny_stock",
      "action": "veto_buy"
    },
    {
      "id": "missing_buy_technical",
      "label": "缺少 K 线/均线，不能生成买入候选",
      "condition": "missing_buy_technical",
      "action": "veto_buy"
    },
    {
      "id": "missing_buy_fundamental",
      "label": "缺少基本面/主业数据，不能生成买入候选",
      "condition": "missing_buy_fundamental",
      "action": "veto_buy"
    },
    {
      "id": "hard_technical_breakdown",
      "label": "价格跌破 20 日线且趋势向下",
      "condition": "hard_technical_breakdown",
      "action": "veto_buy"
    },
    {
      "id": "hard_negative_news",
      "label": "负面催化强于正面催化",
      "condition": "hard_negative_news",
      "action": "veto_buy"
    },
    {
      "id": "hard_market_risk",
      "label": "大盘风险处于高位",
      "condition": "hard_market_risk",
      "action": "cap_buy"
    },
    {
      "id": "debate_risk_veto_shadow",
      "label": "多智能体风险经理否决，买入降权",
      "condition": "debate_risk_veto_shadow",
      "action": "shadow_cap_buy"
    },
    {
      "id": "debate_disagreement_shadow",
      "label": "多智能体多空分歧，买入降权",
      "condition": "debate_disagreement_shadow",
      "action": "shadow_downweight"
    }
  ]
}
```

## Changelog

- 2026-07-01：加入预期差规则和多智能体合议影子闸门；风险经理否决不直接写死全局 veto，但会把买入分数压到正式阈值以下。
- 2026-06-27：增加最低买入价、K线/均线、基本面硬门槛；未达正式阈值的补位候选也必须具备趋势和可验证证据，避免低价/缺数据票进入买入前十。
- 2026-06-27：自学习调权改为至少 20 个冻结 outcome 样本后才触发，避免 3 个样本噪声误改规则。
- 2026-06-26：初始化第一版规则，采用多源候选池、买卖规则命中、持仓复盘和有限幅度自更新。
