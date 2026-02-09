/**
 * MCP Sessions Server
 *
 * Exposes OpenClaw session tools to Claude Agent SDK via MCP.
 * Tool names follow the pattern: mcp__sessions__<tool>
 */

export type SessionInfo = {
  key: string;
  kind?: string;
  channel?: string;
  label?: string;
  updatedAt?: number;
};

export type SessionMessage = {
  role: string;
  content: unknown;
};

export type SendResult = {
  ok: boolean;
  runId?: string;
  status?: string;
  error?: string;
};

/**
 * Backend interface for sessions operations
 * This abstracts the actual gateway calls
 */
export interface SessionsBackend {
  list(): Promise<SessionInfo[]>;
  history(sessionKey: string, options: { limit: number }): Promise<SessionMessage[]>;
  send(sessionKey: string, message: string): Promise<SendResult>;
}

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export interface SessionsMcpServer {
  listTools(): McpTool[];
  callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export type SessionsMcpServerOptions = {
  backend: SessionsBackend;
};

const DEFAULT_HISTORY_LIMIT = 20;

/**
 * Create MCP sessions server instance
 */
export function createSessionsMcpServer(options: SessionsMcpServerOptions): SessionsMcpServer {
  const { backend } = options;

  const tools: McpTool[] = [
    {
      name: "mcp__sessions__list",
      description: "List all active sessions",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "mcp__sessions__history",
      description: "Get message history for a session",
      inputSchema: {
        type: "object",
        properties: {
          sessionKey: { type: "string", description: "Session key to get history for" },
          limit: { type: "number", description: "Maximum messages to return" },
        },
        required: ["sessionKey"],
      },
    },
    {
      name: "mcp__sessions__send",
      description: "Send a message to a session",
      inputSchema: {
        type: "object",
        properties: {
          sessionKey: { type: "string", description: "Session key to send to" },
          message: { type: "string", description: "Message content" },
        },
        required: ["sessionKey", "message"],
      },
    },
  ];

  return {
    listTools() {
      return tools;
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
      switch (name) {
        case "mcp__sessions__list": {
          const sessions = await backend.list();
          return { sessions };
        }

        case "mcp__sessions__history": {
          const sessionKey = args.sessionKey as string;
          const limit =
            typeof args.limit === "number" && args.limit > 0 ? args.limit : DEFAULT_HISTORY_LIMIT;

          try {
            const messages = await backend.history(sessionKey, { limit });
            return { ok: true, messages };
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            return { ok: false, error, messages: [] };
          }
        }

        case "mcp__sessions__send": {
          const sessionKey = args.sessionKey as string;
          const message = args.message as string | undefined;

          if (!message || typeof message !== "string" || !message.trim()) {
            return { ok: false, error: "message parameter is required" };
          }

          const result = await backend.send(sessionKey, message);
          return result;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    },
  };
}
