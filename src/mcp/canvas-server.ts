/**
 * MCP Canvas Server
 *
 * Exposes OpenClaw canvas tools to Claude Agent SDK via MCP.
 * Tool names follow the pattern: mcp__canvas__<tool>
 */

export type CanvasInvokeResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
};

/**
 * Backend interface for canvas operations
 * This abstracts the actual canvas tool implementation
 */
export interface CanvasBackend {
  invoke(action: string, params: Record<string, unknown>): Promise<CanvasInvokeResult>;
}

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export interface CanvasMcpServer {
  listTools(): McpTool[];
  callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export type CanvasMcpServerOptions = {
  backend: CanvasBackend;
};

const CANVAS_ACTIONS = [
  "present",
  "hide",
  "navigate",
  "eval",
  "snapshot",
  "a2ui_push",
  "a2ui_reset",
] as const;

/**
 * Create MCP canvas server instance
 */
export function createCanvasMcpServer(options: CanvasMcpServerOptions): CanvasMcpServer {
  const { backend } = options;

  const tools: McpTool[] = [
    {
      name: "mcp__canvas__invoke",
      description: `Invoke a canvas action. Available actions: ${CANVAS_ACTIONS.join(", ")}. Use snapshot to capture the rendered UI.`,
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: CANVAS_ACTIONS,
            description: "The action to perform",
          },
          node: {
            type: "string",
            description: "Node ID (required for canvas operations)",
          },
          // present params
          target: { type: "string", description: "URL to present" },
          x: { type: "number", description: "X position" },
          y: { type: "number", description: "Y position" },
          width: { type: "number", description: "Width" },
          height: { type: "number", description: "Height" },
          // navigate params
          url: { type: "string", description: "URL to navigate to" },
          // eval params
          javaScript: { type: "string", description: "JavaScript to evaluate" },
          // snapshot params
          outputFormat: {
            type: "string",
            enum: ["png", "jpg", "jpeg"],
            description: "Output image format",
          },
          maxWidth: { type: "number", description: "Maximum width" },
          quality: { type: "number", description: "Image quality (0-100)" },
          // a2ui_push params
          jsonl: { type: "string", description: "JSONL content for A2UI" },
          jsonlPath: { type: "string", description: "Path to JSONL file for A2UI" },
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
        case "mcp__canvas__invoke": {
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
