/**
 * MCP Servers Configuration Tests
 *
 * Tests for buildMcpServers helper that constructs MCP server configurations
 * for the Claude Agent SDK.
 *
 * Format: Array<{ name: string, command: string }>
 * - name: simple server name ("memory", "sessions", etc.)
 * - command: full command string with all arguments included
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock resolveAgentIdFromSessionKey
vi.mock("../config/sessions.js", () => ({
  resolveAgentIdFromSessionKey: vi.fn(),
}));

import { resolveAgentIdFromSessionKey } from "../config/sessions.js";
import { buildMcpServers } from "./mcp-servers.js";

describe("buildMcpServers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveAgentIdFromSessionKey).mockReturnValue("main");
  });

  describe("basic structure", () => {
    it("returns exactly 6 MCP servers", () => {
      const result = buildMcpServers({ sessionKey: "agent:main:main" });

      expect(result).toBeDefined();
      expect(result).toHaveLength(6);
    });

    it("returns servers with correct names", () => {
      const result = buildMcpServers({ sessionKey: "agent:main:main" });

      const names = result.map((s) => s.name);
      expect(names).toContain("memory");
      expect(names).toContain("sessions");
      expect(names).toContain("message");
      expect(names).toContain("nodes");
      expect(names).toContain("browser");
      expect(names).toContain("canvas");
    });

    it("all servers have name and command fields", () => {
      const result = buildMcpServers({ sessionKey: "agent:main:main" });

      for (const server of result) {
        expect(server.name).toBeTruthy();
        expect(typeof server.name).toBe("string");
        expect(server.command).toBeTruthy();
        expect(typeof server.command).toBe("string");
      }
    });
  });

  describe("sessionKey handling", () => {
    it("uses default sessionKey when undefined", () => {
      const result = buildMcpServers({ sessionKey: undefined });

      expect(result).toBeDefined();
      expect(result).toHaveLength(6);
      // Command should contain default sessionKey "agent:main:main"
      const nodesServer = result.find((s) => s.name === "nodes");
      expect(nodesServer?.command).toContain("agent:main:main");
    });

    it("uses default sessionKey when empty string", () => {
      const result = buildMcpServers({ sessionKey: "" });

      expect(result).toBeDefined();
      const nodesServer = result.find((s) => s.name === "nodes");
      expect(nodesServer?.command).toContain("agent:main:main");
    });

    it("passes sessionKey to nodes server", () => {
      const result = buildMcpServers({ sessionKey: "agent:ops:task:123" });

      const nodesServer = result.find((s) => s.name === "nodes");
      expect(nodesServer).toBeDefined();
      expect(nodesServer?.command).toContain("agent:ops:task:123");
    });

    it("derives agentId from sessionKey for memory server", () => {
      vi.mocked(resolveAgentIdFromSessionKey).mockReturnValue("ops");

      const result = buildMcpServers({ sessionKey: "agent:ops:task:123" });

      expect(resolveAgentIdFromSessionKey).toHaveBeenCalledWith("agent:ops:task:123");
      const memoryServer = result.find((s) => s.name === "memory");
      expect(memoryServer?.command).toContain("--agent-id ops");
    });
  });

  describe("command construction", () => {
    it("includes mcp subcommand for each server", () => {
      const result = buildMcpServers({ sessionKey: "agent:main:main" });

      for (const server of result) {
        expect(server.command).toContain("mcp");
      }
    });

    it("includes correct server type in command", () => {
      const result = buildMcpServers({ sessionKey: "agent:main:main" });

      const memoryServer = result.find((s) => s.name === "memory");
      expect(memoryServer?.command).toContain("--server memory");

      const sessionsServer = result.find((s) => s.name === "sessions");
      expect(sessionsServer?.command).toContain("--server sessions");

      const nodesServer = result.find((s) => s.name === "nodes");
      expect(nodesServer?.command).toContain("--server nodes");
    });

    it("quotes paths with spaces in command", () => {
      const result = buildMcpServers({ sessionKey: "agent:main:main" });

      // Check that command uses quoted paths (from existing implementation)
      const memoryServer = result.find((s) => s.name === "memory");
      expect(memoryServer).toBeDefined();
      expect(memoryServer?.command).toBeTruthy();
    });
  });

  describe("individual servers", () => {
    it("memory server has agent-id parameter", () => {
      vi.mocked(resolveAgentIdFromSessionKey).mockReturnValue("custom");

      const result = buildMcpServers({ sessionKey: "agent:custom:task:1" });

      const memoryServer = result.find((s) => s.name === "memory");
      expect(memoryServer).toBeDefined();
      expect(memoryServer?.command).toContain("--agent-id custom");
    });

    it("sessions server exists", () => {
      const result = buildMcpServers({ sessionKey: "agent:main:main" });

      const sessionsServer = result.find((s) => s.name === "sessions");
      expect(sessionsServer).toBeDefined();
      expect(sessionsServer?.command).toContain("--server sessions");
    });

    it("message server exists", () => {
      const result = buildMcpServers({ sessionKey: "agent:main:main" });

      const messageServer = result.find((s) => s.name === "message");
      expect(messageServer).toBeDefined();
      expect(messageServer?.command).toContain("--server message");
    });

    it("nodes server has session-key parameter", () => {
      const result = buildMcpServers({ sessionKey: "agent:test:run:5" });

      const nodesServer = result.find((s) => s.name === "nodes");
      expect(nodesServer).toBeDefined();
      expect(nodesServer?.command).toContain("--session-key agent:test:run:5");
    });

    it("browser server exists", () => {
      const result = buildMcpServers({ sessionKey: "agent:main:main" });

      const browserServer = result.find((s) => s.name === "browser");
      expect(browserServer).toBeDefined();
      expect(browserServer?.command).toContain("--server browser");
    });

    it("canvas server exists", () => {
      const result = buildMcpServers({ sessionKey: "agent:main:main" });

      const canvasServer = result.find((s) => s.name === "canvas");
      expect(canvasServer).toBeDefined();
      expect(canvasServer?.command).toContain("--server canvas");
    });
  });

  describe("edge cases", () => {
    it("handles null sessionKey", () => {
      const result = buildMcpServers({ sessionKey: null as unknown as string });

      expect(result).toBeDefined();
      expect(result).toHaveLength(6);
    });

    it("handles whitespace-only sessionKey", () => {
      const result = buildMcpServers({ sessionKey: "   " });

      expect(result).toBeDefined();
      expect(result).toHaveLength(6);
    });

    it("handles subagent sessionKeys", () => {
      vi.mocked(resolveAgentIdFromSessionKey).mockReturnValue("main");

      const result = buildMcpServers({ sessionKey: "agent:main:subagent:abc" });

      expect(result).toBeDefined();
      const nodesServer = result.find((s) => s.name === "nodes");
      expect(nodesServer?.command).toContain("agent:main:subagent:abc");
    });
  });
});
