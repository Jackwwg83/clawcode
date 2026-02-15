import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKPartialAssistantMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { RunEmbeddedPiAgentParams } from "./types.js";

export type StreamState = {
  assistantTexts: string[];
  currentBlockText: string;
  hasStartedMessage: boolean;
};

export function createStreamState(): StreamState {
  return {
    assistantTexts: [],
    currentBlockText: "",
    hasStartedMessage: false,
  };
}

export async function handleSdkMessage(
  message: SDKMessage,
  params: RunEmbeddedPiAgentParams,
  state: StreamState,
): Promise<void> {
  switch (message.type) {
    case "assistant": {
      await handleAssistantMessage(message, params, state);
      break;
    }
    case "stream_event": {
      await handleStreamEvent(message, params, state);
      break;
    }
    case "result": {
      // Flush any pending block
      if (state.currentBlockText) {
        await params.onBlockReply?.({ text: state.currentBlockText });
        await params.onBlockReplyFlush?.();
        state.currentBlockText = "";
      }
      break;
    }
    case "tool_use_summary": {
      const summary = (message as { summary?: string }).summary;
      if (summary) {
        await params.onToolResult?.({ text: summary });
      }
      break;
    }
    // tool_progress, system, etc. — 不需要映射到上游回调
  }
}

async function handleAssistantMessage(
  message: SDKAssistantMessage,
  params: RunEmbeddedPiAgentParams,
  state: StreamState,
): Promise<void> {
  if (!state.hasStartedMessage) {
    state.hasStartedMessage = true;
    await params.onAssistantMessageStart?.();
  }

  if (!message.message?.content) {
    return;
  }

  for (const block of message.message.content) {
    if (block.type === "text") {
      state.assistantTexts.push(block.text);
      state.currentBlockText += block.text;
    } else if (block.type === "thinking" && "thinking" in block) {
      // Reasoning/thinking content
      await params.onReasoningStream?.({
        text: (block as unknown as { thinking: string }).thinking,
      });
    }
  }

  // Flush block at end of assistant message
  if (state.currentBlockText) {
    await params.onBlockReply?.({ text: state.currentBlockText });
    await params.onBlockReplyFlush?.();
    state.currentBlockText = "";
  }
}

async function handleStreamEvent(
  message: SDKPartialAssistantMessage,
  params: RunEmbeddedPiAgentParams,
  state: StreamState,
): Promise<void> {
  if (!state.hasStartedMessage) {
    state.hasStartedMessage = true;
    await params.onAssistantMessageStart?.();
  }

  const event = message.event;
  if (!event) {
    return;
  }

  // Raw Anthropic streaming events
  // Map content_block_delta with text to onPartialReply
  if (event.type === "content_block_delta") {
    const delta = (
      event as unknown as { delta: { type: string; text?: string; thinking?: string } }
    ).delta;
    if (delta?.type === "text_delta" && delta.text) {
      state.currentBlockText += delta.text;
      await params.onPartialReply?.({ text: delta.text });
    } else if (delta?.type === "thinking_delta" && delta.thinking) {
      await params.onReasoningStream?.({ text: delta.thinking });
    }
  }

  // content_block_stop → flush block
  if (event.type === "content_block_stop") {
    if (state.currentBlockText) {
      state.assistantTexts.push(state.currentBlockText);
      await params.onBlockReply?.({ text: state.currentBlockText });
      await params.onBlockReplyFlush?.();
      state.currentBlockText = "";
    }
  }
}
