/**
 * MCP Protocol Handler Tests
 *
 * Tests for standard MCP protocol compliance.
 * Protocol flow: initialize -> notifications/initialized -> tools/list|tools/call
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMcpProtocolHandler, type McpProtocolHandler } from "./mcp-protocol.js";

describe("MCP Protocol Handler", () => {
  let handler: McpProtocolHandler;
  let mockServer: {
    listTools: ReturnType<typeof vi.fn>;
    callTool: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {
      listTools: vi.fn().mockReturnValue([
        { name: "mcp__memory__recall", description: "Recall memory", inputSchema: {} },
      ]),
      callTool: vi.fn().mockResolvedValue({ results: [{ path: "/test" }] }),
    };
    handler = createMcpProtocolHandler({
      server: mockServer,
      serverInfo: { name: "memory", version: "1.0.0" },
    });
  });

  describe("JSON-RPC request validation (-32600 Invalid Request)", () => {
    it("should return -32600 when request is an array", async () => {
      const response = await handler.handleRequest([] as any);

      expect(response).not.toBeNull();
      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBeNull();
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
      expect(response.error.message).toContain("Invalid Request");
    });

    it("should return -32600 when request is a string", async () => {
      const response = await handler.handleRequest("abc" as any);

      expect(response).not.toBeNull();
      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBeNull();
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
    });

    it("should return -32600 when request is a number", async () => {
      const response = await handler.handleRequest(123 as any);

      expect(response).not.toBeNull();
      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBeNull();
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
    });

    it("should return -32600 when request is null", async () => {
      const response = await handler.handleRequest(null as any);

      expect(response).not.toBeNull();
      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBeNull();
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
    });

    it("should return -32600 when jsonrpc field is missing", async () => {
      const response = await handler.handleRequest({
        id: 1,
        method: "ping",
      } as any);

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(1);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
      expect(response.error.message).toContain("Invalid Request");
    });

    it("should return -32600 when jsonrpc is not '2.0'", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "1.0",
        id: 1,
        method: "ping",
      } as any);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
    });

    it("should return -32600 when method is not a string", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: 123,
      } as any);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
    });

    it("should return -32600 when method is missing", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 1,
      } as any);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
    });

    it("should return -32600 when id is invalid type (object)", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: { invalid: true },
        method: "ping",
      } as any);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
    });

    it("should return -32600 when id is invalid type (array)", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: [1, 2, 3],
        method: "ping",
      } as any);

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32600);
    });

    it("should accept valid id types: number, string, null", async () => {
      // Number id
      let response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 123,
        method: "ping",
      });
      expect(response.error).toBeUndefined();
      expect(response.id).toBe(123);

      // String id
      response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: "abc",
        method: "ping",
      });
      expect(response.error).toBeUndefined();
      expect(response.id).toBe("abc");

      // Null id
      response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: null,
        method: "ping",
      });
      expect(response.error).toBeUndefined();
      expect(response.id).toBeNull();
    });
  });

  describe("notifications (any method without id) → null", () => {
    it("should return null for any notification (no id)", async () => {
      // Custom notification method
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        method: "custom/notification",
      });
      expect(response).toBeNull();
    });

    it("should return null for notifications/cancelled", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: "123", reason: "user cancelled" },
      });
      expect(response).toBeNull();
    });

    it("should return null for notifications/progress", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: { progressToken: "token", progress: 50 },
      });
      expect(response).toBeNull();
    });

    it("should return null for invalid notification (missing jsonrpc)", async () => {
      // Even invalid notifications must not return a response
      const response = await handler.handleRequest({
        method: "some/notification",
      } as any);
      expect(response).toBeNull();
    });

    it("should return null for invalid notification (method not a string)", async () => {
      // Even invalid notifications must not return a response
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        method: 123,
      } as any);
      expect(response).toBeNull();
    });

    it("should return null for invalid notification (missing method)", async () => {
      // Even invalid notifications must not return a response
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
      } as any);
      expect(response).toBeNull();
    });
  });

  describe("lifecycle: initialize → notifications/initialized → tools/*", () => {
    it("should return -32002 for tools/list before initialize", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      });

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32002);
    });

    it("should return -32002 for tools/list after initialize but before notifications/initialized", async () => {
      // Initialize first
      await handler.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: {} },
      });

      // Try tools/list without sending notifications/initialized
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32002);
      expect(response.error.message).toContain("not initialized");
    });

    it("should allow tools/list after initialize AND notifications/initialized", async () => {
      // 1. Initialize
      await handler.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: {} },
      });

      // 2. Send notifications/initialized
      await handler.handleRequest({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });

      // 3. Now tools/list should work
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeInstanceOf(Array);
    });

    it("should return -32002 for tools/call after initialize but before notifications/initialized", async () => {
      // Initialize first
      await handler.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: {} },
      });

      // Try tools/call without sending notifications/initialized
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "mcp__memory__recall", arguments: {} },
      });

      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32002);
    });
  });

  describe("initialize", () => {
    it("should return protocolVersion, capabilities, and serverInfo", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "claude", version: "1.0" },
        },
      });

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();
      expect(response.result.protocolVersion).toBe("2024-11-05");
      expect(response.result.capabilities).toBeDefined();
      expect(response.result.capabilities.tools).toBeDefined();
      expect(response.result.serverInfo).toBeDefined();
      expect(response.result.serverInfo.name).toBe("memory");
    });

    it("should mark handler as initialized after initialize AND notifications/initialized", async () => {
      expect(handler.isInitialized()).toBe(false);

      // Step 1: initialize
      await handler.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: {} },
      });

      // Not yet initialized - waiting for notifications/initialized
      expect(handler.isInitialized()).toBe(false);

      // Step 2: notifications/initialized
      await handler.handleRequest({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });

      // Now initialized
      expect(handler.isInitialized()).toBe(true);
    });
  });

  describe("notifications/initialized", () => {
    it("should accept initialized notification after initialize", async () => {
      // First initialize
      await handler.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: {} },
      });

      // Then send initialized notification (no id = notification)
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });

      // Notifications should return null (no response)
      expect(response).toBeNull();
    });
  });

  describe("tools/list before initialize", () => {
    it("should return error when tools/list called before initialize", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      });

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(2);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32002); // Server not initialized
      expect(response.error.message).toContain("not initialized");
    });
  });

  describe("tools/call before initialize", () => {
    it("should return error when tools/call called before initialize", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "mcp__memory__recall", arguments: { query: "test" } },
      });

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(3);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32002);
    });
  });

  describe("tools/list after initialize", () => {
    beforeEach(async () => {
      // Step 1: initialize
      await handler.handleRequest({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: {} },
      });
      // Step 2: notifications/initialized
      await handler.handleRequest({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });
    });

    it("should return tools list from server", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/list",
      });

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(4);
      expect(response.result).toBeDefined();
      expect(response.result.tools).toBeInstanceOf(Array);
      expect(response.result.tools).toHaveLength(1);
      expect(response.result.tools[0].name).toBe("mcp__memory__recall");
      expect(mockServer.listTools).toHaveBeenCalled();
    });
  });

  describe("tools/call after initialize", () => {
    beforeEach(async () => {
      // Step 1: initialize
      await handler.handleRequest({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: {} },
      });
      // Step 2: notifications/initialized
      await handler.handleRequest({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      });
    });

    it("should return MCP-compliant result with content array", async () => {
      mockServer.callTool.mockResolvedValue({ results: [{ path: "/test", snippet: "hello" }] });

      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "mcp__memory__recall", arguments: { query: "test" } },
      });

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(5);
      expect(response.result).toBeDefined();
      expect(response.result.content).toBeInstanceOf(Array);
      expect(response.result.content.length).toBeGreaterThan(0);
      // Content should be text or json type
      expect(response.result.content[0].type).toMatch(/^(text|json)$/);
    });

    it("should call server.callTool with correct arguments", async () => {
      await handler.handleRequest({
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "mcp__memory__recall", arguments: { query: "test query", limit: 5 } },
      });

      expect(mockServer.callTool).toHaveBeenCalledWith("mcp__memory__recall", {
        query: "test query",
        limit: 5,
      });
    });

    it("should return error content when tool fails", async () => {
      mockServer.callTool.mockResolvedValue({ error: "Tool execution failed" });

      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "mcp__memory__recall", arguments: {} },
      });

      expect(response.result.content).toBeDefined();
      expect(response.result.isError).toBe(true);
    });
  });

  describe("unknown method", () => {
    it("should return JSON-RPC error -32601 for unknown method", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 8,
        method: "unknown/method",
      });

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(8);
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32601); // Method not found
      expect(response.error.message).toContain("Method not found");
    });
  });

  describe("invalid JSON handling", () => {
    it("should return parse error with id=null for invalid JSON", async () => {
      const response = await handler.handleInvalidJson("not valid json {{{");

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBeNull();
      expect(response.error).toBeDefined();
      expect(response.error.code).toBe(-32700); // Parse error
    });
  });

  describe("ping", () => {
    it("should respond to ping method", async () => {
      const response = await handler.handleRequest({
        jsonrpc: "2.0",
        id: 9,
        method: "ping",
      });

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(9);
      expect(response.result).toEqual({});
    });
  });
});
