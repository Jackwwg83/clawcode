# Gateway

## Goal
Keep OpenClaw Gateway architecture intact. Only redirect agent execution to AgentBridge.

## Reused Modules
- src/gateway/server.impl.ts
- src/gateway/server-startup.ts
- src/gateway/server-channels.ts
- src/gateway/server-methods/*
- src/gateway/server-ws-runtime.ts

## Minimal Changes
- Replace agent handler internals to call AgentBridge (Claude SDK).
- Keep websocket protocol, control UI, health/presence, and config reload the same.
- Keep channel lifecycle (start/stop accounts) unchanged.

## Integration Points
- Agent handler -> AgentBridge
- Sessions metadata update -> session store
- Tools -> MCP servers + existing gateway tool handlers

