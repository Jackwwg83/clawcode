import type { RunEmbeddedPiAgentParams } from "./types.js";

type SdkOptions = import("@anthropic-ai/claude-agent-sdk").Options;

export function buildSdkOptions(params: RunEmbeddedPiAgentParams): SdkOptions {
  const options: SdkOptions = {
    model: params.model ?? "claude-opus-4-6",
    cwd: params.workspaceDir,

    systemPrompt: params.extraSystemPrompt
      ? { type: "preset", preset: "claude_code", append: params.extraSystemPrompt }
      : { type: "preset", preset: "claude_code" },

    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,

    persistSession: false,
    includePartialMessages: true,
    settingSources: [],

    env: {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    },

    // Phase 3: 启用 SDK 内置工具（移除 Phase 1b 的 disallowedTools）
    // 如果 OpenClaw 明确禁用了工具，则在 SDK 侧也禁用
    ...(params.disableTools
      ? {
          disallowedTools: [
            "Bash",
            "Read",
            "Edit",
            "Write",
            "Glob",
            "Grep",
            "WebFetch",
            "WebSearch",
            "Task",
            "TaskOutput",
            "TaskStop",
            "NotebookEdit",
            "TodoWrite",
          ],
        }
      : {}),
  };

  // Thinking level mapping
  if (params.thinkLevel && params.thinkLevel !== "off") {
    const thinkingTokenMap: Record<string, number> = {
      minimal: 1024,
      low: 4096,
      medium: 16384,
      high: 32768,
      xhigh: 65536,
    };
    options.maxThinkingTokens = thinkingTokenMap[params.thinkLevel] ?? 16384;
  }

  return options;
}
