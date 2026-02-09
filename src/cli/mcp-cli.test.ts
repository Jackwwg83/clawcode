/**
 * MCP CLI Tests
 *
 * Tests for the `openclaw mcp` subcommand that starts stdio MCP servers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

// Mock createStdioMcpServer
vi.mock("../mcp/stdio-server.js", () => ({
  createStdioMcpServer: vi.fn(),
}));

import { createStdioMcpServer } from "../mcp/stdio-server.js";
import { registerMcpCli, type McpCliOptions, parseMcpCliOptions } from "./mcp-cli.js";

describe("MCP CLI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("registerMcpCli", () => {
    it("should register mcp command with required options", () => {
      const program = new Command();
      registerMcpCli(program);

      const mcpCommand = program.commands.find((cmd) => cmd.name() === "mcp");
      expect(mcpCommand).toBeDefined();
      expect(mcpCommand?.description()).toContain("MCP");
    });

    it("should have --server option", () => {
      const program = new Command();
      registerMcpCli(program);

      const mcpCommand = program.commands.find((cmd) => cmd.name() === "mcp");
      const options = mcpCommand?.options ?? [];
      const serverOption = options.find((opt) => opt.long === "--server");
      expect(serverOption).toBeDefined();
    });

    it("should have --agent-id option", () => {
      const program = new Command();
      registerMcpCli(program);

      const mcpCommand = program.commands.find((cmd) => cmd.name() === "mcp");
      const options = mcpCommand?.options ?? [];
      const agentIdOption = options.find((opt) => opt.long === "--agent-id");
      expect(agentIdOption).toBeDefined();
    });
  });

  describe("parseMcpCliOptions", () => {
    it("should parse memory server options with agentId", () => {
      const opts: McpCliOptions = {
        server: "memory",
        agentId: "my-agent",
      };

      const result = parseMcpCliOptions(opts);

      expect(result.serverType).toBe("memory");
      expect(result.agentId).toBe("my-agent");
    });

    it("should parse sessions server options", () => {
      const opts: McpCliOptions = {
        server: "sessions",
      };

      const result = parseMcpCliOptions(opts);

      expect(result.serverType).toBe("sessions");
      expect(result.agentId).toBeUndefined();
    });

    it("should parse message server options", () => {
      const opts: McpCliOptions = {
        server: "message",
      };

      const result = parseMcpCliOptions(opts);

      expect(result.serverType).toBe("message");
    });

    it("should throw error for missing server option", () => {
      const opts: McpCliOptions = {};

      expect(() => parseMcpCliOptions(opts)).toThrow("--server is required");
    });

    it("should throw error for invalid server type", () => {
      const opts: McpCliOptions = {
        server: "invalid",
      };

      expect(() => parseMcpCliOptions(opts)).toThrow("Invalid server type");
    });

    it("should throw error when memory server missing agentId", () => {
      const opts: McpCliOptions = {
        server: "memory",
      };

      expect(() => parseMcpCliOptions(opts)).toThrow("--agent-id is required");
    });
  });
});
