/**
 * MCP Nodes Server Tests
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createNodesMcpServer,
  type NodesBackend,
  type NodesMcpServer,
} from "./nodes-server.js";

describe("NodesMcpServer", () => {
  let mockBackend: NodesBackend;
  let server: NodesMcpServer;

  beforeEach(() => {
    mockBackend = {
      invoke: vi.fn(),
    };
    server = createNodesMcpServer({ backend: mockBackend });
  });

  describe("listTools", () => {
    it("returns mcp__nodes__invoke tool", () => {
      const tools = server.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("mcp__nodes__invoke");
    });

    it("includes action enum in schema", () => {
      const tools = server.listTools();
      const schema = tools[0].inputSchema as Record<string, unknown>;
      const properties = schema.properties as Record<string, unknown>;
      const actionProp = properties.action as Record<string, unknown>;
      expect(actionProp.enum).toContain("status");
      expect(actionProp.enum).toContain("notify");
      expect(actionProp.enum).toContain("camera_snap");
    });
  });

  describe("callTool", () => {
    it("calls backend invoke with action and params", async () => {
      (mockBackend.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        result: { nodes: [] },
      });

      const result = await server.callTool("mcp__nodes__invoke", {
        action: "status",
      });

      expect(mockBackend.invoke).toHaveBeenCalledWith("status", { action: "status" });
      expect(result).toEqual({ ok: true, result: { nodes: [] } });
    });

    it("passes through all params to backend", async () => {
      (mockBackend.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

      await server.callTool("mcp__nodes__invoke", {
        action: "notify",
        node: "my-node",
        title: "Hello",
        body: "World",
      });

      expect(mockBackend.invoke).toHaveBeenCalledWith("notify", {
        action: "notify",
        node: "my-node",
        title: "Hello",
        body: "World",
      });
    });

    it("returns error when action is missing", async () => {
      const result = await server.callTool("mcp__nodes__invoke", {});
      expect(result).toEqual({ ok: false, error: "action parameter is required" });
      expect(mockBackend.invoke).not.toHaveBeenCalled();
    });

    it("returns error when action is empty string", async () => {
      const result = await server.callTool("mcp__nodes__invoke", { action: "  " });
      expect(result).toEqual({ ok: false, error: "action parameter is required" });
    });

    it("throws for unknown tool", async () => {
      await expect(server.callTool("unknown_tool", {})).rejects.toThrow("Unknown tool: unknown_tool");
    });

    it("returns backend error on failure", async () => {
      (mockBackend.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: "Node not found",
      });

      const result = await server.callTool("mcp__nodes__invoke", {
        action: "describe",
        node: "invalid",
      });

      expect(result).toEqual({ ok: false, error: "Node not found" });
    });
  });
});
