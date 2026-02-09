/**
 * Gateway AgentBridge Integration Contract Tests (TDD)
 *
 * Tests verify the gateway handler correctly integrates with AgentBridge.
 * Key requirements:
 * - Gateway handler calls AgentBridge.run() for agent execution
 * - sdkSessionId is stored in session metadata after a run
 * - Existing delivery metadata and routing are preserved
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createGatewayAgentRunner,
  type GatewayAgentRunnerDeps,
  type GatewayAgentRunParams,
  type AgentBridgeLike,
} from "./agent-bridge-integration.js";

// Create a mock bridge that yields payloads
function createMockBridge(sdkSessionId?: string): AgentBridgeLike {
  return {
    async *run() {
      yield { text: "Hello" };
      yield { isComplete: true };
      return { payloads: [], sdkSessionId: sdkSessionId ?? "sdk-new-123" };
    },
  };
}

// Create mock dependencies
function createMockDeps(): GatewayAgentRunnerDeps {
  return {
    createBridge: vi.fn().mockReturnValue(createMockBridge()),
    loadSessionEntry: vi.fn(),
    updateSessionStore: vi.fn(),
  };
}

describe("Gateway AgentBridge Integration", () => {
  let deps: GatewayAgentRunnerDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
  });

  describe("createGatewayAgentRunner", () => {
    it("returns a runner with run method", () => {
      const runner = createGatewayAgentRunner(deps);
      expect(runner).toBeDefined();
      expect(typeof runner.run).toBe("function");
    });
  });

  describe("run", () => {
    it("calls loadSessionEntry with session key", async () => {
      // Given: mock session entry
      (deps.loadSessionEntry as ReturnType<typeof vi.fn>).mockReturnValue({
        cfg: {},
        storePath: "/tmp/sessions.json",
        entry: { sessionId: "existing-id", updatedAt: Date.now() },
        canonicalKey: "agent:main:main",
      });
      (deps.updateSessionStore as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const runner = createGatewayAgentRunner(deps);
      const params: GatewayAgentRunParams = {
        message: "Hello",
        sessionKey: "agent:main:main",
        workspaceDir: "/workspace",
      };

      // When: run is called
      const payloads = [];
      for await (const payload of runner.run(params)) {
        payloads.push(payload);
      }

      // Then: loadSessionEntry should be called with session key
      expect(deps.loadSessionEntry).toHaveBeenCalledWith("agent:main:main");
    });

    it("stores sdkSessionId in session metadata after run", async () => {
      // Given: session entry without sdkSessionId
      (deps.loadSessionEntry as ReturnType<typeof vi.fn>).mockReturnValue({
        cfg: {},
        storePath: "/tmp/sessions.json",
        entry: { sessionId: "existing-id", updatedAt: Date.now() },
        canonicalKey: "agent:main:main",
      });

      let capturedEntry: Record<string, unknown> | undefined;
      (deps.updateSessionStore as ReturnType<typeof vi.fn>).mockImplementation(
        async (_path, updater) => {
          const store: Record<string, unknown> = {};
          await updater(store);
          capturedEntry = store["agent:main:main"] as Record<string, unknown>;
        }
      );

      const runner = createGatewayAgentRunner(deps);
      const params: GatewayAgentRunParams = {
        message: "Hello",
        sessionKey: "agent:main:main",
        workspaceDir: "/workspace",
      };

      // When: run completes
      const payloads = [];
      for await (const payload of runner.run(params)) {
        payloads.push(payload);
      }

      // Then: sdkSessionId should be stored in session entry
      expect(deps.updateSessionStore).toHaveBeenCalled();
      expect(capturedEntry?.sdkSessionId).toBe("sdk-new-123");
    });

    it("uses existing sdkSessionId for resume", async () => {
      // Given: session entry has existing sdkSessionId
      const existingSdkSessionId = "sdk-existing-abc";
      (deps.loadSessionEntry as ReturnType<typeof vi.fn>).mockReturnValue({
        cfg: {},
        storePath: "/tmp/sessions.json",
        entry: {
          sessionId: "existing-id",
          updatedAt: Date.now(),
          sdkSessionId: existingSdkSessionId,
        },
        canonicalKey: "agent:main:main",
      });
      (deps.updateSessionStore as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const runner = createGatewayAgentRunner(deps);

      // When: run is called
      const payloads = [];
      for await (const payload of runner.run({
        message: "Continue",
        sessionKey: "agent:main:main",
        workspaceDir: "/workspace",
      })) {
        payloads.push(payload);
      }

      // Then: createBridge should be called with existing sdkSessionId
      expect(deps.createBridge).toHaveBeenCalledWith(
        expect.objectContaining({
          sdkSessionId: existingSdkSessionId,
        })
      );
    });

    it("preserves delivery metadata from session entry", async () => {
      // Given: session entry has delivery context
      const deliveryContext = {
        channel: "telegram",
        to: "+1234567890",
        accountId: "bot123",
      };
      (deps.loadSessionEntry as ReturnType<typeof vi.fn>).mockReturnValue({
        cfg: {},
        storePath: "/tmp/sessions.json",
        entry: {
          sessionId: "existing-id",
          updatedAt: Date.now(),
          deliveryContext,
          lastChannel: "telegram",
          lastTo: "+1234567890",
        },
        canonicalKey: "agent:main:main",
      });

      let capturedEntry: Record<string, unknown> | undefined;
      (deps.updateSessionStore as ReturnType<typeof vi.fn>).mockImplementation(
        async (_path, updater) => {
          const store: Record<string, unknown> = {};
          await updater(store);
          capturedEntry = store["agent:main:main"] as Record<string, unknown>;
        }
      );

      const runner = createGatewayAgentRunner(deps);

      // When: run completes
      for await (const _ of runner.run({
        message: "Hello",
        sessionKey: "agent:main:main",
        workspaceDir: "/workspace",
      })) {
        // consume
      }

      // Then: delivery metadata should be preserved
      expect(capturedEntry?.deliveryContext).toEqual(deliveryContext);
      expect(capturedEntry?.lastChannel).toBe("telegram");
      expect(capturedEntry?.lastTo).toBe("+1234567890");
    });

    it("yields payloads from AgentBridge run", async () => {
      // Given: session entry
      (deps.loadSessionEntry as ReturnType<typeof vi.fn>).mockReturnValue({
        cfg: {},
        storePath: "/tmp/sessions.json",
        entry: { sessionId: "existing-id", updatedAt: Date.now() },
        canonicalKey: "agent:main:main",
      });
      (deps.updateSessionStore as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const runner = createGatewayAgentRunner(deps);

      // When: run is called
      const payloads = [];
      for await (const payload of runner.run({
        message: "Hello",
        sessionKey: "agent:main:main",
        workspaceDir: "/workspace",
      })) {
        payloads.push(payload);
      }

      // Then: payloads should be yielded
      expect(payloads.length).toBeGreaterThanOrEqual(1);
      // Last payload should indicate completion
      const lastPayload = payloads[payloads.length - 1];
      expect(lastPayload.isComplete).toBe(true);
    });

    it("passes message and workspaceDir to createBridge", async () => {
      // Given: session entry
      (deps.loadSessionEntry as ReturnType<typeof vi.fn>).mockReturnValue({
        cfg: {},
        storePath: "/tmp/sessions.json",
        entry: { sessionId: "existing-id", updatedAt: Date.now() },
        canonicalKey: "agent:main:main",
      });
      (deps.updateSessionStore as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const runner = createGatewayAgentRunner(deps);

      // When: run is called
      for await (const _ of runner.run({
        message: "Test message",
        sessionKey: "agent:main:main",
        workspaceDir: "/my/workspace",
        channel: "telegram",
      })) {
        // consume
      }

      // Then: createBridge should be called with correct params
      expect(deps.createBridge).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Test message",
          workspaceDir: "/my/workspace",
          sessionKey: "agent:main:main",
          channel: "telegram",
        })
      );
    });
  });
});
