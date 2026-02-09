import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GatewayRequestContext } from "./types.js";
import { agentHandlers } from "./agent.js";

const mocks = vi.hoisted(() => ({
  loadSessionEntry: vi.fn(),
  updateSessionStore: vi.fn(),
  agentCommand: vi.fn(),
  registerAgentRunContext: vi.fn(),
  loadConfigReturn: {} as Record<string, unknown>,
  gatewayAgentRunner: {
    run: vi.fn(),
  },
  createDefaultGatewayAgentRunner: vi.fn(),
}));

// Mock GatewayAgentRunner
vi.mock("./agent-bridge-integration.js", () => ({
  createDefaultGatewayAgentRunner: mocks.createDefaultGatewayAgentRunner,
}));

vi.mock("../session-utils.js", () => ({
  loadSessionEntry: mocks.loadSessionEntry,
}));

vi.mock("../../config/sessions.js", async () => {
  const actual = await vi.importActual<typeof import("../../config/sessions.js")>(
    "../../config/sessions.js",
  );
  return {
    ...actual,
    updateSessionStore: mocks.updateSessionStore,
    resolveAgentIdFromSessionKey: () => "main",
    resolveExplicitAgentSessionKey: () => undefined,
    resolveAgentMainSessionKey: () => "agent:main:main",
  };
});

vi.mock("../../commands/agent.js", () => ({
  agentCommand: mocks.agentCommand,
}));

vi.mock("../../config/config.js", () => ({
  loadConfig: () => mocks.loadConfigReturn,
}));

vi.mock("../../agents/agent-scope.js", () => ({
  listAgentIds: () => ["main"],
}));

vi.mock("../../infra/agent-events.js", () => ({
  registerAgentRunContext: mocks.registerAgentRunContext,
  onAgentEvent: vi.fn(),
}));

vi.mock("../../sessions/send-policy.js", () => ({
  resolveSendPolicy: () => "allow",
}));

vi.mock("../../utils/delivery-context.js", async () => {
  const actual = await vi.importActual<typeof import("../../utils/delivery-context.js")>(
    "../../utils/delivery-context.js",
  );
  return {
    ...actual,
    normalizeSessionDeliveryFields: () => ({}),
  };
});

const makeContext = (): GatewayRequestContext =>
  ({
    dedupe: new Map(),
    addChatRun: vi.fn(),
    logGateway: { info: vi.fn(), error: vi.fn() },
  }) as unknown as GatewayRequestContext;

