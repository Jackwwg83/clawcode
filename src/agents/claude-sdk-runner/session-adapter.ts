import type {
  SDKResultMessage,
  SDKUserMessage,
  NonNullableUsage,
} from "@anthropic-ai/claude-agent-sdk";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import fs from "node:fs/promises";
import type { RunEmbeddedPiAgentParams } from "./types.js";
import { getHistoryLimitFromSessionKey, limitHistoryTurns } from "../pi-embedded-runner/history.js";
import { acquireSessionWriteLock } from "../session-write-lock.js";

type SessionBranchEntry = {
  type: string;
  message?: { role?: string; content?: unknown };
};

type SessionUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
};

type SdkSessionMeta = {
  resumeSessionId?: string;
  updatedAt?: string;
};

/**
 * Session adapter for Claude SDK runner.
 *
 * Design principle:
 * - OpenClaw SessionManager is the source of truth
 * - SDK sessions are persistent (persistSession: true) to support multi-turn resume
 * - History is passed to SDK via the prompt parameter
 * - Results are written back to SessionManager by the caller
 *
 * Phase 4 MVP: single-turn only.
 * Multi-turn resume requires reading existing transcript and
 * converting to SDK's multi-turn format, which is complex.
 */

/**
 * Build SDK prompt from OpenClaw session context.
 *
 * For single-turn: just use params.prompt directly.
 * For multi-turn resume: would need to read session transcript
 * and convert to SDK's AsyncIterable<SDKUserMessage> format.
 */
export function buildSdkPrompt(
  params: RunEmbeddedPiAgentParams,
  options?: { skipHistory?: boolean },
): string | AsyncIterable<SDKUserMessage> {
  if (options?.skipHistory) {
    return params.prompt;
  }
  const history = loadSessionHistoryLines(params);
  if (history.length === 0) {
    return params.prompt;
  }
  const prompt = [
    "Conversation history from OpenClaw session memory:",
    ...history,
    "",
    "Continue the same conversation and reply to the latest user message below.",
    `User: ${params.prompt}`,
  ].join("\n");
  return prompt;
}

export async function persistSdkTurnToSession(
  params: RunEmbeddedPiAgentParams,
  turn: {
    assistantText: string;
    resultMessage: SDKResultMessage | undefined;
    errorMessage?: string;
  },
): Promise<void> {
  const lock = await acquireSessionWriteLock({ sessionFile: params.sessionFile });
  try {
    const sessionManager = SessionManager.open(params.sessionFile);
    const promptText = params.prompt.trim();
    if (promptText) {
      sessionManager.appendMessage({
        role: "user",
        content: [{ type: "text", text: promptText }],
        timestamp: Date.now(),
      } as Parameters<typeof sessionManager.appendMessage>[0]);
    }

    const resultMessage = turn.resultMessage;
    const fallbackResultText =
      resultMessage?.type === "result" && resultMessage.subtype === "success"
        ? resultMessage.result
        : "";
    const assistantText = (turn.assistantText || fallbackResultText).trim();
    const isError = resultMessage?.type === "result" && resultMessage.subtype !== "success";
    const assistantErrorMessage = (
      isError ? resultMessage.errors.join("; ") : turn.errorMessage
    )?.trim();

    if (!assistantText && !assistantErrorMessage) {
      return;
    }

    sessionManager.appendMessage({
      role: "assistant",
      content: assistantText ? [{ type: "text", text: assistantText }] : [],
      stopReason: assistantErrorMessage ? "error" : (resultMessage?.stop_reason ?? "stop"),
      errorMessage: assistantErrorMessage,
      api: "anthropic-messages",
      provider: params.provider ?? "anthropic",
      model: params.model ?? "claude-opus-4-6",
      usage: buildSessionUsage(resultMessage?.type === "result" ? resultMessage.usage : undefined),
      timestamp: Date.now(),
    } as Parameters<typeof sessionManager.appendMessage>[0]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[claude-sdk-runner] failed to persist session turn: ${message}`);
  } finally {
    await lock.release();
  }
}

export async function loadSdkResumeSessionId(
  params: Pick<RunEmbeddedPiAgentParams, "sessionFile">,
): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(getSdkSessionMetaFile(params.sessionFile), "utf8");
    const parsed = JSON.parse(raw) as SdkSessionMeta;
    const sessionId = parsed.resumeSessionId?.trim();
    return sessionId || undefined;
  } catch {
    return undefined;
  }
}

export async function persistSdkResumeSessionId(params: {
  sessionFile: string;
  resultMessage?: SDKResultMessage;
}): Promise<void> {
  const resumeSessionId = params.resultMessage?.session_id?.trim();
  if (!resumeSessionId) {
    return;
  }
  const meta: SdkSessionMeta = {
    resumeSessionId,
    updatedAt: new Date().toISOString(),
  };
  try {
    await fs.writeFile(getSdkSessionMetaFile(params.sessionFile), JSON.stringify(meta), "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[claude-sdk-runner] failed to persist sdk session id: ${message}`);
  }
}

