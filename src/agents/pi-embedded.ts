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
import { resolveBootstrapContextForRun, makeBootstrapWarn } from "./bootstrap-files.js";
// --- ClawCode runtime routing ---
import { runEmbeddedPiAgent as runViaPiEmbedded } from "./pi-embedded-runner.js";
import { resolveRunWorkspaceDir } from "./workspace-run.js";

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
    // Load workspace context files (SOUL.md, AGENTS.md, etc.) for SDK runtime
    let enrichedParams = params;
    try {
      const workspaceResolution = resolveRunWorkspaceDir({
        workspaceDir: params.workspaceDir,
        sessionKey: params.sessionKey,
        agentId: params.agentId,
        config: params.config,
      });
      const resolvedWorkspace = workspaceResolution.workspaceDir;
      const sessionLabel = params.sessionKey ?? params.sessionId;
      const { contextFiles } = await resolveBootstrapContextForRun({
        workspaceDir: resolvedWorkspace,
        config: params.config,
        sessionKey: params.sessionKey,
        sessionId: params.sessionId,
        warn: makeBootstrapWarn({
          sessionLabel,
          warn: (message: string) => console.warn("[sdk-bootstrap]", message),
        }),
      });
      enrichedParams = { ...params, contextFiles, workspaceDir: resolvedWorkspace };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[sdk-bootstrap] Failed to load context files:", msg);
    }
    const { runClaudeSdkAgent } = await import("./claude-sdk-runner/index.js");
    return runClaudeSdkAgent(enrichedParams);
  }
  return runViaPiEmbedded(params);
}
// --- end ClawCode runtime routing ---
