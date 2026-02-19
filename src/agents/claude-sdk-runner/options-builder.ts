import path from "node:path";
import type { SandboxToolPolicy } from "../sandbox.js";
import type { RunEmbeddedPiAgentParams } from "./types.js";
import { isSubagentSessionKey } from "../../routing/session-key.js";
import {
  isToolAllowedByPolicies,
  resolveEffectiveToolPolicy,
  resolveGroupToolPolicy,
  resolveSubagentToolPolicy,
} from "../pi-tools.policy.js";
import { resolveToolProfilePolicy } from "../tool-policy.js";

type SdkOptions = import("@anthropic-ai/claude-agent-sdk").Options;
type PermissionResult = import("@anthropic-ai/claude-agent-sdk").PermissionResult;
type CanUseTool = import("@anthropic-ai/claude-agent-sdk").CanUseTool;

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

    permissionMode: "dontAsk",

    persistSession: false,
    includePartialMessages: true,
    settingSources: [],

    // 继承完整环境变量，确保 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN 等认证配置传递到 claude 子进程
    env: { ...process.env },

    // Enforce OpenClaw workspace boundary in SDK tool permissions.
    canUseTool: createToolPermissionGuard({ workspaceDir: agentCwd, params }),

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

function createToolPermissionGuard(params: {
  workspaceDir: string;
  params: RunEmbeddedPiAgentParams;
}): CanUseTool {
  const workspaceRoot = path.resolve(params.workspaceDir);
  const toolPolicies = resolveSdkToolPolicies(params.params);
  return async (toolName, input, options): Promise<PermissionResult> => {
    if (!isSdkToolAllowed(toolName, toolPolicies)) {
      return deny(`Tool "${toolName}" blocked by OpenClaw tool policy.`);
    }

    const blockedPath = typeof options.blockedPath === "string" ? options.blockedPath : undefined;
    if (blockedPath && !isPathWithinWorkspace(blockedPath, workspaceRoot)) {
      return deny(`Tool "${toolName}" cannot access path outside workspace: ${blockedPath}`);
    }

    if (isPathScopedTool(toolName)) {
      const paths = collectCandidatePaths(input);
      for (const candidate of paths) {
        if (!isPathWithinWorkspace(candidate, workspaceRoot)) {
          return deny(`Tool "${toolName}" cannot access path outside workspace: ${candidate}`);
        }
      }
    }

    if (toolName === "Bash") {
      const command = extractCommand(input);
      if (command && touchesRestrictedRoot(command)) {
        return deny(`Bash command references restricted paths outside workspace.`);
      }
    }

    return allow();
  };
}

function isPathScopedTool(toolName: string): boolean {
  return new Set(["Read", "Edit", "Write", "Glob", "Grep", "NotebookEdit"]).has(toolName);
}

function collectCandidatePaths(input: Record<string, unknown>): string[] {
  const paths: string[] = [];
  const walk = (value: unknown, keyHint?: string) => {
    if (typeof value === "string") {
      if (looksLikePath(value, keyHint)) {
        paths.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, keyHint);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      walk(nested, key);
    }
  };
  walk(input);
  return paths;
}

function looksLikePath(value: string, keyHint?: string): boolean {
  const text = value.trim();
  if (!text) {
    return false;
  }
  if (/^https?:\/\//i.test(text)) {
    return false;
  }
  const key = (keyHint ?? "").toLowerCase();
  if (key.includes("path") || key.includes("file") || key.includes("cwd")) {
    return true;
  }
  return (
    text.startsWith("/") || text.startsWith("./") || text.startsWith("../") || text.includes("/")
  );
}

function isPathWithinWorkspace(rawPath: string, workspaceRoot: string): boolean {
  const resolved = path.resolve(workspaceRoot, rawPath);
  return resolved === workspaceRoot || resolved.startsWith(`${workspaceRoot}${path.sep}`);
}

