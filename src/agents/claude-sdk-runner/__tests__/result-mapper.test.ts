import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, it, expect } from "vitest";
import type { RunEmbeddedPiAgentParams } from "../../pi-embedded-runner/run/params.js";
import { mapSdkResultToRunResult } from "../result-mapper.js";

describe("mapSdkResultToRunResult", () => {
  const baseParams = {
    sessionId: "test-session",
    provider: "anthropic",
    model: "claude-opus-4-6",
    prompt: "hello",
    timeoutMs: 30000,
    runId: "test-run",
    sessionFile: "/tmp/test.jsonl",
    workspaceDir: "/tmp",
  } as unknown as RunEmbeddedPiAgentParams;

  it("maps successful result with text", () => {
    const result = mapSdkResultToRunResult({
      resultMessage: {
        type: "result",
        subtype: "success",
        result: "Hello!",
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        duration_ms: 100,
        duration_api_ms: 80,
        is_error: false,
        num_turns: 1,
        stop_reason: "end_turn",
        total_cost_usd: 0.001,
        modelUsage: {},
        permission_denials: [],
        uuid: "test-uuid",
        session_id: "sdk-session",
      } as unknown as SDKResultMessage,
      assistantTexts: ["Hello!"],
      durationMs: 150,
      params: baseParams,
    });

    expect(result.payloads).toHaveLength(1);
    expect(result.payloads![0].text).toBe("Hello!");
    expect(result.payloads![0].isError).toBeUndefined();
    expect(result.meta.durationMs).toBe(150);
    expect(result.meta.agentMeta?.provider).toBe("anthropic");
    expect(result.meta.agentMeta?.usage?.input).toBe(10);
    expect(result.meta.agentMeta?.usage?.output).toBe(5);
    expect(result.meta.aborted).toBeFalsy();
  });

  it("maps empty result (no text)", () => {
    const result = mapSdkResultToRunResult({
      resultMessage: undefined,
      assistantTexts: [],
      durationMs: 100,
      params: baseParams,
    });

    expect(result.payloads).toEqual([]);
    expect(result.meta.durationMs).toBe(100);
  });

  it("maps aborted result", () => {
    const abortController = new AbortController();
    abortController.abort();

    const result = mapSdkResultToRunResult({
      resultMessage: undefined,
      assistantTexts: ["partial"],
      durationMs: 50,
      params: { ...baseParams, abortSignal: abortController.signal },
    });

    expect(result.meta.aborted).toBe(true);
  });

  it("maps context overflow error", () => {
    const result = mapSdkResultToRunResult({
      resultMessage: {
        type: "result",
        subtype: "error_during_execution",
        errors: ["token limit exceeded: context overflow"],
        usage: {
          input_tokens: 100,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        stop_reason: "error",
      } as unknown as SDKResultMessage,
      assistantTexts: ["failed"],
      durationMs: 42,
      params: baseParams,
    });

    expect(result.payloads).toHaveLength(1);
    expect(result.payloads?.[0]?.isError).toBe(true);
    expect(result.meta.error?.kind).toBe("context_overflow");
  });

  it("falls back to SDK result text when stream text is empty", () => {
    const result = mapSdkResultToRunResult({
      resultMessage: {
        type: "result",
        subtype: "success",
        result: "fallback text",
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        duration_ms: 1,
        duration_api_ms: 1,
        is_error: false,
        num_turns: 1,
        stop_reason: "end_turn",
        total_cost_usd: 0,
        modelUsage: {},
        permission_denials: [],
        uuid: "uuid",
        session_id: "sdk-session",
      } as unknown as SDKResultMessage,
      assistantTexts: [],
      durationMs: 5,
      params: baseParams,
    });

    expect(result.payloads).toHaveLength(1);
    expect(result.payloads?.[0]?.text).toBe("fallback text");
  });

  it("maps role ordering errors", () => {
    const result = mapSdkResultToRunResult({
      resultMessage: {
        type: "result",
        subtype: "error_during_execution",
        errors: ["roles must alternate between user and assistant"],
        usage: {
          input_tokens: 2,
          output_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        stop_reason: "error",
      } as unknown as SDKResultMessage,
      assistantTexts: [],
      durationMs: 42,
      params: baseParams,
    });

    expect(result.meta.error?.kind).toBe("role_ordering");
  });

  it("marks messaging tool dispatch when messaging tools are used", () => {
    const result = mapSdkResultToRunResult({
      resultMessage: {
        type: "result",
        subtype: "success",
        result: "sent",
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        duration_ms: 1,
        duration_api_ms: 1,
        is_error: false,
        num_turns: 1,
        stop_reason: "end_turn",
        total_cost_usd: 0,
        modelUsage: {},
        permission_denials: [],
        uuid: "uuid",
        session_id: "sdk-session",
      } as unknown as SDKResultMessage,
      assistantTexts: ["sent"],
      usedToolNames: new Set(["mcp__openclaw__message"]),
      messagingToolSentTexts: ["hello", "hello"],
      messagingToolSentTargets: [
        { tool: "message", provider: "telegram", to: "telegram:123" },
        { tool: "message", provider: "telegram", to: "telegram:123" },
      ],
      durationMs: 10,
      params: baseParams,
    });

    expect(result.didSendViaMessagingTool).toBe(true);
    expect(result.messagingToolSentTexts).toEqual(["hello"]);
    expect(result.messagingToolSentTargets).toEqual([
      { tool: "message", provider: "telegram", to: "telegram:123" },
    ]);
  });
});
