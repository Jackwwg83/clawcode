# Config

## Goal
Reuse OpenClaw config schema and behavior, but store in ~/.clawcode.

## Key Paths
- Config dir: ~/.clawcode
- Config file: ~/.clawcode/config.json
- Sessions: ~/.clawcode/sessions
- Memory: ~/.clawcode/memory

## Notes
- Keep OpenClaw schema compatible wherever feasible.
- Model/provider selection is delegated to Claude Agent SDK.
- OpenClaw model catalog and auth profiles may be retained for other providers but are not used for Claude runs.

---

## Architecture Overview

### Config File Location
ClawCode stores all configuration in a single JSON file:
```
~/.clawcode/config.json
```

This is a change from OpenClaw's `~/.openclaw/openclaw.json`. ClawCode automatically migrates legacy configs on first run.

### Directory Structure
```
~/.clawcode/
├── config.json              # Main configuration file
├── sessions/                # Session transcripts and state
│   ├── telegram:123456.json
│   └── discord:guild:456.json
├── memory/                  # Long-term memory per agent
│   ├── default/
│   └── mybot/
├── whatsapp-sessions/       # Channel-specific auth data
├── signal-sessions/
└── cron/                    # Scheduled job state
    └── jobs.json
```

---

## Config Schema

### Top-Level Structure
```json
{
  "agents": { ... },           // Agent configuration
  "channels": { ... },         // Channel enablement
  "telegram": { ... },         // Channel-specific configs
  "discord": { ... },
  "slack": { ... },
  "whatsapp": { ... },
  "signal": { ... },
  "imessage": { ... },
  "gateway": { ... },          // Gateway server settings
  "models": { ... },           // Model catalog (legacy)
  "auth": { ... },             // Auth profiles (legacy)
  "routing": { ... },          // Message routing rules
  "hooks": { ... },            // External hooks (Gmail, etc.)
  "sandbox": { ... },          // Code execution sandbox
  "tools": { ... },            // Tool configuration
  "skills": { ... },           // Custom skill paths
  "cron": { ... }              // Cron job settings
}
```

---

## Agents Configuration

