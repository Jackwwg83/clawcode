# ClawCode Agent Notes

## Project Positioning
ClawCode is the Claude Agent SDK edition of OpenClaw. **Primary rule: minimize changes. Replace only the agent runtime with Claude Agent SDK; keep everything else as close to OpenClaw as possible.** All other systems are reused where possible.

## Roles & Responsibilities
- Codex (this agent): **Architect + QA**
  - Maintain architecture/design docs (especially `docs/design/*`, `AGENTS.md`, `CONTEXT.md`).
  - Provide Claude Code with precise, step-by-step execution prompts (commands, files, tests).
  - Review Claude Code results by **reading code + verifying VM test logs**, and publish acceptance notes.
- Claude Code: **Developer**
  - Implements changes, runs tests on the **remote VM**, and returns **raw logs**.
  - Updates implementation files as instructed.

## Design Docs Index
- docs/design/overview.md
- docs/design/agent-runtime.md
- docs/design/mcp.md
- docs/design/gateway.md
- docs/design/channels.md
- docs/design/routing.md
- docs/design/config.md
- docs/design/sessions.md
- docs/design/memory.md
- docs/design/media.md
- docs/design/cron.md
- docs/design/ui.md
- docs/design/deployment.md
- docs/design/migration-plan.md
- docs/design/tdd.md
- docs/design/remote-vm.md
- docs/design/progress.md

## Design Docs Location (Reference)
- All design documents live under `docs/design/`.
- This list is authoritative for both `AGENTS.md` and `CLAUDE.md` (CLAUDE.md is a symlink to AGENTS.md).
- When making decisions or planning work, consult the relevant file from the list above.

## Conventions
- CLI name: clawcode
- Config dir: ~/.clawcode
- Model/provider selection: handled by Claude Agent SDK

## Remote VM Testing & Sync (Required)
- Remote VM has the full Claude Agent SDK environment; **all completed changes must be synced and tested there** before continuing.
- SSH: `ssh -i /Users/jackwu/Work/OCI/ec2.pem ubuntu@18.142.226.39`
- Claude Agent SDK reference guide on VM: `/home/ubuntu/jacktest/CLAUDE_AGENT_SDK_GUIDE.md`
- After each completed task:
  1) Sync the updated code to the VM.
  2) Run the relevant tests on the VM.
  3) Verify results on the VM and report them in the summary.
  
  If unsure how to sync, ask for the preferred method (rsync/scp/git).

## Context Compaction (Claude Code)
When Claude Code compresses context, keep these points in the summary:
- **Primary rule**: minimize changes; only replace agent runtime with Claude Agent SDK.
- **Docs to reference**: `docs/design/overview.md`, `docs/design/agent-runtime.md`, `docs/design/mcp.md`, `docs/design/remote-vm.md`, `docs/design/progress.md`.
- **Remote VM requirement**: changes must be synced + tested on VM (`ssh -i /Users/jackwu/Work/OCI/ec2.pem ubuntu@18.142.226.39`).
- **SDK guide**: `/home/ubuntu/jacktest/CLAUDE_AGENT_SDK_GUIDE.md` (query usage + env setup).
- **VM auth**: `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` are configured; verify with `printenv` on VM.
- **SDK options**: `settingSources: ['user'|'project'|'local']` (needs `project` to read CLAUDE.md from `cwd`), `additionalDirectories?: string[]` for extra CLAUDE.md dirs.
