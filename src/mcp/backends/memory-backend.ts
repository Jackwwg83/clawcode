/**
 * Memory Backend Adapter
 *
 * Adapts MemoryIndexManager to MemoryBackend interface for MCP memory server.
 */
import type { MemoryBackend, MemorySearchResult } from "../memory-server.js";

// Internal MemorySearchResult from MemoryIndexManager includes 'source' field
type InternalMemorySearchResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: "memory" | "sessions";
};

type MemoryManager = {
  search(query: string, opts?: { maxResults?: number }): Promise<InternalMemorySearchResult[]>;
};

export type MemoryBackendDeps = {
  getManager(): Promise<MemoryManager | null>;
};

/**
 * Create memory backend adapter
 */
export function createMemoryBackend(deps: MemoryBackendDeps): MemoryBackend {
  return {
    async search(query: string, options: { maxResults: number }): Promise<MemorySearchResult[]> {
      const manager = await deps.getManager();
      if (!manager) {
        return [];
      }

      const results = await manager.search(query, { maxResults: options.maxResults });

      // Map internal results to MCP format (without 'source' field)
      return results.map((r) => ({
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        score: r.score,
        snippet: r.snippet,
      }));
    },

    async writeEntry(_params: {
      content: string;
      type: string;
      importance: string;
    }) {
      // Memory write in OpenClaw is file-based (memory files in workspace)
      // Direct API write is not supported - users should edit memory files directly
      return {
        ok: false,
        error: "Memory write not implemented - edit memory files directly in workspace",
      };
    },

    async deleteEntry(_memoryId: string) {
      // Memory delete in OpenClaw is file-based
      // Direct API delete is not supported
      return {
        ok: false,
        error: "Memory delete not implemented - edit memory files directly in workspace",
      };
    },
  };
}
