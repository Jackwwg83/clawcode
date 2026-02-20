import { describe, expect, it } from "vitest";
import type { RunEmbeddedPiAgentParams } from "../../pi-embedded-runner/run/params.js";
import { buildSdkOptions } from "../options-builder.js";
import { createStreamState } from "../stream-adapter.js";

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

    const options = buildSdkOptions(params, createStreamState());
    expect(options.cwd).toBe("/tmp/ws");
    expect(options.permissionMode).toBe("bypassPermissions");
    expect(options.allowDangerouslySkipPermissions).toBe(true);
    expect(options.canUseTool).toBeUndefined();
    expect(options.persistSession).toBe(true);
    expect(options.mcpServers).toBeDefined();
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

    const options = buildSdkOptions(params, createStreamState());
    expect(options.disallowedTools).toBeDefined();
    expect(options.disallowedTools).toContain("Bash");
    expect(options.disallowedTools).toContain("Read");
  });

  it("sets short alias as fallback model for dated claude model ids", () => {
    const params = {
      sessionId: "s",
      sessionFile: "/tmp/s.jsonl",
      workspaceDir: "/tmp/ws",
      prompt: "hello",
      timeoutMs: 30_000,
      runId: "run",
      provider: "anthropic",
      model: "claude-sonnet-4-6-20250929",
    } as unknown as RunEmbeddedPiAgentParams;
    const options = buildSdkOptions(params, createStreamState());
    expect(options.model).toBe("claude-sonnet-4-6-20250929");
    expect(options.fallbackModel).toBe("claude-sonnet-4-6");
  });
});
