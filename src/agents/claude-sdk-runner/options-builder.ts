import type { RunEmbeddedPiAgentParams } from "./types.js";

type SdkOptions = import("@anthropic-ai/claude-agent-sdk").Options;

export function buildSdkOptions(params: RunEmbeddedPiAgentParams): SdkOptions {
  // Build append: workspace context files + workspace dir + extraSystemPrompt
  const appendParts: string[] = [];

  // 1. Inject workspace context files (SOUL.md, AGENTS.md, etc.)
  const contextFiles = (params as Record<string, unknown>).contextFiles as
    | Array<{ path: string; content: string }>
    | undefined;

  if (contextFiles?.length) {
    appendParts.push("# Project Context\n");
    const hasSoul = contextFiles.some((f) => f.path.split("/").pop()?.toLowerCase() === "soul.md");
    if (hasSoul) {
      appendParts.push(
        "If SOUL.md is present, embody its persona and tone. " +
          "Avoid stiff, generic replies; follow its guidance unless higher-priority instructions override it.\n",
      );
    }
    for (const file of contextFiles) {
      appendParts.push(`## ${file.path}\n\n${file.content}\n`);
    }
  }

  // 2. Workspace directory instruction (uses sandboxed agent workspace, not code dir)
  const agentCwd = params.workspaceDir?.trim() || process.env.CLAWCODE_AGENT_CWD || process.cwd();
  appendParts.push(
    `# Workspace\n\nYour working directory is: ${agentCwd}\n` +
      "All file operations (read, write, edit, create) MUST stay within this directory.\n" +
      "Do NOT access, modify, or read files outside this workspace — " +
      "especially the application code directory and the configuration directory.\n" +
      "If the user asks you to work on files, create them inside this workspace.\n",
  );

  // 3. Append extraSystemPrompt (group info, etc.)
  if (params.extraSystemPrompt) {
    appendParts.push(params.extraSystemPrompt);
  }

  const append = appendParts.length > 0 ? appendParts.join("\n") : undefined;

  const options: SdkOptions = {
    model: params.model ?? "claude-opus-4-6",
    cwd: agentCwd,

    systemPrompt: append
      ? { type: "preset", preset: "claude_code", append }
      : { type: "preset", preset: "claude_code" },

    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,

    persistSession: false,
    includePartialMessages: true,
    settingSources: [],

    // 继承完整环境变量，确保 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN 等认证配置传递到 claude 子进程
    env: { ...process.env },

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
