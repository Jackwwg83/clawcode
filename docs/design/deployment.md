# Deployment

## Overview

ClawCode is a personal AI assistant built with the Claude Agent SDK. It runs as a local Gateway service that connects to multiple messaging channels (WhatsApp, Telegram, Discord, Slack, etc.) and provides a unified interface to Claude via the official Agent SDK.

This guide covers installation, configuration, and deployment options for running ClawCode in various environments.

## Prerequisites

### System Requirements

- **Node.js**: Version 22.12.0 or higher (required)
- **Operating System**:
  - macOS (recommended for full feature set)
  - Linux (Ubuntu, Debian, RHEL, Arch)
  - Windows via WSL2 (strongly recommended over native Windows)
- **Memory**: 2GB+ RAM recommended
- **Disk Space**: 500MB+ for application and dependencies
- **Network**: Internet connection for API calls and package installation

### Required Dependencies

- **Claude Agent SDK**: Automatically installed with ClawCode
- **Package Manager**: npm (built-in), pnpm, or bun

### Authentication Requirements

ClawCode requires authentication with Claude services. You need **one** of the following:

- **Option A**: `ANTHROPIC_AUTH_TOKEN` — OAuth setup token from Anthropic (recommended)
- **Option B**: `ANTHROPIC_API_KEY` — API key from Anthropic Console

