# ClawCode Context Snapshot (2026-02-03)

## Project Goal
- ClawCode = Claude Agent SDK edition of OpenClaw.
- Primary rule: minimal changes; replace only agent runtime.
- Default state dir: `~/.clawcode`, config file name stays `openclaw.json`.
- Legacy `.openclaw` only for explicit legacy notes.

## Required Docs
- Design docs live in `docs/design/` and indexed in `AGENTS.md` (CLAUDE.md is symlink).
- Must follow TDD (red -> green -> refactor) and VM testing policy from `AGENTS.md`.

## Remote VM Policy (MANDATORY)
- SSH: `ssh -i /Users/jackwu/Work/OCI/ec2.pem ubuntu@18.142.226.39`
- All completed changes must be synced + tested on VM before continuing.
- Use VM test results as source of truth.
- VM SDK guide: `/home/ubuntu/jacktest/CLAUDE_AGENT_SDK_GUIDE.md`
- VM auth is preconfigured: `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` (verify with `printenv`).

## Completed (High Level)
- Config paths updated to `~/.clawcode`, tests + docs + UI updated.
- AgentBridge + Claude SDK Runner implemented and tests passing.
- MCP servers implemented: memory, sessions, message.
- Gateway handler now uses GatewayAgentRunner (AgentBridge) instead of legacy runtime.
- MCP backend adapters created + tests.
- Real service wiring factories added in `src/mcp/backends/real-services.ts` and tests updated.

## Current Status
- MCP stdio server + CLI + gateway mcpServers wiring are complete and VM-verified.
- MCP protocol handler hardened (JSON-RPC validation, notifications return null, init/initialized gating).
- Claude SDK runner uses `@anthropic-ai/claude-agent-sdk` with correct option mapping:
  - `settingSources: ['user'|'project'|'local']` (include `project` to read `CLAUDE.md` from `cwd`)
  - `additionalDirectories?: string[]` for extra `CLAUDE.md` dirs
  - `mcpServers` passed as Record with `{ command, args }`
- Live SDK test passes on VM when auth is configured.

## Key Files
- `src/agent/agent-bridge.ts`
- `src/agent/claude-sdk-runner.ts`
- `src/gateway/server-methods/agent.ts`
- `src/gateway/server-methods/agent-bridge-integration.ts`
- `src/mcp/memory-server.ts`, `sessions-server.ts`, `message-server.ts`
- `src/mcp/backends/real-services.ts`
- `docs/design/progress.md`

## Known Behavior Notes
- `createRealSessionsBackend().list()` fixed to return SessionInfo fields.
- `createRealSessionsBackend().send()` now uses lastChannel/lastTo/lastAccountId -> deliverOutboundPayloads.
- `createRealMessageBackend().send()` uses resolveOutboundTarget + deliverOutboundPayloads.
- `memory write/delete` still return "not implemented" (file-based memory).
 
## Next Steps
- For any new edits: sync to VM and run relevant tests before reporting completion.
