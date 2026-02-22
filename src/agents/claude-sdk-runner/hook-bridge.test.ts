import { beforeEach, describe, expect, it, vi } from "vitest";

const hookRunnerMocks = vi.hoisted(() => ({
  getGlobalHookRunner: vi.fn(),
}));

vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: hookRunnerMocks.getGlobalHookRunner,
}));

import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import { __testing } from "./hook-bridge.js";

const { buildSdkHooks } = __testing;

type HookRunner = NonNullable<ReturnType<typeof getGlobalHookRunner>>;

describe("hook-bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined when no hook runner", () => {
    vi.mocked(getGlobalHookRunner).mockReturnValue(null);
    const result = buildSdkHooks({ agentId: "test", sessionKey: "s1" });
    expect(result).toBeUndefined();
  });

  it("returns undefined when no hooks registered", () => {
    const runner = {
      hasHooks: () => false,
    } as unknown as HookRunner;
    vi.mocked(getGlobalHookRunner).mockReturnValue(runner);

    const result = buildSdkHooks({ agentId: "test", sessionKey: "s1" });
    expect(result).toBeUndefined();
  });

  it("creates PreToolUse hook when before_tool_call is registered", () => {
    const runner = {
      hasHooks: (name: string) => name === "before_tool_call",
      runBeforeToolCall: vi.fn().mockResolvedValue(undefined),
    } as unknown as HookRunner;
    vi.mocked(getGlobalHookRunner).mockReturnValue(runner);

    const result = buildSdkHooks({ agentId: "test", sessionKey: "s1" });
    expect(result).toBeDefined();
    expect(result?.PreToolUse).toHaveLength(1);
    expect(result?.PreToolUse?.[0]?.hooks).toHaveLength(1);
  });

  it("PreToolUse hook blocks when plugin returns block: true", async () => {
    const runner = {
      hasHooks: (name: string) => name === "before_tool_call",
      runBeforeToolCall: vi.fn().mockResolvedValue({
        block: true,
        blockReason: "Not allowed",
      }),
    } as unknown as HookRunner;
    vi.mocked(getGlobalHookRunner).mockReturnValue(runner);

    const result = buildSdkHooks({ agentId: "test", sessionKey: "s1" });
    const hook = result?.PreToolUse?.[0]?.hooks?.[0];
    expect(hook).toBeDefined();

    const output = await hook!(
      {
        hook_event_name: "PreToolUse",
        tool_name: "exec",
        tool_input: { command: "rm -rf /" },
        tool_use_id: "123",
        session_id: "s1",
        transcript_path: "/tmp/t",
        cwd: "/tmp",
      },
      "123",
      { signal: new AbortController().signal },
    );

    expect(output.hookSpecificOutput).toEqual({
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Not allowed",
    });
  });

  it("PreToolUse hook passes through modified params", async () => {
    const runner = {
      hasHooks: (name: string) => name === "before_tool_call",
      runBeforeToolCall: vi.fn().mockResolvedValue({
        params: { command: "echo safe" },
      }),
    } as unknown as HookRunner;
    vi.mocked(getGlobalHookRunner).mockReturnValue(runner);

    const result = buildSdkHooks({ agentId: "test", sessionKey: "s1" });
    const hook = result?.PreToolUse?.[0]?.hooks?.[0];
    expect(hook).toBeDefined();

    const output = await hook!(
      {
        hook_event_name: "PreToolUse",
        tool_name: "exec",
        tool_input: { command: "rm -rf /" },
        tool_use_id: "123",
        session_id: "s1",
        transcript_path: "/tmp/t",
        cwd: "/tmp",
      },
      "123",
      { signal: new AbortController().signal },
    );

    expect(output.hookSpecificOutput).toEqual({
      hookEventName: "PreToolUse",
      updatedInput: { command: "echo safe" },
    });
  });

  it("maps all supported OpenClaw hooks to SDK hook events", () => {
    const enabledHooks = new Set([
      "before_tool_call",
      "after_tool_call",
      "before_compaction",
      "session_start",
      "session_end",
    ]);
    const runner = {
      hasHooks: (name: string) => enabledHooks.has(name),
      runBeforeToolCall: vi.fn().mockResolvedValue(undefined),
      runAfterToolCall: vi.fn().mockResolvedValue(undefined),
      runBeforeCompaction: vi.fn().mockResolvedValue(undefined),
      runSessionStart: vi.fn().mockResolvedValue(undefined),
      runSessionEnd: vi.fn().mockResolvedValue(undefined),
    } as unknown as HookRunner;
    vi.mocked(getGlobalHookRunner).mockReturnValue(runner);

    const result = buildSdkHooks({ agentId: "agent-1", sessionKey: "session-key-1" });
    expect(result).toBeDefined();
    expect(result?.PreToolUse?.[0]?.hooks).toHaveLength(1);
    expect(result?.PostToolUse?.[0]?.hooks).toHaveLength(1);
    expect(result?.PreCompact?.[0]?.hooks).toHaveLength(1);
    expect(result?.SessionStart?.[0]?.hooks).toHaveLength(1);
    expect(result?.SessionEnd?.[0]?.hooks).toHaveLength(1);
  });

  it("PostToolUse hook forwards tool result to after_tool_call hook", async () => {
    const runAfterToolCall = vi.fn().mockResolvedValue(undefined);
    const runner = {
      hasHooks: (name: string) => name === "after_tool_call",
      runAfterToolCall,
    } as unknown as HookRunner;
    vi.mocked(getGlobalHookRunner).mockReturnValue(runner);

    const result = buildSdkHooks({ agentId: "agent-2", sessionKey: "session-key-2" });
    const hook = result?.PostToolUse?.[0]?.hooks?.[0];
    expect(hook).toBeDefined();

    const output = await hook!(
      {
        hook_event_name: "PostToolUse",
        tool_name: "web_search",
        tool_input: { query: "hello" },
        tool_response: { ok: true },
        tool_use_id: "tool-1",
        session_id: "session-2",
        transcript_path: "/tmp/session-2.jsonl",
        cwd: "/tmp",
      },
      "tool-1",
      { signal: new AbortController().signal },
    );

    expect(runAfterToolCall).toHaveBeenCalledWith(
      {
        toolName: "web_search",
        params: { query: "hello" },
        result: { ok: true },
      },
      {
        toolName: "web_search",
        agentId: "agent-2",
        sessionKey: "session-key-2",
      },
    );
    expect(output).toEqual({ continue: true });
  });

  it("PreCompact hook forwards transcript path to before_compaction hook", async () => {
    const runBeforeCompaction = vi.fn().mockResolvedValue(undefined);
    const runner = {
      hasHooks: (name: string) => name === "before_compaction",
      runBeforeCompaction,
    } as unknown as HookRunner;
    vi.mocked(getGlobalHookRunner).mockReturnValue(runner);

    const result = buildSdkHooks({ agentId: "agent-3", sessionKey: "session-key-3" });
    const hook = result?.PreCompact?.[0]?.hooks?.[0];
    expect(hook).toBeDefined();

    const output = await hook!(
      {
        hook_event_name: "PreCompact",
        trigger: "auto",
        custom_instructions: null,
        session_id: "session-3",
        transcript_path: "/tmp/session-3.jsonl",
        cwd: "/tmp",
      },
      undefined,
      { signal: new AbortController().signal },
    );

    expect(runBeforeCompaction).toHaveBeenCalledWith(
      {
        messageCount: 0,
        sessionFile: "/tmp/session-3.jsonl",
      },
      {
        agentId: "agent-3",
        sessionKey: "session-key-3",
        sessionId: "session-3",
      },
    );
    expect(output).toEqual({ continue: true });
  });

  it("SessionStart hook triggers session_start plugin hooks", async () => {
    const runSessionStart = vi.fn().mockResolvedValue(undefined);
    const runner = {
      hasHooks: (name: string) => name === "session_start",
      runSessionStart,
    } as unknown as HookRunner;
    vi.mocked(getGlobalHookRunner).mockReturnValue(runner);

    const result = buildSdkHooks({ agentId: "agent-4", sessionKey: "session-key-4" });
    const hook = result?.SessionStart?.[0]?.hooks?.[0];
    expect(hook).toBeDefined();

    const output = await hook!(
      {
        hook_event_name: "SessionStart",
        source: "startup",
        session_id: "session-4",
        transcript_path: "/tmp/session-4.jsonl",
        cwd: "/tmp",
      },
      undefined,
      { signal: new AbortController().signal },
    );

    expect(runSessionStart).toHaveBeenCalledWith(
      {
        sessionId: "session-4",
      },
      {
        agentId: "agent-4",
        sessionId: "session-4",
      },
    );
    expect(output).toEqual({ continue: true });
  });

  it("SessionEnd hook triggers session_end plugin hooks", async () => {
    const runSessionEnd = vi.fn().mockResolvedValue(undefined);
    const runner = {
      hasHooks: (name: string) => name === "session_end",
      runSessionEnd,
    } as unknown as HookRunner;
    vi.mocked(getGlobalHookRunner).mockReturnValue(runner);

    const result = buildSdkHooks({ agentId: "agent-5", sessionKey: "session-key-5" });
    const hook = result?.SessionEnd?.[0]?.hooks?.[0];
    expect(hook).toBeDefined();

    const output = await hook!(
      {
        hook_event_name: "SessionEnd",
        reason: "other",
        session_id: "session-5",
        transcript_path: "/tmp/session-5.jsonl",
        cwd: "/tmp",
      },
      undefined,
      { signal: new AbortController().signal },
    );

    expect(runSessionEnd).toHaveBeenCalledWith(
      {
        sessionId: "session-5",
        messageCount: 0,
      },
      {
        agentId: "agent-5",
        sessionId: "session-5",
      },
    );
    expect(output).toEqual({ continue: true });
  });
});
