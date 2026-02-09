/**
 * Claude SDK Runner - Wrapper around Claude Agent SDK
 *
 * This module provides the interface to Claude Agent SDK's query functionality
 * via the @anthropic-ai/claude-agent-sdk package.
 */
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";

export type SdkStreamEvent =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_call"; name: string; arguments: Record<string, unknown>; id: string }
  | { type: "tool_result"; name: string; result: string; id: string }
  | { type: "complete"; stopReason: string; sessionId?: string };

export type SettingSource = "user" | "project" | "local";

export type SdkRunnerOptions = {
  systemPrompt: string;
  settingSources: SettingSource[];
  additionalDirectories?: string[];
  allowedTools: string[];
  sdkSessionId?: string;
  mcpServers?: Array<{ name: string; command: string }>;
  workspaceDir: string;
};

export interface ClaudeSdkRunner {
  query(prompt: string, options: SdkRunnerOptions): AsyncGenerator<SdkStreamEvent>;
}

/**
 * Map SDK event types to our normalized event types.
 * SDK events have format:
 * - { type: "assistant", message: { content: [{ type: "text", text: "..." }] } }
 * - { type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } }
 * - { type: "user", message: { content: [{ type: "tool_result", tool_use_id, content }] } }
 * - { type: "result", subtype: "success", result: "...", session_id: "..." }
 */
function* mapSdkEvent(event: Record<string, unknown>): Generator<SdkStreamEvent> {
  const eventType = event.type as string;

  switch (eventType) {
    case "assistant": {
      // Extract text, thinking, and tool_use from assistant message content
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (content) {
        for (const item of content) {
          if (item.type === "text" && typeof item.text === "string") {
            yield { type: "text", content: item.text };
          } else if (item.type === "thinking" && typeof item.thinking === "string" && item.thinking.trim()) {
            yield { type: "thinking", content: item.thinking };
          } else if (item.type === "tool_use") {
            yield {
              type: "tool_call",
              name: item.name as string,
              arguments: (item.input as Record<string, unknown>) ?? {},
              id: item.id as string,
            };
          }
        }
      }
      break;
    }

    case "user": {
      // Extract tool_result from user message content
      const message = event.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      if (content) {
        for (const item of content) {
          if (item.type === "tool_result") {
            yield {
              type: "tool_result",
              name: "", // SDK doesn't provide tool name in result
              result: typeof item.content === "string" ? item.content : JSON.stringify(item.content),
              id: item.tool_use_id as string,
            };
          }
        }
      }
      break;
    }

    case "result": {
      // Final result event
      if (event.subtype === "success" || event.subtype === "error") {
        yield {
          type: "complete",
          stopReason: event.subtype === "success" ? "end_turn" : "error",
          sessionId: event.session_id as string | undefined,
        };
      }
      break;
    }
  }
}

export function createClaudeSdkRunner(): ClaudeSdkRunner {
  return {
    async *query(prompt: string, options: SdkRunnerOptions): AsyncGenerator<SdkStreamEvent> {
      // Build SDK options
      const sdkOptions: Record<string, unknown> = {
        systemPrompt: options.systemPrompt,
        allowedTools: options.allowedTools,
        cwd: options.workspaceDir,
      };

      // Add settingSources (SDK loads settings.json from user/project/local)
      if (options.settingSources.length > 0) {
        sdkOptions.settingSources = options.settingSources;
      }

      // Add additionalDirectories (SDK reads CLAUDE.md from these paths)
      if (options.additionalDirectories && options.additionalDirectories.length > 0) {
        sdkOptions.additionalDirectories = options.additionalDirectories;
      }

      // Add session resume if provided
      if (options.sdkSessionId) {
        sdkOptions.resume = options.sdkSessionId;
      }

      // Add MCP servers if provided (convert array to Record format)
      if (options.mcpServers && options.mcpServers.length > 0) {
        const mcpServersRecord: Record<string, { command: string; args?: string[] }> = {};
        for (const server of options.mcpServers) {
          mcpServersRecord[server.name] = { command: server.command, args: [] };
        }
        sdkOptions.mcpServers = mcpServersRecord;
      }

      // Track if we've yielded a complete event
      let yieldedComplete = false;

      // Call SDK query and yield mapped events
      for await (const event of sdkQuery({ prompt, options: sdkOptions })) {
        for (const mapped of mapSdkEvent(event as Record<string, unknown>)) {
          yield mapped;
          if (mapped.type === "complete") {
            yieldedComplete = true;
          }
        }
      }

      // Only yield fallback complete if SDK didn't provide one
      if (!yieldedComplete) {
        yield {
          type: "complete",
          stopReason: "end_turn",
        };
      }
    },
  };
}
