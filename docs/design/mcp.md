# MCP Servers

## Goal
Expose OpenClaw tools to Claude Agent SDK via MCP, keeping existing tool behavior.

## Servers (initial set)
- memory: recall/remember/forget backed by src/memory
- sessions: list/history/spawn/send backed by src/sessions + gateway handlers
- message: direct message send and channel send
- nodes: node actions (camera, screen, notify)
- browser: bridge to OpenClaw browser control
- canvas: bridge to OpenClaw canvas host

## Naming Convention
- MCP server name: short and stable (memory, sessions, message, nodes, browser, canvas)
- Tool names: mcp__<server>__<tool>

## Process Management
- MCP servers can be launched by the Gateway (child processes) or run as sidecars.
- Use stdio transport for simplicity.

## Permissions
- Tool access controlled by:
  - OpenClaw allowlist/denylist
  - Claude Code Hooks (PreToolUse)
  - Gateway config per-channel policies

## Minimal Tool Schemas
- memory.recall(query, limit)
- memory.remember(content, type, importance)
- memory.forget(memoryId)
- sessions.list()
- sessions.history(sessionKey, limit)
- sessions.send(sessionKey, message)
- message.send(channelId, target, message)
- nodes.<action>(...)
- browser.<action>(...)
- canvas.<action>(...)

