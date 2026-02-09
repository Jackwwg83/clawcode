/**
 * MCP Browser Server
 *
 * Exposes OpenClaw browser tools to Claude Agent SDK via MCP.
 * Tool names follow the pattern: mcp__browser__<tool>
 */

export type BrowserInvokeResult = {
  ok: boolean;
  result?: unknown;
  error?: string;
};

/**
 * Backend interface for browser operations
 * This abstracts the actual browser tool implementation
 */
export interface BrowserBackend {
  invoke(action: string, params: Record<string, unknown>): Promise<BrowserInvokeResult>;
}

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export interface BrowserMcpServer {
  listTools(): McpTool[];
  callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export type BrowserMcpServerOptions = {
  backend: BrowserBackend;
};

const BROWSER_ACTIONS = [
  "status",
  "start",
  "stop",
  "profiles",
  "tabs",
  "open",
  "focus",
  "close",
  "snapshot",
  "screenshot",
  "navigate",
  "console",
  "pdf",
  "upload",
  "dialog",
  "act",
] as const;

/**
 * Create MCP browser server instance
 */
export function createBrowserMcpServer(options: BrowserMcpServerOptions): BrowserMcpServer {
  const { backend } = options;

  const tools: McpTool[] = [
    {
      name: "mcp__browser__invoke",
      description: `Invoke a browser action. Available actions: ${BROWSER_ACTIONS.join(", ")}. Use action="status" to check browser state.`,
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: BROWSER_ACTIONS,
            description: "The action to perform",
          },
          profile: {
            type: "string",
            description: 'Browser profile (e.g., "chrome" for Chrome extension relay, "openclaw" for managed browser)',
          },
          target: {
            type: "string",
            enum: ["sandbox", "host", "node"],
            description: "Browser location target",
          },
          node: {
            type: "string",
            description: "Node ID for node-hosted browser proxy",
          },
          // open/navigate params
          targetUrl: { type: "string", description: "URL to open or navigate to" },
          targetId: { type: "string", description: "Tab target ID" },
          // snapshot params
          snapshotFormat: {
            type: "string",
            enum: ["ai", "aria"],
            description: "Snapshot format",
          },
          // screenshot params
          fullPage: { type: "boolean", description: "Capture full page" },
          // act params
          request: {
            type: "object",
            description: "Action request object for act action",
          },
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
        case "mcp__browser__invoke": {
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
