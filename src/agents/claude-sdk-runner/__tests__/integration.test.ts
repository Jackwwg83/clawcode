import { describe, it, expect } from "vitest";
import type { RunEmbeddedPiAgentParams } from "../../pi-embedded-runner/run/params.js";

describe.skip("SDK runner integration", () => {
  it("completes a simple text conversation", async () => {
    const { runClaudeSdkAgent } = await import("../run.js");

    const result = await runClaudeSdkAgent({
      sessionId: `integration-test-${Date.now()}`,
      prompt: 'Reply with exactly "pong"',
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      timeoutMs: 30000,
      runId: `test-${Date.now()}`,
      sessionFile: "/tmp/test-session.jsonl",
      workspaceDir: "/tmp",
    } as unknown as RunEmbeddedPiAgentParams);

    expect(result.payloads).toBeDefined();
    expect(result.payloads!.length).toBeGreaterThan(0);
    expect(result.payloads![0].text).toContain("pong");
    expect(result.meta.durationMs).toBeGreaterThan(0);
    expect(result.meta.agentMeta?.usage?.input).toBeGreaterThan(0);
  });

  it("handles abort correctly", async () => {
    const { runClaudeSdkAgent } = await import("../run.js");
    const abortController = new AbortController();

    setTimeout(() => abortController.abort(), 100);

    const result = await runClaudeSdkAgent({
      sessionId: `abort-test-${Date.now()}`,
      prompt: "Write a very long essay about the history of computing.",
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      timeoutMs: 60000,
      runId: `test-${Date.now()}`,
      sessionFile: "/tmp/test-session.jsonl",
      workspaceDir: "/tmp",
      abortSignal: abortController.signal,
    } as unknown as RunEmbeddedPiAgentParams);

    expect(result.meta.aborted).toBe(true);
  });
});
