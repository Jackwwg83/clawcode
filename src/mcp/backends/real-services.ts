/**
 * Real Service Wiring
 *
 * Factory functions that wire MCP backend adapters to real OpenClaw services.
 */
import type { OpenClawConfig } from "../../config/config.js";
import type { MemoryBackend, MemorySearchResult } from "../memory-server.js";
import type { SessionsBackend, SessionInfo, SessionMessage, SendResult } from "../sessions-server.js";
import type { MessageBackend } from "../message-server.js";
import type { NodesBackend, NodesInvokeResult } from "../nodes-server.js";
import type { BrowserBackend, BrowserInvokeResult } from "../browser-server.js";
import type { CanvasBackend, CanvasInvokeResult } from "../canvas-server.js";

/**
 * Create memory backend wired to real MemoryIndexManager
 */
export function createRealMemoryBackend(params: {
  cfg: OpenClawConfig;
  agentId: string;
}): MemoryBackend {
  const { cfg, agentId } = params;

  return {
    async search(query: string, options: { maxResults: number }): Promise<MemorySearchResult[]> {
      const { getMemorySearchManager } = await import("../../memory/search-manager.js");
      const result = await getMemorySearchManager({ cfg, agentId });

      if (!result.manager) {
        return [];
      }

      const searchResults = await result.manager.search(query, {
        maxResults: options.maxResults,
      });

      // Map internal results to MCP format (without 'source' field)
      return searchResults.map((r) => ({
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        score: r.score,
        snippet: r.snippet,
      }));
    },

    async writeEntry(_params: { content: string; type: string; importance: string }) {
      // Memory write in OpenClaw is file-based (memory files in workspace)
      // Direct API write is not supported - users should edit memory files directly
      return {
        ok: false,
        error: "Memory write not implemented - edit memory files directly in workspace",
      };
    },

    async deleteEntry(_memoryId: string) {
      // Memory delete in OpenClaw is file-based
      // Direct API delete is not supported
      return {
        ok: false,
        error: "Memory delete not implemented - edit memory files directly in workspace",
      };
    },
  };
}

/**
 * Create sessions backend wired to real gateway session APIs
 */
