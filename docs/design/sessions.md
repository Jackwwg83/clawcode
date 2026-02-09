# Sessions

## Goal
Keep OpenClaw session store and add mapping to Claude SDK sessions.

## Reused Modules
- src/config/sessions/*
- src/sessions/*

## Overview
The session system manages persistent conversation state, transcript storage, and metadata for agent interactions. It maintains a session store per agent, tracks conversation history, and integrates with the Claude Agent SDK for session resumption.

## Session Store Architecture

### Directory Structure
```
~/.clawcode/
└── agents/
    ├── main/
    │   └── sessions/
    │       ├── sessions.json          # Session metadata store
    │       ├── <uuid>.jsonl           # Session transcripts
    │       └── <uuid>-topic-<id>.jsonl # Thread-specific transcripts
    └── codex/
        └── sessions/
            ├── sessions.json
            └── *.jsonl
```

### Per-Agent Isolation
Each agent maintains:
- Separate `sessions.json` metadata store
- Isolated transcript directory
- Independent session lifecycle
- No cross-agent session sharing

### Path Resolution
```typescript
// Default session store
resolveDefaultSessionStorePath(agentId?: string)
// Returns: ~/.clawcode/agents/<agentId>/sessions/sessions.json

// Session transcript
resolveSessionTranscriptPath(sessionId: string, agentId?: string, topicId?: string)
// Returns: ~/.clawcode/agents/<agentId>/sessions/<sessionId>.jsonl
// Or: ~/.clawcode/agents/<agentId>/sessions/<sessionId>-topic-<topicId>.jsonl
```

## Session Metadata: SessionEntry Type

### Core Fields
```typescript
type SessionEntry = {
  sessionId: string;              // UUID for transcript
  updatedAt: number;              // Last activity timestamp (ms)
  sessionFile?: string;           // Path to transcript file
  spawnedBy?: string;             // Parent session key (for subagents)

  // SDK Integration
  sdkSessionId?: string;          // Claude Agent SDK session ID
  cliSessionIds?: Record<string, string>; // Legacy: provider → session ID
  claudeCliSessionId?: string;    // Legacy: Claude CLI session ID

  // Delivery Context
  channel?: string;               // Channel name (discord, slack, etc.)
  lastChannel?: SessionChannelId; // Last delivery channel
  lastTo?: string;                // Last recipient
  lastAccountId?: string;         // Last account used
  lastThreadId?: string | number; // Last thread/topic ID
  deliveryContext?: DeliveryContext; // Structured delivery target

  // Group Metadata
  chatType?: SessionChatType;     // "dm" | "group" | "channel"
  groupId?: string;               // Group/channel ID
  subject?: string;               // Group subject/name
  groupChannel?: string;          // Channel name (e.g., "#general")
  space?: string;                 // Workspace/space name
  displayName?: string;           // Computed display name

  // Session Configuration
  sendPolicy?: "allow" | "deny";  // Override send permissions
  groupActivation?: "mention" | "always"; // When to respond in groups
  groupActivationNeedsSystemIntro?: boolean; // Show intro on first activation

  // Model & Provider
  providerOverride?: string;      // Provider override (anthropic, openai, etc.)
  modelOverride?: string;         // Model override
  authProfileOverride?: string;   // Auth profile override
  authProfileOverrideSource?: "auto" | "user"; // Override source
  authProfileOverrideCompactionCount?: number; // Compaction count at override

  // Execution Context
  execHost?: string;              // Execution host preference
  execSecurity?: string;          // Security level
  execAsk?: string;               // Ask mode for commands
  execNode?: string;              // Node execution preference

  // UI Preferences
  thinkingLevel?: string;         // Thinking display level
  verboseLevel?: string;          // Verbose output level
  reasoningLevel?: string;        // Reasoning display level
  elevatedLevel?: string;         // Elevated mode level
  responseUsage?: "on" | "off" | "tokens" | "full"; // Usage display
  ttsAuto?: TtsAutoMode;          // Text-to-speech mode

  // Queue Management
  queueMode?: "steer" | "followup" | "collect" | ...;
  queueDebounceMs?: number;       // Queue debounce time
  queueCap?: number;              // Max queued messages
  queueDrop?: "old" | "new" | "summarize"; // Queue overflow strategy

  // Token Usage
  inputTokens?: number;           // Total input tokens
  outputTokens?: number;          // Total output tokens
  totalTokens?: number;           // Combined total
  contextTokens?: number;         // Context tokens
  modelProvider?: string;         // Last provider used
  model?: string;                 // Last model used

  // Compaction & Memory
  compactionCount?: number;       // Number of compactions performed
  memoryFlushAt?: number;         // Timestamp of last memory flush
  memoryFlushCompactionCount?: number; // Compaction count at flush

  // Session State
  systemSent?: boolean;           // System prompt sent
  abortedLastRun?: boolean;       // Last run was aborted
  lastHeartbeatText?: string;     // Last heartbeat message
  lastHeartbeatSentAt?: number;   // Heartbeat timestamp

  // Origin Tracking
  origin?: SessionOrigin;         // Initial message context
  label?: string;                 // User-defined label

  // Snapshots
  skillsSnapshot?: SessionSkillSnapshot;           // Last skills config
  systemPromptReport?: SessionSystemPromptReport;  // System prompt analysis
};
```

### DeliveryContext
Structured delivery target information:
```typescript
type DeliveryContext = {
  channel?: string;      // Channel name
  to?: string;           // Recipient ID
  accountId?: string;    // Account ID
  threadId?: string | number; // Thread/topic ID
};
```

### SessionOrigin
Tracks the initial message context:
```typescript
type SessionOrigin = {
  label?: string;        // Conversation label
  provider?: string;     // Origin channel
  surface?: string;      // UI surface (web, mobile, etc.)
  chatType?: SessionChatType; // Chat type
  from?: string;         // Sender ID
  to?: string;           // Recipient ID
  accountId?: string;    // Account ID
  threadId?: string | number; // Thread ID
};
```

## sdkSessionId Mapping

### Purpose
The `sdkSessionId` field maps OpenClaw sessions to Claude Agent SDK sessions, enabling:
- Session resumption across restarts
- Conversation history preservation
- Context continuity

### Integration Flow
1. **First message** - Agent creates new SDK session, stores `sdkSessionId`
2. **Subsequent messages** - Pass `sdkSessionId` to SDK for resumption
3. **Session updates** - Update `sdkSessionId` if SDK provides new value
4. **Cleanup** - `sdkSessionId` persists until session reset

### Resume in Claude Agent SDK
When starting an agent run:
```typescript
import { Agent } from "@anthropic-ai/sdk/agent";

const agent = new Agent({
  model: "claude-opus-4.5",
  sessionId: entry.sdkSessionId, // Resume existing session
  // ... other options
});
```

### Session ID Assignment
```typescript
// After agent run completes
await updateSessionStore(storePath, (store) => {
  store[sessionKey] = {
    ...store[sessionKey],
    sdkSessionId: agent.sessionId, // Store SDK-provided ID
    updatedAt: Date.now(),
  };
});
```

## Session Lifecycle

### Creation
Sessions are created:
1. **On first message** - When routing resolves to new session key
2. **Explicit spawn** - Via agent tools (sessions:spawn)
3. **Thread creation** - When thread sessions are enabled

Creation process:
```typescript
const sessionId = crypto.randomUUID();
const entry: SessionEntry = {
  sessionId,
  updatedAt: Date.now(),
  // ... metadata from message context
};
store[sessionKey] = entry;
```

### Updates
Sessions are updated on:
- New messages received
- Agent configuration changes
- Delivery target updates
- Token usage accumulation
- Compaction events
- Memory flush operations

### Cleanup
Session cleanup options:
1. **Manual reset** - `/new` or `/reset` commands
2. **Idle timeout** - Auto-reset after inactivity (configurable)
3. **Explicit delete** - Via CLI or API
4. **Batch cleanup** - Prune old/inactive sessions

Reset process:
1. Delete transcript file
2. Remove session entry from store
3. Clear SDK session ID
4. Preserve metadata (optional)

## Transcript Storage

### Format
Transcripts use JSONL (JSON Lines) format:
```jsonl
{"type":"session","version":3,"id":"uuid","timestamp":"2025-01-15T12:00:00Z","cwd":"/path"}
{"type":"user","content":[{"type":"text","text":"Hello"}],"timestamp":1234567890}
{"type":"assistant","content":[{"type":"text","text":"Hi!"}],"timestamp":1234567891}
```

### Session Header
First line contains metadata:
```json
{
  "type": "session",
  "version": 3,
  "id": "session-uuid",
  "timestamp": "2025-01-15T12:00:00Z",
  "cwd": "/working/directory"
}
```

### Message Entries
Each message is a separate JSON line:
```json
{
  "role": "user" | "assistant",
  "content": [
    {"type": "text", "text": "message content"},
    {"type": "image", "source": {...}}
  ],
  "api": "openai-responses",
  "provider": "anthropic",
  "model": "claude-opus-4.5",
  "usage": {
    "input": 1000,
    "output": 500,
    "cacheRead": 200,
    "cacheWrite": 100,
    "totalTokens": 1500,
    "cost": {...}
  },
  "stopReason": "stop",
  "timestamp": 1234567890
}
```

### Transcript Management
Pi Coding Agent's SessionManager handles:
- File I/O and locking
- Message appending
- History loading
- Compaction
- Version migration

### Transcript Mirroring
ClawCode mirrors outbound delivery messages to transcripts:
```typescript
await appendAssistantMessageToSessionTranscript({
  agentId: "main",
  sessionKey: "agent:main:discord:dm:user123",
  text: "Message sent to user",
  mediaUrls: ["https://example.com/image.png"],
});
```

### Thread Transcripts
Threads can have separate transcript files:
```
<sessionId>.jsonl              # Parent session
<sessionId>-topic-123.jsonl    # Thread/topic 123
```

## Send Policy

### Purpose
Control whether the agent can send messages in specific sessions.

### Configuration
Global policy in config:
```typescript
{
  session: {
    sendPolicy: {
      default: "allow",
      rules: [
        {
          match: { channel: "discord", chatType: "group" },
          action: "deny"
        },
        {
          match: { keyPrefix: "agent:main:slack" },
          action: "allow"
        }
      ]
    }
  }
}
```

### Per-Session Override
Session entry override:
```typescript
{
  sessionKey: "agent:main:discord:group:123",
  sendPolicy: "deny", // Overrides global rules
}
```

### Evaluation Order
1. Check session-level `sendPolicy` override
2. Evaluate global policy rules in order
3. Return first matching rule action
4. Fall back to `default` policy
5. Default to `"allow"` if nothing matches

### Rule Matching
Rules match against:
- `channel` - Channel name
- `chatType` - "dm" | "group" | "channel"
- `keyPrefix` - Session key prefix

### Use Cases
- Disable bot responses in specific channels
- Enforce read-only mode in groups
- Restrict agent to DMs only
- Allow/deny per conversation

## Multi-Agent Session Isolation

### Store Separation
Each agent has isolated storage:
```
~/.clawcode/agents/main/sessions/sessions.json
~/.clawcode/agents/codex/sessions/sessions.json
~/.clawcode/agents/support/sessions/sessions.json
```

### Key Namespacing
Session keys include agent ID:
```
agent:main:discord:dm:user123
agent:codex:discord:dm:user123  // Different agent, same user
```

### No Cross-Agent Access
Agents cannot:
- Read other agents' session stores
- Access other agents' transcripts
- Modify other agents' metadata
- Resume other agents' SDK sessions

### Subagent Sessions
Spawned sessions include parent reference:
```typescript
{
  sessionKey: "agent:main:subagent:worker1:task123",
  spawnedBy: "agent:main:discord:dm:user123", // Parent session
}
```

### Session Tools Scoping
Agent session tools respect:
- Agent ID boundaries
- Session key ownership
- Subagent spawn constraints

## Session Store Caching

### Cache Strategy
In-memory cache with TTL:
- Default TTL: 45 seconds
- Configurable via `OPENCLAW_SESSION_CACHE_TTL_MS`
- File mtime validation on cache hit
- Automatic invalidation on write

### Cache Behavior
```typescript
// Enable/disable caching
const enabled = process.env.OPENCLAW_SESSION_CACHE_TTL_MS !== "0";

// Cache hit: returns clone to prevent mutations
const store = loadSessionStore(storePath); // May return cached

// Cache miss: loads from disk and caches result
const store = loadSessionStore(storePath, { skipCache: true }); // Forces reload
```

### Invalidation
Cache is invalidated:
- On any write to session store
- When file mtime changes
- When TTL expires
- Manually via `clearSessionStoreCacheForTest()`

## Session Store Locking

### Purpose
Prevent concurrent write conflicts in multi-process environments.

### Lock Mechanism
1. Exclusive lock file: `sessions.json.lock`
2. Poll-based acquisition with timeout
3. Stale lock eviction (30s)
4. Lock released after write completes

### Lock API
```typescript
// Automatic locking
await updateSessionStore(storePath, (store) => {
  // Modifications here are serialized
  store[sessionKey] = { ... };
});

// Manual locking
await withSessionStoreLock(storePath, async () => {
  // Critical section
});
```

### Lock Options
- `timeoutMs` - Max wait time (default: 10s)
- `pollIntervalMs` - Check interval (default: 25ms)
- `staleMs` - Stale lock threshold (default: 30s)

## Key Functions

### Store Management
- `loadSessionStore(storePath, opts?)` - Load session metadata
- `saveSessionStore(storePath, store)` - Save session metadata
- `updateSessionStore(storePath, mutator)` - Atomic update with lock

### Session Updates
- `updateSessionStoreEntry(params)` - Update single session
- `recordSessionMetaFromInbound(params)` - Record message metadata
- `updateLastRoute(params)` - Update delivery context

### Transcript Operations
- `appendAssistantMessageToSessionTranscript(params)` - Add message
- `resolveSessionTranscriptPath(sessionId, agentId?, topicId?)` - Get path

### Path Resolution
- `resolveDefaultSessionStorePath(agentId?)` - Get store path
- `resolveSessionTranscriptsDirForAgent(agentId?)` - Get transcript dir
- `resolveStorePath(store?, opts?)` - Resolve with agent ID expansion

### Policy Evaluation
- `resolveSendPolicy(params)` - Determine send permission

## Testing Considerations

- Test session store locking under concurrency
- Verify cache invalidation on writes
- Test multi-agent isolation
- Validate transcript JSONL format
- Check SDK session ID resumption
- Test send policy evaluation order
- Verify delivery context normalization
- Test thread transcript separation
- Validate session cleanup/reset
- Check file permissions (0o600)
