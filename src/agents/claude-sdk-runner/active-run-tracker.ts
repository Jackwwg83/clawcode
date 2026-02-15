import {
  setActiveEmbeddedRun,
  clearActiveEmbeddedRun,
  type EmbeddedPiQueueHandle,
} from "../pi-embedded-runner/runs.js";

/**
 * Register an SDK run in ACTIVE_EMBEDDED_RUNS.
 *
 * isStreaming() returns false:
 * - queueEmbeddedPiMessage (steer) is rejected at runs.ts:27
 * - This is correct: SDK doesn't support mid-run injection
 *
 * abort() is a no-op initially, wired to conversation.close() in run.ts.
 */
export function registerSdkRun(sessionId: string): EmbeddedPiQueueHandle {
  const handle: EmbeddedPiQueueHandle = {
    queueMessage: async () => {
      throw new Error("steer not supported in claude-sdk runtime");
    },
    isStreaming: () => false,
    isCompacting: () => false,
    abort: () => {
      // No-op initially. run.ts 启动后会设置:
      // handle.abort = () => conversation.close()
      // close() 是 Query 接口的同步方法，强制终止子进程
    },
  };
  setActiveEmbeddedRun(sessionId, handle);
  return handle;
}

export function clearSdkRun(sessionId: string, handle: EmbeddedPiQueueHandle): void {
  clearActiveEmbeddedRun(sessionId, handle);
}
