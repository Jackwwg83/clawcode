import { afterEach, describe, expect, it, vi } from "vitest";
import type { RunEmbeddedPiAgentParams } from "../../pi-embedded-runner/run/params.js";
import { createStreamState } from "../stream-adapter.js";

const sdkMocks = vi.hoisted(() => ({
  createSdkMcpServer: vi.fn((config: unknown) => config),
}));

const piToolMocks = vi.hoisted(() => ({
  createOpenClawCodingTools: vi.fn(() => []),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", async () => {
  const actual = await vi.importActual<typeof import("@anthropic-ai/claude-agent-sdk")>(
    "@anthropic-ai/claude-agent-sdk",
  );
  return {
    ...actual,
    createSdkMcpServer: sdkMocks.createSdkMcpServer,
  };
});

vi.mock("../../pi-tools.js", () => ({
  createOpenClawCodingTools: piToolMocks.createOpenClawCodingTools,
}));

import { __testing, buildOpenClawMcpServer } from "../mcp-tool-bridge.js";

function makeRunParams(
  overrides: Partial<RunEmbeddedPiAgentParams> = {},
): RunEmbeddedPiAgentParams {
  return {
    sessionId: "session-1",
    sessionFile: "/tmp/session-1.jsonl",
    workspaceDir: "/tmp/workspace",
    prompt: "hello",
    timeoutMs: 30_000,
    runId: "run-1",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    ...overrides,
  } as RunEmbeddedPiAgentParams;
}

describe("mcp-tool-bridge", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("buildOpenClawMcpServer returns undefined when disableTools=true", () => {
    const result = buildOpenClawMcpServer({
      runParams: makeRunParams({ disableTools: true }),
      streamState: createStreamState(),
    });

    expect(result).toBeUndefined();
    expect(piToolMocks.createOpenClawCodingTools).not.toHaveBeenCalled();
  });

  it("buildOpenClawMcpServer returns undefined when no tools are available", () => {
    piToolMocks.createOpenClawCodingTools.mockReturnValue([]);

    const result = buildOpenClawMcpServer({
      runParams: makeRunParams(),
      streamState: createStreamState(),
    });

    expect(result).toBeUndefined();
    expect(sdkMocks.createSdkMcpServer).not.toHaveBeenCalled();
  });

  it("buildOpenClawMcpServer returns server config when a valid tool exists", () => {
    piToolMocks.createOpenClawCodingTools.mockReturnValue([
      {
        name: "message",
        description: "send message",
        parameters: { type: "object", properties: {} },
        execute: vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] })),
      },
    ]);

    const result = buildOpenClawMcpServer({
      runParams: makeRunParams(),
      streamState: createStreamState(),
    });

    expect(result).toBeDefined();
    expect(sdkMocks.createSdkMcpServer).toHaveBeenCalledTimes(1);
    expect(sdkMocks.createSdkMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "openclaw",
        version: "1.0.0",
      }),
    );
  });

  it("toMcpToolDefinition converts valid tools and records messaging signals", async () => {
    const state = createStreamState();
    const execute = vi.fn(async () => ({
      content: [{ type: "text", text: "done" }],
      details: {
        message: "from result",
        to: "telegram:dm:bob",
        texts: ["extra 1", "extra 2"],
      },
    }));

    const toolDef = __testing.toMcpToolDefinition(
      {
        name: "openclaw__message",
        label: "message",
        parameters: { properties: { text: { type: "string" } } },
        execute,
      } as never,
      state,
    );

    expect(toolDef).toBeDefined();
    expect(toolDef?.name).toBe("openclaw__message");
    expect(toolDef?.inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: true,
    });

    const ac = new AbortController();
    const result = await toolDef?.handler(
      {
        text: "hello world",
        to: "telegram:dm:alice",
      },
      { signal: ac.signal },
    );

    expect(execute).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ text: "hello world" }),
      ac.signal,
    );
    expect(result?.content).toEqual([{ type: "text", text: "done" }]);
    expect(state.usedToolNames.has("openclaw__message")).toBe(true);
    expect(state.messagingToolSentTexts).toEqual(
      expect.arrayContaining(["hello world", "from result", "extra 1", "extra 2"]),
    );
    expect(state.messagingToolSentTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to: "telegram:dm:alice", tool: "message" }),
        expect.objectContaining({ to: "telegram:dm:bob", tool: "message" }),
      ]),
    );
  });

  it("toMcpToolDefinition rejects invalid or overly long tool names", () => {
    const state = createStreamState();

    expect(
      __testing.toMcpToolDefinition({ name: "", execute: vi.fn() } as never, state),
    ).toBeUndefined();
    expect(
      __testing.toMcpToolDefinition({ name: "bad name", execute: vi.fn() } as never, state),
    ).toBeUndefined();
    expect(
      __testing.toMcpToolDefinition({ name: "a".repeat(129), execute: vi.fn() } as never, state),
    ).toBeUndefined();
  });

  it("toMcpInputSchema keeps valid schemas and repairs missing type", () => {
    const validSchema = {
      type: "object",
      properties: { value: { type: "string" } },
      additionalProperties: false,
    };
    expect(__testing.toMcpInputSchema(validSchema)).toEqual(validSchema);

    const missingTypeSchema = {
      properties: { value: { type: "string" } },
    };
    expect(__testing.toMcpInputSchema(missingTypeSchema)).toEqual({
      type: "object",
      properties: {},
      additionalProperties: true,
    });

    const arraySchema = { type: "array", items: { type: "number" } };
    expect(__testing.toMcpInputSchema(arraySchema)).toEqual(arraySchema);
  });

  it("toMcpCallToolResult maps text/image and falls back for empty content", () => {
    const textResult = __testing.toMcpCallToolResult({
      content: [{ type: "text", text: "hello" }],
      details: { ok: true },
    });
    expect(textResult.content).toEqual([{ type: "text", text: "hello" }]);

    const imageResult = __testing.toMcpCallToolResult({
      content: [{ type: "image", data: "AAA", mimeType: "image/png" }],
      details: { ok: true },
    });
    expect(imageResult.content).toEqual([{ type: "image", data: "AAA", mimeType: "image/png" }]);

    const fallbackResult = __testing.toMcpCallToolResult({
      details: { error: "boom" },
    });
    expect(fallbackResult.content[0]).toEqual(
      expect.objectContaining({
        type: "text",
      }),
    );
    expect((fallbackResult.content[0] as { text: string }).text).toContain("boom");
  });

  it("isMessagingToolName recognizes supported naming patterns", () => {
    expect(__testing.isMessagingToolName("message")).toBe(true);
    expect(__testing.isMessagingToolName("sessions_send")).toBe(true);
    expect(__testing.isMessagingToolName("openclaw__message_whatsapp")).toBe(true);
    expect(__testing.isMessagingToolName("bash")).toBe(false);
  });

  it("collectMessagingSignalsFromInput/Result extracts text and target fields", () => {
    const state = createStreamState();

    __testing.collectMessagingSignalsFromInput(
      "message",
      {
        text: "hello",
        message: "hello again",
        to: "telegram:dm:alice",
      },
      state,
    );
    __testing.collectMessagingSignalsFromResult(
      "message",
      {
        text: "done",
        target: "telegram:group:42",
        texts: ["first", "second"],
      },
      state,
    );

    expect(state.messagingToolSentTexts).toEqual(
      expect.arrayContaining(["hello", "hello again", "done", "first", "second"]),
    );
    expect(state.messagingToolSentTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ to: "telegram:dm:alice" }),
        expect.objectContaining({ to: "telegram:group:42" }),
      ]),
    );

    const textCount = state.messagingToolSentTexts.length;
    __testing.collectMessagingSignalsFromInput("bash", { text: "ignored" }, state);
    expect(state.messagingToolSentTexts.length).toBe(textCount);
  });
});
