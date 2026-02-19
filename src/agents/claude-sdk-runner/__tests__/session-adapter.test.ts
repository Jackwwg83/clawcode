import { SessionManager } from "@mariozechner/pi-coding-agent";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RunEmbeddedPiAgentParams } from "../../pi-embedded-runner/run/params.js";
import { buildSdkPrompt, persistSdkTurnToSession } from "../session-adapter.js";

function getText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }
      const text = (block as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

describe("claude-sdk session adapter", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("builds prompt with recent session history", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-sdk-session-adapter-"));
    tempDirs.push(tempDir);
    const sessionFile = path.join(tempDir, "session.jsonl");

    const manager = SessionManager.open(sessionFile);
    manager.appendMessage({
      role: "user",
      content: [{ type: "text", text: "seed user" }],
    });
    manager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "seed assistant" }],
    });

    const prompt = buildSdkPrompt({
      sessionId: "test-session",
      sessionFile,
      workspaceDir: tempDir,
      prompt: "new question",
      timeoutMs: 30_000,
      runId: "test-run",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    } as unknown as RunEmbeddedPiAgentParams);

    expect(typeof prompt).toBe("string");
    expect(String(prompt)).toContain("User: seed user");
    expect(String(prompt)).toContain("Assistant: seed assistant");
    expect(String(prompt)).toContain("User: new question");
  });

  it("persists user and assistant turns to session transcript", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-sdk-session-persist-"));
    tempDirs.push(tempDir);
    const sessionFile = path.join(tempDir, "session.jsonl");

    const params = {
      sessionId: "test-session",
      sessionFile,
      workspaceDir: tempDir,
      prompt: "hello from user",
      timeoutMs: 30_000,
      runId: "test-run",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    } as unknown as RunEmbeddedPiAgentParams;

    await persistSdkTurnToSession(params, {
      assistantText: "hello from assistant",
      resultMessage: {
        type: "result",
        subtype: "success",
        result: "hello from assistant",
        usage: {
          input_tokens: 5,
          output_tokens: 4,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
        duration_ms: 10,
        duration_api_ms: 10,
        is_error: false,
        num_turns: 1,
        stop_reason: "end_turn",
        total_cost_usd: 0,
        modelUsage: {},
        permission_denials: [],
        uuid: "uuid",
        session_id: "sdk-session",
      },
    });

    const manager = SessionManager.open(sessionFile);
    const messages = manager
      .getBranch()
      .filter((entry) => entry.type === "message")
      .map((entry) => (entry as { message: { role?: string; content?: unknown } }).message);

    const user = messages.find((message) => message.role === "user");
    const assistant = messages.find((message) => message.role === "assistant");

    expect(user).toBeDefined();
    expect(getText(user?.content)).toContain("hello from user");
    expect(assistant).toBeDefined();
    expect(getText(assistant?.content)).toContain("hello from assistant");
  });
});
