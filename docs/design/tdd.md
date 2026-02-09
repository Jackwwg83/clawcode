# TDD Plan (ClawCode)

## 目标
在替换 Agent Runtime 为 Claude Agent SDK 的过程中，坚持“先写测试、后写实现”。优先保障行为兼容 OpenClaw，并让改动可回归、可验证。

## TDD 工作流
1) 先写“行为契约”（Given/When/Then）
2) 写最小失败测试（Red）
3) 实现最小通过代码（Green）
4) 重构（Refactor），保持测试全绿

## 测试分层
- Unit/Contract：默认必跑（mock SDK）
- Integration：可选（真实 SDK，少量案例）
- E2E：后期（通道 + 网关 + SDK 全链路）

## 测试设计原则
- 每个新模块都先有“契约测试”。
- 关键边界：config 路径、session 映射、SDK options、工具权限、事件流映射。
- 测试名称清晰可读，覆盖业务语义（而不是实现细节）。

## 模块级测试清单（先写测试）

### 1) Config / Paths
- `resolves ~/.clawcode as base dir`
- `does not reference ~/.openclaw`
- `loads config.json with existing schema`

### 2) Session Mapping
- `stores sdkSessionId per sessionKey`
- `resumes SDK session when sdkSessionId exists`
- `creates new sdkSessionId when none`

### 3) AgentBridge (核心)
- `builds systemPrompt with memory recall`
- `settingSources includes "project"`
- `allowedTools contains builtins + mcp tools`
- `maps SDK stream events to payloads`
- `emits lifecycle end on success`
- `emits lifecycle error on failure`

### 4) Claude SDK Runner
- `passes resume session id`
- `passes hooks (PreToolUse/PostToolUse)`
- `passes mcpServers config`
- `does not use OpenClaw model selection`

### 5) MCP Memory
- `memory.recall returns ranked results`
- `memory.remember writes entry`
- `memory.forget removes entry`

### 6) MCP Sessions
- `sessions.list returns session index`
- `sessions.history returns recent messages`
- `sessions.send delivers through gateway`

### 7) Gateway Integration
- `gateway agent handler calls AgentBridge`
- `session store updates after run`
- `delivery metadata preserved`

### 8) Channels (Smoke)
- `channel start/stop does not break`
- `message delivery still routes correctly`

## Integration / Live Tests（在 VM 上跑）
- `LIVE=1` 时跑最小 SDK 实测：
  - 发送一条 prompt → SDK → 返回文本
  - 验证 systemPrompt 和 settingSources 生效

## 测试执行顺序（建议）
1) Config/Paths
2) Session Mapping
3) AgentBridge + SDK Runner
4) MCP Memory/Sessions
5) Gateway Integration
6) Channels Smoke