See [Authentication](#authentication) section for setup instructions.

## Deployment Options

### 1. Local Development

Best for: Testing, development, personal use on a workstation.

```bash
# Install globally via npm
npm install -g clawcode@latest

# Or install from source
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
pnpm ui:build
pnpm build
```

### 2. Docker Deployment

Best for: Containerized environments, cloud platforms with Docker support.

See [Docker Installation Guide](https://docs.openclaw.ai/install/docker) for detailed instructions.

Basic Dockerfile pattern:
```dockerfile
FROM node:22-alpine
RUN npm install -g clawcode@latest
WORKDIR /app
CMD ["clawcode", "gateway", "run", "--port", "18789"]
```

### 3. Cloud VM (Hetzner, GCP, AWS, etc.)

Best for: Production deployments, always-on accessibility, remote gateway.

**VM Setup Steps:**

1. Provision a VM with Ubuntu 22.04+ or Debian 12+
2. Install Node.js 22+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
3. Install ClawCode:
   ```bash
   npm install -g clawcode@latest
   ```
4. Configure systemd service (see [Gateway Daemon Setup](#gateway-daemon-setup))

### 4. Platform-as-a-Service (Railway, Render, Fly.io)

Best for: Simple deployment without infrastructure management.

**Configuration Requirements:**
- Runtime: Node.js 22+
- Build command: `npm install -g clawcode@latest` (or install from source)
- Start command: `clawcode gateway run --port $PORT`
- Environment variables: `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`

Note: Some PaaS platforms may not support persistent storage for session data. Consider mounting volumes or using external storage.

## Installation

### From npm (Recommended)

```bash
# Install globally
npm install -g clawcode@latest

# Or using pnpm
pnpm add -g clawcode@latest

# Or using bun
bun add -g clawcode@latest

# Verify installation
clawcode --version
```

### From Source (Development)

```bash
# Clone repository
git clone https://github.com/openclaw/openclaw.git
cd openclaw

# Install dependencies (pnpm recommended for development)
pnpm install

# Build UI components
pnpm ui:build

# Build TypeScript to JavaScript
pnpm build

# Run directly from source (TypeScript)
pnpm openclaw --help

# Or use built version
node dist/index.js --help
```

### From Nix

For NixOS or Nix package manager users:

```bash
# See https://github.com/openclaw/nix-clawdbot
nix-shell -p clawdbot
```

## Configuration

### Config Directory

ClawCode stores all runtime data in `~/.clawcode`:

```
~/.clawcode/
├── config.json          # Main configuration file
├── sessions/            # Session state and history
├── memory/              # Vector embeddings and search index
├── credentials/         # Channel authentication data
├── node.json            # Node configuration (if using nodes)
└── plugins/             # Installed plugins
```

### Authentication

#### Option A: Setup Token (Recommended)

OAuth-based authentication using Anthropic's setup token:

```bash
# Interactive onboarding (prompts for auth)
clawcode onboard

# Or set environment variable directly
export ANTHROPIC_AUTH_TOKEN="your-setup-token-here"

# Or add to config.json
{
  "models": {
    "providers": {
      "anthropic": {
        "authToken": "${ANTHROPIC_AUTH_TOKEN}"
      }
    }
  }
}
```

To obtain a setup token:
1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Navigate to API Keys section
3. Generate a new setup token

#### Option B: API Key

Direct API key authentication:

```bash
# Set environment variable
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# Or add to config.json
{
  "models": {
    "providers": {
      "anthropic": {
        "apiKey": "${ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

**Security Note**: Never commit API keys or auth tokens to version control. Use environment variables or secure secret management.

### Environment Variables

ClawCode supports environment variable substitution in `config.json` using `${VAR_NAME}` syntax:

**Common Environment Variables:**

| Variable | Purpose | Required |
|----------|---------|----------|
| `ANTHROPIC_AUTH_TOKEN` | OAuth setup token | Yes* |
| `ANTHROPIC_API_KEY` | API key authentication | Yes* |
| `ANTHROPIC_BASE_URL` | Custom API endpoint | No |
| `OPENCLAW_PROFILE` | Profile name (for multi-config) | No |
| `CLAWCODE_CONFIG_DIR` | Override config directory | No |

\* One of `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` is required.

**Example config.json with env vars:**

```json
{
  "models": {
    "providers": {
      "anthropic": {
        "apiKey": "${ANTHROPIC_API_KEY}"
      },
      "openai": {
        "apiKey": "${OPENAI_API_KEY}"
      }
    }
  }
}
```

### Basic Configuration

Run the onboarding wizard for guided setup:

```bash
clawcode onboard --install-daemon
```

Or manually create `~/.clawcode/config.json`:

```json
{
  "gateway": {
    "port": 18789,
    "enabled": true
  },
  "agents": {
    "defaults": {
      "workspace": "~/openclaw-workspace"
    }
  },
  "channels": {
    "telegram": {
      "enabled": false
    },
    "discord": {
      "enabled": false
    }
  }
}
```

### MCP Server Configuration

ClawCode exposes tools via MCP (Model Context Protocol) servers. The Agent SDK automatically discovers and connects to these servers.

**Default MCP Servers:**
- Memory (vector search, session history)
- Sessions (session management)
- Message (channel communication)
- Nodes (system integration)
- Browser (web automation)
- Canvas (visual workspace)

**Custom MCP Server Paths:**

If you need to override MCP server locations:

```json
{
  "mcp": {
    "servers": {
      "custom-server": {
        "command": "node",
        "args": ["/path/to/custom-mcp-server.js"]
      }
    }
  }
}
```

## Gateway Setup

The Gateway is ClawCode's control plane — it manages channels, sessions, and tool execution.

### Running the Gateway

#### Development Mode

```bash
# Start gateway with auto-reload
pnpm gateway:watch

# Or start without channels (for testing)
OPENCLAW_SKIP_CHANNELS=1 clawcode gateway run --port 18789
```

#### Production Mode

```bash
# Start gateway service
clawcode gateway run --port 18789 --verbose

# Or use the daemon (recommended)
clawcode gateway install --install-daemon
```

### Gateway Daemon Setup

The daemon ensures the Gateway stays running across reboots.

#### Automatic Installation

```bash
# Install daemon during onboarding
clawcode onboard --install-daemon

# Or install separately
clawcode gateway install --install-daemon
```

This creates:
- **macOS**: launchd service at `~/Library/LaunchAgents/ai.openclaw.gateway.plist`
- **Linux**: systemd user service at `~/.config/systemd/user/openclaw-gateway.service`
- **Windows**: Task Scheduler task (via schtasks)

#### Manual Daemon Start

If you prefer manual control:

```bash
# Start gateway manually
clawcode gateway run --port 18789

# Run in background (Linux/macOS)
nohup clawcode gateway run --port 18789 > ~/.clawcode/gateway.log 2>&1 &
```

### Health Check

Verify the Gateway is running:

```bash
# Check gateway status
clawcode status

# Or use the health command
clawcode health

# Or check directly via HTTP
curl http://localhost:18789/health
```

Expected output:
```json
{
  "status": "ok",
  "version": "2026.1.30",
  "uptime": 3600
}
```

### Gateway Configuration Options

**Port Configuration:**

Default port is `18789`. Override with:
```bash
# Via command line
clawcode gateway run --port 8080

# Via config.json
{
  "gateway": {
    "port": 8080
  }
}

# Via environment variable
OPENCLAW_GATEWAY_PORT=8080 clawcode gateway run
```

**Remote Access:**

By default, the Gateway only listens on localhost. For remote access:

1. **Tailscale Serve** (recommended):
   ```bash
   tailscale serve --bg 18789
   ```

2. **SSH Tunnel**:
   ```bash
   ssh -L 18789:localhost:18789 user@remote-host
   ```

3. **Direct Binding** (not recommended for security):
   ```json
   {
     "gateway": {
       "host": "0.0.0.0",
       "port": 18789
     }
   }
   ```

**Security Warning**: Exposing the Gateway publicly without authentication is risky. Use Tailscale, VPN, or SSH tunnels instead.

## Channel Configuration

ClawCode supports multiple messaging channels. Configure them in `~/.clawcode/config.json` or via the onboarding wizard.

### Telegram

```bash
# Add Telegram account
clawcode channels add telegram

# Or configure in config.json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "accounts": {
        "primary": {
          "botToken": "${TELEGRAM_BOT_TOKEN}",
          "allowFrom": ["@username1", "@username2"]
        }
      }
    }
  }
}
```

Get a bot token from [@BotFather](https://t.me/botfather).

### Discord

```bash
# Add Discord account
clawcode channels add discord

