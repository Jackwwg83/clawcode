import type { RunEmbeddedPiAgentParams } from "./types.js";

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
): string | AsyncIterable<import("@anthropic-ai/claude-agent-sdk").SDKUserMessage> {
  // Phase 4 MVP: single-turn, use prompt directly
  // Multi-turn resume is a future enhancement
  return params.prompt;
}

/**
 * Extract session-relevant data from SDK result
 * for writing back to OpenClaw SessionManager.
 */
export function extractSessionData(
  resultMessage: import("@anthropic-ai/claude-agent-sdk").SDKResultMessage | undefined,
): {
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
