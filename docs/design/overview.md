# ClawCode Design Overview

## Positioning
ClawCode is the Claude Agent SDK edition of OpenClaw. The goal is to keep the OpenClaw architecture and features intact, while replacing the agent runtime with Claude Agent SDK.

## Core Principles
- **Primary rule: minimize changes. Replace only the agent runtime with Claude Agent SDK; keep everything else as close to OpenClaw as possible.**
- Reuse OpenClaw modules wherever possible.
- Replace only the agent runtime and the tool bridge.
- Keep behavior compatible with OpenClaw channels, routing, sessions, memory, media, cron, and UI.
- Use ~/.clawcode for all local state and config.
- Let Claude Agent SDK handle model/provider selection.

## Non-Goals
- No re-architecture of the Gateway or Channels.
- No migration of embeddings or memory providers to Claude-only.
- No rewrite of the UI.

## High-Level Architecture

Channels -> Gateway -> AgentBridge -> Claude Agent SDK
                         |
                         +-> MCP servers (memory / sessions / message / nodes / browser / canvas)

## Major Components
- Gateway: control plane, transport, sessions, channel lifecycle.
- Channels: adapters + plugin lifecycle.
- Routing: agent/session key resolution.
- AgentBridge: maps OpenClaw run params to Claude Agent SDK.
- MCP Servers: expose OpenClaw tools to the SDK.
- Memory: OpenClaw vector + FTS search, unchanged.
- Media, Cron, UI: unchanged.

## Repository Conventions
- CLI: clawcode
- Config dir: ~/.clawcode
- Config file: ~/.clawcode/config.json (same schema as OpenClaw unless noted)
- Session dir: ~/.clawcode/sessions
- Memory db: ~/.clawcode/memory

## Compatibility Notes
- OpenClaw schema is preserved where feasible.
- Model selection and auth profiles are delegated to Claude Agent SDK. OpenClaw model fallback logic is not used.
- Tool permissioning is enforced by OpenClaw allowlist and Claude Code Hooks.
