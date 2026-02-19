import { describe, expect, it } from "vitest";
import type { RunEmbeddedPiAgentParams } from "../../pi-embedded-runner/run/params.js";
import { buildSdkOptions } from "../options-builder.js";

describe("options-builder", () => {
  it("uses run workspace as cwd and enforces non-interactive permission mode", async () => {
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
    expect(options.permissionMode).toBe("dontAsk");
    expect(typeof options.canUseTool).toBe("function");

    const canUseTool = options.canUseTool!;
    const allowed = await canUseTool("Read", { file_path: "notes/today.md" }, {} as never);
    expect(allowed.behavior).toBe("allow");

    const denied = await canUseTool("Read", { file_path: "/etc/passwd" }, {} as never);
    expect(denied.behavior).toBe("deny");
  });

  it("applies OpenClaw tool policy mappings to SDK built-ins", async () => {
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
      config: {
        tools: {
          allow: ["read"],
        },
      },
    } as unknown as RunEmbeddedPiAgentParams;

    const options = buildSdkOptions(params);
    const canUseTool = options.canUseTool!;

    const read = await canUseTool("Read", { file_path: "notes/today.md" }, {} as never);
    expect(read.behavior).toBe("allow");

    const bash = await canUseTool("Bash", { command: "pwd" }, {} as never);
    expect(bash.behavior).toBe("deny");

    const webSearch = await canUseTool("WebSearch", { query: "latest news" }, {} as never);
    expect(webSearch.behavior).toBe("deny");
  });
});
