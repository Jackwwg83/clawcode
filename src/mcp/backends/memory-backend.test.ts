/**
 * Memory Backend Adapter Tests (TDD)
 *
 * Tests verify the memory backend correctly adapts MemoryIndexManager to MemoryBackend interface.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMemoryBackend, type MemoryBackendDeps } from "./memory-backend.js";

// Mock dependencies
function createMockDeps(): MemoryBackendDeps {
  return {
    getManager: vi.fn(),
  };
}

describe("Memory Backend Adapter", () => {
  let deps: MemoryBackendDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
  });

  describe("search", () => {
    it("calls manager.search with query and maxResults", async () => {
      const mockResults = [
        { path: "/memory/note.md", startLine: 1, endLine: 5, score: 0.9, snippet: "test", source: "memory" as const },
      ];
      const mockManager = {
        search: vi.fn().mockResolvedValue(mockResults),
      };
      (deps.getManager as ReturnType<typeof vi.fn>).mockResolvedValue(mockManager);

      const backend = createMemoryBackend(deps);
      const results = await backend.search("test query", { maxResults: 5 });

      expect(deps.getManager).toHaveBeenCalled();
      expect(mockManager.search).toHaveBeenCalledWith("test query", { maxResults: 5 });
      expect(results).toHaveLength(1);
      expect(results[0].path).toBe("/memory/note.md");
      expect(results[0].score).toBe(0.9);
    });

    it("returns empty array when manager is null", async () => {
      (deps.getManager as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const backend = createMemoryBackend(deps);
      const results = await backend.search("test", { maxResults: 10 });

      expect(results).toEqual([]);
    });

    it("maps MemorySearchResult to MCP format", async () => {
      const mockResults = [
        { path: "/memory/file.md", startLine: 10, endLine: 20, score: 0.85, snippet: "content here", source: "memory" as const },
      ];
      const mockManager = { search: vi.fn().mockResolvedValue(mockResults) };
      (deps.getManager as ReturnType<typeof vi.fn>).mockResolvedValue(mockManager);

      const backend = createMemoryBackend(deps);
      const results = await backend.search("query", { maxResults: 5 });

      expect(results[0]).toEqual({
        path: "/memory/file.md",
        startLine: 10,
        endLine: 20,
        score: 0.85,
        snippet: "content here",
      });
    });
  });

  describe("writeEntry", () => {
    it("returns ok false with not implemented message", async () => {
      // Memory write is file-based in OpenClaw, not directly supported via API
      // For now, we return a graceful "not implemented" response
      const backend = createMemoryBackend(deps);
      const result = await backend.writeEntry({
        content: "test content",
        type: "note",
        importance: "normal",
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("not implemented");
    });
  });

  describe("deleteEntry", () => {
    it("returns ok false with not implemented message", async () => {
      // Memory delete is file-based in OpenClaw, not directly supported via API
      const backend = createMemoryBackend(deps);
      const result = await backend.deleteEntry("memory-123");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("not implemented");
    });
  });
});