# Or configure in config.json
{
  "channels": {
    "discord": {
      "enabled": true,
      "accounts": {
        "primary": {
          "token": "${DISCORD_BOT_TOKEN}",
          "allowFrom": ["user#1234"]
        }
      }
    }
  }
}
```

Create a Discord bot at [Discord Developer Portal](https://discord.com/developers/applications).

### Slack

```bash
# Add Slack account
clawcode channels add slack

# Or configure in config.json
{
  "channels": {
    "slack": {
      "enabled": true,
      "accounts": {
        "primary": {
          "botToken": "${SLACK_BOT_TOKEN}",
          "appToken": "${SLACK_APP_TOKEN}",
          "allowFrom": ["U1234567890"]
        }
      }
    }
  }
}
```

Create a Slack app at [Slack API](https://api.slack.com/apps).

### WhatsApp

```bash
# Add WhatsApp account
clawcode channels add whatsapp

# Follow QR code pairing flow
```

WhatsApp uses Baileys library and requires QR code scanning for authentication.

### Other Channels

Supported channels:
- **Google Chat**: Enterprise workspace integration
- **Signal**: via signal-cli
- **iMessage**: macOS only
- **BlueBubbles**: Extension for iMessage relay
- **Microsoft Teams**: Extension
- **Matrix**: Extension
- **Zalo**: Extension
- **WebChat**: Built-in web interface

See [Channels Documentation](https://docs.openclaw.ai/channels) for detailed setup instructions.

## Troubleshooting

### Common Issues

#### 1. Gateway Won't Start

**Symptom**: `clawcode gateway run` fails or exits immediately.

**Solutions**:
- Check port availability: `lsof -i :18789` (macOS/Linux)
- Verify Node.js version: `node --version` (must be ≥22.12.0)
- Check logs: `~/.clawcode/logs/gateway.log`
- Run with verbose output: `clawcode gateway run --verbose`

#### 2. Authentication Errors

**Symptom**: "Missing API key" or "Invalid auth token" errors.

**Solutions**:
- Verify environment variables: `printenv | grep ANTHROPIC`
- Check config.json syntax: `clawcode doctor`
- Ensure no typos in env var names (must be uppercase)
- Test auth directly:
  ```bash
  curl https://api.anthropic.com/v1/messages \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -H "content-type: application/json" \
    -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'
  ```

#### 3. Channel Connection Failures

**Symptom**: Telegram/Discord/Slack bot not responding.

**Solutions**:
- Verify bot tokens are correct
- Check allowlist configuration (`allowFrom` in config.json)
- Review channel-specific logs: `clawcode channels status`
- Restart gateway: `clawcode gateway restart`

#### 4. Daemon Not Starting on Boot

**Symptom**: Gateway doesn't auto-start after system reboot.

**Solutions (macOS)**:
```bash
# Check launchd status
launchctl list | grep openclaw