describe("gateway agent handler", () => {
  it("preserves cliSessionIds from existing session entry", async () => {
    const existingCliSessionIds = { "claude-cli": "abc-123-def" };
    const existingClaudeCliSessionId = "abc-123-def";

    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      storePath: "/tmp/sessions.json",
      entry: {
        sessionId: "existing-session-id",
        updatedAt: Date.now(),
        cliSessionIds: existingCliSessionIds,
        claudeCliSessionId: existingClaudeCliSessionId,
      },
      canonicalKey: "agent:main:main",
    });

    let capturedEntry: Record<string, unknown> | undefined;
    mocks.updateSessionStore.mockImplementation(async (_path, updater) => {
      const store: Record<string, unknown> = {};
      await updater(store);
      capturedEntry = store["agent:main:main"] as Record<string, unknown>;
    });

    mocks.agentCommand.mockResolvedValue({
      payloads: [{ text: "ok" }],
      meta: { durationMs: 100 },
    });

    const respond = vi.fn();
    await agentHandlers.agent({
      params: {
        message: "test",
        agentId: "main",
        sessionKey: "agent:main:main",
        idempotencyKey: "test-idem",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "1", method: "agent" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(mocks.updateSessionStore).toHaveBeenCalled();
    expect(capturedEntry).toBeDefined();
    expect(capturedEntry?.cliSessionIds).toEqual(existingCliSessionIds);
    expect(capturedEntry?.claudeCliSessionId).toBe(existingClaudeCliSessionId);
  });

  it("injects a timestamp into the message passed to GatewayAgentRunner", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-29T01:30:00.000Z")); // Wed Jan 28, 8:30 PM EST

    mocks.loadConfigReturn = {
      agents: {
        defaults: {
          userTimezone: "America/New_York",
        },
      },
    };

    mocks.loadSessionEntry.mockReturnValue({
      cfg: mocks.loadConfigReturn,
      storePath: "/tmp/sessions.json",
      entry: {
        sessionId: "existing-session-id",
        updatedAt: Date.now(),
      },
      canonicalKey: "agent:main:main",
    });
    mocks.updateSessionStore.mockResolvedValue(undefined);

    // Mock GatewayAgentRunner
    const mockRunner = {
      run: vi.fn().mockImplementation(async function* () {
        yield { text: "ok" };
        yield { isComplete: true };
        return { payloads: [], sdkSessionId: "sdk-123" };
      }),
    };
    mocks.createDefaultGatewayAgentRunner.mockReturnValue(mockRunner);

    const respond = vi.fn();
    await agentHandlers.agent({
      params: {
        message: "Is it the weekend?",
        agentId: "main",
        sessionKey: "agent:main:main",
        idempotencyKey: "test-timestamp-inject",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "ts-1", method: "agent" },
      client: null,
      isWebchatConnect: () => false,
    });

    // Wait for the async GatewayAgentRunner call
    await vi.waitFor(() => expect(mockRunner.run).toHaveBeenCalled());

    const callArgs = mockRunner.run.mock.calls[0][0];
    expect(callArgs.message).toBe("[Wed 2026-01-28 20:30 EST] Is it the weekend?");

    mocks.loadConfigReturn = {};
    vi.useRealTimers();
  });

  it("handles missing cliSessionIds gracefully", async () => {
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      storePath: "/tmp/sessions.json",
      entry: {
        sessionId: "existing-session-id",
        updatedAt: Date.now(),
        // No cliSessionIds or claudeCliSessionId
      },
      canonicalKey: "agent:main:main",
    });

    let capturedEntry: Record<string, unknown> | undefined;
    mocks.updateSessionStore.mockImplementation(async (_path, updater) => {
      const store: Record<string, unknown> = {};
      await updater(store);
      capturedEntry = store["agent:main:main"] as Record<string, unknown>;
    });

    mocks.agentCommand.mockResolvedValue({
      payloads: [{ text: "ok" }],
      meta: { durationMs: 100 },
    });

    const respond = vi.fn();
    await agentHandlers.agent({
      params: {
        message: "test",
        agentId: "main",
        sessionKey: "agent:main:main",
        idempotencyKey: "test-idem-2",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "2", method: "agent" },
      client: null,
      isWebchatConnect: () => false,
    });

    expect(mocks.updateSessionStore).toHaveBeenCalled();
    expect(capturedEntry).toBeDefined();
    // Should be undefined, not cause an error
    expect(capturedEntry?.cliSessionIds).toBeUndefined();
    expect(capturedEntry?.claudeCliSessionId).toBeUndefined();
  });
});

