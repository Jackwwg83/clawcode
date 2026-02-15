export type {
  EmbeddedPiAgentMeta,
  EmbeddedPiCompactResult,
  EmbeddedPiRunMeta,
  EmbeddedPiRunResult,
} from "./pi-embedded-runner.js";
export {
  abortEmbeddedPiRun,
  compactEmbeddedPiSession,
  isEmbeddedPiRunActive,
  isEmbeddedPiRunStreaming,
  queueEmbeddedPiMessage,
  resolveEmbeddedSessionLane,
  waitForEmbeddedPiRunEnd,
} from "./pi-embedded-runner.js";

import type { RunEmbeddedPiAgentParams } from "./pi-embedded-runner/run/params.js";
import type { EmbeddedPiRunResult } from "./pi-embedded-runner/types.js";
// --- ClawCode runtime routing ---
import { runEmbeddedPiAgent as runViaPiEmbedded } from "./pi-embedded-runner.js";

function shouldUseClaudeSdk(params: RunEmbeddedPiAgentParams): boolean {
  if (process.env.CLAWCODE_RUNTIME !== "claude-sdk") {
    return false;
  }

  // params.provider 来自上游 resolveConfiguredModelRef() 解析后的值。
  // 但某些内部路径（如 probe）可能不传 provider。
  // 不传时不能 fallback 到 DEFAULT_PROVIDER（会误判），走 pi-embedded。
  const provider = params.provider?.trim();
  if (!provider) {
    return false;
  }

  // 只有明确是 anthropic 才走 SDK
  return provider === "anthropic";
}

export async function runEmbeddedPiAgent(
  params: RunEmbeddedPiAgentParams,
): Promise<EmbeddedPiRunResult> {
  if (shouldUseClaudeSdk(params)) {
    const { runClaudeSdkAgent } = await import("./claude-sdk-runner/index.js");
    return runClaudeSdkAgent(params);
  }
  return runViaPiEmbedded(params);
}
// --- end ClawCode runtime routing ---
