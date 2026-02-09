# Agent Runtime (Claude Agent SDK)

## Goal
Replace OpenClaw's pi-embedded agent runtime with Claude Agent SDK while keeping the call surface compatible for Gateway, Cron, and auto-reply.

## New Modules
- src/agent/agent-bridge.ts
- src/agent/claude-sdk-runner.ts

## AgentBridge Responsibilities
- Accept OpenClaw-style agent run params (sessionKey, routing info, attachments).
- Resolve or create SDK sessionId (resume support).
- Build system prompt (OpenClaw prompt + memory recall + channel context).
- Build Claude Agent SDK options (settingSources, allowedTools, hooks, mcpServers).
- Stream events and convert into OpenClaw payloads.
- Persist session metadata updates.

## Claude Agent SDK Configuration
- SDK package: `@anthropic-ai/claude-agent-sdk` (use `query()`).
- settingSources: `Array<'user'|'project'|'local'>`
  - Loads `settings.json` from user/project/local scopes.
  - Must include `"project"` to read `CLAUDE.md` from `options.cwd`.
- additionalDirectories?: `string[]`
  - Extra directories that contain `CLAUDE.md` (not a replacement for `settingSources`).
- workspaceDir -> `options.cwd` so the SDK reads the project `CLAUDE.md`.
- systemPrompt: explicit (do not rely on SDK defaults).
- allowedTools:
  - Built-ins: Read, Write, Edit, Bash, Glob, Grep, WebSearch, WebFetch, Task
  - MCP tools:
    - memory: mcp__memory__recall, mcp__memory__remember, mcp__memory__forget
    - sessions: mcp__sessions__list, mcp__sessions__history, mcp__sessions__send
    - message: mcp__message__send
    - nodes: mcp__nodes__invoke
    - browser: mcp__browser__invoke
    - canvas: mcp__canvas__invoke
- permissionMode (when needed): "bypassPermissions" or "acceptEdits".
- hooks:
  - PreToolUse: enforce OpenClaw allowlist/denylist.
  - PostToolUse: audit logging, usage stats.
  - SessionStart/End: attach session metadata.

## Anthropic Auth (Env Vars)
- Supported env vars (in precedence order):
  1) `ANTHROPIC_OAUTH_TOKEN`
  2) `ANTHROPIC_API_KEY`
  3) `ANTHROPIC_AUTH_TOKEN` (for custom base URLs)
- If multiple are set, the first one above wins.
- For local dev/VMs, prefer exporting via `~/.profile` so non-interactive shells can read them.

## Anthropic Auth (Which Key to Use)
- Claude Code / subscription auth: use a **setup-token**.
  - CLI: `openclaw models auth setup-token` (interactive) or `openclaw models auth paste-token --provider anthropic`.
  - Stores a token profile for provider `anthropic` in `auth-profiles.json`.
- Official Anthropic API: use `ANTHROPIC_API_KEY`.
  - CLI (headless): `openclaw config set env.ANTHROPIC_API_KEY "sk-ant-..."`.
  - CLI (wizard): `openclaw onboard --anthropic-api-key "$ANTHROPIC_API_KEY"`.
- Third-party Anthropic-compatible endpoint: configure a **custom provider** in `models.providers`
  with `api: "anthropic-messages"` and set the default model to `provider/model`.
  - `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` alone do not override the built-in `anthropic` base URL.
- If a gateway process is already running, restart it after updating env/config so the new auth is picked up.

## Session Mapping
- Use OpenClaw sessionKey as the stable identifier.
- Store sdkSessionId in session metadata (similar to cliSessionIds).
- Resume by passing sdkSessionId to SDK options.

## Streaming and Output Mapping
- Map Claude SDK streaming events to OpenClaw payloads:
  - text chunks -> payloads[].text
  - tool calls -> gateway tool streaming events
  - final -> block flush / message end
- Maintain compatibility with OpenClaw reply chunking and delivery logic.

## Error Handling
- Normalize SDK errors into OpenClaw error types (context overflow, tool errors, timeout).
- Always emit lifecycle end or error to keep gateway state consistent.

## Model/Provider Handling
- Model/provider selection is delegated to Claude Agent SDK.
- OpenClaw model catalogs and auth profiles are not used for Claude runs.
