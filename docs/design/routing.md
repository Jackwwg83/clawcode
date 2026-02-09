# Routing

## Goal
Keep OpenClaw routing semantics and session key rules.

## Reused Modules
- src/routing/*

## Overview
The routing system determines which agent handles incoming messages and generates stable session keys for persistence and concurrency control. It maps channel messages to agent sessions based on configurable binding rules while preserving OpenClaw's DM scoping and identity linking behavior.

## Session Key Format

Session keys follow a structured format that encodes routing information:

### Basic Format
```
agent:<agentId>:<sessionIdentifier>
```

### Main Session
The default session for an agent:
```
agent:main:main
agent:codex:main
```

### Channel-based Sessions
For group or channel conversations:
```
agent:<agentId>:<channel>:<chatType>:<peerId>
```

Examples:
- `agent:main:discord:group:123456789`
- `agent:codex:slack:channel:C1234ABC`

### DM Sessions
Direct message sessions vary by DM scope configuration:

#### `dmScope: "main"` (default)
All DMs collapse to the main session:
```
agent:main:main
```

#### `dmScope: "per-peer"`
One session per peer across all channels:
```
agent:main:dm:user123
```

#### `dmScope: "per-channel-peer"`
One session per peer per channel:
```
agent:main:discord:dm:user456
agent:main:telegram:dm:user456
```

#### `dmScope: "per-account-channel-peer"`
One session per account, channel, and peer:
```
agent:main:discord:default:dm:user789
agent:main:discord:work-account:dm:user789
```

### Thread Sessions
Threads extend the base session key with a thread marker:
```
agent:main:slack:channel:C1234ABC:thread:1234567890.123456
```

Thread sessions inherit their parent's agent binding.

### Subagent Sessions
Sessions spawned by agent tools include a subagent marker:
```
agent:main:subagent:worker1:session123
```

## Agent ID Resolution

### From Session Keys
The `parseAgentSessionKey()` function extracts the agent ID:
```typescript
parseAgentSessionKey("agent:codex:slack:dm:user123")
// Returns: { agentId: "codex", rest: "slack:dm:user123" }
```

### Agent ID Normalization
Agent IDs are normalized for consistency:
- Converted to lowercase
- Limited to 64 characters
- Must match: `^[a-z0-9][a-z0-9_-]{0,63}$`
- Invalid characters replaced with dashes
- Leading/trailing dashes stripped
- Falls back to `"main"` if empty

## Multi-Agent Routing

### Agent Bindings
Bindings map message contexts to specific agents. Configured in `config.bindings`:

```typescript
{
  bindings: [
    {
      match: { channel: "discord", peer: { kind: "dm", id: "user123" } },
      agentId: "codex"
    },
    {
      match: { channel: "slack", guildId: "T1234" },
      agentId: "support"
    }
  ]
}
```

### Binding Priority
Bindings are evaluated in precedence order:

1. **Peer match** - Specific DM, group, or channel
2. **Parent peer match** - For threads, checks parent conversation
3. **Guild match** - Discord guild/server ID
4. **Team match** - Slack/Teams workspace ID
5. **Account match** - Specific account on a channel
6. **Channel wildcard** - Match any account on a channel (`accountId: "*"`)
7. **Default** - Falls back to default agent

### Binding Evaluation
The `resolveAgentRoute()` function:
1. Filters bindings by channel and account
2. Applies precedence rules
3. Returns `ResolvedAgentRoute` with:
   - `agentId` - The selected agent
   - `sessionKey` - Full persistence key
   - `mainSessionKey` - Convenience alias
   - `matchedBy` - Debug trace of which rule matched

### Example Route Resolution
```typescript
const route = resolveAgentRoute({
  cfg: config,
  channel: "discord",
  accountId: "bot-1",
  peer: { kind: "dm", id: "user123" },
});

// Result:
// {
//   agentId: "codex",
//   channel: "discord",
//   accountId: "bot-1",
//   sessionKey: "agent:codex:main",  // dmScope: "main"
//   mainSessionKey: "agent:codex:main",
//   matchedBy: "binding.peer"
// }
```

## Channel Routing

### Message to Session Mapping
Each incoming message is routed through:

1. **Channel identification** - Extract channel name (e.g., "discord", "slack")
2. **Account resolution** - Identify bot account if multi-account
3. **Peer extraction** - Get conversation ID and type (dm/group/channel)
4. **Binding evaluation** - Match against configured rules
5. **Session key generation** - Build persistent key
6. **Agent selection** - Determine which agent handles the message

### Channel Context
Messages carry routing context:
```typescript
{
  channel: "discord",           // Channel name
  accountId: "bot-1",           // Bot account
  peer: {
    kind: "group",              // dm | group | channel
    id: "123456789"             // Conversation ID
  },
  guildId: "987654321",         // Discord-specific
  threadId: "thread123"         // Thread/topic ID
}
```

## Group vs DM Session Handling

### Group Sessions
Always create distinct sessions per group/channel:
```
agent:<agentId>:<channel>:<chatType>:<groupId>
```

Groups never collapse to the main session, regardless of `dmScope`.

### Group Threading
Threads within groups can either:
- Share the parent session (default)
- Create separate thread sessions with `:thread:<id>` suffix

Controlled by thread handling configuration.

### Group Metadata
Sessions store group context:
```typescript
{
  chatType: "group" | "channel",
  channel: "discord",
  groupId: "123456789",
  subject: "General Discussion",
  groupChannel: "#general",
  space: "workspace-name"
}
```

### DM Sessions
Behavior depends on `dmScope`:
- `"main"` - All DMs share agent's main session
- `"per-peer"` - One session per user
- `"per-channel-peer"` - One session per user per channel
- `"per-account-channel-peer"` - Fully isolated per account/channel/user

## Session Key Normalization

### Store vs Request Keys
- **Store key** - Internal format with `agent:` prefix
- **Request key** - User-facing format without prefix

Conversion:
```typescript
toAgentStoreSessionKey({ agentId: "main", requestKey: "session123" })
// Returns: "agent:main:session123"

toAgentRequestSessionKey("agent:main:session123")
// Returns: "session123"
```

### Identity Links
Users can link identities across channels:
```typescript
{
  identityLinks: {
    "john": ["discord:user123", "slack:U456", "telegram:789"]
  }
}
```

When routing DMs, the system:
1. Checks if peer ID matches any linked identity
2. Uses the canonical name for session key
3. Ensures same user → same session across channels

## Integration with Gateway Routing Logic

### Gateway Role
The gateway server:
1. Receives messages from channel monitors
2. Calls `resolveAgentRoute()` to determine routing
3. Loads session store for the agent
4. Manages agent lifecycle (start/stop)
5. Forwards messages to appropriate agent

### Session Key Lookup
Gateway maintains bidirectional mappings:
- `sessionKey` → `sessionId` (UUID)
- `sessionId` → `sessionKey`

For gateway-initiated flows:
```typescript
resolveSessionKeyForRun(runId: string)
// Looks up session key from agent run context
// Falls back to scanning session store
```

### Multi-Agent Coordination
Gateway ensures:
- Each agent has isolated session store
- Session keys include agent ID for disambiguation
- Concurrent agents don't interfere
- Proper cleanup when agents stop

### Session Store Paths
Per-agent session stores:
```
~/.clawcode/agents/<agentId>/sessions/sessions.json
~/.clawcode/agents/main/sessions/sessions.json
~/.clawcode/agents/codex/sessions/sessions.json
```

## Behavior

- Resolve agentId + sessionKey based on channel, account, peer, guild/team
- Preserve dmScope and identityLinks behavior
- Session key remains the stable identifier for agent sessions
- Support thread parent inheritance for binding evaluation
- Normalize all IDs to lowercase for consistency
- Validate agent IDs against configured agents list
- Fall back to default agent when no binding matches

## Key Functions

### `resolveAgentRoute(input: ResolveAgentRouteInput): ResolvedAgentRoute`
Main routing function. Takes message context and returns agent ID + session key.

### `buildAgentSessionKey(params): string`
Constructs session key from routing parameters.

### `parseAgentSessionKey(sessionKey): ParsedAgentSessionKey | null`
Extracts agent ID from session key.

### `normalizeAgentId(value): string`
Sanitizes agent ID to valid format.

### `resolveAgentIdFromSessionKey(sessionKey): string`
Convenience wrapper for extracting agent ID.

## Testing Considerations

- Test binding precedence order
- Verify dmScope variations
- Check identity link resolution
- Validate normalization edge cases
- Ensure thread parent inheritance
- Test multi-agent isolation
- Verify session key parsing
