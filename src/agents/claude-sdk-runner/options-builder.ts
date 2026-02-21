import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import type { StreamState } from "./stream-adapter.js";
import type { RunEmbeddedPiAgentParams } from "./types.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import { resolveMemorySearchConfig } from "../memory-search.js";
import { buildOpenClawMcpServer } from "./mcp-tool-bridge.js";

type SdkOptions = import("@anthropic-ai/claude-agent-sdk").Options;
type SettingSource = import("@anthropic-ai/claude-agent-sdk").SettingSource;
type SdkPluginConfig = import("@anthropic-ai/claude-agent-sdk").SdkPluginConfig;

const DEFAULT_SETTING_SOURCES: SettingSource[] = ["user", "project", "local"];
const CLAUDE_PLUGINS_DIR = path.join(".claude", "plugins");
const PLUGIN_MANIFEST_RELATIVE = path.join(".claude-plugin", "plugin.json");
const ENV_ALLOWLIST_PREFIXES = ["ANTHROPIC_", "CLAWCODE_", "CLAUDE_"];
const ENV_ALLOWLIST_EXACT = new Set([
  "PATH",
  "HOME",
  "SHELL",
  "LANG",
  "TERM",
  "TMPDIR",
  "USER",
  "LOGNAME",
  "XDG_RUNTIME_DIR",
  "NODE_OPTIONS",
  "NODE_EXTRA_CA_CERTS",
  "NODE_DISABLE_COMPILE_CACHE",
  "NO_COLOR",
  "FORCE_COLOR",
]);

export function buildSdkOptions(
  params: RunEmbeddedPiAgentParams,
  streamState?: StreamState,
): SdkOptions {
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

  // 2b. Memory recall section (if memory tools are available)
  const memoryEnabled = isMemoryEnabled(params.config, params.sessionKey ?? params.sessionId);
  if (memoryEnabled) {
    appendParts.push(
      "## Memory Recall\n" +
        "Before answering anything about prior work, decisions, dates, people, preferences, or todos: " +
        "run memory_search on MEMORY.md + memory/*.md; then use memory_get to pull only the needed lines. " +
        "If low confidence after search, say you checked.\n" +
        "Citations: include Source: <path#line> when it helps the user verify memory snippets.\n",
    );
  }

  // 3. Append extraSystemPrompt (group info, etc.)
  if (params.extraSystemPrompt) {
    appendParts.push(params.extraSystemPrompt);
  }

  const append = appendParts.length > 0 ? appendParts.join("\n") : undefined;

  const model = params.model ?? "claude-opus-4-6";
  const fallbackModel = deriveDatedModelFallback(model);
  const options: SdkOptions = {
    model,
    cwd: agentCwd,

    systemPrompt: append
      ? { type: "preset", preset: "claude_code", append }
      : { type: "preset", preset: "claude_code" },

    // SECURITY NOTE: bypassPermissions is intentional.
    // OpenClaw enforces permissions in gateway hooks, and this SDK subprocess
    // is non-interactive so it cannot prompt for runtime approvals.
    // Runtime routing to this path is also explicitly gated by CLAWCODE_RUNTIME
    // and provider=anthropic checks in shouldUseClaudeSdk().
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,

    persistSession: true,
    includePartialMessages: true,
    settingSources: resolveSettingSources(),

    env: buildSafeEnv(),

    // Phase 3: 启用 SDK 内置工具（移除 Phase 1b 的 disallowedTools）
    // 如果 OpenClaw 明确禁用了工具，则在 SDK 侧也禁用
    ...(fallbackModel ? { fallbackModel } : {}),
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

  const plugins = resolveClaudeSdkPlugins(agentCwd);
  if (plugins.length > 0) {
    options.plugins = plugins;
  }

  if (!params.disableTools && streamState) {
    const openclawMcp = buildOpenClawMcpServer({
      runParams: params,
      streamState,
    });
    if (openclawMcp) {
      options.mcpServers = { openclaw: openclawMcp };
    }
  }

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

function deriveDatedModelFallback(model: string): string | undefined {
  const normalized = model.trim();
  const match = normalized.match(/^(claude-(?:sonnet|opus|haiku)-\d+(?:-\d+)?)-\d{8}$/);
  if (!match?.[1]) {
    return undefined;
  }
  return match[1];
}

function resolveSettingSources(): SettingSource[] {
  const raw = process.env.CLAWCODE_CLAUDE_SDK_SETTING_SOURCES?.trim();
  if (!raw) {
    return [...DEFAULT_SETTING_SOURCES];
  }
  const allowed = new Set<SettingSource>(["user", "project", "local"]);
  const parsed = raw
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value): value is SettingSource => allowed.has(value as SettingSource));
  return parsed.length > 0 ? Array.from(new Set(parsed)) : [...DEFAULT_SETTING_SOURCES];
}

function resolveClaudeSdkPlugins(agentCwd: string): SdkPluginConfig[] {
  const roots = new Set<string>();
  const envPaths = process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS?.trim();
  if (envPaths) {
    for (const value of envPaths.split(path.delimiter)) {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      const resolved = path.resolve(trimmed);
      if (isPathWithinAllowedRoots(resolved)) {
        roots.add(resolved);
      }
    }
  }
  roots.add(path.join(os.homedir(), CLAUDE_PLUGINS_DIR));
  roots.add(path.join(agentCwd, CLAUDE_PLUGINS_DIR));

  const discovered = new Set<string>();
  for (const root of roots) {
    walkPluginRoots(root, discovered, 0);
  }

  return Array.from(discovered)
    .toSorted()
    .map((pluginPath) => ({
      type: "local",
      path: pluginPath,
    }));
}

function walkPluginRoots(dirPath: string, out: Set<string>, depth: number): void {
  if (depth > 3) {
    return;
  }
  if (!fs.existsSync(dirPath)) {
    return;
  }
  if (hasPluginManifest(dirPath)) {
    out.add(path.resolve(dirPath));
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === ".claude-plugin" || entry.name === "node_modules") {
      continue;
    }
    const childPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkPluginRoots(childPath, out, depth + 1);
      continue;
    }
    if (entry.isSymbolicLink()) {
      try {
        const resolved = fs.realpathSync(childPath);
        if (!isPathWithinAllowedRoots(resolved)) {
          continue;
        }
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          walkPluginRoots(resolved, out, depth + 1);
        }
      } catch {
        // ignore broken symlink / unreadable path
      }
    }
  }
}

function hasPluginManifest(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, PLUGIN_MANIFEST_RELATIVE));
}

function buildSafeEnv(): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) {
      continue;
    }
    if (ENV_ALLOWLIST_EXACT.has(key)) {
      safe[key] = value;
      continue;
    }
    if (ENV_ALLOWLIST_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      safe[key] = value;
    }
  }
  return safe;
}

function isPathWithinAllowedRoots(candidatePath: string): boolean {
  const resolvedPath = path.resolve(candidatePath);
  return [os.homedir(), process.cwd()].some((root) => {
    const resolvedRoot = path.resolve(root);
    const relative = path.relative(resolvedRoot, resolvedPath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}

function isMemoryEnabled(config: OpenClawConfig | undefined, sessionKey: string): boolean {
  if (!config) {
    return false;
  }
  try {
    const agentId = resolveSessionAgentId({ sessionKey, config });
    return !!resolveMemorySearchConfig(config, agentId);
  } catch {
    return false;
  }
}

export const __testing = {
  buildSafeEnv,
  isPathWithinAllowedRoots,
  isMemoryEnabled,
};
