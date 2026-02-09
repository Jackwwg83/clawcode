/**
 * MCP Message Server
 *
 * Exposes OpenClaw message delivery tools to Claude Agent SDK via MCP.
 * Tool names follow the pattern: mcp__message__<tool>
 */

export type SendResult = {
  ok: boolean;
  status?: string;
  runId?: string;
  error?: string;
};

/**
 * Backend interface for message operations
 * This abstracts the actual gateway delivery
 */
export interface MessageBackend {
  send(channelId: string, target: string, message: string): Promise<SendResult>;
}

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export interface MessageMcpServer {
  listTools(): McpTool[];
  callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export type MessageMcpServerOptions = {
  backend: MessageBackend;
};

/**
 * Create MCP message server instance
 */
export function createMessageMcpServer(options: MessageMcpServerOptions): MessageMcpServer {
  const { backend } = options;

  const tools: McpTool[] = [
    {
      name: "mcp__message__send",
      description: "Send a message to a channel target",
      inputSchema: {
        type: "object",
        properties: {
          channelId: { type: "string", description: "Channel identifier (telegram, discord, slack, etc.)" },
          target: { type: "string", description: "Target user or chat ID" },
          message: { type: "string", description: "Message content" },
        },
        required: ["channelId", "target", "message"],
      },
    },
  ];

  return {
    listTools() {
      return tools;
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
      switch (name) {
        case "mcp__message__send": {
          const channelId = args.channelId as string | undefined;
          const target = args.target as string | undefined;
          const message = args.message as string | undefined;

          // Validate required parameters
          if (!channelId || typeof channelId !== "string" || !channelId.trim()) {
            return { ok: false, error: "channelId parameter is required" };
          }
          if (!target || typeof target !== "string" || !target.trim()) {
            return { ok: false, error: "target parameter is required" };
          }
          if (!message || typeof message !== "string" || !message.trim()) {
            return { ok: false, error: "message parameter is required" };
          }

          const result = await backend.send(channelId, target, message);
          return result;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    },
  };
}