### Schema: `agents`
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-5",
        "fallbacks": ["anthropic/claude-sonnet-3-5"]
      },
      "thinkingDefault": "auto",
      "verboseDefault": "off",
      "contextTokens": 200000,
      "timeoutSeconds": 600,
      "userTimezone": "America/Los_Angeles",
      "timeFormat": "12h",
      "skipBootstrap": false,
      "heartbeatAckMaxChars": 100,
      "enableInteractiveCli": true
    },
    "agents": {
      "mybot": {
        "model": "anthropic/claude-opus-4-6",
        "workspace": "~/workspace/mybot",
        "thinkingDefault": "high",
        "contextTokens": 300000
      }
    }
  }
}
```

### Fields
- **`defaults`**: Default settings for all agents
  - **`model`**: Model selection (string or object with `primary` and `fallbacks`)
  - **`thinkingDefault`**: Thinking level (`"off"`, `"auto"`, `"low"`, `"medium"`, `"high"`, `"xhigh"`)
  - **`verboseDefault`**: Verbose logging level (`"off"`, `"on"`)
  - **`contextTokens`**: Context window size (default: 200000)
  - **`timeoutSeconds`**: Agent timeout (default: 600)
  - **`userTimezone`**: Timezone for date/time formatting (IANA format)
  - **`timeFormat`**: Time format (`"12h"` or `"24h"`)
  - **`skipBootstrap`**: Skip auto-creation of CLAUDE.md in workspace (default: false)
  - **`heartbeatAckMaxChars`**: Max chars to deliver for heartbeat-only responses (default: 100)
  - **`enableInteractiveCli`**: Enable interactive CLI mode (default: true)

- **`agents`**: Per-agent overrides (keyed by agent ID)
  - **`model`**: Override model for this agent
  - **`workspace`**: Custom workspace directory
  - **`thinkingDefault`**: Override thinking level
  - **`contextTokens`**: Override context window size

### Multi-Agent Support
ClawCode supports multiple named agents, each with separate:
- Workspace directory
- Session state
- Memory store
- Model/provider preferences

**Session Key Format:**
```
agent:mybot:telegram:123456
```

---

## Channels Configuration

### Schema: `channels`
```json
{
  "channels": {
    "enabled": ["telegram", "discord", "whatsapp"],
    "disabled": ["slack"]
  }
}
```

This is a global enable/disable switch. Individual channels can be further configured below.

---

## Channel-Specific Configurations

### Telegram
```json
{
  "telegram": {
    "enabled": true,
    "accounts": {
      "main": {
        "enabled": true,
        "token": "1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ",
        "tokenFile": "~/.clawcode/telegram-token.txt",
        "dmPolicy": "allowlist",
        "allowFrom": [123456789, 987654321],
        "requireMention": false
      }
    }
  }
}
```

**Fields:**
- `token` or `tokenFile`: Bot token (from @BotFather)
- `dmPolicy`: DM filtering policy (`"open"`, `"allowlist"`, `"owner"`)
- `allowFrom`: Array of user IDs allowed to DM
- `requireMention`: Require @mention in groups (default: false)

### Discord
```json
{
  "discord": {
    "enabled": true,
    "accounts": {
      "main": {
        "enabled": true,
        "token": "YOUR_DISCORD_BOT_TOKEN",
        "tokenFile": "~/.clawcode/discord-token.txt",
        "dmPolicy": "allowlist",
        "allowFrom": ["123456789012345678"],
        "groupChannels": ["987654321098765432"]
      }
    }
  }
}
```

**Fields:**
- `token` or `tokenFile`: Bot token (from Discord Developer Portal)
- `groupChannels`: Array of guild channel IDs to monitor
- `allowFrom`: Array of user IDs (snowflake format)

### WhatsApp
```json
{
  "whatsapp": {
    "enabled": true,
    "accounts": {
      "personal": {
        "enabled": true,
        "authDir": "~/.clawcode/whatsapp-sessions/personal",
        "dmPolicy": "owner",
        "allowFrom": ["+15551234567"],
        "allowUnmentionedGroups": false
      }
    }
  }
}
```

**Fields:**
- `authDir`: Directory for session data (QR login creates multi-device session here)
- `allowFrom`: Array of phone numbers in E.164 format (`+1555...`)
- `allowUnmentionedGroups`: Respond to groups without @mention (default: false)

### Signal
```json
{
  "signal": {
    "enabled": true,
    "accounts": {
      "main": {
        "enabled": true,
        "signalNumber": "+15551234567",
        "cliPath": "/usr/local/bin/signal-cli",
        "dbPath": "~/.clawcode/signal-sessions/main",
        "dmPolicy": "allowlist",
        "allowFrom": ["+15559876543"]
      }
    }
  }
}
```

**Fields:**
- `signalNumber`: Your Signal phone number (E.164 format)
- `cliPath`: Path to signal-cli binary
- `dbPath`: Database path for signal-cli
- `allowFrom`: Array of phone numbers in E.164 format

### iMessage (macOS only)
```json
{
  "imessage": {
    "enabled": true,
    "accounts": {
      "main": {
        "enabled": true,
        "service": "imessage",
        "httpUrl": "http://localhost:1234",
        "dmPolicy": "allowlist",
        "allowFrom": ["+15551234567", "user@icloud.com"]
      }
    }
  }
}
```

**Fields:**
- `service`: `"imessage"`, `"sms"`, or `"auto"`
- `httpUrl`: BlueBubbles server URL
- `allowFrom`: Array of phone numbers or iMessage handles

### Slack
```json
{
  "slack": {
    "enabled": true,
    "accounts": {
      "main": {
        "enabled": true,
        "botToken": "xoxb-...",
        "appToken": "xapp-...",
        "botTokenFile": "~/.clawcode/slack-bot-token.txt",
        "appTokenFile": "~/.clawcode/slack-app-token.txt",
        "groupChannels": ["C01234567"],
        "autoDiscoverChannels": false
      }
    }
  }
}
```

**Fields:**
- `botToken` or `botTokenFile`: Bot User OAuth Token (from Slack App)
- `appToken` or `appTokenFile`: App-Level Token (for Socket Mode)
- `groupChannels`: Array of channel IDs to monitor
- `autoDiscoverChannels`: Auto-join public channels (default: false)

---

## Gateway Configuration

### Schema: `gateway`
```json
{
  "gateway": {
    "enabled": true,
    "port": 3721,
    "host": "127.0.0.1",
    "remoteTransport": {
      "enabled": false,
      "url": "http://remote-server:3721",
      "token": "secure-token-here"
    }
  }
}
```

**Fields:**
- `enabled`: Enable gateway server (default: true)
- `port`: HTTP server port (default: 3721)
- `host`: Bind address (default: 127.0.0.1)
- `remoteTransport`: For distributed deployments (channels on different machine)
  - `enabled`: Use remote gateway instead of local
  - `url`: Remote gateway URL
  - `token`: Authentication token

---

## Model Catalog (Legacy)

### Schema: `models`
```json
{
  "models": {
    "catalog": {
      "anthropic/claude-sonnet-4-5": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-5-20250929",
        "thinking": "auto",
        "contextTokens": 200000
      }
    }
  }
}
```

**Note:** For Claude Agent SDK runs, model selection is handled by the SDK. This catalog is retained for:
- Other providers (e.g., custom LiteLLM endpoints)
- Model fallback configuration
- Legacy compatibility

---

## Auth Profiles (Legacy)

### Schema: `auth`
```json
{
  "auth": {
    "profiles": {
      "anthropic": {
        "provider": "anthropic",
        "apiKey": "sk-ant-...",
        "apiKeyFile": "~/.clawcode/anthropic-key.txt"
      },
      "openai": {
        "provider": "openai",
        "apiKey": "sk-...",
        "baseUrl": "https://api.openai.com/v1"
      }
    }
  }
}
```

**Note:** For Claude Agent SDK runs, authentication is handled via:
- `ANTHROPIC_API_KEY` environment variable
- Or Claude Agent SDK's built-in auth mechanism

Auth profiles are retained for other providers accessed via LiteLLM or custom proxies.

---

## Environment Variable Overrides

ClawCode supports environment variable overrides for sensitive values:

### Syntax
```bash
export CLAWCODE_TELEGRAM_ACCOUNTS_MAIN_TOKEN="1234567890:ABC..."
export CLAWCODE_DISCORD_ACCOUNTS_MAIN_TOKEN="YOUR_DISCORD_TOKEN"
export CLAWCODE_GATEWAY_REMOTERANSPORT_TOKEN="secure-token"
```

### Mapping Rules
- Prefix: `CLAWCODE_`
- Nested keys: Separated by `_`
- Array indices: Not supported (use config file)
- Case: Uppercase

### Priority
1. Environment variable (highest)
2. Config file value
3. Default value (lowest)

### Example
Config file:
```json
{
  "telegram": {
    "accounts": {
      "main": {
        "token": "placeholder"
      }
    }
  }
}
```

Environment variable takes precedence:
```bash
export CLAWCODE_TELEGRAM_ACCOUNTS_MAIN_TOKEN="actual-token"
```

---

## Multi-Agent Configuration

### Use Case
Run multiple agents with different configurations:
- Production bot + testing bot
- Different models/providers per agent
- Separate workspaces and memory

### Configuration
```json
{
  "agents": {
    "defaults": {
      "model": "anthropic/claude-sonnet-4-5"
    },
    "agents": {
      "production": {
        "model": "anthropic/claude-opus-4-6",
        "workspace": "~/bots/production",
        "thinkingDefault": "high"
      },
      "testing": {
        "model": "anthropic/claude-sonnet-4-5",
        "workspace": "~/bots/testing",
        "thinkingDefault": "off"
      }
    }
  },
  "routing": {
    "rules": [
      {
        "match": {
          "channel": "telegram",
          "senderId": 123456789
        },
        "route": {
          "agentId": "production"
        }
      },
      {
        "match": {
          "channel": "telegram",
          "senderId": 987654321
        },
        "route": {
          "agentId": "testing"
        }
      }
    ]
  }
}
```

### Routing Rules
- **`match`**: Conditions to match against incoming messages
  - `channel`: Channel ID (e.g., `"telegram"`, `"discord"`)
  - `senderId`: User ID or phone number
  - `chatType`: `"dm"`, `"group"`, `"channel"`
- **`route`**: Routing decision
  - `agentId`: Target agent ID
  - `reject`: Reject message (boolean)

---

## Config Validation

### Validation Process
1. **Schema validation**: Config is validated against Zod schema (`src/config/zod-schema.ts`)
2. **Plugin validation**: Channel plugins validate their own config sections
3. **Cross-field validation**: Check dependencies (e.g., `token` or `tokenFile` required)
4. **Runtime validation**: Additional checks during gateway startup

### Error Handling
- **Validation failure**: Config is NOT applied, previous config is preserved
- **Backup rotation**: Up to 10 backup copies in `~/.clawcode/backups/`
- **Error reporting**: Validation errors are logged to console and preserved in memory

### Validation API
```typescript
import { validateConfigObject } from "./config/validation.js";

