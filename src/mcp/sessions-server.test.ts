/**
 * MCP Sessions Server Contract Tests (TDD Red Phase)
 *
 * Tests define the expected behavior of the MCP sessions server before implementation.
 * Tool names follow the pattern: mcp__sessions__<tool>
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSessionsMcpServer,
  type SessionsMcpServer,
  type SessionsBackend,
} from "./sessions-server.js";

// Create mock sessions backend
function createMockBackend(): SessionsBackend {
  return {
    list: vi.fn(),
    history: vi.fn(),
    send: vi.fn(),
  };
}

describe("MCP Sessions Server", () => {
  let server: SessionsMcpServer;
  let backend: SessionsBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = createMockBackend();
    server = createSessionsMcpServer({ backend });
  });

  describe("tool registration", () => {
    it("exposes list, history, and send tools", () => {
      const tools = server.listTools();
      expect(tools.map((t) => t.name)).toContain("mcp__sessions__list");
      expect(tools.map((t) => t.name)).toContain("mcp__sessions__history");
      expect(tools.map((t) => t.name)).toContain("mcp__sessions__send");
    });
  });

  describe("mcp__sessions__list", () => {
    it("returns session index from backend", async () => {
      // Given: backend returns session list
      const mockSessions = [
        { key: "main", kind: "main", channel: "telegram", updatedAt: 1706800000000 },
        { key: "cron:daily", kind: "cron", channel: "internal", updatedAt: 1706790000000 },
      ];
      (backend.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockSessions);

      // When: list tool is called
      const result = await server.callTool("mcp__sessions__list", {});

      // Then: backend list is called
      expect(backend.list).toHaveBeenCalled();

      // And: sessions are returned
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].key).toBe("main");
      expect(result.sessions[0].kind).toBe("main");
    });

    it("returns empty array when no sessions", async () => {
      // Given: backend returns empty
      (backend.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // When: list is called
      const result = await server.callTool("mcp__sessions__list", {});

      // Then: empty sessions array
      expect(result.sessions).toEqual([]);
    });
  });

  describe("mcp__sessions__history", () => {
    it("returns recent messages from backend", async () => {
      // Given: backend returns message history
      const mockMessages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];
      (backend.history as ReturnType<typeof vi.fn>).mockResolvedValue(mockMessages);

      // When: history tool is called
      const result = await server.callTool("mcp__sessions__history", {
        sessionKey: "main",
        limit: 10,
      });

      // Then: backend history is called with correct params
      expect(backend.history).toHaveBeenCalledWith("main", { limit: 10 });

      // And: messages are returned
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe("user");
    });

    it("uses default limit when not specified", async () => {
      // Given: backend returns messages
      (backend.history as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // When: history is called without limit
      await server.callTool("mcp__sessions__history", { sessionKey: "main" });

      // Then: default limit is used
      expect(backend.history).toHaveBeenCalledWith("main", { limit: 20 });
    });

    it("returns error for invalid session key", async () => {
      // Given: backend throws not found
      (backend.history as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Session not found")
      );

      // When: history is called
      const result = await server.callTool("mcp__sessions__history", {
        sessionKey: "nonexistent",
      });

      // Then: error is returned
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Session not found");
    });
  });

  describe("mcp__sessions__send", () => {
    it("delivers message through gateway", async () => {
      // Given: backend send succeeds
      (backend.send as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        runId: "run-123",
        status: "accepted",
      });

      // When: send tool is called
      const result = await server.callTool("mcp__sessions__send", {
        sessionKey: "main",
        message: "Hello from agent",
      });

      // Then: backend send is called
      expect(backend.send).toHaveBeenCalledWith("main", "Hello from agent");

      // And: success result is returned
      expect(result.ok).toBe(true);
      expect(result.runId).toBe("run-123");
      expect(result.status).toBe("accepted");
    });

    it("returns error on send failure", async () => {
      // Given: backend send fails
      (backend.send as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: "Session busy",
      });

      // When: send is called
      const result = await server.callTool("mcp__sessions__send", {
        sessionKey: "main",
        message: "test",
      });

      // Then: error is returned
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Session busy");
    });

    it("requires message parameter", async () => {
      // When: send is called without message
      const result = await server.callTool("mcp__sessions__send", {
        sessionKey: "main",
      });

      // Then: error is returned
      expect(result.ok).toBe(false);
      expect(result.error).toContain("message");
    });
  });
});
