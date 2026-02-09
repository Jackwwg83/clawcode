/**
 * Message Backend Adapter Tests (TDD)
 *
 * Tests verify the message backend correctly adapts gateway message delivery to MessageBackend interface.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMessageBackend, type MessageBackendDeps } from "./message-backend.js";

// Mock dependencies
function createMockDeps(): MessageBackendDeps {
  return {
    sendToChannel: vi.fn(),
  };
}

describe("Message Backend Adapter", () => {
  let deps: MessageBackendDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
  });

  describe("send", () => {
    it("calls sendToChannel with channelId, target, and message", async () => {
      (deps.sendToChannel as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: "delivered",
      });

      const backend = createMessageBackend(deps);
      const result = await backend.send("telegram", "+1234567890", "Hello from MCP");

      expect(deps.sendToChannel).toHaveBeenCalledWith("telegram", "+1234567890", "Hello from MCP");
      expect(result.ok).toBe(true);
      expect(result.status).toBe("delivered");
    });

    it("returns error when channel is not supported", async () => {
      (deps.sendToChannel as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: "Unsupported channel: unknown",
      });

      const backend = createMessageBackend(deps);
      const result = await backend.send("unknown", "target", "test");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Unsupported channel");
    });

    it("returns error when delivery fails", async () => {
      (deps.sendToChannel as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: "Delivery failed: target not found",
      });

      const backend = createMessageBackend(deps);
      const result = await backend.send("telegram", "invalid-target", "test");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Delivery failed");
    });

    it("handles delivery with runId", async () => {
      (deps.sendToChannel as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: "queued",
        runId: "msg-456",
      });

      const backend = createMessageBackend(deps);
      const result = await backend.send("discord", "user#1234", "Hello");

      expect(result.ok).toBe(true);
      expect(result.runId).toBe("msg-456");
    });
  });
});
