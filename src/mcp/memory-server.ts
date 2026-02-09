/**
 * MCP Memory Server
 *
 * Exposes OpenClaw memory tools to Claude Agent SDK via MCP.
 * Tool names follow the pattern: mcp__memory__<tool>
 */

export type MemorySearchResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
};

export type MemoryWriteResult = {
  ok: boolean;
  path?: string;
  line?: number;
  error?: string;
};

export type MemoryDeleteResult = {
  ok: boolean;
  error?: string;
};

/**
 * Backend interface for memory operations
 * This abstracts the actual memory storage (MemoryIndexManager)
 */
export interface MemoryBackend {
  search(query: string, options: { maxResults: number }): Promise<MemorySearchResult[]>;
  writeEntry(params: {
    content: string;
    type: string;
    importance: string;
  }): Promise<MemoryWriteResult>;
  deleteEntry(memoryId: string): Promise<MemoryDeleteResult>;
}

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export interface MemoryMcpServer {
  listTools(): McpTool[];
  callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export type MemoryMcpServerOptions = {
  backend: MemoryBackend;
};

const DEFAULT_RECALL_LIMIT = 10;
const DEFAULT_IMPORTANCE = "normal";

/**
 * Create MCP memory server instance
 */
export function createMemoryMcpServer(options: MemoryMcpServerOptions): MemoryMcpServer {
  const { backend } = options;

  const tools: McpTool[] = [
    {
      name: "mcp__memory__recall",
      description: "Search memory for relevant information",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Maximum results to return" },
        },
        required: ["query"],
      },
    },
    {
      name: "mcp__memory__remember",
      description: "Store information in memory",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "Content to remember" },
          type: { type: "string", description: "Type of memory (note, preference, fact, etc.)" },
          importance: {
            type: "string",
            enum: ["low", "normal", "high"],
            description: "Importance level",
          },
        },
        required: ["content", "type"],
      },
    },
    {
      name: "mcp__memory__forget",
      description: "Remove an entry from memory",
      inputSchema: {
        type: "object",
        properties: {
          memoryId: { type: "string", description: "ID of the memory entry to remove" },
        },
        required: ["memoryId"],
      },
    },
  ];

  return {
    listTools() {
      return tools;
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
      switch (name) {
        case "mcp__memory__recall": {
          const query = args.query as string;
          const limit =
            typeof args.limit === "number" && args.limit > 0 ? args.limit : DEFAULT_RECALL_LIMIT;
          const results = await backend.search(query, { maxResults: limit });
          return { results };
        }

        case "mcp__memory__remember": {
          const content = args.content as string;
          const type = args.type as string;
          const importance =
            typeof args.importance === "string" ? args.importance : DEFAULT_IMPORTANCE;
          const result = await backend.writeEntry({ content, type, importance });
          return result;
        }

        case "mcp__memory__forget": {
          const memoryId = args.memoryId as string;
          const result = await backend.deleteEntry(memoryId);
          return result;
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    },
  };
}
