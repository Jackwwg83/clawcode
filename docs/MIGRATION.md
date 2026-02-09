# Migration Guide: OpenClaw to ClawCode

## Table of Contents
- [What is ClawCode?](#what-is-clawcode)
- [Key Differences](#key-differences)
- [Migration Steps](#migration-steps)
- [Config Compatibility](#config-compatibility)
- [Breaking Changes](#breaking-changes)
- [Troubleshooting](#troubleshooting)

---

## What is ClawCode?

ClawCode is the Claude Agent SDK edition of OpenClaw. It maintains the same multi-channel architecture, features, and user experience while leveraging the official Claude Agent SDK for enhanced agent capabilities.

### Key Points
- **Same channels**: Slack, Discord, Claude Desktop, Web, SSH all work identically
- **Same features**: Multi-channel support, authentication, gateway architecture
- **Same architecture**: Gateway + Channels design pattern preserved
- **Only difference**: Agent runtime replaced (pi-coding-agent → Claude Agent SDK)

Think of ClawCode as OpenClaw 2.0 - a modernized version that uses Anthropic's official agent framework while maintaining full backward compatibility.

---

## Key Differences

### Agent Runtime
**OpenClaw**: Uses custom `pi-coding-agent` implementation
**ClawCode**: Uses official Claude Agent SDK with Model Context Protocol (MCP) servers

This change provides:
- Official support from Anthropic
- Better integration with Claude's capabilities
- Access to MCP ecosystem
- More reliable agent behavior

### Model Selection
**OpenClaw**: Manual model configuration in code
**ClawCode**: Delegated to Claude Agent SDK, which handles model selection and fallback

### Tools Exposure
**OpenClaw**: Custom tool implementation
**ClawCode**: Exposes 6 MCP servers for tool access:
- `memory-server`: Agent memory and state management
- `sessions-server`: Session lifecycle operations
- `message-server`: Message handling and routing
- `nodes-server`: Gateway node discovery and communication
- `browser-server`: Web browsing capabilities
- `canvas-server`: Visual canvas operations

### Performance
Both OpenClaw and ClawCode offer similar performance characteristics:
- Response times: Comparable
- Throughput: Similar capacity
- Resource usage: Equivalent footprint

### Compatibility
ClawCode maintains **full backward compatibility** with OpenClaw configuration:
- All config schema preserved
- Auth profiles work without changes
- Channel configs require no modifications
- Model configs fully compatible

---

## Migration Steps

### Step 1: Backup Your OpenClaw Configuration

Before migrating, backup your existing OpenClaw configuration:

```bash
# Backup config directory
cp -r ~/.openclaw ~/.openclaw.backup

# Backup specific config file
cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.backup
```

### Step 2: Install ClawCode

Install ClawCode globally via npm:

```bash
npm install -g clawcode@latest
```

Verify installation:

```bash
clawcode --version
```

### Step 3: Configuration Migration

ClawCode uses `~/.clawcode/` as its primary config directory but automatically falls back to `~/.openclaw/` for backward compatibility.

**Option A: Use existing OpenClaw config (recommended for quick migration)**
```bash
# No action needed - ClawCode will automatically use ~/.openclaw/
```

**Option B: Migrate to ClawCode config directory**
```bash
# Copy OpenClaw config to ClawCode directory
cp -r ~/.openclaw ~/.clawcode

# Or create symlink
ln -s ~/.openclaw ~/.clawcode
```

### Step 4: Stop OpenClaw Gateway

Before starting ClawCode, stop any running OpenClaw gateway instances:

```bash
# Find OpenClaw process
ps aux | grep openclaw

# Stop the process (replace <PID> with actual process ID)
kill <PID>

# Or if using pm2/systemd, use appropriate stop command
pm2 stop openclaw
# or
systemctl stop openclaw
```

### Step 5: Start ClawCode Gateway

Start the ClawCode gateway:

```bash
# Start gateway with default settings
clawcode gateway run

# Or specify custom port
clawcode gateway run --port 3000

# Or run in background with pm2
pm2 start clawcode -- gateway run
pm2 save
```

### Step 6: Verify Channel Status

Check that all your channels are properly configured and running:

```bash
# List all channels
clawcode channels status

# Probe channels to verify connectivity
clawcode channels status --probe
```

Expected output:
```
Channel Status:
  slack: enabled, connected
  discord: enabled, connected
  web: enabled, running on port 3001
  ssh: enabled, listening on port 2222
  claude-desktop: enabled, active
```

### Step 7: Test Agent Functionality

Send a test message to verify the agent is working:

```bash
# Test via CLI
clawcode agent --message "Hello, this is a test message"

# Test via Web UI (if enabled)
# Open browser to http://localhost:3001

# Test via Slack/Discord
# Send a message in your configured channel
```

---

## Config Compatibility

### Configuration Schema

All OpenClaw configuration schemas are preserved in ClawCode. Your existing config files will work without modification.

**Config file locations** (in order of precedence):
1. `~/.clawcode/clawcode.json`
2. `~/.clawcode/openclaw.json`
3. `~/.openclaw/openclaw.json` (fallback)

### Authentication Profiles

All authentication methods continue to work:

```json
{
  "auth": {
    "type": "token",
    "token": "${ANTHROPIC_AUTH_TOKEN}"
  }
}
```

Or:

```json
{
  "auth": {
    "type": "api-key",
    "apiKey": "${ANTHROPIC_API_KEY}"
  }
}
```

### Channel Configurations

No changes needed for channel configs:

```json
{
  "channels": {
    "slack": {
      "enabled": true,
      "botToken": "${SLACK_BOT_TOKEN}",
      "appToken": "${SLACK_APP_TOKEN}"
    },
    "discord": {
      "enabled": true,
      "token": "${DISCORD_BOT_TOKEN}"
    },
    "web": {
      "enabled": true,
      "port": 3001
    },
    "ssh": {
      "enabled": true,
      "port": 2222
    },
    "claude-desktop": {
      "enabled": true
    }
  }
}
```

### Model Configurations

Model configurations remain compatible:

```json
{
  "model": {
    "name": "claude-sonnet-4-5",
    "maxTokens": 8096,
    "temperature": 1.0
  }
}
```

**Note**: With ClawCode, model selection is delegated to Claude Agent SDK, which may override these settings for optimal performance.

---

## Breaking Changes

**None** - ClawCode maintains full backward compatibility with OpenClaw.

All existing features, configurations, and APIs work identically. The only internal change is the agent runtime, which is transparent to users.

---

## Troubleshooting

### Port Conflicts

**Problem**: Gateway fails to start due to port already in use.

**Solution**:
```bash
# Check what's using the port
lsof -i :3000

# Start ClawCode on different port
clawcode gateway run --port 3002
```

### Authentication Issues

**Problem**: Agent fails to authenticate with Claude API.

**Solutions**:

1. **Verify environment variables**:
   ```bash
   echo $ANTHROPIC_AUTH_TOKEN
   # or
   echo $ANTHROPIC_API_KEY
   ```

2. **Check config file**:
   ```bash
   cat ~/.clawcode/clawcode.json
   # or
   cat ~/.openclaw/openclaw.json
   ```

3. **Test authentication**:
   ```bash
   clawcode auth verify
   ```

4. **Re-authenticate**:
   ```bash
   clawcode auth login
   ```

### Channel Connection Issues

**Problem**: Channels show as disconnected or fail to start.

**Solutions**:

1. **Check channel status with probing**:
   ```bash
   clawcode channels status --probe
   ```

2. **Verify channel tokens**:
   ```bash
   # For Slack
   echo $SLACK_BOT_TOKEN
   echo $SLACK_APP_TOKEN

   # For Discord
   echo $DISCORD_BOT_TOKEN
   ```

3. **Restart specific channel**:
   ```bash
   clawcode channels restart slack
   ```

4. **Check logs**:
   ```bash
   clawcode logs --channel slack --tail 50
   ```

### Agent Not Responding

**Problem**: Agent receives messages but doesn't respond.

**Solutions**:

1. **Check gateway logs**:
   ```bash
   clawcode logs --tail 100
   ```

2. **Verify MCP servers are running**:
   ```bash
   clawcode mcp status
   ```

3. **Restart gateway**:
   ```bash
   clawcode gateway restart
   ```

4. **Test agent directly**:
   ```bash
   clawcode agent --message "test" --debug
   ```

### Config Not Loading

**Problem**: ClawCode doesn't seem to use your config file.

**Solutions**:

1. **Check config file location**:
   ```bash
   ls -la ~/.clawcode/
   ls -la ~/.openclaw/
   ```

2. **Verify config syntax**:
   ```bash
   clawcode config validate
   ```

3. **View active config**:
   ```bash
   clawcode config show
   ```

4. **Specify config explicitly**:
   ```bash
   clawcode gateway run --config ~/.openclaw/openclaw.json
   ```

### Performance Issues

**Problem**: ClawCode is slower than expected.

**Solutions**:

1. **Check resource usage**:
   ```bash
   clawcode status --verbose
   ```

2. **Monitor gateway health**:
   ```bash
   clawcode gateway health
   ```

3. **Adjust concurrency settings** in config:
   ```json
   {
     "gateway": {
       "maxConcurrentRequests": 10,
       "requestTimeout": 30000
     }
   }
   ```

4. **Review logs for bottlenecks**:
   ```bash
   clawcode logs --level warn --tail 100
   ```

### Need More Help?

- **Documentation**: Check `/Users/jackwu/openclaw/clawcode/docs/`
- **GitHub Issues**: Report issues at the ClawCode repository
- **Community**: Join the ClawCode/OpenClaw community channels
- **Logs**: Always include relevant logs when seeking help

---

## Summary

Migrating from OpenClaw to ClawCode is straightforward:

1. Backup your config
2. Install ClawCode
3. Stop OpenClaw
4. Start ClawCode
5. Verify everything works

The migration is seamless because ClawCode maintains full backward compatibility. Your existing configuration, channels, and workflows continue to work without modification.

Welcome to ClawCode - OpenClaw powered by Claude Agent SDK!
