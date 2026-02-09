# Migration Plan (ClawCode)

## Phase 1: Repository Bootstrap
- Create clawcode repo structure
- Copy OpenClaw modules: channels, routing, config, sessions, memory, media, cron, utils, infra, ui
- Wire config paths to ~/.clawcode

## Phase 2: Agent Runtime
- Implement AgentBridge + Claude SDK runner
- Replace runEmbeddedPiAgent internal logic
- Add sessionKey -> sdkSessionId mapping

## Phase 3: MCP Servers
- Implement memory, sessions, message MCP servers
- Wire into AgentBridge (mcpServers + allowedTools)

## Phase 4: Full Channel Coverage
- Keep all OpenClaw channels enabled via config
- Validate Telegram/Discord/Slack, then the rest

## Phase 5: UI + Node Tools
- Serve control UI
- Wire nodes/browser/canvas MCP servers

