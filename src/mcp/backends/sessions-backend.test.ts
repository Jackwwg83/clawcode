/**
 * Sessions Backend Adapter Tests (TDD)
 *
 * Tests verify the sessions backend correctly adapts gateway APIs to SessionsBackend interface.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createSessionsBackend, type SessionsBackendDeps } from "./sessions-backend.js";

// Mock dependencies
function createMockDeps(): SessionsBackendDeps {
  return {
    listSessions: vi.fn(),
    getSessionHistory: vi.fn(),
    sendToSession: vi.fn(),
  };
}

describe("Sessions Backend Adapter", () => {
  let deps: SessionsBackendDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
  });

  describe("list", () => {
    it("calls listSessions and returns mapped results", async () => {
      const mockSessions = [
        { key: "agent:main:main", label: "Main", updatedAt: 1234567890, channel: "telegram" },
        { key: "agent:main:user1", label: "User1", updatedAt: 1234567800 },
      ];
      (deps.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue(mockSessions);

      const backend = createSessionsBackend(deps);
      const result = await backend.list();

      expect(deps.listSessions).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe("agent:main:main");
      expect(result[0].label).toBe("Main");
      expect(result[0].channel).toBe("telegram");
    });

    it("returns empty array when no sessions exist", async () => {
      (deps.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const backend = createSessionsBackend(deps);
      const result = await backend.list();

      expect(result).toEqual([]);
    });
  });

  describe("history", () => {
    it("calls getSessionHistory with sessionKey and limit", async () => {
      const mockMessages = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];
      (deps.getSessionHistory as ReturnType<typeof vi.fn>).mockResolvedValue(mockMessages);

      const backend = createSessionsBackend(deps);
      const result = await backend.history("agent:main:main", { limit: 10 });

      expect(deps.getSessionHistory).toHaveBeenCalledWith("agent:main:main", { limit: 10 });
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("user");
      expect(result[1].content).toBe("Hi there!");
    });

    it("throws error for invalid session key", async () => {
      (deps.getSessionHistory as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Session not found")
      );

      const backend = createSessionsBackend(deps);
      await expect(backend.history("invalid-key", { limit: 10 })).rejects.toThrow("Session not found");
    });
  });

  describe("send", () => {
    it("calls sendToSession with sessionKey and message", async () => {
      (deps.sendToSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        runId: "run-123",
        status: "accepted",
      });

      const backend = createSessionsBackend(deps);
      const result = await backend.send("agent:main:main", "Hello from MCP");

      expect(deps.sendToSession).toHaveBeenCalledWith("agent:main:main", "Hello from MCP");
      expect(result.ok).toBe(true);
      expect(result.runId).toBe("run-123");
    });

    it("returns error when send fails", async () => {
      (deps.sendToSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: "Session not found",
      });

      const backend = createSessionsBackend(deps);
      const result = await backend.send("invalid-key", "test");

      expect(result.ok).toBe(false);
      expect(result.error).toBe("Session not found");
    });
  });
});
