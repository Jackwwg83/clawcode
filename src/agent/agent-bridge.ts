/**
 * AgentBridge - Bridges OpenClaw agent params to Claude Agent SDK
 *
 * Responsibilities:
 * - Accept OpenClaw-style agent run params
 * - Resolve or create SDK sessionId (resume support)
 * - Build system prompt (OpenClaw prompt + memory recall + channel context)
 * - Build Claude Agent SDK options (settingSources, allowedTools, hooks, mcpServers)
 * - Stream events and convert into OpenClaw payloads
 * - Persist session metadata updates
 */

import type { ClaudeSdkRunner, SdkRunnerOptions, SettingSource } from "./claude-sdk-runner.js";

// Built-in tools that should always be available
export const BUILTIN_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Task",
] as const;

export type AgentBridgeParams = {
  sessionKey: string;
  workspaceDir: string;
  prompt: string;
  /** Memory files to include in context */
  memoryFiles?: string[];
  /** MCP server configs */
  mcpServers?: Array<{ name: string; command: string }>;
  /** Stored SDK session ID for resume */
  sdkSessionId?: string;
  /** Channel context */
  channel?: string;
  /** Extra system prompt content */
  extraSystemPrompt?: string;
  /** Override SDK settingSources (default: ["user", "project"]) */
  settingSources?: SettingSource[];
  /** Override allowed tools list */
  allowedToolsOverride?: string[];
  /** Additional directories for CLAUDE.md resolution */
  additionalDirectories?: string[];
};

export type AgentBridgeOptions = {
  systemPrompt: string;
  settingSources: SettingSource[];
  allowedTools: string[];
  sdkSessionId?: string;
  mcpServers?: Array<{ name: string; command: string }>;
};

export type OpenClawPayload = {
  text?: string;
  mediaUrls?: string[];
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  toolResult?: {
    name: string;
    result: string;
  };
  isComplete?: boolean;
  isError?: boolean;
};

export type AgentBridgeRunResult = {
  payloads: OpenClawPayload[];
  sdkSessionId?: string;
  error?: {
    kind: "context_overflow" | "network_error" | "unknown";
    message: string;
  };
};

export class AgentBridge {
  private params: AgentBridgeParams;
  private runner: ClaudeSdkRunner;

  constructor(params: AgentBridgeParams, runner: ClaudeSdkRunner) {
    this.params = params;
    this.runner = runner;
  }

  /**
   * Build SDK options from OpenClaw params
   */
  async buildOptions(): Promise<AgentBridgeOptions> {
    // Build system prompt with memory files
    const systemPrompt = await buildSystemPromptWithMemory({
      workspaceDir: this.params.workspaceDir,
      memoryFiles: this.params.memoryFiles,
      extraSystemPrompt: this.params.extraSystemPrompt,
      channel: this.params.channel,
    });

    // Resolve MCP tools from server configs
    const mcpTools = resolveMcpTools(this.params.mcpServers);

    // Combine builtin tools with MCP tools
    const allowedTools: string[] = [...BUILTIN_TOOLS, ...mcpTools];

    return {
      systemPrompt,
      settingSources: this.params.settingSources ?? (["user", "project"] as SettingSource[]),
      allowedTools: this.params.allowedToolsOverride ?? allowedTools,
      sdkSessionId: this.params.sdkSessionId,
      mcpServers: this.params.mcpServers,
    };
  }

  /**
   * Run the agent and yield OpenClaw payloads
   */
  async *run(): AsyncGenerator<OpenClawPayload, AgentBridgeRunResult> {
    const options = await this.buildOptions();
    const payloads: OpenClawPayload[] = [];
    let sdkSessionId: string | undefined = this.params.sdkSessionId;

    try {
      // Stream events from SDK runner
      for await (const event of this.runner.query(this.params.prompt, {
        ...options,
        workspaceDir: this.params.workspaceDir,
      })) {
        switch (event.type) {
          case "text": {
            const payload: OpenClawPayload = { text: event.content };
            payloads.push(payload);
            yield payload;
            break;
          }
          case "tool_call": {
            const payload: OpenClawPayload = {
              toolCall: {
                name: event.name,
                arguments: event.arguments,
              },
            };
            payloads.push(payload);
            yield payload;
            break;
          }
          case "tool_result": {
            const payload: OpenClawPayload = {
              toolResult: {
                name: event.name,
                result: event.result,
              },
            };
            payloads.push(payload);
            yield payload;
            break;
          }
          case "complete": {
            // Capture session ID from complete event if present
            if (event.sessionId) {
              sdkSessionId = event.sessionId;
            }
            const payload: OpenClawPayload = { isComplete: true };
            payloads.push(payload);
            yield payload;
            break;
          }
        }
      }
    } catch (err) {
      // Always emit lifecycle end for gateway state consistency
      const errorPayload: OpenClawPayload = { isError: true };
      payloads.push(errorPayload);
      yield errorPayload;

      // Normalize and rethrow error
      const message = err instanceof Error ? err.message : String(err);
      throw normalizeError(message);
    }

    return {
      payloads,
      sdkSessionId,
    };
  }
}