# Reload service
launchctl unload ~/Library/LaunchAgents/ai.openclaw.gateway.plist
launchctl load ~/Library/LaunchAgents/ai.openclaw.gateway.plist
```

**Solutions (Linux)**:
```bash
# Check systemd status
systemctl --user status openclaw-gateway

# Enable service
systemctl --user enable openclaw-gateway

# Enable lingering (survives logout)
loginctl enable-linger $USER
```

#### 5. Out of Memory

**Symptom**: Gateway crashes with OOM errors.

**Solutions**:
- Increase Node.js memory limit:
  ```bash
  NODE_OPTIONS="--max-old-space-size=4096" clawcode gateway run
  ```
- Configure session pruning in config.json:
  ```json
  {
    "sessions": {
      "pruning": {
        "enabled": true,
        "maxTokens": 50000
      }
    }
  }
  ```

### Diagnostic Tools

#### clawcode doctor

Run comprehensive diagnostics:

```bash
clawcode doctor
```

Checks:
- Node.js version
- Config file validity
- Authentication status
- Gateway connectivity
- Channel health
- Disk space
- Permissions

#### clawcode status

View current system status:

```bash
# Full status report
clawcode status

# Gateway status only
clawcode gateway status

# Channel status only
clawcode channels status
```

#### Logs

Log locations:
- Gateway: `~/.clawcode/logs/gateway.log`
- Channels: `~/.clawcode/logs/channels/`
- Sessions: `~/.clawcode/logs/sessions/`

View logs:
```bash
# Real-time gateway logs
tail -f ~/.clawcode/logs/gateway.log

