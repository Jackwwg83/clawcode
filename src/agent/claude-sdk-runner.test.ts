/**
 * Claude SDK Runner Tests (TDD)
 *
 * Tests the wrapper around Claude Agent SDK's query functionality.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Claude Agent SDK
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { query as mockSdkQuery } from "@anthropic-ai/claude-agent-sdk";
import { createClaudeSdkRunner, type SdkRunnerOptions } from "./claude-sdk-runner.js";

// Use current directory as workspaceDir for tests (must exist)
const TEST_WORKSPACE_DIR = process.cwd();

describe("ClaudeSdkRunner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createClaudeSdkRunner", () => {
    it("returns a runner with query method", () => {
      const runner = createClaudeSdkRunner();
      expect(runner).toBeDefined();
      expect(typeof runner.query).toBe("function");
    });
  });

  describe("query", () => {
    it("calls SDK query with prompt", async () => {
      // Given: mock SDK query that yields events
      const mockEvents = [
        { type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } },
        { type: "result", subtype: "success", session_id: "s1" },
      ];
      (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        for (const event of mockEvents) {
          yield event;
        }
      });

      const runner = createClaudeSdkRunner();
      const options: SdkRunnerOptions = {
        systemPrompt: "You are helpful.",
        settingSources: ["project"],
        allowedTools: ["Read", "Write"],
        workspaceDir: TEST_WORKSPACE_DIR,
      };

      // When: query is called
      const events = [];
      for await (const event of runner.query("Hello", options)) {
        events.push(event);
      }

      // Then: SDK query should be called with prompt
      expect(mockSdkQuery).toHaveBeenCalled();
      const callArgs = (mockSdkQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.prompt).toBe("Hello");
    });

    it("passes systemPrompt to SDK options", async () => {
      // Given: mock SDK query
      (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        yield { type: "result", subtype: "success" };
      });

      const runner = createClaudeSdkRunner();
      const options: SdkRunnerOptions = {
        systemPrompt: "You are a test assistant.",
        settingSources: ["project"],
        allowedTools: ["Read"],
        workspaceDir: TEST_WORKSPACE_DIR,
      };

      // When: query is called
      for await (const _ of runner.query("Test", options)) {
        // consume events
      }

      // Then: systemPrompt should be passed
      const callArgs = (mockSdkQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.options.systemPrompt).toBe("You are a test assistant.");
    });

    it("passes allowedTools to SDK options", async () => {
      // Given: mock SDK query
      (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        yield { type: "result", subtype: "success" };
      });

      const runner = createClaudeSdkRunner();
      const options: SdkRunnerOptions = {
        systemPrompt: "Test",
        settingSources: ["project"],
        allowedTools: ["Read", "Write", "Bash"],
        workspaceDir: TEST_WORKSPACE_DIR,
      };

      // When: query is called
      for await (const _ of runner.query("Test", options)) {
        // consume events
      }

      // Then: allowedTools should be passed
      const callArgs = (mockSdkQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.options.allowedTools).toEqual(["Read", "Write", "Bash"]);
    });

    it("passes settingSources to SDK options", async () => {
      // Given: mock SDK query
      (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        yield { type: "result", subtype: "success" };
      });

      const runner = createClaudeSdkRunner();
      const options: SdkRunnerOptions = {
        systemPrompt: "Test",
        settingSources: ["user", "project"],
        allowedTools: ["Read"],
        workspaceDir: TEST_WORKSPACE_DIR,
      };

      // When: query is called
      for await (const _ of runner.query("Test", options)) {
        // consume events
      }

      // Then: settingSources should be passed (user/project/local values)
      const callArgs = (mockSdkQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.options.settingSources).toEqual(["user", "project"]);
    });

    it("passes additionalDirectories to SDK options when provided", async () => {
      // Given: mock SDK query
      (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        yield { type: "result", subtype: "success" };
      });

      const runner = createClaudeSdkRunner();
      const options: SdkRunnerOptions = {
        systemPrompt: "Test",
        settingSources: ["project"],
        additionalDirectories: ["/extra/dir1", "/extra/dir2"],
        allowedTools: ["Read"],
        workspaceDir: TEST_WORKSPACE_DIR,
      };

      // When: query is called
      for await (const _ of runner.query("Test", options)) {
        // consume events
      }

      // Then: additionalDirectories should be passed (string paths for CLAUDE.md)
      const callArgs = (mockSdkQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.options.additionalDirectories).toEqual(["/extra/dir1", "/extra/dir2"]);
    });

    it("passes mcpServers as Record to SDK options", async () => {
      // Given: mock SDK query
      (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        yield { type: "result", subtype: "success" };
      });

      const runner = createClaudeSdkRunner();
      const options: SdkRunnerOptions = {
        systemPrompt: "Test",
        settingSources: ["project"],
        allowedTools: ["Read"],
        mcpServers: [
          { name: "memory", command: "mcp-memory" },
          { name: "sessions", command: "mcp-sessions" },
        ],
        workspaceDir: TEST_WORKSPACE_DIR,
      };

      // When: query is called
      for await (const _ of runner.query("Test", options)) {
        // consume events
      }

      // Then: mcpServers should be converted to Record format
      const callArgs = (mockSdkQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.options.mcpServers).toEqual({
        memory: { command: "mcp-memory", args: [] },
        sessions: { command: "mcp-sessions", args: [] },
      });
    });

    it("passes resume option when sdkSessionId is provided", async () => {
      // Given: mock SDK query
      (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        yield { type: "result", subtype: "success" };
      });

      const runner = createClaudeSdkRunner();
      const options: SdkRunnerOptions = {
        systemPrompt: "Test",
        settingSources: ["project"],
        allowedTools: ["Read"],
        sdkSessionId: "session-abc-123",
        workspaceDir: TEST_WORKSPACE_DIR,
      };

      // When: query is called
      for await (const _ of runner.query("Test", options)) {
        // consume events
      }

      // Then: resume should be set to sdkSessionId
      const callArgs = (mockSdkQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.options.resume).toBe("session-abc-123");
    });

    it("does not pass resume when sdkSessionId is not provided", async () => {
      // Given: mock SDK query
      (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        yield { type: "result", subtype: "success" };
      });

      const runner = createClaudeSdkRunner();
      const options: SdkRunnerOptions = {
        systemPrompt: "Test",
        settingSources: ["project"],
        allowedTools: ["Read"],
        workspaceDir: TEST_WORKSPACE_DIR,
        // No sdkSessionId
      };

      // When: query is called
      for await (const _ of runner.query("Test", options)) {
        // consume events
      }

      // Then: resume should be undefined
      const callArgs = (mockSdkQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.options.resume).toBeUndefined();
    });

    it("passes cwd from workspaceDir", async () => {
      // Given: mock SDK query
      (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        yield { type: "result", subtype: "success" };
      });

      const runner = createClaudeSdkRunner();
      const options: SdkRunnerOptions = {
        systemPrompt: "Test",
        settingSources: [],
        allowedTools: [],
        workspaceDir: "/custom/workspace",
      };

      // When: query is called
      for await (const _ of runner.query("Test", options)) {
        // consume events
      }

      // Then: cwd should be set
      const callArgs = (mockSdkQuery as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callArgs.options.cwd).toBe("/custom/workspace");
    });

    it("yields SDK events mapped to our types", async () => {
      // Given: mock SDK query that yields multiple events
      const mockEvents = [
        { type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } },
        { type: "assistant", message: { content: [{ type: "text", text: " world" }] } },
        { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { path: "/test" } }] } },
        { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "content" }] } },
        { type: "result", subtype: "success", session_id: "new-session" },
      ];
      (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        for (const event of mockEvents) {
          yield event;
        }
      });

      const runner = createClaudeSdkRunner();
      const options: SdkRunnerOptions = {
        systemPrompt: "Test",
        settingSources: ["project"],
        allowedTools: ["Read"],
        workspaceDir: TEST_WORKSPACE_DIR,
      };

      // When: query is called
      const events = [];
      for await (const event of runner.query("Test", options)) {
        events.push(event);
      }

      // Then: events should be yielded (mapped to our types)
      expect(events.length).toBeGreaterThan(0);
      // Text events
      expect(events.filter((e) => e.type === "text")).toHaveLength(2);
      // Tool events
      expect(events.filter((e) => e.type === "tool_call")).toHaveLength(1);
      expect(events.filter((e) => e.type === "tool_result")).toHaveLength(1);
      // Complete event
      const completeEvent = events.find((e) => e.type === "complete");
      expect(completeEvent).toBeDefined();
      expect(completeEvent?.sessionId).toBe("new-session");
    });

    it("does not yield duplicate complete event when SDK provides one", async () => {
      // Given: mock SDK query that yields complete event
      const mockEvents = [
        { type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } },
        { type: "result", subtype: "success", session_id: "session-1" },
      ];
      (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        for (const event of mockEvents) {
          yield event;
        }
      });

      const runner = createClaudeSdkRunner();
      const options: SdkRunnerOptions = {
        systemPrompt: "Test",
        settingSources: [],
        allowedTools: [],
        workspaceDir: TEST_WORKSPACE_DIR,
      };

      // When: query is called
      const events = [];
      for await (const event of runner.query("Test", options)) {
        events.push(event);
      }

      // Then: only one complete event should be yielded
      const completeEvents = events.filter((e) => e.type === "complete");
      expect(completeEvents).toHaveLength(1);
      expect(completeEvents[0].sessionId).toBe("session-1");
    });

    it("yields fallback complete event when SDK does not provide one", async () => {
      // Given: mock SDK query that does not yield complete event
      const mockEvents = [{ type: "assistant", message: { content: [{ type: "text", text: "Hello" }] } }];
      (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
        for (const event of mockEvents) {
          yield event;
        }
      });

      const runner = createClaudeSdkRunner();
      const options: SdkRunnerOptions = {
        systemPrompt: "Test",
        settingSources: [],
        allowedTools: [],
        workspaceDir: TEST_WORKSPACE_DIR,
      };

      // When: query is called
      const events = [];
      for await (const event of runner.query("Test", options)) {
        events.push(event);
      }

      // Then: fallback complete event should be yielded
      const completeEvents = events.filter((e) => e.type === "complete");
      expect(completeEvents).toHaveLength(1);
      expect(completeEvents[0].stopReason).toBe("end_turn");
      expect(completeEvents[0].sessionId).toBeUndefined();
    });

    describe("thinking block extraction", () => {
      it("extracts single thinking block from assistant content", async () => {
        // Given: SDK yields thinking block
        const mockEvents = [
          {
            type: "assistant",
            message: {
              content: [{ type: "thinking", thinking: "Let me analyze this problem..." }],
            },
          },
          { type: "result", subtype: "success" },
        ];
        (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
          for (const event of mockEvents) {
            yield event;
          }
        });

        const runner = createClaudeSdkRunner();

        // When: query is called
        const events = [];
        for await (const event of runner.query("Test", { systemPrompt: "", settingSources: [], allowedTools: [], workspaceDir: TEST_WORKSPACE_DIR })) {
          events.push(event);
        }

        // Then: thinking event should be extracted
        const thinkingEvents = events.filter((e) => e.type === "thinking");
        expect(thinkingEvents).toHaveLength(1);
        expect(thinkingEvents[0].content).toBe("Let me analyze this problem...");
      });

      it("handles interleaved thinking and text blocks", async () => {
        // Given: SDK yields mixed content
        const mockEvents = [
          {
            type: "assistant",
            message: {
              content: [
                { type: "thinking", thinking: "Planning..." },
                { type: "text", text: "Here's my plan:" },
                { type: "thinking", thinking: "Executing..." },
                { type: "text", text: "Step 1..." },
              ],
            },
          },
          { type: "result", subtype: "success" },
        ];
        (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
          for (const event of mockEvents) {
            yield event;
          }
        });

        const runner = createClaudeSdkRunner();

        // When: query is called
        const events = [];
        for await (const event of runner.query("Test", { systemPrompt: "", settingSources: [], allowedTools: [], workspaceDir: TEST_WORKSPACE_DIR })) {
          events.push(event);
        }

        // Then: events should be in correct order
        const contentEvents = events.filter((e) => e.type === "thinking" || e.type === "text");
        expect(contentEvents).toHaveLength(4);
        expect(contentEvents[0].type).toBe("thinking");
        expect(contentEvents[0].content).toBe("Planning...");
        expect(contentEvents[1].type).toBe("text");
        expect(contentEvents[1].content).toBe("Here's my plan:");
        expect(contentEvents[2].type).toBe("thinking");
        expect(contentEvents[2].content).toBe("Executing...");
        expect(contentEvents[3].type).toBe("text");
        expect(contentEvents[3].content).toBe("Step 1...");
      });

      it("preserves thinking blocks adjacent to tool calls", async () => {
        // Given: SDK yields thinking with tool_use
        const mockEvents = [
          {
            type: "assistant",
            message: {
              content: [
                { type: "thinking", thinking: "I need to read the file..." },
                { type: "tool_use", id: "t1", name: "Read", input: { path: "/test" } },
              ],
            },
          },
          {
            type: "user",
            message: {
              content: [{ type: "tool_result", tool_use_id: "t1", content: "File content" }],
            },
          },
          { type: "result", subtype: "success" },
        ];
        (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
          for (const event of mockEvents) {
            yield event;
          }
        });

        const runner = createClaudeSdkRunner();

        // When: query is called
        const events = [];
        for await (const event of runner.query("Test", { systemPrompt: "", settingSources: [], allowedTools: [], workspaceDir: TEST_WORKSPACE_DIR })) {
          events.push(event);
        }

        // Then: thinking should precede tool_call
        expect(events[0].type).toBe("thinking");
        expect(events[0].content).toBe("I need to read the file...");
        expect(events[1].type).toBe("tool_call");
        expect(events[1].name).toBe("Read");
      });

      it("handles multiple consecutive thinking blocks", async () => {
        // Given: SDK yields multiple thinking blocks
        const mockEvents = [
          {
            type: "assistant",
            message: {
              content: [
                { type: "thinking", thinking: "First thought" },
                { type: "thinking", thinking: "Second thought" },
                { type: "thinking", thinking: "Third thought" },
              ],
            },
          },
          { type: "result", subtype: "success" },
        ];
        (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
          for (const event of mockEvents) {
            yield event;
          }
        });

        const runner = createClaudeSdkRunner();

        // When: query is called
        const events = [];
        for await (const event of runner.query("Test", { systemPrompt: "", settingSources: [], allowedTools: [], workspaceDir: TEST_WORKSPACE_DIR })) {
          events.push(event);
        }

        // Then: all three thinking blocks should be yielded
        const thinkingEvents = events.filter((e) => e.type === "thinking");
        expect(thinkingEvents).toHaveLength(3);
        expect(thinkingEvents[0].content).toBe("First thought");
        expect(thinkingEvents[1].content).toBe("Second thought");
        expect(thinkingEvents[2].content).toBe("Third thought");
      });

      it("skips empty or malformed thinking blocks", async () => {
        // Given: SDK yields empty/malformed thinking
        const mockEvents = [
          {
            type: "assistant",
            message: {
              content: [
                { type: "thinking", thinking: "" },
                { type: "thinking" }, // missing thinking property
                { type: "text", text: "Real content" },
              ],
            },
          },
          { type: "result", subtype: "success" },
        ];
        (mockSdkQuery as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
          for (const event of mockEvents) {
            yield event;
          }
        });

        const runner = createClaudeSdkRunner();

        // When: query is called
        const events = [];
        for await (const event of runner.query("Test", { systemPrompt: "", settingSources: [], allowedTools: [], workspaceDir: TEST_WORKSPACE_DIR })) {
          events.push(event);
        }

        // Then: only text event should be yielded (empty thinking skipped)
        const contentEvents = events.filter((e) => e.type === "thinking" || e.type === "text");
        expect(contentEvents).toHaveLength(1);
        expect(contentEvents[0].type).toBe("text");
        expect(contentEvents[0].content).toBe("Real content");
      });
    });
  });
});
