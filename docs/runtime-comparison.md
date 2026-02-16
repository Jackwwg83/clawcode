# Runtime 对比实验报告

> pi-embedded vs Claude Agent SDK — 同一框架下的行为差异观察

**日期：** 2026-02-16
**版本：** ClawCode v0.1 (基于 OpenClaw v2026.2.13)
**作者：** ClawCode Team

---

## 1. 实验背景

OpenClaw 是一个通过 IM 通讯工具（WhatsApp、Telegram、Discord 等）让普通人使用 AI 完成真实世界任务的平台。用户在聊天窗口里发一句话，OpenClaw 解析意图、调用工具、返回结果。

ClawCode 在 OpenClaw 的 agent 执行层引入了 **Claude Agent SDK** 作为可选运行时。两个 runtime 共享同一个消息入口：

```
用户消息 → IM Gateway → pi-embedded.ts（路由层）→ runtime 分叉
                                                    ├─ pi-embedded（原生）
                                                    └─ claude-sdk（可选）
```

唯一分叉点是 `src/agents/pi-embedded.ts` 中的 `shouldUseClaudeSdk()` 函数。路由规则：

- `CLAWCODE_RUNTIME=claude-sdk` **且** provider 为 `anthropic` → 使用 SDK
- 其他所有情况 → 使用 pi-embedded

**实验目的：** 在同一框架、同一任务下，切换 runtime 会不会产生**可观察的行为差异**。不是比较好坏，只是记录事实。

---

## 2. 两个 Runtime 的技术画像

基于代码分析，两者在以下维度有结构性差异：

| 维度              | pi-embedded                                                                                    | Claude Agent SDK                                                                                  |
| :---------------- | :--------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------ |
| **调用方式**      | 本进程，pi-agent-core 库，多轮循环                                                             | 本进程，SDK `query()` 异步迭代器                                                                  |
| **工具来源**      | OpenClaw 定制工具（`read`, `write`, `exec`, `web_search` 等小写命名，~22 个原生工具）          | SDK 内置工具（`Read`, `Write`, `Bash`, `WebSearch` 等 CamelCase）+ OpenClaw 独有工具通过 MCP 桥接 |
| **System Prompt** | OpenClaw 动态构建（含 skills、channel actions、工具摘要、上下文注入等），每次 attempt 重新生成 | SDK 预设 `claude_code` preset + `append` 追加 OpenClaw 额外指令                                   |
| **上下文管理**    | 主动 compaction（最多 3 次重试）+ 工具结果截断回退 + 显式 token 累加器                         | SDK 内部管理（黑盒），OpenClaw 层不干预                                                           |
| **会话模型**      | SessionManager (JSONL) 持久化，支持多轮 resume，支持 steer（运行中注入消息）                   | 单次查询（`persistSession: false`），OpenClaw SessionManager 仅做历史记录                         |
| **权限控制**      | 7 层策略：profile → global → agent → channel → owner-only → sandbox → plugin hooks             | SDK `bypassPermissions` 放行 + OpenClaw hooks 做实际权限控制                                      |
| **多 provider**   | 支持所有（Anthropic / OpenAI / Gemini / Ollama 等）                                            | 仅 Anthropic（非 Anthropic 自动回退到 pi-embedded）                                               |

### 工具映射关系

| 工具类别                   | pi-embedded 工具                       | SDK 运行时                       |
| :------------------------- | :------------------------------------- | :------------------------------- |
| 文件操作                   | `read`, `write`, `edit`, `apply_patch` | SDK 内置 `Read`, `Write`, `Edit` |
| 命令执行                   | `exec`, `process`                      | SDK 内置 `Bash`                  |
| 搜索                       | `web_search`, `web_fetch`              | SDK 内置 `WebSearch`, `WebFetch` |
| 文件搜索                   | —                                      | SDK 内置 `Glob`, `Grep`          |
| 会话/消息/浏览器/定时/记忆 | 原生工具                               | MCP 桥接                         |

