# ClawCode

ClawCode 是 [OpenClaw](https://github.com/openclaw/openclaw) 的 thin fork，在保留 OpenClaw 全部功能的基础上，添加了 [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents-and-tools/claude-agent-sdk/overview) 作为**可选运行时**。当 provider 为 Anthropic 且配置启用时，agent 会通过 Claude Agent SDK 执行；其他情况自动回退到 OpenClaw 原生的 pi-embedded 运行时。

- 上游基线：OpenClaw v2026.2.13（commit `01d2ad205`）
- SDK 版本：`@anthropic-ai/claude-agent-sdk` 0.2.37

## 架构概览

```
用户消息 → OpenClaw Gateway → pi-embedded.ts（路由层）
                                 ├─ CLAWCODE_RUNTIME=claude-sdk + provider=anthropic
                                 │    → claude-sdk-runner/run.ts（SDK 运行时）
                                 └─ 其他情况
                                      → pi-embedded-runner（原生运行时，无改动）
```

### 路由逻辑（`src/agents/pi-embedded.ts`）

只有同时满足两个条件才走 SDK 运行时：

1. 环境变量 `CLAWCODE_RUNTIME=claude-sdk`
2. 当前请求的 provider 为 `anthropic`

其他所有情况（非 Anthropic provider、未设置环境变量、provider 为空）均走原生 pi-embedded 运行时，**零侵入**。

### claude-sdk-runner 模块（`src/agents/claude-sdk-runner/`）

| 文件                    | 职责                                                       |
| ----------------------- | ---------------------------------------------------------- |
| `index.ts`              | 公共入口，导出 `runClaudeSdkAgent`                         |
| `run.ts`                | 主运行逻辑：调用 SDK `query()`，管理超时/中止/错误         |
| `options-builder.ts`    | 将 OpenClaw 参数转为 SDK `Options`（模型、权限、thinking） |
| `session-adapter.ts`    | 会话适配：OpenClaw Session → SDK prompt                    |
| `stream-adapter.ts`     | 流式事件映射：SDK 消息 → OpenClaw 回调                     |
| `result-mapper.ts`      | 结果映射：SDK Result → OpenClaw `EmbeddedPiRunResult`      |
| `active-run-tracker.ts` | 运行状态追踪，支持外部 abort                               |
| `types.ts`              | 类型定义，复用上游类型                                     |

### Update 保护

ClawCode 阻止了 `openclaw update` 命令，防止上游更新覆盖 SDK 运行时代码。涉及 3 个文件：

- `src/cli/update-cli/update-command.ts` — CLI update 命令
- `src/gateway/server-methods/update.ts` — Gateway update.run 接口
- `src/commands/doctor-update.ts` — doctor 命令的 update 检查

升级方式见 [从 OpenClaw 上游同步](#从-openclaw-上游同步)。

## 前置条件

- **Node.js** >= 22（当前测试版本：v23.11.0）
- **pnpm** >= 10.23（当前测试版本：10.23.0）
- **Claude Code CLI** 已安装并登录（SDK 运行时需要有效的 Anthropic 认证）

## 快速开始

### 1. Clone 仓库

```bash
git clone https://github.com/Jackwwg83/clawcode.git
cd clawcode
```

### 2. 安装依赖

```bash
pnpm install
```

### 3. 复制 gitignored 构建文件

以下文件被 `.gitignore` 排除，需要从一个已构建的 OpenClaw 安装中复制：

**a2ui bundle 文件：**

```bash
# 从已安装的 openclaw 复制 a2ui bundle
cp /path/to/openclaw/src/canvas-host/a2ui/*.bundle.js src/canvas-host/a2ui/
```

如果你不需要 Canvas 功能，可以跳过此步骤——构建脚本 `scripts/bundle-a2ui.sh` 会尝试生成，缺失时构建仍可完成。

### 4. 构建

```bash
pnpm build
```

### 5. 配置环境变量

```bash
# 启用 Claude SDK 运行时（必需）
export CLAWCODE_RUNTIME=claude-sdk

# Anthropic API 认证（二选一）
# 方式 A：直接使用 API key
export ANTHROPIC_API_KEY=sk-ant-xxx

# 方式 B：使用 Claude Code CLI 的认证（通过 base URL + auth token）
export ANTHROPIC_BASE_URL=https://api.anthropic.com
export ANTHROPIC_AUTH_TOKEN=your-token
```

> SDK 运行时会将完整的 `process.env` 传递给 Claude 子进程，确保认证配置被正确继承。

### 6. 启动

```bash
# 交互式引导
openclaw onboard

# 或直接启动
openclaw start
```

### 7. 验证 SDK 运行时生效

向 OpenClaw 发送一条消息，在日志中应能看到 SDK 相关的输出。你也可以通过以下方式快速验证路由逻辑：

```bash
# 运行路由测试
pnpm vitest run src/agents/claude-sdk-runner/__tests__/routing.test.ts
```

## 配置说明

### 环境变量

| 变量                   | 说明                              | 默认值                     |
| ---------------------- | --------------------------------- | -------------------------- |
| `CLAWCODE_RUNTIME`     | 运行时选择：`claude-sdk` 或不设置 | 不设置（使用 pi-embedded） |
| `ANTHROPIC_API_KEY`    | Anthropic API Key                 | —                          |
| `ANTHROPIC_BASE_URL`   | Anthropic API Base URL            | —                          |
| `ANTHROPIC_AUTH_TOKEN` | Anthropic Auth Token              | —                          |

### 运行时切换

```bash
# 使用 Claude SDK 运行时
export CLAWCODE_RUNTIME=claude-sdk

# 使用原生 pi-embedded 运行时（默认）
unset CLAWCODE_RUNTIME
```

### Provider 回退逻辑

即使设置了 `CLAWCODE_RUNTIME=claude-sdk`，以下情况会自动回退到 pi-embedded：

1. **provider 不是 anthropic** — 比如使用 OpenAI、Ollama 等
2. **provider 为空** — 某些内部路径（如 probe）不传 provider
3. **SDK 运行错误** — 认证失败、计费问题、速率限制等会抛出 `FailoverError`，由上游 failover 机制捕获处理

## 开发指南

### 项目结构（ClawCode 新增/修改部分）

```
src/agents/
├── pi-embedded.ts                    # [修改] 路由层，新增 SDK 分支
├── claude-sdk-runner/
│   ├── index.ts                      # 公共入口
│   ├── run.ts                        # SDK query() 主逻辑
│   ├── options-builder.ts            # 参数转换
│   ├── session-adapter.ts            # 会话适配
│   ├── stream-adapter.ts             # 流式事件映射
│   ├── result-mapper.ts              # 结果映射
│   ├── active-run-tracker.ts         # 运行状态追踪
│   ├── types.ts                      # 类型定义
│   └── __tests__/
│       ├── routing.test.ts           # 路由逻辑测试
│       ├── integration.test.ts       # 集成测试
│       ├── result-mapper.test.ts     # 结果映射测试
│       └── active-run-tracker.test.ts# 状态追踪测试
├── ...（其余文件未修改）

src/cli/update-cli/update-command.ts  # [修改] 阻止 openclaw update
src/commands/doctor-update.ts         # [修改] 跳过 update 检查
src/gateway/server-methods/update.ts  # [修改] 阻止 gateway update.run
package.json                          # [修改] 添加 @anthropic-ai/claude-agent-sdk
```

### 本地开发

```bash
# 开发模式（热重载）
pnpm dev

# 类型检查
pnpm tsgo

# 格式化 + lint
pnpm check
```

### 运行测试

```bash
# 运行所有 SDK runner 测试
pnpm vitest run src/agents/claude-sdk-runner/

# 运行单个测试文件
pnpm vitest run src/agents/claude-sdk-runner/__tests__/routing.test.ts

# 运行 update guard 测试
pnpm vitest run src/cli/update-cli.test.ts
```

**VM 低内存方案（< 2GB RAM）：**

```bash
# 限制 Node 堆内存
NODE_OPTIONS="--max-old-space-size=1024" pnpm vitest run src/agents/claude-sdk-runner/
```

### 修改注意事项

- **只有 `pi-embedded.ts` 是路由修改点** — 所有新增逻辑都在 `claude-sdk-runner/` 目录，不要修改其他上游文件
- **Update 保护不可移除** — 3 个 guard 文件防止意外被上游覆盖
- **SDK 使用 `bypassPermissions`** — 权限控制由 OpenClaw hooks 层负责，SDK 层不做额外限制
- **环境变量传递** — `options-builder.ts` 会将完整 `process.env` 传给 SDK 子进程

## 从 OpenClaw 上游同步

```bash
# 1. 添加上游 remote（只需一次）
git remote add upstream https://github.com/openclaw/openclaw.git

# 2. 拉取上游更新
git fetch upstream

# 3. 合并上游 main 分支
git merge upstream/main

# 4. 解决冲突（如果有）
# 重点关注 pi-embedded.ts — 保留 ClawCode 路由逻辑
# package.json — 保留 @anthropic-ai/claude-agent-sdk 依赖

# 5. 重新安装依赖并构建
pnpm install && pnpm build

# 6. 运行测试确认无回归
pnpm vitest run src/agents/claude-sdk-runner/
pnpm vitest run src/cli/update-cli.test.ts
```

## FAQ

**Q: ClawCode 和 OpenClaw 有什么区别？**

ClawCode 是 OpenClaw 的 thin fork，唯一区别是添加了 Claude Agent SDK 作为可选运行时。不设置 `CLAWCODE_RUNTIME=claude-sdk` 时，行为与原版 OpenClaw 完全一致。

**Q: 我用的不是 Anthropic 的模型，能用 ClawCode 吗？**

可以。非 Anthropic provider 会自动回退到 pi-embedded 运行时，功能不受影响。

**Q: `openclaw update` 为什么不能用？**

ClawCode 禁用了内置的 update 命令，防止上游更新覆盖 SDK 运行时代码。请通过 `git pull` 更新，或参考 [从 OpenClaw 上游同步](#从-openclaw-上游同步)。

**Q: SDK 运行时出错会怎样？**

认证失败、计费问题、速率限制等错误会抛出 `FailoverError`，由 OpenClaw 的 failover 机制自动捕获并处理。其他未知错误会向上抛出。

**Q: 支持多轮对话吗？**

当前 SDK 运行时为单轮模式（Phase 4 MVP）。每次请求独立执行，会话历史由 OpenClaw SessionManager 管理。多轮 resume 是未来增强方向。

## License

MIT — 同 [OpenClaw](https://github.com/openclaw/openclaw)。
