import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type {
  RunEmbeddedPiAgentParams,
  EmbeddedPiRunResult,
  EmbeddedPiAgentMeta,
} from "./types.js";

export function mapSdkResultToRunResult(ctx: {
  resultMessage: SDKResultMessage | undefined;
  assistantTexts: string[];
  durationMs: number;
  params: RunEmbeddedPiAgentParams;
  timedOut?: boolean;
}): EmbeddedPiRunResult {
  const { resultMessage, assistantTexts, durationMs, params, timedOut = false } = ctx;
  const fullText = assistantTexts.join("");

  const agentMeta: EmbeddedPiAgentMeta = {
    sessionId: params.sessionId,
    provider: params.provider ?? "anthropic",
    model: params.model ?? "claude-opus-4-6",
  };

  if (resultMessage?.type === "result") {
    const u = resultMessage.usage;
    agentMeta.usage = {
      input: u?.input_tokens,
      output: u?.output_tokens,
      cacheRead: u?.cache_read_input_tokens,
      cacheWrite: u?.cache_creation_input_tokens,
      total: (u?.input_tokens ?? 0) + (u?.output_tokens ?? 0),
    };
    // SDK 只有一轮，所以 lastCallUsage 等于 usage
    agentMeta.lastCallUsage = { ...agentMeta.usage };

    // promptTokens for display
    agentMeta.promptTokens = u?.input_tokens;
  }

  if (!resultMessage && (params.abortSignal?.aborted || timedOut)) {
    return {
      payloads: [],
      meta: {
        durationMs,
        agentMeta,
        aborted: true,
      },
      didSendViaMessagingTool: false,
      messagingToolSentTexts: [],
      messagingToolSentTargets: [],
    };
  }

  const isError = resultMessage?.type === "result" && resultMessage.subtype !== "success";
  const errorKind = isError ? mapSdkErrorKind(resultMessage) : undefined;

  return {
    payloads: fullText ? [{ text: fullText, isError: isError || undefined }] : [],
    meta: {
      durationMs,
      agentMeta,
      aborted: params.abortSignal?.aborted || timedOut || undefined,
      stopReason:
        resultMessage?.type === "result" ? (resultMessage.stop_reason ?? undefined) : undefined,
      error: errorKind,
    },
    didSendViaMessagingTool: false,
    messagingToolSentTexts: [],
    messagingToolSentTargets: [],
  };
}

function mapSdkErrorKind(result: SDKResultMessage):
  | {
      kind: "context_overflow" | "compaction_failure" | "role_ordering" | "image_size";
      message: string;
    }
  | undefined {
  if (result.type !== "result" || result.subtype === "success") {
    return undefined;
  }

  const errors = "errors" in result ? (result as unknown as { errors: string[] }).errors : [];
  const errorMsg = errors.join("; ") || `SDK error: ${result.subtype}`;

  // 检查是否包含 context overflow 关键词
  if (errors.some((e) => /context|overflow|token.*limit|too.*long/i.test(e))) {
    return { kind: "context_overflow", message: errorMsg };
  }

  // 其他 SDK 错误没有直接对应的 OpenClaw error kind
  // 不设置 error kind → 调用方按普通失败处理
  return undefined;
}