export function createRealSessionsBackend(params: { cfg: OpenClawConfig }): SessionsBackend {
  const { cfg } = params;

  return {
    async list(): Promise<SessionInfo[]> {
      const {
        loadCombinedSessionStoreForGateway,
        listSessionsFromStore,
      } = await import("../../gateway/session-utils.js");

      const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);
      const result = listSessionsFromStore({ cfg, storePath, store, opts: {} });

      // Map to SessionInfo: { key, kind?, channel?, label?, updatedAt? }
      return result.sessions.map((s) => ({
        key: s.key,
        kind: s.kind,
        channel: s.channel,
        label: s.label,
        updatedAt: s.updatedAt ?? undefined,
      }));
    },

    async history(sessionKey: string, options: { limit: number }): Promise<SessionMessage[]> {
      const {
        loadCombinedSessionStoreForGateway,
        readSessionMessages,
      } = await import("../../gateway/session-utils.js");

      const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);
      const entry = store[sessionKey];

      if (!entry?.sessionId) {
        return [];
      }

      const messages = readSessionMessages(entry.sessionId, storePath, entry.sessionFile);

      // Apply limit and map to SessionMessage format
      const limited = options.limit > 0 ? messages.slice(-options.limit) : messages;

      return limited.map((m: any) => ({
        role: m.role ?? "unknown",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      }));
    },

    async send(sessionKey: string, message: string): Promise<SendResult> {
      const { loadCombinedSessionStoreForGateway } = await import("../../gateway/session-utils.js");
      const { resolveOutboundTarget } = await import("../../infra/outbound/targets.js");
      const { deliverOutboundPayloads } = await import("../../infra/outbound/deliver.js");

      try {
        const { store } = loadCombinedSessionStoreForGateway(cfg);
        const entry = store[sessionKey];

        if (!entry) {
          return {
            ok: false,
            error: `Session not found: ${sessionKey}`,
          };
        }

        // Get delivery context from session entry
        const channel = entry.lastChannel;
        const to = entry.lastTo;
        const accountId = entry.lastAccountId;

        if (!channel || !to) {
          return {
            ok: false,
            error: "Session has no delivery context (lastChannel/lastTo missing)",
          };
        }

        // Resolve outbound target
        const resolved = resolveOutboundTarget({
          channel,
          to,
          cfg,
          accountId,
          mode: "explicit",
        });

        if (!resolved.ok) {
          return {
            ok: false,
            error: String(resolved.error),
          };
        }

        // Deliver the message
        const results = await deliverOutboundPayloads({
          cfg,
          channel,
          to: resolved.to,
          accountId,
          payloads: [{ text: message }],
        });

        const result = results.at(-1);
        if (!result) {
          return {
            ok: false,
            error: "No delivery result",
          };
        }

        return {
          ok: true,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

/**
 * Create message backend wired to real outbound delivery
 */
export function createRealMessageBackend(): MessageBackend {
  return {
    async send(
      channelId: string,
      target: string,
      message: string,
    ): Promise<SendResult & { messageId?: string }> {
      const { loadConfig } = await import("../../config/config.js");
      const { resolveOutboundTarget } = await import("../../infra/outbound/targets.js");
      const { deliverOutboundPayloads } = await import("../../infra/outbound/deliver.js");

      try {
        const cfg = loadConfig();

        const resolved = resolveOutboundTarget({
          channel: channelId,
          to: target,
          cfg,
          mode: "explicit",
        });

        if (!resolved.ok) {
          return {
            ok: false,
            error: String(resolved.error),
          };
        }

        const results = await deliverOutboundPayloads({
          cfg,
          channel: channelId,
          to: resolved.to,
          payloads: [{ text: message }],
        });

        const result = results.at(-1);
        if (!result) {
          return {
            ok: false,
            error: "No delivery result",
          };
        }

        return {
          ok: true,
          messageId: result.messageId,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

/**
 * Create nodes backend wired to real nodes tool
 */
export function createRealNodesBackend(params?: {
  agentSessionKey?: string;
  config?: OpenClawConfig;
}): NodesBackend {
  return {
    async invoke(action: string, invokeParams: Record<string, unknown>): Promise<NodesInvokeResult> {
      try {
        const { createNodesTool } = await import("../../agents/tools/nodes-tool.js");
        const tool = createNodesTool({
          agentSessionKey: params?.agentSessionKey,
          config: params?.config,
        });

        // Build params for the tool
        const toolParams = { ...invokeParams, action };

        const result = await tool.execute("mcp-invoke", toolParams);

        return {
          ok: true,
          result: result.details ?? result.content,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

/**
 * Create browser backend wired to real browser tool
 */
export function createRealBrowserBackend(params?: {
  sandboxBridgeUrl?: string;
  allowHostControl?: boolean;
}): BrowserBackend {
  return {
    async invoke(action: string, invokeParams: Record<string, unknown>): Promise<BrowserInvokeResult> {
      try {
        const { createBrowserTool } = await import("../../agents/tools/browser-tool.js");
        const tool = createBrowserTool({
          sandboxBridgeUrl: params?.sandboxBridgeUrl,
          allowHostControl: params?.allowHostControl,
        });

        // Build params for the tool
        const toolParams = { ...invokeParams, action };

        const result = await tool.execute("mcp-invoke", toolParams);

        return {
          ok: true,
          result: result.details ?? result.content,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

/**
 * Create canvas backend wired to real canvas tool
 */
export function createRealCanvasBackend(): CanvasBackend {
  return {
    async invoke(action: string, invokeParams: Record<string, unknown>): Promise<CanvasInvokeResult> {
      try {
        const { createCanvasTool } = await import("../../agents/tools/canvas-tool.js");
        const tool = createCanvasTool();

        // Build params for the tool
        const toolParams = { ...invokeParams, action };

        const result = await tool.execute("mcp-invoke", toolParams);

        return {
          ok: true,
          result: result.details ?? result.content,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
