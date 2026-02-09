/**
 * MCP Browser Server Tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createBrowserMcpServer,
  type BrowserBackend,
  type BrowserMcpServer,
} from "./browser-server.js";

describe("BrowserMcpServer", () => {
  let mockBackend: BrowserBackend;
  let server: BrowserMcpServer;

  beforeEach(() => {
    mockBackend = {
      invoke: vi.fn(),
    };
    server = createBrowserMcpServer({ backend: mockBackend });
  });

  describe("listTools", () => {
    it("returns mcp__browser__invoke tool", () => {
      const tools = server.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("mcp__browser__invoke");
    });

    it("includes action enum in schema", () => {
      const tools = server.listTools();
      const schema = tools[0].inputSchema as Record<string, unknown>;
      const properties = schema.properties as Record<string, unknown>;
      const actionProp = properties.action as Record<string, unknown>;
      expect(actionProp.enum).toContain("status");
      expect(actionProp.enum).toContain("snapshot");
      expect(actionProp.enum).toContain("act");
    });
  });

  describe("callTool", () => {
    it("calls backend invoke with action and params", async () => {
      (mockBackend.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        result: { running: true },
      });

      const result = await server.callTool("mcp__browser__invoke", {
        action: "status",
      });

      expect(mockBackend.invoke).toHaveBeenCalledWith("status", { action: "status" });
      expect(result).toEqual({ ok: true, result: { running: true } });
    });

    it("passes through all params to backend", async () => {
      (mockBackend.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

      await server.callTool("mcp__browser__invoke", {
        action: "open",
        targetUrl: "https://example.com",
        profile: "chrome",
      });

      expect(mockBackend.invoke).toHaveBeenCalledWith("open", {
        action: "open",
        targetUrl: "https://example.com",
        profile: "chrome",
      });
    });

    it("returns error when action is missing", async () => {
      const result = await server.callTool("mcp__browser__invoke", {});
      expect(result).toEqual({ ok: false, error: "action parameter is required" });
      expect(mockBackend.invoke).not.toHaveBeenCalled();
    });

    it("returns error when action is empty string", async () => {
      const result = await server.callTool("mcp__browser__invoke", { action: "  " });
      expect(result).toEqual({ ok: false, error: "action parameter is required" });
    });

    it("throws for unknown tool", async () => {
      await expect(server.callTool("unknown_tool", {})).rejects.toThrow("Unknown tool: unknown_tool");
    });

    it("returns backend error on failure", async () => {
      (mockBackend.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: "Browser not running",
      });

      const result = await server.callTool("mcp__browser__invoke", {
        action: "snapshot",
      });

      expect(result).toEqual({ ok: false, error: "Browser not running" });
    });
  });
});