const result = validateConfigObject(configData);
if (!result.ok) {
  console.error("Validation failed:", result.error);
}
```

---

## Config Defaults

### Default Values
When fields are omitted, ClawCode uses these defaults:

```typescript
{
  agents: {
    defaults: {
      model: "anthropic/claude-sonnet-4-5",
      thinkingDefault: "auto",
      verboseDefault: "off",
      contextTokens: 200000,
      timeoutSeconds: 600,
      userTimezone: "UTC",
      timeFormat: "24h",
      skipBootstrap: false,
      heartbeatAckMaxChars: 100,
      enableInteractiveCli: true
    }
  },
  gateway: {
    enabled: true,
    port: 3721,
    host: "127.0.0.1"
  },
  channels: {
    enabled: [],  // No channels enabled by default
    disabled: []
  }
}
```

### Per-Channel Defaults
Each channel plugin defines its own defaults:
- `dmPolicy`: Usually `"open"` (Telegram, Discord) or `"owner"` (WhatsApp, iMessage)
- `requireMention`: Usually `false`
- `enabled`: Usually `true` (if channel is configured)

---

## Legacy Compatibility

### Migration from OpenClaw
ClawCode automatically migrates `~/.openclaw/openclaw.json` to `~/.clawcode/config.json` on first run.

**Migration Process:**
1. Check if `~/.openclaw/openclaw.json` exists
2. If yes, and `~/.clawcode/config.json` does NOT exist:
   - Copy config to new location
   - Apply schema transformations (if needed)
   - Preserve all existing settings
3. Log migration result

**Fallback Behavior:**
If `~/.clawcode/config.json` is missing, ClawCode checks `~/.openclaw/openclaw.json` as fallback.

### Breaking Changes
- **Config path**: `~/.openclaw` → `~/.clawcode`
- **Model selection**: Claude Agent SDK handles model selection (OpenClaw's model catalog is optional)
- **Auth**: Claude Agent SDK uses `ANTHROPIC_API_KEY` (OpenClaw's auth profiles are optional)

### Compatibility Notes
- Channel auth directories remain unchanged (e.g., `~/.clawcode/whatsapp-sessions/` works as-is)
- Bot tokens and credentials do NOT need to be updated
- Session transcripts are NOT migrated (new sessions start fresh)

---

## Config File I/O

### Reading Config
```typescript
import { loadConfig } from "./config/config.js";