describe("gateway agent handler - GatewayAgentRunner integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadConfigReturn = {};
  });

  // Helper to create async generator from payloads
  async function* mockRunGenerator(payloads: Array<{ text?: string; isComplete?: boolean }>) {
    for (const payload of payloads) {
      yield payload;
    }
    return { payloads, sdkSessionId: "sdk-new-session-456" };
  }

  it("uses GatewayAgentRunner instead of agentCommand", async () => {
    // Given: session entry exists
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      storePath: "/tmp/sessions.json",
      entry: {
        sessionId: "existing-session-id",
        updatedAt: Date.now(),
      },
      canonicalKey: "agent:main:main",
    });
    mocks.updateSessionStore.mockResolvedValue(undefined);

    // Mock GatewayAgentRunner
    const mockRunner = {
      run: vi.fn().mockReturnValue(mockRunGenerator([{ text: "Hello" }, { isComplete: true }])),
    };
    mocks.createDefaultGatewayAgentRunner.mockReturnValue(mockRunner);

    const respond = vi.fn();
    const context = makeContext();

    // When: agent handler is called
    await agentHandlers.agent({
      params: {
        message: "test message",
        agentId: "main",
        sessionKey: "agent:main:main",
        idempotencyKey: "test-runner-idem",
      },
      respond,
      context,
      req: { type: "req", id: "runner-1", method: "agent" },
      client: null,
      isWebchatConnect: () => false,
    });

    // Wait for async run to complete
    await vi.waitFor(() => expect(mocks.createDefaultGatewayAgentRunner).toHaveBeenCalled());

    // Then: GatewayAgentRunner should be created and run called
    expect(mocks.createDefaultGatewayAgentRunner).toHaveBeenCalled();
    expect(mockRunner.run).toHaveBeenCalled();

    // And: agentCommand should NOT be called
    expect(mocks.agentCommand).not.toHaveBeenCalled();
  });

  it("passes sessionKey and message to GatewayAgentRunner", async () => {
    mocks.loadSessionEntry.mockReturnValue({
      cfg: { workspaceDir: "/test/workspace" },
      storePath: "/tmp/sessions.json",
      entry: {
        sessionId: "existing-session-id",
        updatedAt: Date.now(),
      },
      canonicalKey: "agent:main:main",
    });
    mocks.updateSessionStore.mockResolvedValue(undefined);

    const mockRunner = {
      run: vi.fn().mockReturnValue(mockRunGenerator([{ text: "Hi" }, { isComplete: true }])),
    };
    mocks.createDefaultGatewayAgentRunner.mockReturnValue(mockRunner);

    const respond = vi.fn();
    await agentHandlers.agent({
      params: {
        message: "Hello SDK",
        agentId: "main",
        sessionKey: "agent:main:main",
        idempotencyKey: "test-params-idem",
        channel: "telegram",
        extraSystemPrompt: "Be helpful",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "params-1", method: "agent" },
      client: null,
      isWebchatConnect: () => false,
    });

    await vi.waitFor(() => expect(mockRunner.run).toHaveBeenCalled());

    // Verify run params
    const runParams = mockRunner.run.mock.calls[0][0];
    expect(runParams.sessionKey).toBe("agent:main:main");
    expect(runParams.message).toContain("Hello SDK");
    expect(runParams.channel).toBeDefined();
    expect(runParams.extraSystemPrompt).toBe("Be helpful");
  });

  it("preserves sdkSessionId from session entry for resume", async () => {
    // Given: session entry has existing sdkSessionId
    const existingSdkSessionId = "sdk-existing-789";
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      storePath: "/tmp/sessions.json",
      entry: {
        sessionId: "existing-session-id",
        updatedAt: Date.now(),
        sdkSessionId: existingSdkSessionId,
      },
      canonicalKey: "agent:main:main",
    });
    mocks.updateSessionStore.mockResolvedValue(undefined);

    const mockRunner = {
      run: vi.fn().mockReturnValue(mockRunGenerator([{ isComplete: true }])),
    };
    mocks.createDefaultGatewayAgentRunner.mockReturnValue(mockRunner);

    const respond = vi.fn();
    await agentHandlers.agent({
      params: {
        message: "continue",
        agentId: "main",
        sessionKey: "agent:main:main",
        idempotencyKey: "test-resume-idem",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "resume-1", method: "agent" },
      client: null,
      isWebchatConnect: () => false,
    });

    await vi.waitFor(() => expect(mockRunner.run).toHaveBeenCalled());

    // GatewayAgentRunner internally handles sdkSessionId - just verify it was called
    // The actual sdkSessionId handling is tested in agent-bridge-integration.test.ts
    expect(mockRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "agent:main:main",
      }),
    );
  });

  it("preserves delivery metadata when using GatewayAgentRunner", async () => {
    // Given: session entry has delivery context
    const deliveryContext = {
      channel: "telegram",
      to: "+1234567890",
      accountId: "bot123",
    };
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      storePath: "/tmp/sessions.json",
      entry: {
        sessionId: "existing-session-id",
        updatedAt: Date.now(),
        deliveryContext,
        lastChannel: "telegram",
        lastTo: "+1234567890",
        lastAccountId: "bot123",
      },
      canonicalKey: "agent:main:main",
    });

    let capturedEntry: Record<string, unknown> | undefined;
    mocks.updateSessionStore.mockImplementation(async (_path, updater) => {
      const store: Record<string, unknown> = {};
      await updater(store);
      capturedEntry = store["agent:main:main"] as Record<string, unknown>;
    });

    const mockRunner = {
      run: vi.fn().mockReturnValue(mockRunGenerator([{ isComplete: true }])),
    };
    mocks.createDefaultGatewayAgentRunner.mockReturnValue(mockRunner);

    const respond = vi.fn();
    await agentHandlers.agent({
      params: {
        message: "test",
        agentId: "main",
        sessionKey: "agent:main:main",
        idempotencyKey: "test-delivery-idem",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "delivery-1", method: "agent" },
      client: null,
      isWebchatConnect: () => false,
    });

    await vi.waitFor(() => expect(mockRunner.run).toHaveBeenCalled());

    // The handler's initial session update should preserve delivery metadata
    expect(capturedEntry?.lastChannel).toBe("telegram");
    expect(capturedEntry?.lastTo).toBe("+1234567890");
    expect(capturedEntry?.lastAccountId).toBe("bot123");
  });

  it("responds with completed status after GatewayAgentRunner finishes", async () => {
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      storePath: "/tmp/sessions.json",
      entry: {
        sessionId: "existing-session-id",
        updatedAt: Date.now(),
      },
      canonicalKey: "agent:main:main",
    });
    mocks.updateSessionStore.mockResolvedValue(undefined);

    // Track when run completes
    let runCompleted: () => void;
    const runCompletedPromise = new Promise<void>((resolve) => {
      runCompleted = resolve;
    });

    // Use mockImplementation to create fresh generator each call
    const mockRunner = {
      run: vi.fn().mockImplementation(async function* () {
        yield { text: "Done" };
        yield { isComplete: true };
        runCompleted();
        return { payloads: [], sdkSessionId: "sdk-complete-123" };
      }),
    };
    mocks.createDefaultGatewayAgentRunner.mockReturnValue(mockRunner);

    const respond = vi.fn();
    await agentHandlers.agent({
      params: {
        message: "test",
        agentId: "main",
        sessionKey: "agent:main:main",
        idempotencyKey: "test-complete-idem",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "complete-1", method: "agent" },
      client: null,
      isWebchatConnect: () => false,
    });

    // First response is "accepted"
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ status: "accepted" }),
      undefined,
      expect.anything(),
    );

    // Wait for the generator to complete and then a tick for .then() to execute
    await runCompletedPromise;
    await new Promise((r) => setTimeout(r, 50));

    // Second response should be "ok" with result
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({ status: "ok" }),
      undefined,
      expect.anything(),
    );
  });

  it("passes mcpServers to GatewayAgentRunner with all 6 server commands", async () => {
    mocks.loadSessionEntry.mockReturnValue({
      cfg: {},
      storePath: "/tmp/sessions.json",
      entry: {
        sessionId: "existing-session-id",
        updatedAt: Date.now(),
      },
      canonicalKey: "agent:main:main",
    });
    mocks.updateSessionStore.mockResolvedValue(undefined);

    const mockRunner = {
      run: vi.fn().mockImplementation(async function* () {
        yield { text: "Hi" };
        yield { isComplete: true };
        return { payloads: [], sdkSessionId: "sdk-mcp-123" };
      }),
    };
    mocks.createDefaultGatewayAgentRunner.mockReturnValue(mockRunner);

    const respond = vi.fn();
    await agentHandlers.agent({
      params: {
        message: "test",
        agentId: "main",
        sessionKey: "agent:main:main",
        idempotencyKey: "test-mcp-servers-idem",
      },
      respond,
      context: makeContext(),
      req: { type: "req", id: "mcp-1", method: "agent" },
      client: null,
      isWebchatConnect: () => false,
    });

    await vi.waitFor(() => expect(mockRunner.run).toHaveBeenCalled());

    // Verify mcpServers is passed with all 6 servers
    const runParams = mockRunner.run.mock.calls[0][0];
    expect(runParams.mcpServers).toBeDefined();
    expect(runParams.mcpServers).toHaveLength(6);

    const serverNames = runParams.mcpServers.map((s: { name: string }) => s.name);
    expect(serverNames).toContain("memory");
    expect(serverNames).toContain("sessions");
    expect(serverNames).toContain("message");
    expect(serverNames).toContain("nodes");
    expect(serverNames).toContain("browser");
    expect(serverNames).toContain("canvas");

    // Verify memory server has agentId in command
    const memoryServer = runParams.mcpServers.find((s: { name: string }) => s.name === "memory");
    expect(memoryServer.command).toContain("--agent-id");
    expect(memoryServer.command).toContain("main");

    // Verify nodes server has session-key in command
    const nodesServer = runParams.mcpServers.find((s: { name: string }) => s.name === "nodes");
    expect(nodesServer.command).toContain("--session-key");
    expect(nodesServer.command).toContain("agent:main:main");

    // Verify commands use absolute path (not just 'openclaw')
    // Commands should use node + absolute path to openclaw.mjs
    expect(memoryServer.command).toMatch(/node|openclaw/);
    expect(memoryServer.command).toContain("mcp");
    expect(memoryServer.command).toContain("--server");
    expect(memoryServer.command).toContain("memory");
  });

  it("handles paths with spaces correctly in mcpServers command", async () => {
    // Save original values
    const originalExecPath = process.execPath;
    const originalArgv1 = process.argv[1];

    // Mock paths with spaces
    Object.defineProperty(process, "execPath", {
      value: "/path with spaces/to node/node",
      configurable: true,
    });
    process.argv[1] = "/another path/with spaces/openclaw.mjs";

    try {
      mocks.loadSessionEntry.mockReturnValue({
        cfg: {},
        storePath: "/tmp/sessions.json",
        entry: {
          sessionId: "existing-session-id",
          updatedAt: Date.now(),
        },
        canonicalKey: "agent:main:main",
      });
      mocks.updateSessionStore.mockResolvedValue(undefined);

      const mockRunner = {
        run: vi.fn().mockImplementation(async function* () {
          yield { text: "Hi" };
          yield { isComplete: true };
          return { payloads: [], sdkSessionId: "sdk-spaces-123" };
        }),
      };
      mocks.createDefaultGatewayAgentRunner.mockReturnValue(mockRunner);

      const respond = vi.fn();
      await agentHandlers.agent({
        params: {
          message: "test",
          agentId: "main",
          sessionKey: "agent:main:main",
          idempotencyKey: "test-spaces-path-idem",
        },
        respond,
        context: makeContext(),
        req: { type: "req", id: "spaces-1", method: "agent" },
        client: null,
        isWebchatConnect: () => false,
      });

      await vi.waitFor(() => expect(mockRunner.run).toHaveBeenCalled());

      const runParams = mockRunner.run.mock.calls[0][0];
      const memoryServer = runParams.mcpServers.find((s: { name: string }) => s.name === "memory");

      // The command should properly handle paths with spaces by quoting them
      expect(memoryServer.command).toBeDefined();
      expect(typeof memoryServer.command).toBe("string");

      // Verify paths are quoted to handle spaces
      // The command should contain quoted paths like: "/path with spaces/..."
      expect(memoryServer.command).toContain('"/path with spaces/to node/node"');
      expect(memoryServer.command).toContain('"/another path/with spaces/openclaw.mjs"');

      // Verify the rest of the command is present
      expect(memoryServer.command).toContain("mcp");
      expect(memoryServer.command).toContain("--server");
      expect(memoryServer.command).toContain("memory");
      expect(memoryServer.command).toContain("--agent-id")
    } finally {
      // Restore original values
      Object.defineProperty(process, "execPath", {
        value: originalExecPath,
        configurable: true,
      });
      process.argv[1] = originalArgv1;
    }
  });
});