/**
 * Build system prompt with memory recall
 *
 * Combines memory files and extra system prompt into a single prompt string.
 * Memory files are included as references so the agent knows which files to recall.
 */
export async function buildSystemPromptWithMemory(params: {
  workspaceDir: string;
  memoryFiles?: string[];
  extraSystemPrompt?: string;
  channel?: string;
}): Promise<string> {
  const parts: string[] = [];

  // Add memory file references
  if (params.memoryFiles && params.memoryFiles.length > 0) {
    parts.push("# Memory Files");
    parts.push("");
    parts.push("The following memory files are available in the workspace:");
    for (const file of params.memoryFiles) {
      parts.push(`- ${file}`);
    }
    parts.push("");
  }

  // Add channel context if present
  if (params.channel) {
    parts.push(`# Channel Context`);
    parts.push("");
    parts.push(`Current channel: ${params.channel}`);
    parts.push("");
  }

  // Add extra system prompt
  if (params.extraSystemPrompt) {
    parts.push(params.extraSystemPrompt);
  }

  return parts.join("\n");
}

/**
 * Resolve MCP tools from server configs
 *
 * Converts MCP server configs into tool name array.
 * Tool names follow the pattern: mcp__<server>__<tool>
 *
 * Currently supported tools per server:
 * - memory: recall, remember, forget
 * - sessions: list, history, send
 * - message: send
 * - nodes: invoke (status, describe, notify, camera_snap, etc.)
 * - browser: invoke (status, start, stop, snapshot, act, etc.)
 * - canvas: invoke (present, hide, navigate, eval, snapshot, a2ui_push, a2ui_reset)
 */
export function resolveMcpTools(
  mcpServers?: Array<{ name: string; command: string }>
): string[] {
  if (!mcpServers || mcpServers.length === 0) {
    return [];
  }

  const tools: string[] = [];

  for (const server of mcpServers) {
    // Map server name to available tools
    switch (server.name) {
      case "memory":
        tools.push("mcp__memory__recall");
        tools.push("mcp__memory__remember");
        tools.push("mcp__memory__forget");
        break;
      case "sessions":
        tools.push("mcp__sessions__list");
        tools.push("mcp__sessions__history");
        tools.push("mcp__sessions__send");
        break;
      case "message":
        tools.push("mcp__message__send");
        break;
      case "nodes":
        tools.push("mcp__nodes__invoke");
        break;
      case "browser":
        tools.push("mcp__browser__invoke");
        break;
      case "canvas":
        tools.push("mcp__canvas__invoke");
        break;
      default:
        // For unknown servers, add a generic tool pattern
        // This allows extension without code changes
        tools.push(`mcp__${server.name}__default`);
        break;
    }
  }

  return tools;
}

/**
 * Normalize SDK errors into OpenClaw error types
 */
export type NormalizedError = {
  kind: "context_overflow" | "network_error" | "unknown";
  message: string;
};

export function normalizeError(message: string): NormalizedError {
  const lowerMessage = message.toLowerCase();

  // Check for context overflow errors
  if (
    lowerMessage.includes("context_length_exceeded") ||
    lowerMessage.includes("context overflow") ||
    lowerMessage.includes("too many tokens")
  ) {
    return { kind: "context_overflow", message };
  }

  // Check for network errors
  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("enotfound") ||
    lowerMessage.includes("econnrefused") ||
    lowerMessage.includes("timeout")
  ) {
    return { kind: "network_error", message };
  }

  // Default to unknown
  return { kind: "unknown", message };
}
