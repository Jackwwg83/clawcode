/**
 * MCP Protocol Handler
 *
 * Implements standard MCP (Model Context Protocol) for Claude Agent SDK.
 * Handles lifecycle: initialize -> notifications/initialized -> tools/list|tools/call
 */
import type { StdioMcpServer } from "./stdio-server.js";

export type McpRequest = {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

export type McpResponse = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type McpProtocolHandlerOptions = {
  server: StdioMcpServer;
  serverInfo: {
    name: string;
    version: string;
  };
};

// JSON-RPC error codes
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const SERVER_NOT_INITIALIZED = -32002;

export interface McpProtocolHandler {
  handleRequest(request: McpRequest): Promise<McpResponse | null>;
  handleInvalidJson(raw: string): McpResponse;
  isInitialized(): boolean;
}

/**
 * Validate JSON-RPC request structure
 * Returns error response if invalid, null if valid
 */
function validateRequest(request: unknown): McpResponse | null {
  const req = request as Record<string, unknown>;

  // Extract id for error response (may be invalid type)
  const rawId = req?.id;
  const responseId = isValidId(rawId) ? (rawId as number | string | null) : null;

  // Check jsonrpc field
  if (req?.jsonrpc !== "2.0") {
    return {
      jsonrpc: "2.0",
      id: responseId,
      error: {
        code: INVALID_REQUEST,
        message: "Invalid Request: jsonrpc must be '2.0'",
      },
    };
  }

  // Check method field
  if (typeof req?.method !== "string") {
    return {
      jsonrpc: "2.0",
      id: responseId,
      error: {
        code: INVALID_REQUEST,
        message: "Invalid Request: method must be a string",
      },
    };
  }

  // Check id type (must be number, string, or null; undefined means notification)
  if (rawId !== undefined && !isValidId(rawId)) {
    return {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: INVALID_REQUEST,
        message: "Invalid Request: id must be a number, string, or null",
      },
    };
  }

  return null; // Valid request
}

/**
 * Check if id is a valid JSON-RPC id type
 */
function isValidId(id: unknown): boolean {
  return id === null || typeof id === "number" || typeof id === "string";
}

/**
 * Check if value is a non-array object (plain object)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Check if request is a notification (no id field)
 * Only valid for plain objects - caller must verify first
 */
function isNotification(request: Record<string, unknown>): boolean {
  return !("id" in request);
}

/**
 * Create an MCP protocol handler
 */
export function createMcpProtocolHandler(options: McpProtocolHandlerOptions): McpProtocolHandler {
  const { server, serverInfo } = options;
  // Lifecycle states:
  // - initReceived: initialize method has been called
  // - initialized: notifications/initialized has been received (ready for tools/*)
  let initReceived = false;
  let initialized = false;

  return {
    isInitialized() {
      return initialized;
    },

    handleInvalidJson(_raw: string): McpResponse {
      return {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: PARSE_ERROR,
          message: "Parse error: Invalid JSON",
        },
      };
    },

    async handleRequest(request: McpRequest): Promise<McpResponse | null> {
      // First check if request is a plain object (not array, string, number, null)
      // Non-object JSON values are invalid requests
      if (!isPlainObject(request)) {
        return {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: INVALID_REQUEST,
            message: "Invalid Request: request must be an object",
          },
        };
      }

      // Per MCP spec: Notifications (no id field) MUST NOT return any response,
      // even if the notification is malformed. Check this FIRST.
      if (isNotification(request)) {
        // Special handling for notifications/initialized - sets initialized state
        // Only if the request looks valid enough to have a method string
        const method = request.method;
        if (typeof method === "string" && method === "notifications/initialized" && initReceived) {
          initialized = true;
        }
        // All notifications return null (no response) - even invalid ones
        return null;
      }

      // For non-notification requests, validate structure
      const validationError = validateRequest(request);
      if (validationError) {
        return validationError;
      }

      const { id, method, params } = request as McpRequest;

      // Handle ping (always allowed, even before initialize)
      if (method === "ping") {
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {},
        };
      }

      // Handle initialize
      if (method === "initialize") {
        initReceived = true;
        // Note: initialized stays false until notifications/initialized is received
        const clientProtocolVersion =
          typeof params?.protocolVersion === "string" ? params.protocolVersion : "2024-11-05";

        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            protocolVersion: clientProtocolVersion,
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
            serverInfo: {
              name: serverInfo.name,
              version: serverInfo.version,
            },
          },
        };
      }

      // Check initialization for tools methods
      // Must have both: initReceived AND initialized (after notifications/initialized)
      if (!initialized && (method === "tools/list" || method === "tools/call")) {
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          error: {
            code: SERVER_NOT_INITIALIZED,
            message: "Server not initialized. Call 'initialize' first, then send 'notifications/initialized'.",
          },
        };
      }

      // Handle tools/list
      if (method === "tools/list") {
        const tools = server.listTools();
        return {
          jsonrpc: "2.0",
          id: id ?? null,
          result: {
            tools: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            })),
          },
        };
      }

      // Handle tools/call
      if (method === "tools/call") {
        const toolName = typeof params?.name === "string" ? params.name : "";
        const toolArgs =
          typeof params?.arguments === "object" && params.arguments !== null
            ? (params.arguments as Record<string, unknown>)
            : {};

        try {
          const result = await server.callTool(toolName, toolArgs);

          // Convert result to MCP content format
          const content = formatToolResult(result);

          // Check if result indicates an error
          const isError = "error" in result && typeof result.error === "string";

          return {
            jsonrpc: "2.0",
            id: id ?? null,
            result: {
              content,
              isError,
            },
          };
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          return {
            jsonrpc: "2.0",
            id: id ?? null,
            result: {
              content: [{ type: "text", text: `Error: ${errorMessage}` }],
              isError: true,
            },
          };
        }
      }

      // Unknown method
      return {
        jsonrpc: "2.0",
        id: id ?? null,
        error: {
          code: METHOD_NOT_FOUND,
          message: `Method not found: ${method}`,
        },
      };
    },
  };
}

/**
 * Format tool result as MCP content array
 */
function formatToolResult(result: Record<string, unknown>): Array<{ type: string; text?: string; json?: unknown }> {
  // If result has error field, return as text
  if ("error" in result && typeof result.error === "string") {
    return [{ type: "text", text: result.error }];
  }

  // If result has results array (memory search), format as JSON
  if ("results" in result && Array.isArray(result.results)) {
    return [{ type: "json", json: result.results }];
  }

  // If result has sessions array, format as JSON
  if ("sessions" in result && Array.isArray(result.sessions)) {
    return [{ type: "json", json: result.sessions }];
  }

  // If result has messages array (history), format as JSON
  if ("messages" in result && Array.isArray(result.messages)) {
    return [{ type: "json", json: result.messages }];
  }

  // If result has ok field (send result), format as text
  if ("ok" in result) {
    if (result.ok) {
      return [{ type: "text", text: "Success" }];
    } else {
      const errorMsg = typeof result.error === "string" ? result.error : "Unknown error";
      return [{ type: "text", text: errorMsg }];
    }
  }

  // Default: return as JSON
  return [{ type: "json", json: result }];
}
