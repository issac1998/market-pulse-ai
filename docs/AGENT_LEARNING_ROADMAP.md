# Agent 工程师学习路线(面试导向)

> 更新时间:2026-07。定位:系统学习 AI Agent 工程,以面试为导向,每个阶段配开源项目 + 高频面试题与参考答案。参考实现以 **Claude Code / Codex CLI / OpenClaw** 三个真实 harness 为主线,由浅入深覆盖:LLM 基础 → Agent 循环与 harness → 工具调用与 MCP → 知识库/RAG → 记忆 → 上下文工程与多 Agent → SFT/RLHF/Agentic RL → AI Coding 与聊天机器人应用 → 安全/评估/生产化。

---

## 总览:路线图

| 阶段 | 主题 | 核心开源项目/资料 | 建议时长 |
|---|---|---|---|
| 0 | LLM 基础前置 | karpathy/nanoGPT、HF LLM Course、vLLM | 1-2 周 |
| 1 | Agent 核心循环与 Harness | openai/codex、claude-agent-sdk、smolagents、mini-swe-agent | 2 周 |
| 2 | 工具调用与 MCP | MCP spec、modelcontextprotocol/servers、codex 沙箱源码 | 1-2 周 |
| 3 | 知识库与 RAG | LlamaIndex、ragflow、GraphRAG、qdrant、ragas | 2 周 |
| 4 | 记忆系统 | mem0、letta(MemGPT)、graphiti(Zep)、OpenClaw memory | 1-2 周 |
| 5 | 上下文工程、规划与多 Agent | LangGraph、AutoGen、Anthropic/Cognition 博客 | 1-2 周 |
| 6 | 训练侧:SFT → DPO/GRPO → Agentic RL | LLaMA-Factory、TRL、unsloth、verl、OpenRLHF | 3-4 周 |
| 7 | 应用一:AI Coding Agent | Claude Code、Codex、OpenHands、Aider、SWE-agent、Cline | 2 周 |
| 8 | 应用二:聊天机器人/个人助理 | OpenClaw、Dify、LobeChat、livekit/agents | 1-2 周 |
| 9 | 安全、评估与生产化 | Langfuse、SWE-bench、tau-bench、prompt injection 研究 | 1 周 |

三个主线参考实现:

| | Claude Code | Codex CLI | OpenClaw |
|---|---|---|---|
| 仓库 | [anthropics/claude-code](https://github.com/anthropics/claude-code)(CLI 本体闭源混淆,文档/issue 开放;[Agent SDK](https://github.com/anthropics/claude-agent-sdk-python) 开源) | [openai/codex](https://github.com/openai/codex)(Rust,Apache-2.0,全开源) | [openclaw/openclaw](https://github.com/openclaw/openclaw)(TypeScript,开源) |
| 定位 | 终端 coding agent | 终端 coding agent | 自托管个人助理(多聊天渠道) |
| 学习价值 | harness 设计的事实标准:权限、hooks、subagent、compaction、skills | 唯一能读全源码的一线大厂 agent;沙箱实现教科书 | 消息型 agent 的完整形态:gateway、渠道适配、心跳、文件型记忆 |
| 项目记忆 | CLAUDE.md | AGENTS.md | workspace 内 markdown |

---

## 阶段 0:LLM 基础前置

### 要掌握的知识
- **Tokenization**:BPE 原理;为什么 token ≠ 字/词;中英文 token 效率差异;换 tokenizer 对成本核算的影响。
- **Transformer 推理**:prefill vs decode 两阶段;KV cache;为什么 decode 是逐 token 的、受显存带宽约束。
- **采样**:temperature / top-p / top-k / greedy;为什么推理型模型(o1、Claude 4.7+)开始移除采样参数。
- **Chat 模型**:base vs instruct;chat template(ChatML、Llama 格式);system/user/assistant 角色是"训练出来的约定",不是模型固有结构。
- **上下文窗口**:注意力的二次复杂度;长上下文的真实衰减(见阶段 5 的 context rot)。

### 学习资料
- [karpathy: Neural Networks Zero to Hero](https://github.com/karpathy/nn-zero-to-hero) + [nanoGPT](https://github.com/karpathy/nanoGPT) —— 手写一遍 GPT。
- [Hugging Face LLM Course](https://huggingface.co/learn/llm-course) —— 免费,含 transformers 库实操。
- Stanford [CS336: Language Modeling from Scratch](https://stanford-cs336.github.io/) —— 想深入训练侧的看这个。
- [vLLM](https://github.com/vllm-project/vllm) 文档中 PagedAttention 部分 —— 理解推理服务。

### 面试题

**Q1:KV cache 是什么?为什么能加速?代价是什么?**
答:自回归解码时,每生成一个新 token 都要对全部历史 token 做注意力。历史 token 的 Key/Value 在参数不变时是不变的,把它们缓存起来,每步只需计算新 token 的 Q/K/V,复杂度从每步 O(n²) 降到 O(n)。代价是显存:KV cache 大小 ≈ 2 × 层数 × KV头数 × head_dim × 序列长度 × 精度字节数,长上下文时常常超过权重本身。工程上衍生出 GQA/MQA(减少 KV 头)、PagedAttention(分页管理避免碎片)、prefix caching(跨请求复用相同前缀的 KV)——最后这个就是 API "prompt caching" 计费便宜的底层原因。

**Q2:prefill 和 decode 有什么区别?对 agent 有什么影响?**
答:prefill 并行处理整个 prompt,算力密集;decode 逐 token 生成,显存带宽密集。agent 的特点是"长 prompt(工具定义+历史)、短生成、高频往返",所以 input token 消耗远大于 output,prompt caching 的收益极大;这也是为什么 agent harness 设计要保证前缀稳定(见阶段 5)。

**Q3:base model 和 instruct model 的区别?chat template 是什么?**
答:base 只做 next-token 预测,不会"对话";instruct 经过 SFT/对齐,学会遵循 chat template 中的角色约