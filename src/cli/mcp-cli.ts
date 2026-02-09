/**
 * MCP CLI
 *
 * Starts MCP servers for Claude Agent SDK via stdio transport.
 * Usage: openclaw mcp --server {memory|sessions|message|nodes|browser|canvas} [--agent-id <id>] [--session-key <key>]
 *
 * Implements standard MCP protocol:
 * - initialize -> notifications/initialized -> tools/list|tools/call
 * - JSON-RPC 2.0 compliant responses
 * - stdout: JSON-RPC responses only
 * - stderr: logs
 */
import type { Command } from "commander";
import { createStdioMcpServer, type StdioMcpServerOptions } from "../mcp/stdio-server.js";
import { createMcpProtocolHandler } from "../mcp/mcp-protocol.js";

export type McpCliOptions = {
  server?: string;
  agentId?: string;
  sessionKey?: string;
};

const VALID_SERVER_TYPES = ["memory", "sessions", "message", "nodes", "browser", "canvas"] as const;
type ServerType = (typeof VALID_SERVER_TYPES)[number];

// Version of this MCP server implementation
const MCP_SERVER_VERSION = "1.0.0";

/**
 * Parse and validate MCP CLI options
 */
export function parseMcpCliOptions(opts: McpCliOptions): StdioMcpServerOptions {
  const { server, agentId, sessionKey } = opts;

  if (!server) {
    throw new Error("--server is required (memory|sessions|message|nodes|browser|canvas)");
  }

  if (!VALID_SERVER_TYPES.includes(server as ServerType)) {
    throw new Error(`Invalid server type: ${server}. Must be one of: ${VALID_SERVER_TYPES.join(", ")}`);
  }

  const serverType = server as ServerType;

  if (serverType === "memory" && !agentId) {
    throw new Error("--agent-id is required for memory server");
  }

  return {
    serverType,
    agentId,
    agentSessionKey: sessionKey,
  };
}

/**
 * Run MCP server in stdio mode with standard MCP protocol
 *
 * This reads JSON-RPC requests from stdin and writes responses to stdout.
 * Logs are written to stderr to keep stdout clean for protocol.
 */
async function runStdioServer(
  server: ReturnType<typeof createStdioMcpServer>,
  serverName: string,
) {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  // Create protocol handler
  const handler = createMcpProtocolHandler({
    server,
    serverInfo: {
      name: serverName,
      version: MCP_SERVER_VERSION,
    },
  });

  // Log to stderr (not stdout)
  const log = (msg: string) => process.stderr.write(`[mcp:${serverName}] ${msg}\n`);

  log("Server started, waiting for requests...");

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const request = JSON.parse(trimmed);
      const response = await handler.handleRequest(request);

      // Notifications return null - no response
      if (response !== null) {
        process.stdout.write(JSON.stringify(response) + "\n");
      }
    } catch (err) {
      // JSON parse error
      const response = handler.handleInvalidJson(trimmed);
      process.stdout.write(JSON.stringify(response) + "\n");
    }
  }

  log("Server stdin closed, exiting.");
}

/**
 * Register MCP CLI subcommand
 */
export function registerMcpCli(program: Command) {
  program
    .command("mcp")
    .description("Start MCP server for Claude Agent SDK (stdio transport)")
    .option("--server <type>", "Server type: memory, sessions, message, nodes, browser, or canvas")
    .option("--agent-id <id>", "Agent ID (required for memory server)")
    .option("--session-key <key>", "Session key (optional, for nodes server)")
    .action(async (opts: McpCliOptions) => {
      try {
        const options = parseMcpCliOptions(opts);
        const server = createStdioMcpServer(options);
        await runStdioServer(server, options.serverType);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${error}\n`);
        process.exit(1);
      }
    });
}
