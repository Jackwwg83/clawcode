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
});
