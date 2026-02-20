# Claude SDK Runtime Parity Plan

## Goal

When `CLAWCODE_RUNTIME=claude-sdk`, keep the same practical agent capability level that OpenClaw had on the PI runtime path, instead of downgrading to a text-only or built-in-tools-only mode.

## Gaps To Close

1. OpenClaw custom tools were not available in the SDK path.
2. Tool usage outcomes were not reflected in SDK run result metadata (`didSendViaMessagingTool` and message payload tracking stayed false/empty).
3. Session memory relied only on text history stitching and did not reuse SDK-native session continuity.
4. Dated Claude model IDs could fail on some gateways while short aliases were available.

## Implementation

### 1) OpenClaw Tool Bridge via SDK MCP

- Build a per-run SDK MCP server from `createOpenClawCodingTools(...)`.
- Register tools into Claude SDK via `options.mcpServers`.
- Keep PI-side tool policy resolution and channel-aware tool construction inputs when producing bridge tools.

### 2) Tool Lifecycle + Messaging Metadata Parity

- Track tool names used during SDK runs.
- Track messaging payload signals from tool input/output for message-oriented tools.
- Map those signals into final run result metadata:
  - `didSendViaMessagingTool`
  - `messagingToolSentTexts`
  - `messagingToolSentTargets`

### 3) Session Continuity Upgrade

- Persist SDK session resume metadata per OpenClaw session file.
- Reuse saved SDK session ID on later turns through `options.resume`.
- Keep OpenClaw transcript persistence as source-of-truth and fallback memory path.

### 4) Model Fallback Hardening

- If a dated Claude model ID is used, derive a short alias fallback model automatically.
- Let SDK fall back to the short alias when the dated ID is unavailable on gateway side.

## Validation

1. `pnpm build` passes.
2. Claude SDK runner unit tests pass (options/result/session/stream).
3. Remote runtime smoke check:
   - model response works,
   - tool progress/summary events still flow,
   - no regression in Telegram reply path.