const cfg = loadConfig();  // Reads ~/.clawcode/config.json
```

### Writing Config
```typescript
import { writeConfigFile } from "./config/config.js";

await writeConfigFile(updatedConfig);
```

**Write Behavior:**
- Validates before writing
- Creates backup in `~/.clawcode/backups/`
- Atomic write (write to temp file, then rename)
- Pretty-printed JSON with 2-space indent

### Watching for Changes
ClawCode does NOT auto-reload config on file changes. Restart the gateway server to apply config changes.

---

## Config Sections Reference

### Additional Sections

#### Hooks (External Integrations)
```json
{
  "hooks": {
    "gmail": {
      "enabled": true,
      "model": "anthropic/claude-sonnet-3-5",
      "thinking": "low",
      "allowUnsafeExternalContent": false
    }
  }
}
```

#### Sandbox (Code Execution)
```json
{
  "sandbox": {
    "mode": "docker",
    "docker": {
      "image": "alpine:latest",
      "network": "none"
    }
  }
}
```

#### Tools
```json
{
  "tools": {
    "message": {
      "enabled": true,
      "alsoAllow": ["telegram", "discord"]
    },
    "webSearch": {
      "enabled": true,
      "provider": "brave"
    }
  }
}
```

#### Skills (Custom Skills)
```json
{
  "skills": {
    "paths": [
      "~/my-skills",
      "/opt/shared-skills"
    ]
  }
}
```

#### Cron
```json
{
  "cron": {
    "enabled": true,
    "jobs": []  // Jobs are stored in ~/.clawcode/cron/jobs.json
  }
}
```

---

## Best Practices

### Security
1. **Never commit credentials**: Use `tokenFile` or environment variables
2. **Restrict allowFrom**: Use allowlist DM policy for production bots
3. **Limit group access**: Only join trusted groups
4. **Validate external input**: Enable `allowUnsafeExternalContent` only for trusted hooks

### Performance
1. **Disable unused channels**: Set `enabled: false` for channels you don't use
2. **Limit context tokens**: Reduce `contextTokens` for faster responses
3. **Use model fallbacks**: Define fallback models for better reliability

### Maintenance
1. **Backup regularly**: Config backups are automatic, but keep external backups too
2. **Version control**: Store sanitized config (without credentials) in git
3. **Document custom rules**: Add comments (JSON5 format supported in some parsers)

### Testing
1. **Use separate agents**: Create `testing` agent for experiments
2. **Test routing rules**: Verify routing with test messages before production
3. **Monitor logs**: Check gateway logs for validation errors
