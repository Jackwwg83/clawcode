import type { RunEmbeddedPiAgentParams } from "../pi-embedded-runner/run/params.js";
import type {
  EmbeddedPiRunResult,
  EmbeddedPiRunMeta,
  EmbeddedPiAgentMeta,
} from "../pi-embedded-runner/types.js";

// Re-export upstream types for convenience
export type {
  RunEmbeddedPiAgentParams,
  EmbeddedPiRunResult,
  EmbeddedPiRunMeta,
  EmbeddedPiAgentMeta,
};

// SDK-specific types
export type ClaudeSdkRunnerConfig = {
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var. */
  apiKey?: string;
};
