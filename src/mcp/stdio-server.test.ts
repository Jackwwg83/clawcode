/**
 * MCP Stdio Server Tests
 *
 * Tests for the MCP stdio server that exposes tools to Claude Agent SDK.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the real backends
vi.mock("./backends/real-services.js", () => ({
  createRealMemoryBackend: vi.fn(),
  createRealSessionsBackend: vi.fn(),
  createRealMessageBackend: vi.fn(),
}));

vi.mock("../config/config.js", () => ({
  loadConfig: vi.fn(() => ({})),
}));

import { createRealMemoryBackend, createRealSessionsBackend, createRealMessageBackend } from "./backends/real-services.js";
import { createStdioMcpServer, type StdioMcpServerOptions } from "./stdio-server.js";

describe("MCP Stdio Server", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createStdioMcpServer", () => {
    it("should create memory server with real backend", () => {
      const mockBackend = { search: vi.fn(), writeEntry: vi.fn(), deleteEntry: vi.fn() };
      vi.mocked(createRealMemoryBackend).mockReturnValue(mockBackend);

      const options: StdioMcpServerOptions = {
        serverType: "memory",
        agentId: "test-agent",
      };

      const server = createStdioMcpServer(options);

      expect(createRealMemoryBackend).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: "test-agent" })
      );
      expect(server).toBeDefined();
      expect(server.listTools).toBeDefined();
      expect(server.callTool).toBeDefined();
    });

    it("should create sessions server with real backend", () => {
      const mockBackend = { list: vi.fn(), history: vi.fn(), send: vi.fn() };
      vi.mocked(createRealSessionsBackend).mockReturnValue(mockBackend);

      const options: StdioMcpServerOptions = {
        serverType: "sessions",
      };

      const server = createStdioMcpServer(options);

      expect(createRealSessionsBackend).toHaveBeenCalled();
      expect(server).toBeDefined();
    });

    it("should create message server with real backend", () => {
      const mockBackend = { send: vi.fn() };
      vi.mocked(createRealMessageBackend).mockReturnValue(mockBackend);

      const options: StdioMcpServerOptions = {
        serverType: "message",
      };

      const server = createStdioMcpServer(options);

      expect(createRealMessageBackend).toHaveBeenCalled();
      expect(server).toBeDefined();
    });

    it("should throw error for unknown server type", () => {
      expect(() => {
        createStdioMcpServer({ serverType: "unknown" as any });
      }).toThrow("Unknown server type");
    });

    it("should require agentId for memory server", () => {
      expect(() => {
        createStdioMcpServer({ serverType: "memory" });
      }).toThrow("agentId is required");
    });
  });

  describe("memory server tools", () => {
    it("should expose memory tools via listTools", () => {
      const mockBackend = { search: vi.fn(), writeEntry: vi.fn(), deleteEntry: vi.fn() };
      vi.mocked(createRealMemoryBackend).mockReturnValue(mockBackend);

      const server = createStdioMcpServer({ serverType: "memory", agentId: "test" });
      const tools = server.listTools();

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("mcp__memory__recall");
      expect(toolNames).toContain("mcp__memory__remember");
      expect(toolNames).toContain("mcp__memory__forget");
    });

    it("should call backend search for recall tool", async () => {
      const mockBackend = {
        search: vi.fn().mockResolvedValue([{ path: "/test", snippet: "test" }]),
        writeEntry: vi.fn(),
        deleteEntry: vi.fn(),
      };
      vi.mocked(createRealMemoryBackend).mockReturnValue(mockBackend);

      const server = createStdioMcpServer({ serverType: "memory", agentId: "test" });
      const result = await server.callTool("mcp__memory__recall", { query: "test query", limit: 5 });

      expect(mockBackend.search).toHaveBeenCalledWith("test query", { maxResults: 5 });
      expect(result).toHaveProperty("results");
    });
  });

  describe("sessions server tools", () => {
    it("should expose sessions tools via listTools", () => {
      const mockBackend = { list: vi.fn(), history: vi.fn(), send: vi.fn() };
      vi.mocked(createRealSessionsBackend).mockReturnValue(mockBackend);

      const server = createStdioMcpServer({ serverType: "sessions" });
      const tools = server.listTools();

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("mcp__sessions__list");
      expect(toolNames).toContain("mcp__sessions__history");
      expect(toolNames).toContain("mcp__sessions__send");
    });
  });

  describe("message server tools", () => {
    it("should expose message tools via listTools", () => {
      const mockBackend = { send: vi.fn() };
      vi.mocked(createRealMessageBackend).mockReturnValue(mockBackend);

      const server = createStdioMcpServer({ serverType: "message" });
      const tools = server.listTools();

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("mcp__message__send");
    });
  });
});