---

## 3. 实验设计

### 3.1 环境

- **机器：** VM (ubuntu@54.169.224.161, ssh alias: clawcode)
- **实例：** 同一 ClawCode 实例，同一 API 代理 (http://18.141.210.162:3000/api)
- **切换方式：** `CLAWCODE_RUNTIME` 环境变量
- **模型：** 两个 runtime 使用同一模型 **claude-sonnet-4-5-20250929**

### 3.2 方法

每个测试用例跑两次（先 pi-embedded，后 claude-sdk），间隔 5 秒。通过 CLI `agent --local --json` 执行，记录完整 JSON 输出。

### 3.3 测试用例

| #      | 用户消息                                                                           | 考察重点            |
| :----- | :--------------------------------------------------------------------------------- | :------------------ |
| **T1** | "帮我总结一下今天的科技新闻"                                                       | Web 搜索 + 信息整合 |
| **T2** | "读一下 package.json，这个项目是做什么的"                                          | 文件读取 + 理解     |
| **T3** | "帮我写一个 Python 脚本，把当前目录下所有 .txt 文件合并成一个"                     | 编码任务            |
| **T4** | "这段代码有什么问题？`for(var i=0;i<10;i++){setTimeout(()=>console.log(i),100)}`"  | 纯推理              |
| **T5** | "帮我查一下 src/agents/ 目录下有哪些文件，然后告诉我这个项目的 agent 架构是怎样的" | 多步骤探索          |

---

## 4. 实验结果

### T1: "帮我总结一下今天的科技新闻"

| 指标                     | pi-embedded                                                                             | Claude SDK                                                                                                               |
| :----------------------- | :-------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| **响应摘要**             | 尝试调用 `web_search` 但因缺少 Brave API 密钥失败，返回配置指引                         | 成功使用 `WebSearch` 搜索并返回了 5 条详细科技新闻摘要（印度 AI 峰会、TypeScript 6.0、AI 监管、Cursor 新功能、中国光伏） |
| **工具调用**             | `web_search` → 失败（缺 Brave API key）                                                 | `WebSearch` → 成功（SDK 内置搜索）                                                                                       |
| **Token (in / out)**     | 8 / 289                                                                                 | 915 / 997                                                                                                                |
| **Cache (read / write)** | 16,984 / 17,210                                                                         | 34,287 / 5,054                                                                                                           |
| **响应时间**             | 9,454ms                                                                                 | 34,676ms                                                                                                                 |
| **任务完成**             | **未完成** — 缺少搜索 API 配置                                                          | **完成** — 返回了有出处的新闻摘要                                                                                        |
| **关键差异**             | pi-embedded 的 `web_search` 依赖 OpenClaw 配置的 Brave Search API key；未配置则直接失败 | SDK 的 `WebSearch` 使用自带的搜索能力，不依赖 OpenClaw 的 Brave 配置                                                     |

### T2: "读一下 package.json，这个项目是做什么的"

| 指标                     | pi-embedded                                                                                                               | Claude SDK                                                                                                   |
| :----------------------- | :------------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------- |
| **响应摘要**             | 读取了 package.json，总结为"多渠道 AI 网关"，列出核心功能、技术栈、跨平台支持                                             | 读取了 package.json，总结为"多通道 AI 网关"，列出主要特点，并额外注意到了 git commit 中的 ClawCode fork 信息 |
| **工具调用**             | `read`（package.json）→ 2 轮 API 调用                                                                                     | `Read`（package.json）→ 1 轮                                                                                 |
| **Token (in / out)**     | 9 / 466                                                                                                                   | 9 / 503                                                                                                      |
| **Cache (read / write)** | 33,634 / 4,483                                                                                                            | 32,698 / 10,208                                                                                              |
| **响应时间**             | 15,715ms                                                                                                                  | 16,590ms                                                                                                     |
| **任务完成**             | **完成**                                                                                                                  | **完成**                                                                                                     |
| **关键差异**             | 两者输出质量相近。pi-embedded 用了 2 轮 API 调用（先读文件，再回复），SDK 在 1 轮内完成。SDK 额外发现了项目的 fork 历史。 |

### T3: "帮我写一个 Python 脚本，把当前目录下所有 .txt 文件合并成一个"

| 指标                     | pi-embedded                                                                                                                                                         | Claude SDK                                                                         |
| :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :--------------------------------------------------------------------------------- |
| **响应摘要**             | 使用 `write` 工具创建了 `merge_txt_files.py`，附带使用说明和功能特点列表                                                                                            | 先用 `Read` 检查发现文件已存在（T3-pi 刚创建的），读取后确认功能完整，返回使用说明 |
| **工具调用**             | `write`（创建脚本）→ 2 轮                                                                                                                                           | `Read`（发现已有文件）→ 确认 → 1 轮（多次工具调用）                                |
| **Token (in / out)**     | 9 / 1,356                                                                                                                                                           | 16 / 1,184                                                                         |
| **Cache (read / write)** | 33,649 / 1,464                                                                                                                                                      | 54,101 / 5,912                                                                     |
| **响应时间**             | 21,823ms                                                                                                                                                            | 23,305ms                                                                           |
| **任务完成**             | **完成** — 直接创建了脚本文件                                                                                                                                       | **完成** — 发现已有脚本并确认可用                                                  |
| **关键差异**             | pi-embedded 直接写文件；SDK 先检查再决定（更谨慎的工具使用模式）。SDK 的 cache_read 更高（54K vs 33K），说明 SDK 的 system prompt 更大（包含 claude_code preset）。 |

### T4: "这段代码有什么问题？"

| 指标                     | pi-embedded                                                                                                                                                               | Claude SDK                                                    |
| :----------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------ |
| **响应摘要**             | 识别为"闭包和变量作用域经典问题"，给出 4 种解决方案（let、IIFE、setTimeout 第三参数、bind）                                                                               | 识别为"闭包和变量作用域经典问题"，给出 4 种完全相同的解决方案 |
| **工具调用**             | 无工具调用                                                                                                                                                                | 无工具调用                                                    |
| **Token (in / out)**     | 3 / 495                                                                                                                                                                   | 3 / 504                                                       |
| **Cache (read / write)** | 16,648 / 362                                                                                                                                                              | 15,290 / 3,743                                                |
| **响应时间**             | 10,360ms                                                                                                                                                                  | 12,567ms                                                      |
| **任务完成**             | **完成**                                                                                                                                                                  | **完成**                                                      |
| **关键差异**             | **这是两个 runtime 行为最接近的场景。** 纯推理无工具调用时，两者输出几乎一样——都给出了 4 种相同的解决方案，token 数也接近（495 vs 504）。唯一差异：pi-embedded 快 ~2 秒。 |

### T5: "帮我查一下 src/agents/ 目录下有哪些文件，然后告诉我这个项目的 agent 架构是怎样的"

| 指标                     | pi-embedded                                                                                                                                                                                                       | Claude SDK                                                              |
| :----------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------- |
| **响应摘要**             | 深入分析了 8 个架构维度（核心层次、工具系统、模型认证、会话管理等），输出非常详细                                                                                                                                 | 类似的分析深度，列出了目录结构、双运行时架构、工具系统、沙箱等 7 个维度 |
| **工具调用**             | `exec`(tree) → 失败, `read` × 多次（部分无 path 参数导致报错）, 多轮对话                                                                                                                                          | `Bash`(ls/find), `Read` × 多次, `Glob`, `Grep` → 更多工具种类           |
| **Token (in / out)**     | 91 / 3,857                                                                                                                                                                                                        | 1,014 / 4,836                                                           |
| **Cache (read / write)** | 518,585 / 23,581                                                                                                                                                                                                  | 238,243 / 19,251                                                        |
| **响应时间**             | 102,572ms (~103s)                                                                                                                                                                                                 | 100,021ms (~100s)                                                       |
| **任务完成**             | **完成**（有工具报错但最终完成）                                                                                                                                                                                  | **完成**                                                                |
| **关键差异**             | pi-embedded 遇到了工具问题：`tree` 未安装、多次 `read` 缺少 path 参数。SDK 用了更多种类的工具（`Glob`、`Grep`），探索更系统化。pi-embedded 的 cache_read 更高（518K vs 238K），说明它的多轮循环累积了更多上下文。 |

---

## 5. 发现

### 5.1 响应风格

两个 runtime 的回复**风格非常接近**。这是意料之中的——底层模型相同（claude-sonnet-4-5），差异主要来自 system prompt。两者都：

- 使用中文回复（用户用中文提问）
- 使用 Markdown 格式化输出
- 结构化分点回答

细微差异：SDK 的回复略带 "Claude Code" 的风格（更偏向开发者视角），pi-embedded 的回复更偏向"助手"视角。这是 system prompt 差异导致的。

### 5.2 工具选择和使用模式

这是**最显著的差异来源**：

| 行为           | pi-embedded                                                   | Claude SDK                                |
| :------------- | :------------------------------------------------------------ | :---------------------------------------- |
| 工具种类       | 仅使用 OpenClaw 工具（`read`, `write`, `exec`, `web_search`） | 使用 SDK 原生工具 + 额外的 `Glob`、`Grep` |
| 搜索能力       | 依赖外部 Brave Search API 配置                                | SDK 自带 `WebSearch`，开箱即用            |
| 文件探索       | 用 `exec` 跑 shell 命令（如 `tree`）                          | 用 `Glob` 和 `Grep` 做结构化搜索          |
| 写文件行为     | 直接 `write` 创建文件                                         | 先 `Read` 检查是否已存在，再决定          |
| 工具调用稳定性 | 出现"read 缺 path 参数"等调用错误                             | 未观察到工具调用错误                      |

**SDK 的工具使用更"defensive"**——先检查再行动。pi-embedded 更"aggressive"——直接执行。

### 5.3 Token 效率

汇总数据：

| 用例 | pi-embedded (in/out) | SDK (in/out)  | pi-embedded cache_read | SDK cache_read |
| :--- | :------------------- | :------------ | :--------------------- | :------------- |
| T1   | 8 / 289              | 915 / 997     | 16,984                 | 34,287         |
| T2   | 9 / 466              | 9 / 503       | 33,634                 | 32,698         |
| T3   | 9 / 1,356            | 16 / 1,184    | 33,649                 | 54,101         |
| T4   | 3 / 495              | 3 / 504       | 16,648                 | 15,290         |
| T5   | 91 / 3,857           | 1,014 / 4,836 | 518,585                | 238,243        |

观察：

- **Output tokens 接近**：两者生成的文本量差不多（T4 几乎一样）
- **Input tokens**：SDK 在需要工具的场景下 input 更高（T1: 915 vs 8, T5: 1014 vs 91），因为 SDK 的 system prompt 更大（包含 `claude_code` preset）
- **Cache read**：pi-embedded 在 T5（多轮）场景下 cache_read 极高（518K），因为多轮循环重复读取之前的上下文。SDK 的单次查询模式没有这个累积效应
- **整体**：SDK 的 system prompt 更大，但在单次查询上不需要多轮累积，总体 token 消耗差异不大

### 5.4 差异最显著的场景

1. **T1（Web 搜索）**：差异最大。pi-embedded 完全失败（缺 Brave API key），SDK 成功完成。这不是 runtime 能力差异，而是**工具配置依赖不同**——SDK 自带搜索能力，pi-embedded 依赖外部配置。

2. **T5（多步骤探索）**：差异第二大。SDK 有 `Glob`/`Grep` 做结构化代码搜索，pi-embedded 只能用 `exec`（shell 命令）。pi-embedded 出现了多次工具调用错误（read 缺 path），SDK 没有。

3. **T4（纯推理）**：差异最小。没有工具调用时，两个 runtime 的输出几乎完全一致。

### 5.5 意外发现

1. **SDK 的 "先读后写" 模式**：T3 中，SDK 发现前一个测试已经创建了 `merge_txt_files.py`，于是读取确认而不是盲目覆写。这是 SDK 的 `claude_code` preset 里的编码规范在起作用（"read before write"）。

2. **pi-embedded 的工具调用 bug**：T5 中，pi-embedded 多次调用 `read` 工具但没有传 `path` 参数。这说明 OpenClaw 的工具 schema 校验不够严格——模型生成了不完整的工具调用参数，但 runtime 没有在发送给模型前拦截。SDK 没有这个问题，可能因为 SDK 内置工具有更严格的参数校验。

3. **Cache 行为差异**：pi-embedded 的多轮循环导致 `cache_read` 在 T5 中飙升到 518K，远高于 SDK 的 238K。这是架构差异导致的——pi-embedded 每轮重新发送完整历史，SDK 在一次查询中由内部管理上下文。

4. **响应时间**：两者在简单任务上差距不大（T2: 15.7s vs 16.6s），但 T1 中 SDK 由于实际执行了搜索任务，耗时 34.7s 远超 pi-embedded 的 9.5s（后者快只是因为失败得快）。

---

## 6. 总结

### 核心结论

**在同一模型、同一任务下，两个 runtime 的核心推理能力没有差异**（T4 证实了这一点）。

差异主要来自：

1. **工具集不同** — SDK 有 `Glob`/`Grep`/内置 `WebSearch`，pi-embedded 依赖 OpenClaw 配置的外部服务
2. **System prompt 不同** — SDK 的 `claude_code` preset 让模型表现出更"开发者导向"的行为模式（先读后写、结构化搜索）
3. **上下文管理不同** — pi-embedded 多轮循环累积上下文，SDK 单次查询更高效
4. **工具调用稳定性** — SDK 内置工具的参数校验更严格，未出现调用错误

### 对 ClawCode 的启示

- SDK runtime 在**编码和文件操作场景**下有天然优势（更多内置工具、更严格的校验）
- pi-embedded 在**需要 OpenClaw 特有工具**的场景下不可替代（消息发送、会话管理、cron 等）
- 两者的回退机制（非 Anthropic 自动用 pi-embedded）设计是合理的

---

## 7. 附录

### A. 测试环境配置

```
VM: ubuntu@54.169.224.161 (ssh clawcode)
OS: Ubuntu (Kernel 5.x)
Node.js: v22.22.0
pnpm: v10.28.2
ClawCode: v2026.2.13 (commit 12bb078)
SDK: @anthropic-ai/claude-agent-sdk v0.2.37
Model: claude-sonnet-4-5-20250929
API Proxy: http://18.141.210.162:3000/api
```

### B. 运行命令

```bash
# Pi-embedded runtime
CLAWCODE_RUNTIME=pi-embedded node openclaw.mjs agent --local \
  --message "..." --json --timeout 120 --session-id <id>

# Claude SDK runtime
CLAWCODE_RUNTIME=claude-sdk node openclaw.mjs agent --local \
  --message "..." --json --timeout 120 --session-id <id>
```

### C. 原始数据

完整 JSON 输出保存在 `test/runtime-results/` 目录下：

```
test/runtime-results/
├── T1-web-search-pi-embedded.json
├── T1-web-search-claude-sdk.json
├── T2-file-read-pi-embedded.json
├── T2-file-read-claude-sdk.json
├── T3-coding-pi-embedded.json
├── T3-coding-claude-sdk.json
├── T4-code-analysis-pi-embedded.json
├── T4-code-analysis-claude-sdk.json
├── T5-multi-step-pi-embedded.json
└── T5-multi-step-claude-sdk.json
```
