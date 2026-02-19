import { describe, expect, it, vi } from "vitest";
import type { RunEmbeddedPiAgentParams } from "../../pi-embedded-runner/run/params.js";
import { createStreamState, handleSdkMessage } from "../stream-adapter.js";

describe("stream-adapter", () => {
  it("does not duplicate text when both stream_event and assistant snapshots arrive", async () => {
    const onBlockReply = vi.fn(async () => {});
    const onBlockReplyFlush = vi.fn(async () => {});
    const params = {
      sessionId: "s",
      sessionFile: "/tmp/s.jsonl",
      workspaceDir: "/tmp",
      prompt: "hello",
      timeoutMs: 30_000,
      runId: "run",
      onBlockReply,
      onBlockReplyFlush,
    } as unknown as RunEmbeddedPiAgentParams;

    const state = createStreamState();
    await handleSdkMessage(
      {
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "hello" } },
      } as never,
      params,
      state,
    );
    await handleSdkMessage(
      { type: "stream_event", event: { type: "content_block_stop" } } as never,
      params,
      state,
    );
    await handleSdkMessage(
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "hello" }] },
      } as never,
      params,
      state,
    );

    expect(state.assistantTexts.join("")).toBe("hello");
    expect(onBlockReply).toHaveBeenCalledTimes(1);
  });

  it("emits tool and compaction lifecycle events", async () => {
    const onAgentEvent = vi.fn(async () => {});
    const onToolResult = vi.fn(async () => {});
    const params = {
      sessionId: "s",
      sessionFile: "/tmp/s.jsonl",
      workspaceDir: "/tmp",
      prompt: "hello",
      timeoutMs: 30_000,
      runId: "run",
      onAgentEvent,
      onToolResult,
    } as unknown as RunEmbeddedPiAgentParams;
    const state = createStreamState();

    await handleSdkMessage(
      {
        type: "system",
        subtype: "status",
        status: "compacting",
      } as never,
      params,
      state,
    );
    await handleSdkMessage(
      {
        type: "tool_progress",
        tool_name: "Bash",
        tool_use_id: "tool-1",
        parent_tool_use_id: null,
        elapsed_time_seconds: 1,
      } as never,
      params,
      state,
    );
    await handleSdkMessage(
      {
        type: "tool_use_summary",
        summary: "done",
      } as never,
      params,
      state,
    );
    await handleSdkMessage(
      {
        type: "system",
        subtype: "status",
        status: null,
      } as never,
      params,
      state,
    );

    expect(onToolResult).toHaveBeenCalledWith({ text: "done" });
    expect(onAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: "compaction",
        data: expect.objectContaining({ phase: "start" }),
      }),
    );
    expect(onAgentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        stream: "tool",
        data: expect.objectContaining({ phase: "update", toolName: "Bash" }),
      }),
    );
  });
});
