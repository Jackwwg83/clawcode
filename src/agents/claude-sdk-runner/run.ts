import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { query, AbortError } from "@anthropic-ai/claude-agent-sdk";
import type { RunEmbeddedPiAgentParams, EmbeddedPiRunResult } from "./types.js";
import { FailoverError } from "../failover-error.js";
import { registerSdkRun, clearSdkRun } from "./active-run-tracker.js";
import { buildSdkOptions } from "./options-builder.js";
import { mapSdkResultToRunResult } from "./result-mapper.js";
import { buildSdkPrompt } from "./session-adapter.js";
import { createStreamState, handleSdkMessage } from "./stream-adapter.js";

export async function runClaudeSdkAgent(
  params: RunEmbeddedPiAgentParams,
): Promise<EmbeddedPiRunResult> {
  const started = Date.now();
  const options = buildSdkOptions(params);
  const handle = registerSdkRun(params.sessionId);
  const state = createStreamState();

  // Timeout timer
  let timeoutTimer: NodeJS.Timeout | undefined;
  let timedOut = false;

  try {
    const prompt = buildSdkPrompt(params);
    const conversation = query({ prompt, options });

    // Wire abort to handle (so abortEmbeddedPiRun works)
    // close() 强制终止 SDK 子进程和所有资源
    handle.abort = () => conversation.close();

    // Wire external abort signal
    if (params.abortSignal) {
      params.abortSignal.addEventListener(
        "abort",
        () => {
          conversation.close();
        },
        { once: true },
      );
    }

    // Timeout
    if (params.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        conversation.close();
      }, params.timeoutMs);
    }

    let resultMessage: SDKResultMessage | undefined;

    for await (const message of conversation) {
      await handleSdkMessage(message, params, state);
      if (message.type === "result") {
        resultMessage = message;
      }
    }

    return mapSdkResultToRunResult({
      resultMessage,
      assistantTexts: state.assistantTexts,
      durationMs: Date.now() - started,
      params,
      timedOut,
    });
  } catch (error) {
    if (error instanceof AbortError) {
      // Normal abort, return gracefully
      return mapSdkResultToRunResult({
        resultMessage: undefined,
        assistantTexts: state.assistantTexts,
        durationMs: Date.now() - started,
        params,
        timedOut,
      });
    }
    // auth/billing/rate_limit → FailoverError，让外层 fallback 捕获
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("authentication") || msg.includes("unauthorized")) {
        throw new FailoverError(error.message, {
          reason: "auth",
          provider: params.provider,
          model: params.model,
          cause: error,
        });
      }
      if (msg.includes("billing")) {
        throw new FailoverError(error.message, {
          reason: "billing",
          provider: params.provider,
          model: params.model,
          cause: error,
        });
      }
      if (msg.includes("rate_limit") || msg.includes("rate limit") || msg.includes("429")) {
        throw new FailoverError(error.message, {
          reason: "rate_limit",
          provider: params.provider,
          model: params.model,
          cause: error,
        });
      }
    }
    throw error;
  } finally {
    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }
    clearSdkRun(params.sessionId, handle);
  }
}
