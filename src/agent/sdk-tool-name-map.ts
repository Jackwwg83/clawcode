/**
 * SDK ↔ OpenClaw tool name mapping.
 *
 * Claude Agent SDK uses PascalCase tool names (Read, Write, Bash, …)
 * while OpenClaw's policy engine uses lowercase canonical names (read, write, exec, …).
 * MCP tools use the mcp__<server>__<action> convention.
 *
 * This module provides bidirectional lookups so that policy checks operate
 * on canonical names regardless of the SDK surface.
 */

/** Maps Claude Agent SDK built-in tool names to OpenClaw canonical names. */
export const SDK_TO_OPENCLAW: Record<string, string> = {
  Read: "read",
  Write: "write",
  Edit: "edit",
  Bash: "exec",
  Glob: "glob",
  Grep: "grep",
  WebSearch: "web_search",
  WebFetch: "web_fetch",
  Task: "task",
};

/** Maps MCP tool names to OpenClaw canonical names. */
export const MCP_TO_OPENCLAW: Record<string, string> = {
  mcp__memory__recall: "memory_search",
  mcp__memory__remember: "memory_get",
  mcp__memory__forget: "memory_get",
  mcp__sessions__list: "sessions_list",
  mcp__sessions__history: "sessions_history",
  mcp__sessions__send: "sessions_send",
  mcp__message__send: "message",
  mcp__browser__invoke: "browser",
  mcp__canvas__invoke: "canvas",
  mcp__nodes__invoke: "nodes",
};

/**
 * Map an SDK or MCP tool name to its OpenClaw canonical name.
 *
 * Resolution order:
 *  1. Exact match in SDK_TO_OPENCLAW
 *  2. Exact match in MCP_TO_OPENCLAW
 *  3. Fallback: lowercase the input
 */
export function mapToolToCanonical(sdkName: string): string {
  return SDK_TO_OPENCLAW[sdkName] ?? MCP_TO_OPENCLAW[sdkName] ?? sdkName.toLowerCase();
}