function extractCommand(input: Record<string, unknown>): string | undefined {
  const cmd = input.command;
  if (typeof cmd === "string" && cmd.trim()) {
    return cmd;
  }
  const script = input.script;
  if (typeof script === "string" && script.trim()) {
    return script;
  }
  return undefined;
}

function touchesRestrictedRoot(command: string): boolean {
  const lowered = command.toLowerCase();
  return (
    lowered.includes("/.openclaw") ||
    lowered.includes("/home/<user>/clawcode") ||
    lowered.includes("/etc/") ||
    lowered.includes("/root/")
  );
}

function resolveSdkToolPolicies(
  params: RunEmbeddedPiAgentParams,
): Array<SandboxToolPolicy | undefined> {
  const {
    globalPolicy,
    globalProviderPolicy,
    agentPolicy,
    agentProviderPolicy,
    profile,
    providerProfile,
    profileAlsoAllow,
    providerProfileAlsoAllow,
  } = resolveEffectiveToolPolicy({
    config: params.config,
    sessionKey: params.sessionKey,
    modelProvider: params.provider,
    modelId: params.model,
  });

  const groupPolicy = resolveGroupToolPolicy({
    config: params.config,
    sessionKey: params.sessionKey,
    spawnedBy: params.spawnedBy,
    messageProvider: params.messageProvider,
    groupId: params.groupId,
    groupChannel: params.groupChannel,
    groupSpace: params.groupSpace,
    accountId: params.agentAccountId,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
  });
  const subagentPolicy =
    isSubagentSessionKey(params.sessionKey) && params.sessionKey
      ? resolveSubagentToolPolicy(params.config)
      : undefined;

  const profilePolicy = mergeAlsoAllow(resolveToolProfilePolicy(profile), profileAlsoAllow);
  const providerProfilePolicy = mergeAlsoAllow(
    resolveToolProfilePolicy(providerProfile),
    providerProfileAlsoAllow,
  );

  return [
    profilePolicy,
    providerProfilePolicy,
    globalPolicy,
    globalProviderPolicy,
    agentPolicy,
    agentProviderPolicy,
    groupPolicy,
    subagentPolicy,
  ];
}

function mergeAlsoAllow(
  policy: { allow?: string[]; deny?: string[] } | undefined,
  alsoAllow?: string[],
): SandboxToolPolicy | undefined {
  if (!Array.isArray(alsoAllow) || alsoAllow.length === 0) {
    return policy;
  }
  if (!policy?.allow || policy.allow.length === 0) {
    return {
      allow: Array.from(new Set(["*", ...alsoAllow])),
      deny: policy?.deny,
    };
  }
  return {
    ...policy,
    allow: Array.from(new Set([...policy.allow, ...alsoAllow])),
  };
}

function isSdkToolAllowed(
  toolName: string,
  policies: Array<SandboxToolPolicy | undefined>,
): boolean {
  const mappedNames = mapSdkToolNameToPolicyNames(toolName);
  if (mappedNames.length === 0) {
    // Unknown SDK-native tools are not mapped to OpenClaw policy names yet.
    return true;
  }
  return mappedNames.every((name) => isToolAllowedByPolicies(name, policies));
}

function mapSdkToolNameToPolicyNames(toolName: string): string[] {
  const normalized = toolName.trim().toLowerCase();
  switch (normalized) {
    case "bash":
      return ["exec"];
    case "read":
      return ["read"];
    case "edit":
      return ["edit"];
    case "write":
      return ["write"];
    case "glob":
    case "grep":
      return ["read"];
    case "notebookedit":
      return ["edit", "write"];
    case "webfetch":
      return ["web_fetch"];
    case "websearch":
      return ["web_search"];
    default:
      return [];
  }
}

function allow(): PermissionResult {
  return { behavior: "allow" };
}

function deny(message: string): PermissionResult {
  return { behavior: "deny", message };
}
