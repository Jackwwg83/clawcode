/**
 * LLM Slug Generator Tests
 *
 * Tests for llm-slug-generator.ts to verify mcpServers are passed to runAgentViaSdk.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OpenClawConfig } from "../config/config.js";

const runAgentViaSdkMock = vi.fn();

vi.mock("../agent/run-agent-via-sdk.js", () => ({
  runAgentViaSdk: (params: unknown) => runAgentViaSdkMock(params),
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveDefaultAgentId: vi.fn().mockReturnValue("main"),
  resolveAgentWorkspaceDir: vi.fn().mockReturnValue("/tmp/workspace"),
  resolveAgentDir: vi.fn().mockReturnValue("/tmp/agents"),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdtemp: vi.fn().mockResolvedValue("/tmp/openclaw-slug-123"),
    rm: vi.fn().mockResolvedValue(undefined),
  },
}));

import { generateSlugViaLLM } from "./llm-slug-generator.js";

describe("generateSlugViaLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runAgentViaSdkMock.mockResolvedValue({
      payloads: [{ text: "vendor-pitch" }],
      meta: {
        durationMs: 500,
        agentMeta: { sessionId: "slug-gen-1", provider: "anthropic", model: "claude-sonnet-4-5" },
      },
    });
  });

  it("passes mcpServers to runAgentViaSdk when generating slug", async () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-sonnet-4-5" },
        },
      },
    };

    await generateSlugViaLLM({
      sessionContent: "This is a conversation about vendor pitch strategies",
      cfg,
    });

    expect(runAgentViaSdkMock).toHaveBeenCalledTimes(1);
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

  it("includes sessionKey for temporary slug generation session", async () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-sonnet-4-5" },
        },
      },
    };

    await generateSlugViaLLM({
      sessionContent: "Bug fix discussion for authentication flow",
      cfg,
    });

    expect(runAgentViaSdkMock).toHaveBeenCalledTimes(1);
    const callArgs = runAgentViaSdkMock.mock.calls[0][0];

    expect(callArgs.mcpServers).toBeDefined();
    expect(callArgs.sessionKey).toBe("temp:slug-generator");

    // Each server should have a command string
    for (const server of callArgs.mcpServers) {
      expect(server.name).toBeTruthy();
      expect(server.command).toBeTruthy();
      expect(typeof server.command).toBe("string");
    }
  });

  it("returns slug from LLM response", async () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-sonnet-4-5" },
        },
      },
    };

    runAgentViaSdkMock.mockResolvedValueOnce({
      payloads: [{ text: "api-design" }],
      meta: {
        durationMs: 500,
        agentMeta: { sessionId: "slug-gen-2", provider: "anthropic", model: "claude-sonnet-4-5" },
      },
    });

    const result = await generateSlugViaLLM({
      sessionContent: "Discussion about API design patterns",
      cfg,
    });

    expect(result).toBe("api-design");
    expect(runAgentViaSdkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpServers: expect.any(Array),
      }),
    );
  });

  it("handles LLM errors gracefully and returns null", async () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-sonnet-4-5" },
        },
      },
    };

    runAgentViaSdkMock.mockRejectedValueOnce(new Error("API rate limit exceeded"));

    const result = await generateSlugViaLLM({
      sessionContent: "Test content",
      cfg,
    });

    expect(result).toBeNull();
    expect(runAgentViaSdkMock).toHaveBeenCalled();
  });
});
