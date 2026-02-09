/**
 * Real Service Wiring Tests
 *
 * Tests for wiring MCP backend adapters to real OpenClaw services.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked imports
vi.mock("../../memory/search-manager.js", () => ({
  getMemorySearchManager: vi.fn(),
}));
vi.mock("../../gateway/session-utils.js", () => ({
  loadCombinedSessionStoreForGateway: vi.fn(),
  listSessionsFromStore: vi.fn(),
  readSessionMessages: vi.fn(),
}));
vi.mock("../../infra/outbound/targets.js", () => ({
  resolveOutboundTarget: vi.fn(),
}));
vi.mock("../../infra/outbound/deliver.js", () => ({
  deliverOutboundPayloads: vi.fn(),
}));
vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn(),
}));

import { getMemorySearchManager } from "../../memory/search-manager.js";
import {
  loadCombinedSessionStoreForGateway,
  listSessionsFromStore,
  readSessionMessages,
} from "../../gateway/session-utils.js";
import { resolveOutboundTarget } from "../../infra/outbound/targets.js";
import { deliverOutboundPayloads } from "../../infra/outbound/deliver.js";
import { loadConfig } from "../../config/config.js";
import {
  createRealMemoryBackend,
  createRealSessionsBackend,
  createRealMessageBackend,
} from "./real-services.js";

describe("Real Memory Backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call getMemorySearchManager and delegate search", async () => {
    const mockManager = {
      search: vi.fn().mockResolvedValue([
        {
          path: "/test/file.md",
          startLine: 1,
          endLine: 5,
          score: 0.9,
          snippet: "test content",
          source: "memory" as const,
        },
      ]),
    };
    vi.mocked(getMemorySearchManager).mockResolvedValue({ manager: mockManager });

    const cfg = { agents: {} } as any;
    const agentId = "test-agent";
    const backend = createRealMemoryBackend({ cfg, agentId });

    const results = await backend.search("test query", { maxResults: 10 });

    expect(getMemorySearchManager).toHaveBeenCalledWith({ cfg, agentId });
    expect(mockManager.search).toHaveBeenCalledWith("test query", { maxResults: 10 });
    expect(results).toEqual([
      {
        path: "/test/file.md",
        startLine: 1,
        endLine: 5,
        score: 0.9,
        snippet: "test content",
      },
    ]);
  });

  it("should return empty array when manager is null", async () => {
    vi.mocked(getMemorySearchManager).mockResolvedValue({ manager: null, error: "not found" });

    const cfg = {} as any;
    const backend = createRealMemoryBackend({ cfg, agentId: "test" });

    const results = await backend.search("query", { maxResults: 5 });

    expect(results).toEqual([]);
  });

  it("should return not implemented for writeEntry", async () => {
    const cfg = {} as any;
    const backend = createRealMemoryBackend({ cfg, agentId: "test" });

    const result = await backend.writeEntry({
      content: "test",
      type: "note",
      importance: "high",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not implemented");
  });

  it("should return not implemented for deleteEntry", async () => {
    const cfg = {} as any;
    const backend = createRealMemoryBackend({ cfg, agentId: "test" });

    const result = await backend.deleteEntry("mem-123");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not implemented");
  });
});

describe("Real Sessions Backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return SessionInfo with key/kind/channel/label/updatedAt fields for list", async () => {
    const mockStore = { "session-1": { sessionId: "sess-1", label: "test-label" } };
    vi.mocked(loadCombinedSessionStoreForGateway).mockReturnValue({
      storePath: "/test/store.json",
      store: mockStore,
    });
    vi.mocked(listSessionsFromStore).mockReturnValue({
      ts: Date.now(),
      path: "/test/store.json",
      count: 1,
      defaults: {},
      sessions: [
        {
          key: "session-1",
          kind: "direct",
          channel: "telegram",
          label: "test-label",
          updatedAt: 1234567890,
          sessionId: "sess-1", // internal field, should not be exposed
          displayName: "Display Name", // internal field, should not be exposed
        },
      ],
    } as any);

    const cfg = {} as any;
    const backend = createRealSessionsBackend({ cfg });

    const results = await backend.list();

    expect(loadCombinedSessionStoreForGateway).toHaveBeenCalledWith(cfg);
    expect(listSessionsFromStore).toHaveBeenCalledWith({
      cfg,
      storePath: "/test/store.json",
      store: mockStore,
      opts: {},
    });
    expect(results).toHaveLength(1);
    // SessionInfo fields: key, kind?, channel?, label?, updatedAt?
    expect(results[0].key).toBe("session-1");
    expect(results[0].kind).toBe("direct");
    expect(results[0].channel).toBe("telegram");
    expect(results[0].label).toBe("test-label");
    expect(results[0].updatedAt).toBe(1234567890);
    // Should NOT have sessionId or displayName (not part of SessionInfo)
    expect("sessionId" in results[0]).toBe(false);
    expect("displayName" in results[0]).toBe(false);
  });

  it("should call readSessionMessages for history", async () => {
    const mockStore = {
      "session-key": {
        sessionId: "sess-abc",
        sessionFile: "/test/sess-abc.jsonl",
      },
    };
    vi.mocked(loadCombinedSessionStoreForGateway).mockReturnValue({
      storePath: "/test/store.json",
      store: mockStore,
    });
    vi.mocked(readSessionMessages).mockReturnValue([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);

    const cfg = {} as any;
    const backend = createRealSessionsBackend({ cfg });

    const messages = await backend.history("session-key", { limit: 10 });

    expect(readSessionMessages).toHaveBeenCalledWith(
      "sess-abc",
      "/test/store.json",
      "/test/sess-abc.jsonl",
    );
    expect(messages).toHaveLength(2);
  });

  it("should return empty array when session not found for history", async () => {
    vi.mocked(loadCombinedSessionStoreForGateway).mockReturnValue({
      storePath: "/test/store.json",
      store: {},
    });

    const cfg = {} as any;
    const backend = createRealSessionsBackend({ cfg });

    const messages = await backend.history("nonexistent", { limit: 10 });

    expect(messages).toEqual([]);
  });

  it("should send message using session entry lastChannel/lastTo/lastAccountId", async () => {
    const mockStore = {
      "session-key": {
        sessionId: "sess-abc",
        lastChannel: "telegram",
        lastTo: "+1234567890",
        lastAccountId: "bot-123",
      },
    };
    vi.mocked(loadCombinedSessionStoreForGateway).mockReturnValue({
      storePath: "/test/store.json",
      store: mockStore,
    });
    vi.mocked(resolveOutboundTarget).mockReturnValue({
      ok: true,
      to: "+1234567890",
    } as any);
    vi.mocked(deliverOutboundPayloads).mockResolvedValue([
      { messageId: "msg-456" },
    ] as any);

    const cfg = {} as any;
    const backend = createRealSessionsBackend({ cfg });

    const result = await backend.send("session-key", "Hello from session!");

    expect(resolveOutboundTarget).toHaveBeenCalledWith({
      channel: "telegram",
      to: "+1234567890",
      cfg,
      accountId: "bot-123",
      mode: "explicit",
    });
    expect(deliverOutboundPayloads).toHaveBeenCalledWith({
      cfg,
      channel: "telegram",
      to: "+1234567890",
      accountId: "bot-123",
      payloads: [{ text: "Hello from session!" }],
    });
    expect(result.ok).toBe(true);
  });

  it("should return error when session not found for send", async () => {
    vi.mocked(loadCombinedSessionStoreForGateway).mockReturnValue({
      storePath: "/test/store.json",
      store: {},
    });

    const cfg = {} as any;
    const backend = createRealSessionsBackend({ cfg });

    const result = await backend.send("nonexistent", "hello");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should return error when session has no lastChannel for send", async () => {
    const mockStore = {
      "session-key": {
        sessionId: "sess-abc",
        // Missing lastChannel, lastTo
      },
    };
    vi.mocked(loadCombinedSessionStoreForGateway).mockReturnValue({
      storePath: "/test/store.json",
      store: mockStore,
    });

    const cfg = {} as any;
    const backend = createRealSessionsBackend({ cfg });

    const result = await backend.send("session-key", "hello");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("delivery context");
  });

  it("should return error when resolveOutboundTarget fails for send", async () => {
    const mockStore = {
      "session-key": {
        sessionId: "sess-abc",
        lastChannel: "telegram",
        lastTo: "invalid-target",
      },
    };
    vi.mocked(loadCombinedSessionStoreForGateway).mockReturnValue({
      storePath: "/test/store.json",
      store: mockStore,
    });
    vi.mocked(resolveOutboundTarget).mockReturnValue({
      ok: false,
      error: "Invalid target format",
    } as any);

    const cfg = {} as any;
    const backend = createRealSessionsBackend({ cfg });

    const result = await backend.send("session-key", "hello");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid target format");
  });
});

describe("Real Message Backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call resolveOutboundTarget and deliverOutboundPayloads for send", async () => {
    const cfg = { channels: {} } as any;
    vi.mocked(loadConfig).mockReturnValue(cfg);
    vi.mocked(resolveOutboundTarget).mockReturnValue({
      ok: true,
      to: "resolved-target",
    } as any);
    vi.mocked(deliverOutboundPayloads).mockResolvedValue([
      { messageId: "msg-123" },
    ] as any);

    const backend = createRealMessageBackend();

    const result = await backend.send("telegram", "+1234567890", "Hello!");

    expect(loadConfig).toHaveBeenCalled();
    expect(resolveOutboundTarget).toHaveBeenCalledWith({
      channel: "telegram",
      to: "+1234567890",
      cfg,
      mode: "explicit",
    });
    expect(deliverOutboundPayloads).toHaveBeenCalledWith({
      cfg,
      channel: "telegram",
      to: "resolved-target",
      payloads: [{ text: "Hello!" }],
    });
    expect(result.ok).toBe(true);
    expect(result.messageId).toBe("msg-123");
  });

  it("should return error when resolveOutboundTarget fails", async () => {
    const cfg = {} as any;
    vi.mocked(loadConfig).mockReturnValue(cfg);
    vi.mocked(resolveOutboundTarget).mockReturnValue({
      ok: false,
      error: "Invalid target",
    } as any);

    const backend = createRealMessageBackend();

    const result = await backend.send("telegram", "invalid", "test");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Invalid target");
  });

  it("should return error when deliverOutboundPayloads fails", async () => {
    const cfg = {} as any;
    vi.mocked(loadConfig).mockReturnValue(cfg);
    vi.mocked(resolveOutboundTarget).mockReturnValue({
      ok: true,
      to: "target",
    } as any);
    vi.mocked(deliverOutboundPayloads).mockRejectedValue(new Error("Delivery failed"));

    const backend = createRealMessageBackend();

    const result = await backend.send("telegram", "target", "test");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Delivery failed");
  });
});
