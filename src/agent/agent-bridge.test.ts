/**
 * AgentBridge Contract Tests (TDD Red Phase)
 *
 * These tests define the expected behavior of AgentBridge before implementation.
 * AgentBridge bridges OpenClaw's agent run params to Claude Agent SDK.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentBridge,
  BUILTIN_TOOLS,
  type AgentBridgeParams,
  type OpenClawPayload,
} from "./agent-bridge.js";
import type { ClaudeSdkRunner, SdkStreamEvent } from "./claude-sdk-runner.js";

// Create mock SDK runner
function createMockRunner(
  events: SdkStreamEvent[] = []
): ClaudeSdkRunner & { events: SdkStreamEvent[] } {
  const runner = {
    events,
    async *query() {
      for (const event of runner.events) {
        yield event;
      }
    },
  };
  return runner;
}

describe("AgentBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildOptions", () => {
    it("builds systemPrompt with memory recall", async () => {
      // Given: AgentBridge params with memory files
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "Hello",
        memoryFiles: ["MEMORY.md", "USER.md"],
        extraSystemPrompt: "You are a helpful assistant.",
      };
      const mockRunner = createMockRunner();
      const bridge = new AgentBridge(params, mockRunner);

      // When: buildOptions is called
      const options = await bridge.buildOptions();

      // Then: systemPrompt should include memory file references and extra prompt
      expect(options.systemPrompt).toContain("MEMORY.md");
      expect(options.systemPrompt).toContain("USER.md");
      expect(options.systemPrompt).toContain("You are a helpful assistant.");
    });

    it("settingSources includes 'project'", async () => {
      // Given: AgentBridge params
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "Hello",
      };
      const mockRunner = createMockRunner();
      const bridge = new AgentBridge(params, mockRunner);

      // When: buildOptions is called
      const options = await bridge.buildOptions();

      // Then: settingSources should include "project" for CLAUDE.md loading
      expect(options.settingSources).toContain("project");
    });

    it("allowedTools includes builtins + mcp tools", async () => {
      // Given: AgentBridge params with MCP servers
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "Hello",
        mcpServers: [{ name: "memory", command: "mcp-memory" }],
      };
      const mockRunner = createMockRunner();
      const bridge = new AgentBridge(params, mockRunner);

      // When: buildOptions is called
      const options = await bridge.buildOptions();

      // Then: allowedTools should include all builtins
      for (const tool of BUILTIN_TOOLS) {
        expect(options.allowedTools).toContain(tool);
      }

      // And: allowedTools should include MCP memory tools
      expect(options.allowedTools).toContain("mcp__memory__recall");
      expect(options.allowedTools).toContain("mcp__memory__remember");
      expect(options.allowedTools).toContain("mcp__memory__forget");
    });

    it("allowedTools includes message server tools", async () => {
      // Given: AgentBridge params with message MCP server
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "Hello",
        mcpServers: [{ name: "message", command: "mcp-message" }],
      };
      const mockRunner = createMockRunner();
      const bridge = new AgentBridge(params, mockRunner);

      // When: buildOptions is called
      const options = await bridge.buildOptions();

      // Then: allowedTools should include MCP message tools
      expect(options.allowedTools).toContain("mcp__message__send");
    });

    it("allowedTools includes nodes/browser/canvas invoke tools", async () => {
      // Given: AgentBridge params with nodes, browser, canvas MCP servers
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "Hello",
        mcpServers: [
          { name: "nodes", command: "mcp-nodes" },
          { name: "browser", command: "mcp-browser" },
          { name: "canvas", command: "mcp-canvas" },
        ],
      };
      const mockRunner = createMockRunner();
      const bridge = new AgentBridge(params, mockRunner);

      // When: buildOptions is called
      const options = await bridge.buildOptions();

      // Then: allowedTools should include nodes/browser/canvas invoke tools
      expect(options.allowedTools).toContain("mcp__nodes__invoke");
      expect(options.allowedTools).toContain("mcp__browser__invoke");
      expect(options.allowedTools).toContain("mcp__canvas__invoke");
    });

    it("allowedTools includes all 6 MCP server tools", async () => {
      // Given: AgentBridge params with all 6 MCP servers
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "Hello",
        mcpServers: [
          { name: "memory", command: "mcp-memory" },
          { name: "sessions", command: "mcp-sessions" },
          { name: "message", command: "mcp-message" },
          { name: "nodes", command: "mcp-nodes" },
          { name: "browser", command: "mcp-browser" },
          { name: "canvas", command: "mcp-canvas" },
        ],
      };
      const mockRunner = createMockRunner();
      const bridge = new AgentBridge(params, mockRunner);

      // When: buildOptions is called
      const options = await bridge.buildOptions();

      // Then: allowedTools should include all MCP tools
      // memory (3)
      expect(options.allowedTools).toContain("mcp__memory__recall");
      expect(options.allowedTools).toContain("mcp__memory__remember");
      expect(options.allowedTools).toContain("mcp__memory__forget");
      // sessions (3)
      expect(options.allowedTools).toContain("mcp__sessions__list");
      expect(options.allowedTools).toContain("mcp__sessions__history");
      expect(options.allowedTools).toContain("mcp__sessions__send");
      // message (1)
      expect(options.allowedTools).toContain("mcp__message__send");
      // nodes (1)
      expect(options.allowedTools).toContain("mcp__nodes__invoke");
      // browser (1)
      expect(options.allowedTools).toContain("mcp__browser__invoke");
      // canvas (1)
      expect(options.allowedTools).toContain("mcp__canvas__invoke");
    });
  });

  describe("session management", () => {
    it("uses sdkSessionId when present (resume)", async () => {
      // Given: AgentBridge params with existing sdkSessionId
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "Continue our conversation",
        sdkSessionId: "sdk-session-abc",
      };
      const mockRunner = createMockRunner();
      const bridge = new AgentBridge(params, mockRunner);

      // When: buildOptions is called
      const options = await bridge.buildOptions();

      // Then: sdkSessionId should be passed for resume
      expect(options.sdkSessionId).toBe("sdk-session-abc");
    });

    it("stores sdkSessionId on first run", async () => {
      // Given: AgentBridge params without sdkSessionId (first run)
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "Hello",
      };

      // Mock SDK runner to return a session ID in complete event
      const mockNewSessionId = "sdk-session-new-xyz";
      const mockRunner = createMockRunner([
        { type: "text", content: "Hello!" },
        { type: "complete", stopReason: "end_turn", sessionId: mockNewSessionId },
      ]);
      const bridge = new AgentBridge(params, mockRunner);

      // When: run is called
      const payloads: OpenClawPayload[] = [];
      const generator = bridge.run();
      let result: IteratorResult<OpenClawPayload, unknown>;
      do {
        result = await generator.next();
        if (!result.done && result.value) {
          payloads.push(result.value);
        }
      } while (!result.done);

      // Then: result should contain the new sdkSessionId
      const runResult = result.value as { sdkSessionId?: string };
      expect(runResult.sdkSessionId).toBe(mockNewSessionId);
    });
  });

  describe("stream mapping", () => {
    it("maps SDK text stream to OpenClaw payloads", async () => {
      // Given: AgentBridge params
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "Hello",
      };

      // Mock SDK runner stream events
      const mockRunner = createMockRunner([
        { type: "text", content: "Hello" },
        { type: "text", content: " world" },
        { type: "text", content: "!" },
        { type: "complete", stopReason: "end_turn" },
      ]);
      const bridge = new AgentBridge(params, mockRunner);

      // When: run is called
      const payloads: OpenClawPayload[] = [];
      for await (const payload of bridge.run()) {
        payloads.push(payload);
      }

      // Then: payloads should map text chunks
      expect(payloads.length).toBeGreaterThanOrEqual(4);
      expect(payloads[0].text).toBe("Hello");
      expect(payloads[1].text).toBe(" world");
      expect(payloads[2].text).toBe("!");
      expect(payloads[payloads.length - 1].isComplete).toBe(true);
    });

    it("maps SDK tool call events to OpenClaw payloads", async () => {
      // Given: AgentBridge params
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "Read the file",
      };

      // Mock SDK runner stream events with tool call
      const mockRunner = createMockRunner([
        { type: "text", content: "Let me read that file." },
        {
          type: "tool_call",
          name: "Read",
          arguments: { file_path: "/workspace/README.md" },
          id: "tool-1",
        },
        {
          type: "tool_result",
          name: "Read",
          result: "# README\nThis is a test.",
          id: "tool-1",
        },
        { type: "text", content: "The file contains a README." },
        { type: "complete", stopReason: "end_turn" },
      ]);
      const bridge = new AgentBridge(params, mockRunner);

      // When: run is called
      const payloads: OpenClawPayload[] = [];
      for await (const payload of bridge.run()) {
        payloads.push(payload);
      }

      // Then: payloads should include tool call and result
      const toolCallPayload = payloads.find((p) => p.toolCall);
      expect(toolCallPayload?.toolCall?.name).toBe("Read");
      expect(toolCallPayload?.toolCall?.arguments).toEqual({
        file_path: "/workspace/README.md",
      });

      const toolResultPayload = payloads.find((p) => p.toolResult);
      expect(toolResultPayload?.toolResult?.name).toBe("Read");
      expect(toolResultPayload?.toolResult?.result).toContain("README");
    });

    it("emits final payload with isComplete flag", async () => {
      // Given: AgentBridge params
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "Hello",
      };

      // Mock SDK runner stream events
      const mockRunner = createMockRunner([
        { type: "text", content: "Hello!" },
        { type: "complete", stopReason: "end_turn" },
      ]);
      const bridge = new AgentBridge(params, mockRunner);

      // When: run is called
      const payloads: OpenClawPayload[] = [];
      for await (const payload of bridge.run()) {
        payloads.push(payload);
      }

      // Then: last payload should have isComplete flag
      const lastPayload = payloads[payloads.length - 1];
      expect(lastPayload.isComplete).toBe(true);
    });
  });

  describe("error handling", () => {
    it("normalizes SDK context overflow error", async () => {
      // Given: AgentBridge params
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "A very long prompt...",
      };

      // Mock SDK runner to throw context overflow
      const mockRunner: ClaudeSdkRunner = {
        async *query() {
          throw new Error("context_length_exceeded");
        },
      };
      const bridge = new AgentBridge(params, mockRunner);

      // When/Then: run should throw normalized OpenClaw error
      const payloads: OpenClawPayload[] = [];
      let caughtError: unknown;
      try {
        for await (const payload of bridge.run()) {
          payloads.push(payload);
        }
      } catch (err) {
        caughtError = err;
      }

      // Expect normalized error with kind
      expect(caughtError).toMatchObject({
        kind: "context_overflow",
      });
    });

    it("always emits lifecycle end even on error", async () => {
      // Given: AgentBridge params
      const params: AgentBridgeParams = {
        sessionKey: "session-123",
        workspaceDir: "/workspace",
        prompt: "Hello",
      };

      // Mock SDK runner to throw error mid-stream
      const mockRunner: ClaudeSdkRunner = {
        async *query() {
          yield { type: "text", content: "Starting..." };
          throw new Error("Network error");
        },
      };
      const bridge = new AgentBridge(params, mockRunner);

      // When: run is called
      const payloads: OpenClawPayload[] = [];
      try {
        for await (const payload of bridge.run()) {
          payloads.push(payload);
        }
      } catch {
        // Expected error
      }

      // Then: should have emitted lifecycle end for gateway state consistency
      expect(payloads.some((p) => p.isComplete || p.isError)).toBe(true);
    });
  });
});