function getSdkSessionMetaFile(sessionFile: string): string {
  return `${sessionFile}.claude-sdk.json`;
}

function loadSessionHistoryLines(params: RunEmbeddedPiAgentParams): string[] {
  try {
    const sessionManager = SessionManager.open(params.sessionFile);
    const branch = sessionManager.getBranch() as SessionBranchEntry[];
    const messages: AgentMessage[] = [];
    for (const entry of branch) {
      if (entry.type !== "message") {
        continue;
      }
      const role = entry.message?.role;
      if (role !== "user" && role !== "assistant") {
        continue;
      }
      const text = extractTextFromContent(entry.message?.content);
      if (!text) {
        continue;
      }
      messages.push({
        role: role,
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      } as unknown as AgentMessage);
    }

    if (messages.length === 0) {
      return [];
    }

    const historyLimit = resolveHistoryLimit(params);
    const limitedMessages = limitHistoryTurns(messages, historyLimit);
    let trimmed = limitedMessages
      .map((message) => {
        if ((message.role !== "user" && message.role !== "assistant") || !("content" in message)) {
          return "";
        }
        const content = (message as { content?: unknown }).content;
        const text = typeof content === "string" ? content.trim() : extractTextFromContent(content);
        if (!text) {
          return "";
        }
        return `${message.role === "user" ? "User" : "Assistant"}: ${text}`;
      })
      .filter(Boolean);
    const currentPrompt = params.prompt.trim();
    if (currentPrompt) {
      const duplicateTail = `User: ${currentPrompt}`;
      if (trimmed[trimmed.length - 1] === duplicateTail) {
        trimmed = trimmed.slice(0, -1);
      }
    }

    if (trimmed.length === 0) {
      return [];
    }
    return trimmed;
  } catch {
    return [];
  }
}

function resolveHistoryLimit(params: RunEmbeddedPiAgentParams): number | undefined {
  const sessionKey = params.sessionKey ?? params.sessionId;
  return getHistoryLimitFromSessionKey(sessionKey, params.config);
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  const texts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const text = (block as { text?: unknown }).text;
    if (typeof text === "string" && text.trim()) {
      texts.push(text.trim());
    }
  }
  return texts.join("\n");
}

function buildSessionUsage(usage: NonNullableUsage | undefined): SessionUsage {
  const input = usage?.input_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;
  const cacheRead = usage?.cache_read_input_tokens ?? 0;
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

/**
 * Extract session-relevant data from SDK result
 * for writing back to OpenClaw SessionManager.
 */
export function extractSessionData(resultMessage: SDKResultMessage | undefined): {
  sdkSessionId?: string;
  tokenUsage?: { input: number; output: number; cacheRead: number; cacheWrite: number };
} {
  if (!resultMessage || resultMessage.type !== "result") {
    return {};
  }

  return {
    sdkSessionId: resultMessage.session_id,
    tokenUsage: resultMessage.usage
      ? {
          input: resultMessage.usage.input_tokens,
          output: resultMessage.usage.output_tokens,
          cacheRead: resultMessage.usage.cache_read_input_tokens,
          cacheWrite: resultMessage.usage.cache_creation_input_tokens,
        }
      : undefined,
  };
}
