import { describe, expect, it } from "vitest";
import type { RunEmbeddedPiAgentParams } from "../../pi-embedded-runner/run/params.js";
import { buildSdkOptions } from "../options-builder.js";

describe("options-builder", () => {
  it("uses run workspace as cwd and enables bypass permissions", async () => {
    const params = {
      sessionId: "s",
      sessionFile: "/tmp/s.jsonl",
      workspaceDir: "/tmp/ws",
      prompt: "hello",
      timeoutMs: 30_000,
      runId: "run",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    } as unknown as RunEmbeddedPiAgentParams;

    const options = buildSdkOptions(params);
    expect(options.cwd).toBe("/tmp/ws");
    expect(options.permissionMode).toBe("bypassPermissions");
    expect(options.allowDangerouslySkipPermissions).toBe(true);
    expect(options.canUseTool).toBeUndefined();
  });

  it("disables SDK tools only when disableTools=true", () => {
    const params = {
      sessionId: "s",
      sessionKey: "telegram:dm:alice",
      sessionFile: "/tmp/s.jsonl",
      workspaceDir: "/tmp/ws",
      prompt: "hello",
      timeoutMs: 30_000,
      runId: "run",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      disableTools: true,
    } as unknown as RunEmbeddedPiAgentParams;

    const options = buildSdkOptions(params);
    expect(options.disallowedTools).toBeDefined();
    expect(options.disallowedTools).toContain("Bash");
    expect(options.disallowedTools).toContain("Read");
  });
});
