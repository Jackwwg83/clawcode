/**
 * MCP Stdio Server
 *
 * Creates MCP servers for use with Claude Agent SDK stdio transport.
 * Supports memory, sessions, message, nodes, browser, and canvas server types.
 */
import type { McpTool } from "./memory-server.js";
import { loadConfig } from "../config/config.js";
import {
  createRealMemoryBackend,
  createRealSessionsBackend,
  createRealMessageBackend,
  createRealNodesBackend,
  createRealBrowserBackend,
  createRealCanvasBackend,
} from "./backends/real-services.js";
import { createMemoryMcpServer } from "./memory-server.js";
import { createSessionsMcpServer } from "./sessions-server.js";
import { createMessageMcpServer } from "./message-server.js";
import { createNodesMcpServer } from "./nodes-server.js";
import { createBrowserMcpServer } from "./browser-server.js";
import { createCanvasMcpServer } from "./canvas-server.js";

export type StdioMcpServerOptions = {
  serverType: "memory" | "sessions" | "message" | "nodes" | "browser" | "canvas";
  agentId?: string;
  agentSessionKey?: string;
};

export interface StdioMcpServer {
  listTools(): McpTool[];
  callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/**
 * Create an MCP server for stdio transport
 */
export function createStdioMcpServer(options: StdioMcpServerOptions): StdioMcpServer {
  const { serverType, agentId, agentSessionKey } = options;
  const cfg = loadConfig();

  switch (serverType) {
    case "memory": {
      if (!agentId) {
        throw new Error("agentId is required for memory server");
      }
      const backend = createRealMemoryBackend({ cfg, agentId });
      return createMemoryMcpServer({ backend });
    }

    case "sessions": {
      const backend = createRealSessionsBackend({ cfg });
      return createSessionsMcpServer({ backend });
    }

    case "message": {
      const backend = createRealMessageBackend();
      return createMessageMcpServer({ backend });
    }

    case "nodes": {
      const backend = createRealNodesBackend({ agentSessionKey, config: cfg });
      return createNodesMcpServer({ backend });
    }

    case "browser": {
      const backend = createRealBrowserBackend();
      return createBrowserMcpServer({ backend });
    }

    case "canvas": {
      const backend = createRealCanvasBackend();
      return createCanvasMcpServer({ backend });
    }

    default:
      throw new Error(`Unknown server type: ${serverType}`);
  }
}