# Search for errors
grep ERROR ~/.clawcode/logs/*.log
```

### Getting Help

If issues persist:

1. Check [Documentation](https://docs.openclaw.ai)
2. Search [GitHub Issues](https://github.com/openclaw/openclaw/issues)
3. Join [Discord Community](https://discord.gg/clawd)
4. Run `clawcode doctor` and share output

## Security

### API Key Storage

**Best Practices**:
- Never commit keys to version control
- Use environment variables or secret management
- Restrict file permissions: `chmod 600 ~/.clawcode/config.json`
- Rotate keys regularly

### Network Exposure

**Gateway Security**:
- Default: localhost-only (127.0.0.1:18789)
- Remote access: Use Tailscale, VPN, or SSH tunnels
- Public exposure: **Not recommended** without authentication

**Firewall Rules** (if exposing externally):
```bash
# Linux (iptables)
sudo iptables -A INPUT -p tcp --dport 18789 -s trusted-ip -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 18789 -j DROP

# macOS (pf)
# Add to /etc/pf.conf:
pass in proto tcp from trusted-ip to any port 18789
block in proto tcp from any to any port 18789
```

### Channel Security

**DM Access Control**:

ClawCode enforces DM pairing by default:

```json
{
  "channels": {
    "telegram": {
      "accounts": {
        "primary": {
          "dmPolicy": "pairing",
          "allowFrom": []
        }
      }
    }
  }
}
```

**Pairing Flow**:
1. Unknown sender DMs bot
2. Bot responds with pairing code (e.g., "XY123")
3. Admin approves: `clawcode pairing approve telegram XY123`
4. Sender is added to allowlist

**Open DM Policy** (risky):
```json
{
  "channels": {
    "telegram": {
      "accounts": {
        "primary": {
          "dmPolicy": "open",
          "allowFrom": ["*"]
        }
      }
    }
  }
}
```

⚠️ **Warning**: Open DM policy allows anyone to message your bot. Use with caution.

### Permissions

ClawCode requires minimal system permissions:

**Required**:
- Network access (API calls, webhook listeners)
- File system (read/write config, sessions, logs)

**Optional** (depending on features):
- Browser automation: Chrome/Chromium binary execution
- Audio transcription: Access to audio files
- TTS: Network access to TTS providers
- Nodes: Camera, microphone, screen recording (macOS/iOS/Android)

### Audit

Review security configuration:

```bash
# Run security audit
clawcode doctor

# Check for risky DM policies
clawcode channels status

# Review allowlists
cat ~/.clawcode/config.json | grep -A 5 allowFrom
```

## Updating

### npm Installation

```bash
# Update to latest version
npm update -g clawcode

# Or install specific version
npm install -g clawcode@2026.1.30
```

### Source Installation

```bash
cd /path/to/openclaw
git pull origin main
pnpm install
pnpm ui:build
pnpm build
```

### Post-Update

Always run after updating:

```bash
clawcode doctor
```

This checks for:
- Config migrations
- Breaking changes
- Deprecated features

## Platform-Specific Notes

### macOS

- **Menu bar app**: Available for GUI control
- **iMessage support**: Native integration
- **Voice Wake**: Always-on speech activation
- **Canvas**: Live visual workspace

### Linux

- **Systemd user services**: Recommended for daemon management
- **Headless support**: Fully functional without GUI
- **Docker**: Well-tested in containerized environments

### Windows (WSL2)

- **WSL2 strongly recommended**: Native Windows support is experimental
- **File paths**: Use WSL paths (e.g., `/home/user/.clawcode`)
- **Systemd**: Available in WSL2 (Ubuntu 22.04+)

### Docker

- **Persistent storage**: Mount volumes for `~/.clawcode`
- **Networking**: Expose port 18789 for gateway access
- **Environment**: Pass `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`

Example docker-compose.yml:
```yaml
version: '3.8'
services:
  clawcode:
    image: node:22-alpine
    command: sh -c "npm install -g clawcode@latest && clawcode gateway run --port 18789"
    ports:
      - "18789:18789"
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - clawcode-data:/root/.clawcode
volumes:
  clawcode-data:
```

## Additional Resources

- [Official Documentation](https://docs.openclaw.ai)
- [Getting Started Guide](https://docs.openclaw.ai/start/getting-started)
- [Configuration Reference](https://docs.openclaw.ai/gateway/configuration)
- [Channel Guides](https://docs.openclaw.ai/channels)
- [Security Best Practices](https://docs.openclaw.ai/gateway/security)
- [GitHub Repository](https://github.com/openclaw/openclaw)
- [Discord Community](https://discord.gg/clawd)

## Host Requirements

- **Node.js**: Version 22.12.0 or higher (required)
- **Claude Code**: Installed on the VM or host system
- **Claude Agent SDK**: Installed in project dependencies (automatic with ClawCode)

## Runtime Notes

- Agent SDK uses Claude Code runtime; ensure PATH resolves Claude Code binaries
- Use `~/.clawcode` for all runtime data
- Model/provider selection is delegated to Claude Agent SDK
- OpenClaw model catalog and auth profiles may be retained for other providers but are not used for Claude runs
