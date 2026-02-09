---
summary: "Use Anthropic Claude via API keys or setup-token in OpenClaw"
read_when:
  - You want to use Anthropic models in OpenClaw
  - You want setup-token instead of API keys
title: "Anthropic"
---

# Anthropic (Claude)

Anthropic builds the **Claude** model family and provides access via an API.
In OpenClaw you can authenticate with an API key or a **setup-token**.

## Option A: Anthropic API key

**Best for:** standard API access and usage-based billing.
Create your API key in the Anthropic Console.

### CLI setup

```bash
openclaw onboard
# choose: Anthropic API key

# or non-interactive
openclaw onboard --anthropic-api-key "$ANTHROPIC_API_KEY"
```

### Config snippet

```json5
{
  env: { ANTHROPIC_API_KEY: "sk-ant-..." },
  agents: { defaults: { model: { primary: "anthropic/claude-opus-4-5" } } },
}
```

## Prompt caching (Anthropic API)

OpenClaw does **not** override Anthropic’s default cache TTL unless you set it.
This is **API-only**; subscription auth does not honor TTL settings.

To set the TTL per model, use `cacheControlTtl` in the model `params`:

```json5
{
  agents: {
    defaults: {
      models: {
        "anthropic/claude-opus-4-5": {
          params: { cacheControlTtl: "5m" }, // or "1h"
        },
      },
    },
  },
}
```

OpenClaw includes the `extended-cache-ttl-2025-04-11` beta flag for Anthropic API
requests; keep it if you override provider headers (see [/gateway/configuration](/gateway/configuration)).

## Option B: Claude setup-token

**Best for:** using your Claude subscription.

### Where to get a setup-token

Setup-tokens are created by the **Claude Code CLI**, not the Anthropic Console. You can run this on **any machine**:

```bash
claude setup-token
```

Paste the token into OpenClaw (wizard: **Anthropic token (paste setup-token)**), or run it on the gateway host:

```bash
openclaw models auth setup-token --provider anthropic
```

If you generated the token on a different machine, paste it:

```bash
openclaw models auth paste-token --provider anthropic
```

### CLI setup

```bash
# Paste a setup-token during onboarding
openclaw onboard --auth-choice setup-token
```

### Config snippet

```json5
{
  agents: { defaults: { model: { primary: "anthropic/claude-opus-4-5" } } },
}
```

## Option C: Third-party Anthropic-compatible endpoint

**Best for:** using a proxy or third-party service that implements the Anthropic Messages API.

OpenClaw should treat third-party endpoints as **custom providers** (do not use the
built-in `anthropic` provider). This ensures the custom base URL is actually used.

### CLI setup (recommended)

```bash
# Create a custom provider that speaks Anthropic Messages
openclaw models providers add \
  --id crs \
  --base-url https://your-endpoint.example.com/api \
  --api anthropic-messages \
  --model claude-sonnet-4-5-20250929 \
  --model-name "Claude Sonnet 4.5" \
  --context-window 200000 \
  --max-tokens 8192 \
  --input text \
  --api-key "$CRS_API_KEY" \
  --set-default
```

If your provider requires custom headers, add `--headers '{"x-custom":"value"}'`.
Use `--auth-header` if you need an `Authorization: Bearer ...` header.

Auth follows OpenClaw's standard order: **auth profiles → env vars → `models.providers.*.apiKey`**.
The CLI stores `--api-key`/`--token` in **auth profiles** (preferred). If you want to avoid
plaintext in config, omit `apiKey` and rely on auth profiles, or set `apiKey` to an
env var name (or `${ENV_VAR}`) and define it in `env`/shell.

### Config snippet

```json5
{
  env: {
    CRS_API_KEY: "cr_...",
  },
  models: {
    mode: "merge",
    providers: {
      crs: {
        baseUrl: "https://your-endpoint.example.com/api",
        // apiKey can be an env var name. You can omit it if using auth profiles.
        apiKey: "CRS_API_KEY",
        api: "anthropic-messages",
        models: [
          {
            id: "claude-sonnet-4-5-20250929",
            name: "Claude Sonnet 4.5",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 8192,
          },
        ],
      },
    },
  },
  agents: { defaults: { model: { primary: "crs/claude-sonnet-4-5-20250929" } } },
}
```

### Note on `--base-url` (auth paste-token)

`openclaw models auth paste-token --provider anthropic --base-url <url>` only stores
`env.ANTHROPIC_BASE_URL` + `env.ANTHROPIC_AUTH_TOKEN`. It does **not** override the
base URL for the built-in `anthropic` models. Use a custom provider when you need
traffic routed to a third-party endpoint.

## Notes

- Generate the setup-token with `claude setup-token` and paste it, or run `openclaw models auth setup-token` on the gateway host.
- If you see “OAuth token refresh failed …” on a Claude subscription, re-auth with a setup-token. See [/gateway/troubleshooting#oauth-token-refresh-failed-anthropic-claude-subscription](/gateway/troubleshooting#oauth-token-refresh-failed-anthropic-claude-subscription).
- Auth details + reuse rules are in [/concepts/oauth](/concepts/oauth).

## Troubleshooting

**401 errors / token suddenly invalid**

- Claude subscription auth can expire or be revoked. Re-run `claude setup-token`
  and paste it into the **gateway host**.
- If the Claude CLI login lives on a different machine, use
  `openclaw models auth paste-token --provider anthropic` on the gateway host.

**No API key found for provider "anthropic"**

- Auth is **per agent**. New agents don’t inherit the main agent’s keys.
- Re-run onboarding for that agent, or paste a setup-token / API key on the
  gateway host, then verify with `openclaw models status`.

**No credentials found for profile `anthropic:default`**

- Run `openclaw models status` to see which auth profile is active.
- Re-run onboarding, or paste a setup-token / API key for that profile.

**No available auth profile (all in cooldown/unavailable)**

- Check `openclaw models status --json` for `auth.unusableProfiles`.
- Add another Anthropic profile or wait for cooldown.

More: [/gateway/troubleshooting](/gateway/troubleshooting) and [/help/faq](/help/faq).
