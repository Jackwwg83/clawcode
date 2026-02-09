---
summary: "CLI reference for `openclaw models` (status/list/set/scan, aliases, fallbacks, auth)"
read_when:
  - You want to change default models or view provider auth status
  - You want to scan available models/providers and debug auth profiles
title: "models"
---

# `openclaw models`

Model discovery, scanning, and configuration (default model, fallbacks, auth profiles).

Related:

- Providers + models: [Models](/providers/models)
- Provider auth setup: [Getting started](/start/getting-started)

## Common commands

```bash
openclaw models status
openclaw models list
openclaw models set <model-or-alias>
openclaw models scan
```

`openclaw models status` shows the resolved default/fallbacks plus an auth overview.
When provider usage snapshots are available, the OAuth/token status section includes
provider usage headers.
Add `--probe` to run live auth probes against each configured provider profile.
Probes are real requests (may consume tokens and trigger rate limits).
Use `--agent <id>` to inspect a configured agent’s model/auth state. When omitted,
the command uses `OPENCLAW_AGENT_DIR`/`PI_CODING_AGENT_DIR` if set, otherwise the
configured default agent.

Notes:

- `models set <model-or-alias>` accepts `provider/model` or an alias.
- Model refs are parsed by splitting on the **first** `/`. If the model ID includes `/` (OpenRouter-style), include the provider prefix (example: `openrouter/moonshotai/kimi-k2`).
- If you omit the provider, OpenClaw treats the input as an alias or a model for the **default provider** (only works when there is no `/` in the model ID).

### `models status`

Options:

- `--json`
- `--plain`
- `--check` (exit 1=expired/missing, 2=expiring)
- `--probe` (live probe of configured auth profiles)
- `--probe-provider <name>` (probe one provider)
- `--probe-profile <id>` (repeat or comma-separated profile ids)
- `--probe-timeout <ms>`
- `--probe-concurrency <n>`
- `--probe-max-tokens <n>`
- `--agent <id>` (configured agent id; overrides `OPENCLAW_AGENT_DIR`/`PI_CODING_AGENT_DIR`)

## Aliases + fallbacks

```bash
openclaw models aliases list
openclaw models fallbacks list
```

## Auth profiles

```bash
openclaw models auth add
openclaw models auth login --provider <id>
openclaw models auth setup-token
openclaw models auth paste-token
```

`models auth login` runs a provider plugin’s auth flow (OAuth/API key). Use
`openclaw plugins list` to see which providers are installed.

Notes:

- `setup-token` prompts for a setup-token value (generate it with `claude setup-token` on any machine).
- `paste-token` accepts a token string generated elsewhere or from automation.
- `paste-token --base-url <url>` (anthropic only) sets `env.ANTHROPIC_BASE_URL` +
  `env.ANTHROPIC_AUTH_TOKEN`. This does **not** override the built-in `anthropic` base URL.
  For third-party Anthropic-compatible endpoints, create a custom provider with
  `openclaw models providers add`.

## Custom providers

Add, list, or remove custom model providers with their own base URLs and API types.

```bash
openclaw models providers add
openclaw models providers list
openclaw models providers remove <id>
```

Example (Anthropic-compatible proxy):

```bash
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

Auth follows the standard order: **auth profiles → env vars → `models.providers.*.apiKey`**.
`--api-key`/`--token` are stored in auth profiles (preferred). If you want to avoid plaintext in
config, set `models.providers.<id>.apiKey` to an env var name (or `${ENV_VAR}`) or omit it and rely
on auth profiles.

### `providers add`

Options:

- `--id <id>`: Provider id (e.g. `my-provider`)
- `--base-url <url>`: Base URL (e.g. `https://api.example.com/v1`)
- `--api <type>`: API type (`anthropic-messages`, `openai-completions`, `openai-responses`, `google-generative-ai`, `bedrock-converse-stream`)
- `--model <id>`: Model id (e.g. `claude-3-opus`)
- `--model-name <name>`: Model display name (defaults to model id)
- `--context-window <n>`: Context window size (default: 200000)
- `--max-tokens <n>`: Max output tokens (default: 8192)
- `--input <types>`: Input types: `text`, `image`, or `text,image` (default: `text`)
- `--reasoning`: Model supports reasoning/thinking
- `--api-key <key>`: API key (stored in auth profile)
- `--token <token>`: Auth token (stored in auth profile)
- `--api-key-env <name>`: Env var name for API key (stored in `models.providers.<id>.apiKey`, not auth profile). Accepts `ENV` or `${ENV}` (normalized to `ENV`).
- `--headers <json>`: Custom headers as JSON (e.g. `'{"x-api-key":"abc"}'`)
- `--auth-header`: Include auth header in requests (writes `authHeader: true`)
- `--set-default`: Set this model as the default

Note: `--api-key`, `--token`, and `--api-key-env` are mutually exclusive; use only one.

### `providers list`

Options:

- `--json`
- `--plain`

### `providers remove <id>`

Remove a custom provider by its id. Auth profiles for this provider must be removed manually if needed.
