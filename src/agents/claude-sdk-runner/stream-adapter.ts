import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKPartialAssistantMessage,
  SDKStatusMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { MessagingToolSend } from "../pi-embedded-messaging.js";
import type { RunEmbeddedPiAgentParams } from "./types.js";

export type StreamState = {
  assistantTexts: string[];
  currentBlockText: string;
  hasStartedMessage: boolean;
  sawStreamTextDelta: boolean;
  isCompacting: boolean;
  usedToolNames: Set<string>;
  messagingToolSentTexts: string[];
  messagingToolSentTargets: MessagingToolSend[];
};

export function createStreamState(): StreamState {
  return {
    assistantTexts: [],
    currentBlockText: "",
    hasStartedMessage: false,
    sawStreamTextDelta: false,
    isCompacting: false,
    usedToolNames: new Set<string>(),
    messagingToolSentTexts: [],
    messagingToolSentTargets: [],
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
      if (state.isCompacting) {
        state.isCompacting = false;
        await params.onAgentEvent?.({
          stream: "compaction",
          data: { phase: "end", willRetry: false },
        });
      }
      // Flush any pending block
      if (state.currentBlockText) {
        state.assistantTexts.push(state.currentBlockText);
        await params.onBlockReply?.({ text: state.currentBlockText });
        await params.onBlockReplyFlush?.();
        state.currentBlockText = "";
      }
      break;
    }
    case "tool_use_summary": {
      const summary = message.summary;
      if (summary) {
        await params.onToolResult?.({ text: summary });
        await params.onAgentEvent?.({
          stream: "tool",
          data: { phase: "end", summary },
        });
      }
      break;
    }
    case "tool_progress": {
      const progress = message;
      state.usedToolNames.add(progress.tool_name);
      await params.onAgentEvent?.({
        stream: "tool",
        data: {
          phase: "update",
          toolName: progress.tool_name,
          toolUseId: progress.tool_use_id,
          parentToolUseId: progress.parent_tool_use_id,
          elapsedTimeSeconds: progress.elapsed_time_seconds,
        },
      });
      break;
    }
    case "system": {
      await handleSystemMessage(message, params, state);
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

  let assistantText = "";
  for (const block of message.message.content) {
    if (block.type === "text") {
      assistantText += block.text;
    } else if (block.type === "thinking" && "thinking" in block) {
      // Reasoning/thinking content
      await params.onReasoningStream?.({
        text: (block as unknown as { thinking: string }).thinking,
      });
    }
  }

  // SDK can emit both stream_event deltas and a final assistant snapshot.
  // Skip assistant text replay when delta streaming already carried the text.
  if (assistantText && !state.sawStreamTextDelta) {
    state.assistantTexts.push(assistantText);
    state.currentBlockText += assistantText;
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
      state.sawStreamTextDelta = true;
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

async function handleSystemMessage(
  message: SDKMessage,
  params: RunEmbeddedPiAgentParams,
  state: StreamState,
): Promise<void> {
  const system = message as SDKStatusMessage;
  if (system.subtype !== "status") {
    return;
  }

  const compacting = system.status === "compacting";
  if (compacting && !state.isCompacting) {
    state.isCompacting = true;
    await params.onAgentEvent?.({
      stream: "compaction",
      data: { phase: "start" },
    });
    return;
  }
  if (!compacting && state.isCompacting) {
    state.isCompacting = false;
    await params.onAgentEvent?.({
      stream: "compaction",
      data: { phase: "end", willRetry: false },
    });
  }
}
