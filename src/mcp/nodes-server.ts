/**
 * MCP Nodes Server
 *
 * Exposes OpenClaw nodes tools to Claude Agent SDK via MCP.
 * Tool names follow the pattern: mcp__nodes__<tool>
 */

export type NodesInvokeResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
};

/**
 * Backend interface for nodes operations
 * This abstracts the actual nodes tool implementation
 */
export interface NodesBackend {
  invoke(action: string, params: Record<string, unknown>): Promise<NodesInvokeResult>;
}

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export interface NodesMcpServer {
  listTools(): McpTool[];
  callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export type NodesMcpServerOptions = {
  backend: NodesBackend;
};

const NODES_ACTIONS = [
  "status",
  "describe",
  "pending",
  "approve",
  "reject",
  "notify",
  "camera_snap",
  "camera_list",
  "camera_clip",
  "screen_record",
  "location_get",
  "run",
] as const;

/**
 * Create MCP nodes server instance
 */
export function createNodesMcpServer(options: NodesMcpServerOptions): NodesMcpServer {
  const { backend } = options;

  const tools: McpTool[] = [
    {
      name: "mcp__nodes__invoke",
      description: `Invoke a nodes action. Available actions: ${NODES_ACTIONS.join(", ")}. Use action="status" to list paired nodes.`,
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: NODES_ACTIONS,
            description: "The action to perform",
          },
          node: {
            type: "string",
            description: "Node ID or name (required for most actions)",
          },
          // notify params
          title: { type: "string", description: "Notification title" },
          body: { type: "string", description: "Notification body" },
          // camera params
          facing: {
            type: "string",
            enum: ["front", "back", "both"],
            description: "Camera facing direction",
          },
          durationMs: { type: "number", description: "Duration in milliseconds" },
          // run params
          command: {
            type: "array",
            items: { type: "string" },
            description: "Command argv array for run action",
          },
          cwd: { type: "string", description: "Working directory for run action" },
          // approve/reject params
          requestId: { type: "string", description: "Pairing request ID" },
        },
        required: ["action"],
      },
    },
  ];

  return {
    listTools() {
      return tools;
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
      switch (name) {
        case "mcp__nodes__invoke": {
          const action = args.action as string | undefined;
          if (!action || typeof action !== "string" || !action.trim()) {
            return { ok: false, error: "action parameter is required" };
          }

          // Pass through all params to the backend
          const result = await backend.invoke(action, args);
          return result;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    },
  };
}
