/**
 * MCP Memory Server Contract Tests (TDD Red Phase)
 *
 * Tests define the expected behavior of the MCP memory server before implementation.
 * Tool names follow the pattern: mcp__memory__<tool>
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryMcpServer,
  type MemoryMcpServer,
  type MemoryBackend,
} from "./memory-server.js";

// Create mock memory backend
function createMockBackend(): MemoryBackend {
  return {
    search: vi.fn(),
    writeEntry: vi.fn(),
    deleteEntry: vi.fn(),
  };
}

describe("MCP Memory Server", () => {
  let server: MemoryMcpServer;
  let backend: MemoryBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    backend = createMockBackend();
    server = createMemoryMcpServer({ backend });
  });

  describe("tool registration", () => {
    it("exposes recall, remember, and forget tools", () => {
      const tools = server.listTools();
      expect(tools.map((t) => t.name)).toContain("mcp__memory__recall");
      expect(tools.map((t) => t.name)).toContain("mcp__memory__remember");
      expect(tools.map((t) => t.name)).toContain("mcp__memory__forget");
    });
  });

  describe("mcp__memory__recall", () => {
    it("returns ranked results from backend search", async () => {
      // Given: backend returns search results
      const mockResults = [
        { path: "MEMORY.md", startLine: 1, endLine: 10, score: 0.95, snippet: "Important note" },
        { path: "memory/notes.md", startLine: 5, endLine: 15, score: 0.8, snippet: "Another note" },
      ];
      (backend.search as ReturnType<typeof vi.fn>).mockResolvedValue(mockResults);

      // When: recall tool is called
      const result = await server.callTool("mcp__memory__recall", {
        query: "important notes",
        limit: 10,
      });

      // Then: backend search is called with correct params
      expect(backend.search).toHaveBeenCalledWith("important notes", { maxResults: 10 });

      // And: results are returned
      expect(result.results).toHaveLength(2);
      expect(result.results[0].path).toBe("MEMORY.md");
      expect(result.results[0].score).toBe(0.95);
    });

    it("uses default limit when not specified", async () => {
      // Given: backend returns empty results
      (backend.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // When: recall is called without limit
      await server.callTool("mcp__memory__recall", { query: "test" });

      // Then: default limit is used
      expect(backend.search).toHaveBeenCalledWith("test", { maxResults: 10 });
    });

    it("returns empty array when no matches", async () => {
      // Given: backend returns no results
      (backend.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      // When: recall is called
      const result = await server.callTool("mcp__memory__recall", { query: "nonexistent" });

      // Then: empty results
      expect(result.results).toEqual([]);
    });
  });

  describe("mcp__memory__remember", () => {
    it("writes entry to backend", async () => {
      // Given: backend write succeeds
      (backend.writeEntry as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        path: "MEMORY.md",
        line: 42,
      });

      // When: remember tool is called
      const result = await server.callTool("mcp__memory__remember", {
        content: "User prefers dark mode",
        type: "preference",
        importance: "high",
      });

      // Then: backend writeEntry is called
      expect(backend.writeEntry).toHaveBeenCalledWith({
        content: "User prefers dark mode",
        type: "preference",
        importance: "high",
      });

      // And: success result is returned
      expect(result.ok).toBe(true);
      expect(result.path).toBe("MEMORY.md");
    });

    it("uses default importance when not specified", async () => {
      // Given: backend write succeeds
      (backend.writeEntry as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

      // When: remember is called without importance
      await server.callTool("mcp__memory__remember", {
        content: "Some note",
        type: "note",
      });

      // Then: default importance is used
      expect(backend.writeEntry).toHaveBeenCalledWith({
        content: "Some note",
        type: "note",
        importance: "normal",
      });
    });

    it("returns error on write failure", async () => {
      // Given: backend write fails
      (backend.writeEntry as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: "Permission denied",
      });

      // When: remember is called
      const result = await server.callTool("mcp__memory__remember", {
        content: "test",
        type: "note",
      });

      // Then: error is returned
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Permission denied");
    });
  });

  describe("mcp__memory__forget", () => {
    it("removes entry from backend", async () => {
      // Given: backend delete succeeds
      (backend.deleteEntry as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

      // When: forget tool is called
      const result = await server.callTool("mcp__memory__forget", {
        memoryId: "MEMORY.md:42",
      });

      // Then: backend deleteEntry is called
      expect(backend.deleteEntry).toHaveBeenCalledWith("MEMORY.md:42");

      // And: success result is returned
      expect(result.ok).toBe(true);
    });

    it("returns error when entry not found", async () => {
      // Given: backend delete fails (not found)
      (backend.deleteEntry as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        error: "Entry not found",
      });

      // When: forget is called
      const result = await server.callTool("mcp__memory__forget", {
        memoryId: "nonexistent:99",
      });

      // Then: error is returned
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Entry not found");
    });
  });
});
