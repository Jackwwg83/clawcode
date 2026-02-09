/**
 * MCP Message Server Contract Tests (TDD Red Phase)
 *
 * Tests define the expected behavior of the MCP message server before implementation.
 * Tool names follow the pattern: mcp__message__<tool>
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMessageMcpServer,
  type MessageMcpServer,
  type MessageBackend,
} from "./message-server.js";

// Create mock message backend
function createMockBackend(): MessageBackend {
  return {
    send: vi.fn(),
  };
}

describe("MCP Message Server", () => {
  let server: MessageMcpServer;
  let backend: MessageBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = createMockBackend();
    server = createMessageMcpServer({ backend });
  });

  describe("tool registration", () => {
    it("exposes send tool", () => {
      const tools = server.listTools();
      expect(tools.map((t) => t.name)).toContain("mcp__message__send");
    });
  });

  describe("mcp__message__send", () => {
    it("delivers message through backend", async () => {
      // Given: backend send succeeds
      (backend.send as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: "delivered",
        runId: "msg-123",
      });

      // When: send tool is called
      const result = await server.callTool("mcp__message__send", {
        channelId: "telegram",
        target: "user123",
        message: "Hello from agent",
      });

      // Then: backend send is called with correct params
      expect(backend.send).toHaveBeenCalledWith("telegram", "user123", "Hello from agent");

      // And: success result is returned
      expect(result.ok).toBe(true);
      expect(result.status).toBe("delivered");
      expect(result.runId).toBe("msg-123");
    });

    it("returns error on send failure", async () => {
      // Given: backend send fails
      (backend.send as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: "Channel not available",
      });

      // When: send is called
      const result = await server.callTool("mcp__message__send", {
        channelId: "telegram",
        target: "user123",
        message: "test",
      });

      // Then: error is returned
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Channel not available");
    });

    it("requires channelId parameter", async () => {
      // When: send is called without channelId
      const result = await server.callTool("mcp__message__send", {
        target: "user123",
        message: "test",
      });

      // Then: error is returned
      expect(result.ok).toBe(false);
      expect(result.error).toContain("channelId");
    });

    it("requires target parameter", async () => {
      // When: send is called without target
      const result = await server.callTool("mcp__message__send", {
        channelId: "telegram",
        message: "test",
      });

      // Then: error is returned
      expect(result.ok).toBe(false);
      expect(result.error).toContain("target");
    });

    it("requires message parameter", async () => {
      // When: send is called without message
      const result = await server.callTool("mcp__message__send", {
        channelId: "telegram",
        target: "user123",
      });

      // Then: error is returned
      expect(result.ok).toBe(false);
      expect(result.error).toContain("message");
    });
  });
});
