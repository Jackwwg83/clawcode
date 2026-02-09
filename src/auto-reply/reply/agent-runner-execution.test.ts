/**
 * Agent Runner Execution Tests
 *
 * Tests for agent-runner-execution.ts to verify mcpServers are passed to runAgentViaSdk.
 */
import crypto from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TemplateContext } from "../templating.js";
import type { FollowupRun } from "./queue.js";

const runAgentViaSdkMock = vi.fn();

vi.mock("../../agents/model-fallback.js", () => ({
  runWithModelFallback: async ({
    provider,
    model,
    run,
  }: {
    provider: string;
    model: string;
    run: (provider: string, model: string) => Promise<unknown>;
  }) => ({
    result: await run(provider, model),
    provider,
    model,
  }),
}));

vi.mock("../../agent/run-agent-via-sdk.js", () => ({
  runAgentViaSdk: (params: unknown) => runAgentViaSdkMock(params),
}));

vi.mock("../../agents/cli-runner.js", () => ({
  runCliAgent: vi.fn().mockResolvedValue({
    payloads: [{ text: "ok" }],
    meta: { durationMs: 5 },
  }),
}));

vi.mock("../../agents/model-selection.js", () => ({
  isCliProvider: vi.fn().mockReturnValue(false),
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveAgentModelFallbacksOverride: vi.fn().mockReturnValue(undefined),
}));

vi.mock("../../config/sessions.js", () => ({
  resolveAgentIdFromSessionKey: vi.fn().mockReturnValue("main"),
  resolveGroupSessionKey: vi.fn().mockReturnValue(undefined),
  resolveSessionTranscriptPath: vi.fn().mockReturnValue("/tmp/transcript.jsonl"),
  updateSessionStore: vi.fn(),
}));

vi.mock("../../utils/message-channel.js", () => ({
  isMarkdownCapableMessageChannel: vi.fn().mockReturnValue(true),
  resolveMessageChannel: vi.fn().mockReturnValue("webchat"),
}));

import { runAgentTurnWithFallback } from "./agent-runner-execution.js";

describe("runAgentTurnWithFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runAgentViaSdkMock.mockResolvedValue({
      payloads: [{ text: "ok" }],
      meta: {
        durationMs: 5,
        agentMeta: { sessionId: "s", provider: "anthropic", model: "claude-sonnet-4-5" },
      },
    });
  });

  function createTestContext() {
    const sessionCtx = {
      Provider: "webchat",
      OriginatingTo: "session:1",
      AccountId: "primary",
      MessageSid: "msg",
    } as unknown as TemplateContext;

    const followupRun = {
      prompt: "hello",
      summaryLine: "hello",
      enqueuedAt: Date.now(),
      run: {
        sessionId: "session-1",
        sessionKey: "agent:main:task:1",
        messageProvider: "webchat",
        sessionFile: "/tmp/session.jsonl",
        workspaceDir: "/tmp",
        config: {},
        skillsSnapshot: {},
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        thinkLevel: "low",
        verboseLevel: "off",
        reasoningLevel: "off",
        elevatedLevel: "off",
        bashElevated: {
          enabled: false,
          allowed: false,
          defaultLevel: "off",
        },
        timeoutMs: 30000,
        blockReplyBreak: "message_end",
      },
    } as unknown as FollowupRun;

    return { sessionCtx, followupRun };
  }

  it("passes mcpServers to runAgentViaSdk", async () => {
    const { sessionCtx, followupRun } = createTestContext();

    await runAgentTurnWithFallback({
      commandBody: "test message",
      followupRun,
      sessionCtx,
      opts: { runId: crypto.randomUUID() },
      typingSignals: {
        signalTextDelta: vi.fn().mockResolvedValue(undefined),
        signalMessageStart: vi.fn().mockResolvedValue(undefined),
        signalReasoningDelta: vi.fn().mockResolvedValue(undefined),
        signalToolStart: vi.fn().mockResolvedValue(undefined),
        shouldStartOnReasoning: false,
      },
      blockReplyPipeline: null,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      applyReplyToMode: (payload) => payload,
      shouldEmitToolResult: () => true,
      shouldEmitToolOutput: () => true,
      pendingToolTasks: new Set(),
      resetSessionAfterCompactionFailure: vi.fn().mockResolvedValue(false),
      resetSessionAfterRoleOrderingConflict: vi.fn().mockResolvedValue(false),
      isHeartbeat: false,
      sessionKey: "agent:main:task:1",
      getActiveSessionEntry: () => undefined,
      activeSessionStore: {},
      storePath: "/tmp/sessions.json",
      resolvedVerboseLevel: "off",
    });

    expect(runAgentViaSdkMock).toHaveBeenCalledTimes(1);
    const callArgs = runAgentViaSdkMock.mock.calls[0][0];

    expect(callArgs.mcpServers).toBeDefined();
    expect(Array.isArray(callArgs.mcpServers)).toBe(true);
    expect(callArgs.mcpServers.length).toBeGreaterThan(0);

    // Should have all 6 MCP servers
    const serverNames = callArgs.mcpServers.map((s: { name: string }) => s.name);
    expect(serverNames).toContain("memory");
    expect(serverNames).toContain("sessions");
    expect(serverNames).toContain("message");
    expect(serverNames).toContain("nodes");
    expect(serverNames).toContain("browser");
    expect(serverNames).toContain("canvas");
  });

  it("includes correct sessionKey in mcpServers configuration", async () => {
    const { sessionCtx, followupRun } = createTestContext();
    followupRun.run.sessionKey = "agent:ops:subagent:abc";

    await runAgentTurnWithFallback({
      commandBody: "test message",
      followupRun,
      sessionCtx,
      opts: { runId: crypto.randomUUID() },
      typingSignals: {
        signalTextDelta: vi.fn().mockResolvedValue(undefined),
        signalMessageStart: vi.fn().mockResolvedValue(undefined),
        signalReasoningDelta: vi.fn().mockResolvedValue(undefined),
        signalToolStart: vi.fn().mockResolvedValue(undefined),
        shouldStartOnReasoning: false,
      },
      blockReplyPipeline: null,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      applyReplyToMode: (payload) => payload,
      shouldEmitToolResult: () => true,
      shouldEmitToolOutput: () => true,
      pendingToolTasks: new Set(),
      resetSessionAfterCompactionFailure: vi.fn().mockResolvedValue(false),
      resetSessionAfterRoleOrderingConflict: vi.fn().mockResolvedValue(false),
      isHeartbeat: false,
      sessionKey: "agent:ops:subagent:abc",
      getActiveSessionEntry: () => undefined,
      activeSessionStore: {},
      storePath: "/tmp/sessions.json",
      resolvedVerboseLevel: "off",
    });

    expect(runAgentViaSdkMock).toHaveBeenCalledTimes(1);
    const callArgs = runAgentViaSdkMock.mock.calls[0][0];

    expect(callArgs.mcpServers).toBeDefined();
    // Nodes server should have the sessionKey in its command
    const nodesServer = callArgs.mcpServers.find((s: { name: string }) => s.name === "nodes");
    expect(nodesServer).toBeDefined();
    expect(nodesServer.command).toContain("agent:ops:subagent:abc");
  });
});
