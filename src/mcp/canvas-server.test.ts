/**
 * MCP Canvas Server Tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCanvasMcpServer,
  type CanvasBackend,
  type CanvasMcpServer,
} from "./canvas-server.js";

describe("CanvasMcpServer", () => {
  let mockBackend: CanvasBackend;
  let server: CanvasMcpServer;

  beforeEach(() => {
    mockBackend = {
      invoke: vi.fn(),
    };
    server = createCanvasMcpServer({ backend: mockBackend });
  });

  describe("listTools", () => {
    it("returns mcp__canvas__invoke tool", () => {
      const tools = server.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("mcp__canvas__invoke");
    });

    it("includes action enum in schema", () => {
      const tools = server.listTools();
      const schema = tools[0].inputSchema as Record<string, unknown>;
      const properties = schema.properties as Record<string, unknown>;
      const actionProp = properties.action as Record<string, unknown>;
      expect(actionProp.enum).toContain("present");
      expect(actionProp.enum).toContain("snapshot");
      expect(actionProp.enum).toContain("a2ui_push");
    });
  });

  describe("callTool", () => {
    it("calls backend invoke with action and params", async () => {
      (mockBackend.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        result: { ok: true },
      });

      const result = await server.callTool("mcp__canvas__invoke", {
        action: "present",
        node: "my-node",
      });

      expect(mockBackend.invoke).toHaveBeenCalledWith("present", {
        action: "present",
        node: "my-node",
      });
      expect(result).toEqual({ ok: true, result: { ok: true } });
    });

    it("passes through all params to backend", async () => {
      (mockBackend.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

      await server.callTool("mcp__canvas__invoke", {
        action: "navigate",
        node: "my-node",
        url: "https://example.com",
      });

      expect(mockBackend.invoke).toHaveBeenCalledWith("navigate", {
        action: "navigate",
        node: "my-node",
        url: "https://example.com",
      });
    });

    it("returns error when action is missing", async () => {
      const result = await server.callTool("mcp__canvas__invoke", {});
      expect(result).toEqual({ ok: false, error: "action parameter is required" });
      expect(mockBackend.invoke).not.toHaveBeenCalled();
    });

    it("returns error when action is empty string", async () => {
      const result = await server.callTool("mcp__canvas__invoke", { action: "  " });
      expect(result).toEqual({ ok: false, error: "action parameter is required" });
    });

    it("throws for unknown tool", async () => {
      await expect(server.callTool("unknown_tool", {})).rejects.toThrow("Unknown tool: unknown_tool");
    });

    it("returns backend error on failure", async () => {
      (mockBackend.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: "Node not connected",
      });

      const result = await server.callTool("mcp__canvas__invoke", {
        action: "snapshot",
        node: "invalid",
      });

      expect(result).toEqual({ ok: false, error: "Node not connected" });
    });
  });
});
