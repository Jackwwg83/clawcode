import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEmbeddedPiAgentParams } from "../../pi-embedded-runner/run/params.js";
import { FailoverError } from "../../failover-error.js";

const sdkMocks = vi.hoisted(() => {
  class MockAbortError extends Error {}
  return {
    query: vi.fn(),
    AbortError: MockAbortError,
  };
});

const activeRunMocks = vi.hoisted(() => ({
  registerSdkRun: vi.fn(() => ({
    queueMessage: vi.fn(async () => {}),
    isStreaming: vi.fn(() => false),
    isCompacting: vi.fn(() => false),
    abort: vi.fn(),
  })),
  clearSdkRun: vi.fn(),
}));

const optionsMocks = vi.hoisted(() => ({
  buildSdkOptions: vi.fn(() => ({})),
}));

const pluginIntentMocks = vi.hoisted(() => ({
  rewritePromptForClaudePluginInstall: vi.fn((prompt: string) => ({
    rewritten: false,
    rewrittenPrompt: prompt,
    pluginSpec: "",
  })),
}));

const sessionMocks = vi.hoisted(() => ({
  buildSdkPrompt: vi.fn((params: { prompt: string }) => params.prompt),
  loadSdkResumeSessionId: vi.fn(async () => undefined),
  persistSdkResumeSessionId: vi.fn(async () => {}),
  persistSdkTurnToSession: vi.fn(async () => {}),
}));

const streamMocks = vi.hoisted(() => ({
  createStreamState: vi.fn(() => ({
    assistantTexts: [] as string[],
    currentBlockText: "",
    hasStartedMessage: false,
    sawStreamTextDelta: false,
    isCompacting: false,
    usedToolNames: new Set<string>(),
    messagingToolSentTexts: [] as string[],
    messagingToolSentTargets: [],
  })),
  handleSdkMessage: vi.fn(async () => {}),
}));

const resultMapperMocks = vi.hoisted(() => ({
  mapSdkResultToRunResult: vi.fn((ctx: { durationMs: number }) => ({
    payloads: [],
    meta: { durationMs: ctx.durationMs },
  })),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", async () => {
  const actual = await vi.importActual<typeof import("@anthropic-ai/claude-agent-sdk")>(
    "@anthropic-ai/claude-agent-sdk",
  );
  return {
    ...actual,
    query: sdkMocks.query,
    AbortError: sdkMocks.AbortError,
  };
});

vi.mock("../active-run-tracker.js", () => ({
  registerSdkRun: activeRunMocks.registerSdkRun,
  clearSdkRun: activeRunMocks.clearSdkRun,
}));

vi.mock("../options-builder.js", () => ({
  buildSdkOptions: optionsMocks.buildSdkOptions,
}));

vi.mock("../plugin-intent.js", () => ({
  rewritePromptForClaudePluginInstall: pluginIntentMocks.rewritePromptForClaudePluginInstall,
}));

vi.mock("../session-adapter.js", () => ({
  buildSdkPrompt: sessionMocks.buildSdkPrompt,
  loadSdkResumeSessionId: sessionMocks.loadSdkResumeSessionId,
  persistSdkResumeSessionId: sessionMocks.persistSdkResumeSessionId,
  persistSdkTurnToSession: sessionMocks.persistSdkTurnToSession,
}));

vi.mock("../stream-adapter.js", () => ({
  createStreamState: streamMocks.createStreamState,
  handleSdkMessage: streamMocks.handleSdkMessage,
}));

vi.mock("../result-mapper.js", () => ({
  mapSdkResultToRunResult: resultMapperMocks.mapSdkResultToRunResult,
}));

import { runClaudeSdkAgent } from "../run.js";

function makeParams(overrides: Partial<RunEmbeddedPiAgentParams> = {}): RunEmbeddedPiAgentParams {
  return {
    sessionId: "session-1",
    sessionFile: "/tmp/session-1.jsonl",
    workspaceDir: "/tmp/workspace",
    prompt: "hello",
    timeoutMs: 50,
    runId: "run-1",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    ...overrides,
  } as RunEmbeddedPiAgentParams;
}

function createBlockingConversation() {
  let closed = false;
  const close = vi.fn(() => {
    closed = true;
  });

  return {
    close,
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (closed) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
        yield { type: "system", subtype: "status", status: null } as never;
      }
      throw new sdkMocks.AbortError("closed");
    },
  };
}

describe("runClaudeSdkAgent error paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws FailoverError for auth errors", async () => {
    sdkMocks.query.mockImplementation(() => {
      throw new Error("authentication failed");
    });

    const error = await runClaudeSdkAgent(makeParams()).catch((err) => err);
    expect(error).toBeInstanceOf(FailoverError);
    expect(error).toMatchObject({ reason: "auth" });
  });

  it("throws FailoverError for billing errors", async () => {
    sdkMocks.query.mockImplementation(() => {
      throw new Error("billing issue");
    });

    const error = await runClaudeSdkAgent(makeParams()).catch((err) => err);
    expect(error).toBeInstanceOf(FailoverError);
    expect(error).toMatchObject({ reason: "billing" });
  });

  it("throws FailoverError for rate limit errors", async () => {
    sdkMocks.query.mockImplementation(() => {
      throw new Error("rate limit reached");
    });

    const error = await runClaudeSdkAgent(makeParams()).catch((err) => err);
    expect(error).toBeInstanceOf(FailoverError);
    expect(error).toMatchObject({ reason: "rate_limit" });
  });

  it("rethrows unknown errors as-is", async () => {
    const unknownError = new Error("boom");
    sdkMocks.query.mockImplementation(() => {
      throw unknownError;
    });

    await expect(runClaudeSdkAgent(makeParams())).rejects.toBe(unknownError);
  });

  it("calls conversation.close() on timeout", async () => {
    const conversation = createBlockingConversation();
    sdkMocks.query.mockReturnValue(conversation);

    await runClaudeSdkAgent(makeParams({ timeoutMs: 20 }));

    expect(conversation.close).toHaveBeenCalled();
    expect(resultMapperMocks.mapSdkResultToRunResult).toHaveBeenCalledWith(
      expect.objectContaining({ timedOut: true }),
    );
  });

  it("calls conversation.close() when abort signal fires", async () => {
    const conversation = createBlockingConversation();
    sdkMocks.query.mockReturnValue(conversation);

    const controller = new AbortController();
    const runPromise = runClaudeSdkAgent(
      makeParams({
        timeoutMs: 1_000,
        abortSignal: controller.signal,
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    await runPromise;

    expect(conversation.close).toHaveBeenCalled();
  });
});
