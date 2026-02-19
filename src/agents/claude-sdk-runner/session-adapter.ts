import type {
  SDKResultMessage,
  SDKUserMessage,
  NonNullableUsage,
} from "@anthropic-ai/claude-agent-sdk";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import type { OpenClawConfig } from "../../config/config.js";
import type { RunEmbeddedPiAgentParams } from "./types.js";
import { getHistoryLimitFromSessionKey } from "../pi-embedded-runner/history.js";
import { acquireSessionWriteLock } from "../session-write-lock.js";

const MAX_HISTORY_MESSAGES = 24;
const MAX_HISTORY_CHARS = 12_000;

type SessionBranchEntry = {
  type: string;
  message?: { role?: string; content?: unknown };
};

type TranscriptTurn = { role: "user" | "assistant"; text: string };

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

/**
 * Session adapter for Claude SDK runner.
 *
 * Design principle:
 * - OpenClaw SessionManager is the source of truth
 * - SDK sessions are ephemeral (persistSession: false)
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
): string | AsyncIterable<SDKUserMessage> {
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

function loadSessionHistoryLines(params: RunEmbeddedPiAgentParams): string[] {
  try {
    const sessionManager = SessionManager.open(params.sessionFile);
    const branch = sessionManager.getBranch() as SessionBranchEntry[];
    const turns: TranscriptTurn[] = [];
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
      turns.push({
        role: role as "user" | "assistant",
        text,
      });
    }

    if (turns.length === 0) {
      return [];
    }

    const historyLimit = resolveHistoryLimit(params);
    const limitedTurns = limitHistoryTurnsByUserCount(turns, historyLimit);
    let trimmed = limitedTurns
      .slice(-MAX_HISTORY_MESSAGES)
      .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`);
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

    const capped: string[] = [];
    let usedChars = 0;
    for (let i = trimmed.length - 1; i >= 0; i -= 1) {
      const line = trimmed[i];
      if (usedChars + line.length > MAX_HISTORY_CHARS) {
        if (capped.length === 0) {
          capped.unshift(line.slice(-MAX_HISTORY_CHARS));
        }
        break;
      }
      capped.unshift(line);
      usedChars += line.length;
    }
    return capped;
  } catch {
    return [];
  }
}

function resolveHistoryLimit(params: RunEmbeddedPiAgentParams): number | undefined {
  const sessionKey = params.sessionKey ?? params.sessionId;
  return getHistoryLimitFromSessionKey(sessionKey, params.config);
}

function limitHistoryTurnsByUserCount(
  turns: TranscriptTurn[],
  historyLimit: number | undefined,
): TranscriptTurn[] {
  if (!historyLimit || historyLimit <= 0) {
    return turns;
  }
  let userCount = 0;
  let start = turns.length;
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    if (turns[i].role === "user") {
      userCount += 1;
      if (userCount > historyLimit) {
        return turns.slice(start);
      }
      start = i;
    }
  }
  return turns;
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
