# Channels

## Goal
Preserve OpenClaw channel support and behavior.

## Reused Modules
- src/channels/*
- src/channels/plugins/*
- src/gateway/server-channels.ts

## Notes
- Channels are long-running adapters, not MCP tools.
- Use existing allowlist, mention-gating, and command-gating logic.
- Channel-specific reply routing remains unchanged.

---

## Architecture Overview

### Channel Plugin System
ClawCode uses a plugin-based architecture for multi-platform messaging support. Each channel (Telegram, Discord, Slack, WhatsApp, Signal, iMessage, etc.) is implemented as a **plugin** that conforms to the `ChannelPlugin` interface.

**Key Principles:**
- **Plugin isolation**: Each channel is a self-contained module with its own configuration, authentication, and message handling logic
- **Runtime registry**: Channels are registered at runtime via `src/plugins/runtime.js` and loaded from `extensions/` or configured plugin paths
- **Adapter pattern**: Each plugin exposes standardized adapters (config, outbound, gateway, status, security, etc.)
- **Long-running processes**: Channels run as persistent services, not one-off tools

### Supported Channels
The following channels are currently supported:
- **Telegram** - Bot API and MTProto
- **Discord** - Bot with slash commands and message actions
- **Slack** - Bot with workspace integration
- **WhatsApp** - Multi-device web client (Baileys)
- **Signal** - CLI-based integration
- **iMessage** - macOS integration via BlueBubbles
- **Google Chat** - Workspace integration
- **MS Teams** - Enterprise messaging
- **Matrix** - Decentralized protocol
- **Urbit** - P2P messaging

Each channel implementation lives under `src/channels/plugins/` with dedicated files for configuration, outbound delivery, authentication, and message actions.

---

## Message Flow

### Inbound Path
```
Channel Platform → Channel Plugin (gateway adapter)
  → Gateway Server (src/gateway/server-channels.ts)
  → Message Router (src/routing/)
  → Agent Runtime (AgentBridge)
  → Response Generation
```

### Outbound Path
```
Agent Response/Tool Call → Outbound Delivery Layer
  → Channel Plugin (outbound adapter)
  → Channel Platform API
  → User/Group
```

**Flow Details:**
1. **Inbound message** arrives at channel-specific listener (WebSocket, webhook, polling)
2. **Gateway adapter** normalizes the message format and extracts metadata (sender, chat type, reply context)
3. **Router** determines target agent and session key based on channel, sender, and conversation context
4. **Agent runtime** processes the message via Claude Agent SDK
5. **Outbound delivery** sends response back through the channel plugin's `sendPayload` or `sendText` methods

---

## Channel Adapter Interface

Each `ChannelPlugin` exposes multiple adapters to handle different aspects of channel behavior:

### 1. Config Adapter (`ChannelConfigAdapter`)
Manages channel-specific configuration and account resolution.

**Key Methods:**
- `listAccountIds(cfg)`: Returns all configured account IDs for this channel
- `resolveAccount(cfg, accountId)`: Resolves account-specific config
- `isEnabled(account, cfg)`: Checks if account is enabled
- `isConfigured(account, cfg)`: Validates account configuration
- `resolveAllowFrom(cfg, accountId)`: Returns allowlist for DM gating

**Example:**
```typescript
config: {
  listAccountIds: (cfg) => Object.keys(cfg.telegram?.accounts ?? {}),
  resolveAccount: (cfg, accountId) => cfg.telegram?.accounts[accountId] ?? {},
  isEnabled: (account) => account.enabled !== false,
  isConfigured: (account) => Boolean(account.token)
}
```

### 2. Outbound Adapter (`ChannelOutboundAdapter`)
Handles message delivery to the channel platform.

**Key Properties:**
- `deliveryMode`: `"direct"` (bypass gateway), `"gateway"` (require gateway), or `"hybrid"`
- `textChunkLimit`: Max characters per message chunk
- `pollMaxOptions`: Max poll options supported

**Key Methods:**
- `sendPayload(ctx)`: Sends a complete reply payload (text, media, reactions)
- `sendText(ctx)`: Sends plain text message
- `sendMedia(ctx)`: Sends media attachment
- `sendPoll(ctx)`: Creates a poll/survey

### 3. Gateway Adapter (`ChannelGatewayAdapter`)
Manages channel lifecycle (start, stop, authentication).

**Key Methods:**
- `startAccount(ctx)`: Initializes and starts message listener for an account
- `stopAccount(ctx)`: Gracefully stops the listener
- `loginWithQrStart(params)`: Initiates QR-based authentication (WhatsApp, Signal)
- `logoutAccount(ctx)`: Clears credentials and logs out

**Lifecycle:**
```typescript
startAccount → Running → (messages flow) → stopAccount
```

The `ChannelManager` in `src/gateway/server-channels.ts` orchestrates all account lifecycles.

### 4. Status Adapter (`ChannelStatusAdapter`)
Provides runtime status and diagnostics.

**Key Methods:**
- `buildAccountSnapshot(params)`: Returns current account state (connected, last message time, errors)
- `probeAccount(params)`: Tests connectivity
- `collectStatusIssues(accounts)`: Identifies configuration or authentication issues

**Status Fields:**
- `running`: Is the listener active?
- `connected`: Is the WebSocket/connection established?
- `lastMessageAt`: Timestamp of last received message
- `lastError`: Most recent error message
- `reconnectAttempts`: Number of reconnection attempts

### 5. Security Adapter (`ChannelSecurityAdapter`)
Enforces DM policies and allowlists.

**Key Methods:**
- `resolveDmPolicy(ctx)`: Returns DM policy config (open, allowlist, owner)
- `collectWarnings(ctx)`: Generates security warnings for misconfigurations

**DM Policy Types:**
- `open`: Accept all messages
- `allowlist`: Only accept from approved senders
- `owner`: Only accept from configured owner
- `requireMention`: Only respond when bot is @mentioned (groups)

### 6. Threading Adapter (`ChannelThreadingAdapter`)
Manages thread/reply behavior for threaded channels (Slack, Discord).

**Key Methods:**
- `resolveReplyToMode(params)`: Returns `"off"`, `"first"` (reply to first message), or `"all"` (thread replies)
- `buildToolContext(params)`: Constructs threading context for agent tools

### 7. Message Action Adapter (`ChannelMessageActionAdapter`)
Handles agent-triggered actions (send message, create poll, etc.).

**Key Methods:**
- `listActions(cfg)`: Returns supported action names
- `handleAction(ctx)`: Executes a message action
- `supportsButtons(cfg)`: Does channel support interactive buttons?
- `extractToolSend(args)`: Parses tool call arguments

---

## Configuration Per Channel

Each channel stores its config under a top-level key in `~/.clawcode/config.json`:

### Example: Telegram
```json
{
  "telegram": {
    "enabled": true,
    "accounts": {
      "main": {
        "enabled": true,
        "token": "1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ",
        "dmPolicy": "allowlist",
        "allowFrom": [123456789, 987654321]
      }
    }
  }
}
```

### Example: WhatsApp
```json
{
  "whatsapp": {
    "enabled": true,
    "accounts": {
      "personal": {
        "enabled": true,
        "authDir": "~/.clawcode/whatsapp-sessions/personal",
        "dmPolicy": "owner",
        "allowFrom": ["+15551234567"]
      }
    }
  }
}
```

### Common Config Fields
- `enabled`: Enable/disable the entire channel
- `accounts`: Multi-account support (each account is a separate bot/session)
- `dmPolicy`: DM gating policy
- `allowFrom`: Allowlist for DM filtering
- `token` / `botToken`: API credentials
- `authDir`: Directory for persistent session data
- `groupChannels`: List of allowed group IDs

---

## Event Handling and Lifecycle

### Channel Manager Lifecycle
The `ChannelManager` (in `src/gateway/server-channels.ts`) orchestrates all channel lifecycles:

```typescript
export type ChannelManager = {
  startChannels(): Promise<void>;     // Start all enabled channels
  startChannel(channel, accountId?): Promise<void>;  // Start specific channel
  stopChannel(channel, accountId?): Promise<void>;   // Stop specific channel
  getRuntimeSnapshot(): ChannelRuntimeSnapshot;      // Get current status
  markChannelLoggedOut(channel, cleared, accountId?): void; // Handle logout
};
```

**Startup Flow:**
1. Load config from `~/.clawcode/config.json`
2. For each enabled channel:
   - Resolve account IDs via `plugin.config.listAccountIds(cfg)`
   - Check if enabled via `plugin.config.isEnabled(account, cfg)`
   - Check if configured via `plugin.config.isConfigured(account, cfg)`
   - Create AbortController for graceful shutdown
   - Call `plugin.gateway.startAccount(ctx)` with abort signal
3. Plugin starts listening for messages (WebSocket, polling, webhook)

**Shutdown Flow:**
1. Call `stopChannel(channelId)` or `stopChannel(channelId, accountId)`
2. Abort signal triggers cleanup in plugin's `startAccount` listener
3. Optional: Call `plugin.gateway.stopAccount(ctx)` for explicit cleanup
4. Wait for all pending tasks to complete
5. Mark account as `running: false`

### Event Types
Channels emit events through their gateway adapters:
- **Inbound messages**: Text, media, reactions, edits, deletions
- **Group events**: Member join/leave, topic change, admin actions
- **Status events**: Connected, disconnected, reconnecting, logged out
- **Error events**: Authentication failures, rate limits, API errors

**Error Handling:**
- All errors are caught in `ChannelManager` and logged to `channelLogs[channelId]`
- `lastError` field is updated in runtime snapshot
- Failed accounts remain disabled until configuration is fixed

### Reconnection Logic
Each channel plugin implements its own reconnection strategy:
- **Exponential backoff**: Discord, Slack (WebSocket reconnection)
- **Immediate retry**: Telegram (Bot API is stateless)
- **QR re-authentication**: WhatsApp, Signal (when session expires)
- **Max attempts**: Configurable per channel (default: 10)

**Reconnection State:**
```typescript
{
  reconnectAttempts: 3,
  lastDisconnect: {
    at: 1707500000000,
    status: 401,
    error: "Authentication failed",
    loggedOut: true
  }
}
```

---

## Channel-Specific Features

### Mention Gating (Groups)
For group chats, channels support mention-based filtering:
- **requireMention**: Agent only responds when @mentioned
- **Pattern stripping**: Remove `@botname` from message before processing
- **Fallback**: If no mention, message is ignored

**Implementation:**
- `ChannelMentionAdapter.stripMentions(text)`: Removes mention patterns
- `resolveGroupIntroHint(ctx)`: Returns hint about mention requirement

### Allowlist Matching
DM and group messages are filtered by allowlist:
- **Exact match**: Phone number, user ID, username
- **Normalized**: Lowercase, trimmed, E.164 for phone numbers
- **Wildcard**: Some channels support domain wildcards (`@example.com`)

**Matching Flow:**
```typescript
const allowFrom = plugin.config.resolveAllowFrom({ cfg, accountId });
const isAllowed = allowFrom?.includes(normalizedSenderId);
if (!isAllowed && dmPolicy === "allowlist") {
  // Reject message
}
```

### Command Gating
Channels support command-based filtering for elevated operations:
- **Commands**: `/start`, `/help`, `/status`, `/login`, etc.
- **Owner-only**: Some commands require sender to be in `allowFrom`
- **Skip when empty**: If channel has no config, skip command processing

**Adapter:**
```typescript
command: {
  enforceOwnerForCommands: true,
  skipWhenConfigEmpty: true
}
```

### Media Handling
Each channel has different media support:
- **Limits**: Max file size, supported MIME types
- **Inline**: Some channels support inline images (Slack)
- **External URLs**: Some require pre-uploaded URLs (Discord)

**Adapter:**
```typescript
outbound: {
  sendMedia: async (ctx) => {
    // Upload media to channel-specific CDN
    // Send message with media attachment
  }
}
```

---

## Integration with Gateway

The gateway server (`src/gateway/server-channels.ts`) bridges channels and the agent runtime:

### Server Startup
```typescript
const manager = createChannelManager({
  loadConfig: () => loadConfig(),
  channelLogs: { ... },
  channelRuntimeEnvs: { ... }
});

await manager.startChannels();
```

### Message Routing
When a message arrives:
1. Channel plugin's `startAccount` listener receives the message
2. Plugin normalizes message format
3. Gateway server routes to appropriate agent via session key
4. Agent processes and generates response
5. Gateway server delivers response via `deliverOutboundPayloads`

### Session Keys
Session keys identify conversations:
```
telegram:123456789            # DM with user 123456789
discord:guild:987654321       # Guild channel
whatsapp:group:abc123         # WhatsApp group
agent:mybot:telegram:123456  # Multi-agent with agent "mybot"
```

---

## Testing and Diagnostics

### Status Endpoint
Runtime status is available via `manager.getRuntimeSnapshot()`:
```typescript
{
  channels: {
    telegram: { accountId: "main", running: true, connected: true, lastMessageAt: ... },
    discord: { accountId: "main", running: false, lastError: "Not configured" }
  },
  channelAccounts: {
    telegram: {
      main: { ... },
      bot2: { ... }
    }
  }
}
```

### Health Checks
Each channel plugin can implement:
- `plugin.heartbeat.checkReady(cfg)`: Returns `{ ok: boolean, reason: string }`
- `plugin.status.probeAccount(params)`: Tests API connectivity

### Logging
Channel logs are scoped by subsystem:
```typescript
channelLogs[channelId].info("Connected to Telegram");
channelLogs[channelId].error("Authentication failed: invalid token");
```

---

## Migration from OpenClaw

ClawCode preserves OpenClaw's channel architecture with minimal changes:

### What's Unchanged
- Plugin system and adapter interfaces
- Channel configuration schema
- Message routing and session management
- Security policies (allowlist, DM gating)
- Outbound delivery logic

### What's Changed
- **Config location**: `~/.openclaw` → `~/.clawcode`
- **Agent runtime**: OpenClaw embedded agent → Claude Agent SDK via `AgentBridge`
- **MCP integration**: Channel tools are NOT exposed as MCP tools (channels remain long-running services)

### Compatibility Notes
- Legacy `~/.openclaw` configs are auto-migrated on first run
- Channel-specific auth directories remain unchanged (no migration needed)
- Existing bot tokens and credentials work as-is
