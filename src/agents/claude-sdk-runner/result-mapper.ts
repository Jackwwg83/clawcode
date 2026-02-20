import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { MessagingToolSend } from "../pi-embedded-messaging.js";
import type {
  RunEmbeddedPiAgentParams,
  EmbeddedPiRunResult,
  EmbeddedPiAgentMeta,
} from "./types.js";

export function mapSdkResultToRunResult(ctx: {
  resultMessage: SDKResultMessage | undefined;
  assistantTexts: string[];
  usedToolNames?: Set<string>;
  messagingToolSentTexts?: string[];
  messagingToolSentTargets?: MessagingToolSend[];
  durationMs: number;
  params: RunEmbeddedPiAgentParams;
  timedOut?: boolean;
}): EmbeddedPiRunResult {
  const {
    resultMessage,
    assistantTexts,
    usedToolNames = new Set<string>(),
    messagingToolSentTexts = [],
    messagingToolSentTargets = [],
    durationMs,
    params,
    timedOut = false,
  } = ctx;
  const streamedText = assistantTexts.join("");
  const resultText =
    resultMessage?.type === "result" && resultMessage.subtype === "success"
      ? resultMessage.result
      : "";
  const fullText = annotateAutoContinuation(streamedText || resultText);

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

  const didSendViaMessagingTool =
    messagingToolSentTexts.length > 0 ||
    messagingToolSentTargets.length > 0 ||
    Array.from(usedToolNames).some(isMessagingToolName);

  if (!resultMessage && (params.abortSignal?.aborted || timedOut)) {
    return {
      payloads: [],
      meta: {
        durationMs,
        agentMeta,
        aborted: true,
      },
      didSendViaMessagingTool,
      messagingToolSentTexts: dedupeTexts(messagingToolSentTexts),
      messagingToolSentTargets: dedupeTargets(messagingToolSentTargets),
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
    didSendViaMessagingTool,
    messagingToolSentTexts: dedupeTexts(messagingToolSentTexts),
    messagingToolSentTargets: dedupeTargets(messagingToolSentTargets),
  };
}

function dedupeTexts(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function dedupeTargets(values: MessagingToolSend[]): MessagingToolSend[] {
  const seen = new Set<string>();
  const deduped: MessagingToolSend[] = [];
  for (const target of values) {
    const key = `${target.tool}|${target.provider}|${target.accountId ?? ""}|${target.to ?? ""}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(target);
  }
  return deduped;
}

function isMessagingToolName(toolName: string): boolean {
  const normalized = toolName.trim().toLowerCase();
  const canonical = normalized.split("__").pop() ?? normalized;
  return (
    canonical === "message" || canonical === "sessions_send" || canonical.startsWith("message_")
  );
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
  if (errors.some((e) => /compaction|compact/i.test(e))) {
    return { kind: "compaction_failure", message: errorMsg };
  }
  if (errors.some((e) => /role|ordering|alternate/i.test(e))) {
    return { kind: "role_ordering", message: errorMsg };
  }
  if (errors.some((e) => /image|too.*large|max.*image|unsupported.*image/i.test(e))) {
    return { kind: "image_size", message: errorMsg };
  }

  // 其他 SDK 错误没有直接对应的 OpenClaw error kind
  // 不设置 error kind → 调用方按普通失败处理
  return undefined;
}

function annotateAutoContinuation(text: string): string {
  if (!text) {
    return text;
  }
  const marker = "User: Conversation info (untrusted metadata):";
  const atStart = text.startsWith(marker);
  const newlineIndex = text.indexOf(`\n${marker}`);
  const markerIndex = atStart ? 0 : newlineIndex >= 0 ? newlineIndex + 1 : -1;
  if (markerIndex < 0) {
    return text;
  }

  const notice = '[系统提示] 以下以 "User:" 开头的段落是模型自动续写，不代表用户真实发送的新消息。';
  const prefix = text.slice(0, markerIndex).trimEnd();
  const suffix = text.slice(markerIndex);
  if (!prefix) {
    return `${notice}\n\n${suffix}`;
  }
  return `${prefix}\n\n${notice}\n\n${suffix}`;
}
