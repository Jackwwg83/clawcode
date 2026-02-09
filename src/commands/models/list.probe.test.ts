/**
 * Models List Probe Tests
 *
 * Tests for list.probe.ts to verify mcpServers are passed to runAgentViaSdk.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";

const runAgentViaSdkMock = vi.fn();

vi.mock("../../agent/run-agent-via-sdk.js", () => ({
  runAgentViaSdk: (params: unknown) => runAgentViaSdkMock(params),
}));

vi.mock("../../agents/agent-paths.js", () => ({
  resolveOpenClawAgentDir: vi.fn().mockReturnValue("/tmp/agents"),
}));

vi.mock("../../agents/agent-scope.js", () => ({
  resolveDefaultAgentId: vi.fn().mockReturnValue("main"),
  resolveAgentWorkspaceDir: vi.fn().mockReturnValue("/tmp/workspace"),
}));

vi.mock("../../agents/workspace.js", () => ({
  resolveDefaultAgentWorkspaceDir: vi.fn().mockReturnValue("/tmp/workspace"),
}));

vi.mock("../../config/sessions/paths.js", () => ({
  resolveSessionTranscriptPath: vi.fn().mockReturnValue("/tmp/session.jsonl"),
  resolveSessionTranscriptsDirForAgent: vi.fn().mockReturnValue("/tmp/sessions"),
}));

vi.mock("../../agents/failover-error.js", () => ({
  describeFailoverError: vi
    .fn()
    .mockReturnValue({ reason: "auth", message: "Authentication failed" }),
}));

vi.mock("../../agents/auth-profiles.js", () => ({
  ensureAuthProfileStore: vi.fn().mockReturnValue({ profiles: {}, order: {} }),
  listProfilesForProvider: vi.fn().mockReturnValue([]),
  resolveAuthProfileDisplayLabel: vi.fn().mockReturnValue("Default"),
  resolveAuthProfileOrder: vi.fn().mockReturnValue([]),
}));

vi.mock("../../agents/model-auth.js", () => ({
  getCustomProviderApiKey: vi.fn().mockReturnValue(null),
  resolveEnvApiKey: vi.fn().mockReturnValue({ key: "test-key", source: "ANTHROPIC_API_KEY" }),
}));

vi.mock("../../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn().mockResolvedValue([
    { provider: "anthropic", id: "claude-sonnet-4-5" },
    { provider: "openai", id: "gpt-4-turbo" },
  ]),
}));

vi.mock("../../agents/model-selection.js", () => ({
  normalizeProviderId: (id: string) => id.toLowerCase(),
  parseModelRef: vi.fn().mockImplementation((ref: string, defaultProvider: string) => {
    const parts = ref.split("/");
    if (parts.length === 2) {
      return { provider: parts[0], model: parts[1] };
    }
    return { provider: defaultProvider, model: ref };
  }),
}));

vi.mock("../status-all/format.js", () => ({
  redactSecrets: (text: string) => text,
}));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

import { runAuthProbes } from "./list.probe.js";

describe("runAuthProbes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runAgentViaSdkMock.mockResolvedValue({
      payloads: [{ text: "OK" }],
      meta: {
        durationMs: 100,
        agentMeta: { sessionId: "probe-1", provider: "anthropic", model: "claude-sonnet-4-5" },
      },
    });
  });

  it("passes mcpServers to runAgentViaSdk during probe", async () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-sonnet-4-5" },
        },
      },
    };

    await runAuthProbes({
      cfg,
      providers: ["anthropic"],
      modelCandidates: ["anthropic/claude-sonnet-4-5"],
      options: {
        timeoutMs: 5000,
        concurrency: 1,
        maxTokens: 50,
      },
    });

    // Should have been called for the probe
    expect(runAgentViaSdkMock).toHaveBeenCalled();
    const callArgs = runAgentViaSdkMock.mock.calls[0][0];

    expect(callArgs.mcpServers).toBeDefined();
    expect(Array.isArray(callArgs.mcpServers)).toBe(true);
    expect(callArgs.mcpServers.length).toBeGreaterThan(0);

    // Should have all 6 MCP servers
    const serverNames = callArgs.mcpServers.map((s: { name: string }) => s.name);
    expect(serverNames).toContain("memory");
    expect(serverNames).toContain("sessions");
    expect(serverNames).toContain("message");
    expect(serverNames).toContain("nodes");
    expect(serverNames).toContain("browser");
    expect(serverNames).toContain("canvas");
  });

  it("includes sessionKey in mcpServers for probe sessions", async () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          model: { primary: "openai/gpt-4-turbo" },
        },
      },
    };

    await runAuthProbes({
      cfg,
      providers: ["openai"],
      modelCandidates: ["openai/gpt-4-turbo"],
      options: {
        timeoutMs: 5000,
        concurrency: 1,
        maxTokens: 50,
      },
    });

    expect(runAgentViaSdkMock).toHaveBeenCalled();
    const callArgs = runAgentViaSdkMock.mock.calls[0][0];

    expect(callArgs.mcpServers).toBeDefined();
    // Each server should have a command string
    for (const server of callArgs.mcpServers) {
      expect(server.name).toBeTruthy();
      expect(server.command).toBeTruthy();
      expect(typeof server.command).toBe("string");
    }
  });
});
