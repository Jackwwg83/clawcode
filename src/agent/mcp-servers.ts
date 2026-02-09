import { resolveAgentIdFromSessionKey } from "../config/sessions.js";

/**
 * Construct stable MCP server commands using process.execPath and argv[1]
 * This ensures the commands work regardless of PATH configuration
 * Paths are quoted to handle spaces correctly
 */
export function buildMcpServers(params: {
  sessionKey?: string;
  agentId?: string;
}): Array<{ name: string; command: string }> {
  // Get execution paths
  const execPath = process.execPath;
  const scriptPath = process.argv[1] ?? "openclaw";

  // Shell-escape a path by wrapping in quotes and escaping internal quotes
  const shellQuote = (p: string): string => `"${p.replace(/"/g, '\\"')}"`;
  const mcpBase = `${shellQuote(execPath)} ${shellQuote(scriptPath)} mcp`;

  // Resolve sessionKey and agentId
  const resolvedSessionKey = params.sessionKey?.trim() || "agent:main:main";
  const resolvedAgentId =
    params.agentId ?? resolveAgentIdFromSessionKey(params.sessionKey?.trim()) ?? "main";

  // Construct mcpServers for Claude Agent SDK
  const mcpServers = [
    {
      name: "memory",
      command: `${mcpBase} --server memory --agent-id ${resolvedAgentId}`,
    },
    {
      name: "sessions",
      command: `${mcpBase} --server sessions`,
    },
    {
      name: "message",
      command: `${mcpBase} --server message`,
    },
    {
      name: "nodes",
      command: `${mcpBase} --server nodes --session-key ${resolvedSessionKey}`,
    },
    {
      name: "browser",
      command: `${mcpBase} --server browser`,
    },
    {
      name: "canvas",
      command: `${mcpBase} --server canvas`,
    },
  ];

  return mcpServers;
}
