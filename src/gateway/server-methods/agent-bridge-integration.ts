/**
 * Gateway AgentBridge Integration
 *
 * Bridges the gateway agent handler to AgentBridge for Claude Agent SDK execution.
 * This module handles:
 * - Session metadata loading and updating
 * - sdkSessionId persistence for session resume
 * - Delivery context preservation
 */

import type { OpenClawPayload } from "../../agent/agent-bridge.js";
import type { SessionEntry } from "../../config/sessions/types.js";

export type GatewayAgentRunParams = {
  message: string;
  sessionKey: string;
  workspaceDir: string;
  channel?: string;
  extraSystemPrompt?: string;
  memoryFiles?: string[];
  mcpServers?: Array<{ name: string; command: string }>;
};

export type GatewayAgentRunResult = {
  payloads: OpenClawPayload[];
  sdkSessionId?: string;
};

export type SessionLoadResult = {
  cfg: Record<string, unknown>;
  storePath?: string;
  entry?: SessionEntry & { sdkSessionId?: string };
  canonicalKey: string;
};

export type AgentBridgeLike = {
  run(): AsyncGenerator<OpenClawPayload, { payloads: OpenClawPayload[]; sdkSessionId?: string }>;
};

export type GatewayAgentRunnerDeps = {
  createBridge: (params: {
    sessionKey: string;
    workspaceDir: string;
    prompt: string;
    memoryFiles?: string[];
    mcpServers?: Array<{ name: string; command: string }>;
    sdkSessionId?: string;
    channel?: string;
    extraSystemPrompt?: string;
  }) => AgentBridgeLike;
  loadSessionEntry: (sessionKey: string) => SessionLoadResult;
  updateSessionStore: (
    storePath: string,
    updater: (store: Record<string, unknown>) => void | Promise<void>
  ) => Promise<void>;
};

export interface GatewayAgentRunner {
  run(params: GatewayAgentRunParams): AsyncGenerator<OpenClawPayload, GatewayAgentRunResult>;
}

/**
 * Create a gateway agent runner that uses AgentBridge
 */
export function createGatewayAgentRunner(deps: GatewayAgentRunnerDeps): GatewayAgentRunner {
  return {
    async *run(params: GatewayAgentRunParams): AsyncGenerator<OpenClawPayload, GatewayAgentRunResult> {
      // Load session entry
      const sessionLoad = deps.loadSessionEntry(params.sessionKey);
      const { storePath, entry, canonicalKey } = sessionLoad;

      // Get existing sdkSessionId for resume
      const existingSdkSessionId = entry?.sdkSessionId;

      // Create bridge with params
      const bridge = deps.createBridge({
        sessionKey: params.sessionKey,
        workspaceDir: params.workspaceDir,
        prompt: params.message,
        memoryFiles: params.memoryFiles,
        mcpServers: params.mcpServers,
        sdkSessionId: existingSdkSessionId,
        channel: params.channel,
        extraSystemPrompt: params.extraSystemPrompt,
      });

      // Collect payloads
      const payloads: OpenClawPayload[] = [];
      let sdkSessionId: string | undefined = existingSdkSessionId;

      // Run and yield payloads
      const generator = bridge.run();
      let result: IteratorResult<OpenClawPayload, { payloads: OpenClawPayload[]; sdkSessionId?: string }>;

      do {
        result = await generator.next();
        if (!result.done && result.value) {
          payloads.push(result.value);
          yield result.value;
        }
      } while (!result.done);

      // Get final result with sdkSessionId
      if (result.value?.sdkSessionId) {
        sdkSessionId = result.value.sdkSessionId;
      }

      // Update session store with sdkSessionId and preserve delivery metadata
      if (storePath) {
        await deps.updateSessionStore(storePath, (store) => {
          const existingEntry = (store[canonicalKey] as SessionEntry) ?? {};
          store[canonicalKey] = {
            ...existingEntry,
            // Preserve existing fields
            sessionId: entry?.sessionId ?? existingEntry.sessionId,
            updatedAt: Date.now(),
            deliveryContext: entry?.deliveryContext ?? existingEntry.deliveryContext,
            lastChannel: entry?.lastChannel ?? existingEntry.lastChannel,
            lastTo: entry?.lastTo ?? existingEntry.lastTo,
            lastAccountId: entry?.lastAccountId ?? existingEntry.lastAccountId,
            // Update sdkSessionId
            sdkSessionId,
          };
        });
      }

      return {
        payloads,
        sdkSessionId,
      };
    },
  };
}

/**
 * Default factory using real implementations
 */
export function createDefaultGatewayAgentRunner(): GatewayAgentRunner {
  // Lazy-load dependencies to avoid circular imports
  let deps: GatewayAgentRunnerDeps | undefined;

  const getDeps = (): GatewayAgentRunnerDeps => {
    if (!deps) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { loadSessionEntry } = require("../session-utils.js");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { updateSessionStore } = require("../../config/sessions.js");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AgentBridge } = require("../../agent/agent-bridge.js");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createClaudeSdkRunner } = require("../../agent/claude-sdk-runner.js");

      deps = {
        createBridge: (params) => {
          const runner = createClaudeSdkRunner();
          return new AgentBridge(params, runner);
        },
        loadSessionEntry,
        updateSessionStore,
      };
    }
    return deps;
  };

  return {
    async *run(params: GatewayAgentRunParams): AsyncGenerator<OpenClawPayload, GatewayAgentRunResult> {
      const runner = createGatewayAgentRunner(getDeps());
      return yield* runner.run(params);
    },
  };
}
