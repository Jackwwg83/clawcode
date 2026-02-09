/**
 * Custom Provider CLI
 *
 * Add custom model providers with their own base URLs, API types, and auth.
 */

import { text as clackText, confirm as clackConfirm } from "@clack/prompts";
import JSON5 from "json5";
import type { RuntimeEnv } from "../../runtime.js";
import { upsertAuthProfile } from "../../agents/auth-profiles.js";
import { normalizeProviderId } from "../../agents/model-selection.js";
import { logConfigUpdated } from "../../config/logging.js";
import type { ModelApi, ModelDefinitionConfig, ModelProviderConfig } from "../../config/types.js";
import { stylePromptMessage } from "../../terminal/prompt-style.js";
import { applyAuthProfileConfig } from "../onboard-auth.js";
import { updateConfig } from "./shared.js";

const text = (params: Parameters<typeof clackText>[0]) =>
  clackText({
    ...params,
    message: stylePromptMessage(params.message),
  });

const confirm = (params: Parameters<typeof clackConfirm>[0]) =>
  clackConfirm({
    ...params,
    message: stylePromptMessage(params.message),
  });

const SUPPORTED_APIS: ModelApi[] = [
  "anthropic-messages",
  "openai-completions",
  "openai-responses",
  "google-generative-ai",
  "bedrock-converse-stream",
];

export type ProvidersAddOptions = {
  id?: string;
  baseUrl?: string;
  api?: string;
  model?: string;
  modelName?: string;
  contextWindow?: string;
  maxTokens?: string;
  input?: string;
  reasoning?: boolean;
  apiKey?: string;
  token?: string;
  apiKeyEnv?: string;
  headers?: string;
  authHeader?: boolean;
  setDefault?: boolean;
};

const VALID_INPUT_TYPES = ["text", "image"] as const;

function parseInputTypes(raw?: string): Array<"text" | "image"> {
  if (!raw) {
    return ["text"];
  }
  const parts = raw.split(",").map((s) => s.trim().toLowerCase());
  const result: Array<"text" | "image"> = [];
  for (const part of parts) {
    if (part === "text" || part === "image") {
      result.push(part);
    }
  }
  return result.length > 0 ? result : ["text"];
}

/**
 * Strict validation for --input option when explicitly provided.
 * Throws if any value is not in VALID_INPUT_TYPES.
 */
function validateInputTypes(raw: string): Array<"text" | "image"> {
  const parts = raw.split(",").map((s) => s.trim().toLowerCase());
  const result: Array<"text" | "image"> = [];
  for (const part of parts) {
    if (part === "text" || part === "image") {
      result.push(part);
    } else if (part !== "") {
      throw new Error(`Invalid --input: "${part}" (allowed: ${VALID_INPUT_TYPES.join(", ")})`);
    }
  }
  if (result.length === 0) {
    throw new Error(`Invalid --input: empty value (allowed: ${VALID_INPUT_TYPES.join(", ")})`);
  }
  return result;
}

function validateApi(raw?: string): ModelApi | undefined {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  const match = SUPPORTED_APIS.find((api) => api.toLowerCase() === normalized);
  return match;
}

/**
 * Parse and validate --headers option (JSON5 format).
 * Returns Record<string, string> or throws on invalid input.
 */
function validateHeaders(raw: string): Record<string, string> {
  try {
    const parsed = JSON5.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("must be a JSON object");
    }
    // Validate all values are strings
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string") {
        throw new Error(`value for "${key}" must be a string`);
      }
    }
    return parsed as Record<string, string>;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid --headers: ${reason}`);
  }
}

/**
 * Strict validation for numeric options.
 * Requires pure positive integer (no floats, no trailing chars like "123abc").
 */
function validateNumericOption(
  name: string,
  value: string | undefined,
): number | undefined {
  if (!value) {
    return undefined;
  }
  // Use Number() for strict parsing (unlike parseInt which is lenient)
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: "${value}" (must be a positive integer)`);
  }
  return parsed;
}

export async function modelsProvidersAddCommand(
  opts: ProvidersAddOptions,
  runtime: RuntimeEnv,
): Promise<void> {
  // Validate numeric options first (before any interactive prompts)
  const contextWindowValue = validateNumericOption("--context-window", opts.contextWindow);
  const maxTokensValue = validateNumericOption("--max-tokens", opts.maxTokens);

  // Validate headers option (JSON5)
  const headersValue = opts.headers?.trim() ? validateHeaders(opts.headers) : undefined;

  // Validate conflicting auth options
  if (opts.apiKey?.trim() && opts.token?.trim()) {
    throw new Error("Cannot specify both --api-key and --token. Use only one.");
  }

  // Validate --api-key-env is mutually exclusive with --api-key and --token
  if (opts.apiKeyEnv?.trim() && (opts.apiKey?.trim() || opts.token?.trim())) {
    throw new Error("--api-key-env cannot be used with --api-key or --token");
  }

  // Normalize and validate apiKeyEnv
  let normalizedApiKeyEnv: string | undefined;
  if (opts.apiKeyEnv?.trim()) {
    const raw = opts.apiKeyEnv.trim();
    // Strip ${...} wrapper if present, then trim
    const unwrapped = raw.replace(/^\$\{(.+)\}$/, "$1").trim();
    // Validate: must be non-empty and match [A-Z0-9_]+
    if (!unwrapped || !/^[A-Z0-9_]+$/.test(unwrapped)) {
      throw new Error(`Invalid --api-key-env: "${raw}" (must be ENV_VAR or \${ENV_VAR})`);
    }
    normalizedApiKeyEnv = unwrapped;
  }

  // Non-TTY validation: check required params before any prompts
  if (!process.stdin.isTTY) {
    const missing: string[] = [];
    if (!opts.id?.trim()) {
      missing.push("--id");
    }
    if (!opts.baseUrl?.trim()) {
      missing.push("--base-url");
    }
    if (!opts.model?.trim()) {
      missing.push("--model");
    }
    if (missing.length > 0) {
      throw new Error(
        `Missing required parameters in non-interactive mode: ${missing.join(", ")}`,
      );
    }
  }

  // Resolve provider id
  let providerId = opts.id?.trim();
  if (!providerId) {
    const idInput = await text({
      message: "Provider id (e.g. my-provider)",
      validate: (value) => (value?.trim() ? undefined : "Required"),
    });
    providerId = normalizeProviderId(String(idInput).trim());
  } else {
    providerId = normalizeProviderId(providerId);
  }

  // Resolve base URL
  let baseUrl = opts.baseUrl?.trim();
  if (!baseUrl) {
    const urlInput = await text({
      message: "Base URL (e.g. https://api.example.com/v1)",
      validate: (value) => (value?.trim() ? undefined : "Required"),
    });
    baseUrl = String(urlInput).trim();
  }

  // Resolve API type
  let api: ModelApi;
  if (opts.api?.trim()) {
    // User provided an --api value, validate it strictly
    const validated = validateApi(opts.api);
    if (!validated) {
      throw new Error(
        `Invalid --api: "${opts.api}" (must be one of: ${SUPPORTED_APIS.join(", ")})`,
      );
    }
    api = validated;
  } else {
    // --api not provided
    if (!process.stdin.isTTY) {
      // Non-TTY: use default API type to avoid hanging on prompt
      api = "anthropic-messages";
    } else {
      const apiInput = await text({
        message: `API type (${SUPPORTED_APIS.join(", ")})`,
        initialValue: "anthropic-messages",
        validate: (value) => {
          const validated = validateApi(String(value ?? ""));
          return validated ? undefined : `Must be one of: ${SUPPORTED_APIS.join(", ")}`;
        },
      });
      api = validateApi(String(apiInput)) ?? "anthropic-messages";
    }
  }

  // Resolve model definition
  let modelId = opts.model?.trim();
  if (!modelId) {
    const modelInput = await text({
      message: "Model id (e.g. claude-3-opus)",
      validate: (value) => (value?.trim() ? undefined : "Required"),
    });
    modelId = String(modelInput).trim();
  }

  const modelName = opts.modelName?.trim() || modelId;
  const contextWindow = contextWindowValue ?? 200000;
  const maxTokens = maxTokensValue ?? 8192;
  // If user explicitly provided --input, use strict validation; otherwise default to ["text"]
  const inputTypes = opts.input?.trim()
    ? validateInputTypes(opts.input)
    : parseInputTypes(undefined);
  const reasoning = opts.reasoning ?? false;

  // Build model definition
  const modelDef: ModelDefinitionConfig = {
    id: modelId,
    name: modelName,
    api,
    reasoning,
    input: inputTypes,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow,
    maxTokens,
  };

  // Build provider config
  const providerConfig: ModelProviderConfig = {
    baseUrl,
    api,
    models: [modelDef],
    ...(headersValue && { headers: headersValue }),
    ...(opts.authHeader && { authHeader: true }),
    ...(normalizedApiKeyEnv && { apiKey: normalizedApiKeyEnv }),
  };

  // Handle auth credentials
  // Skip auth profile handling when --api-key-env is used (apiKey is stored in config, not auth profile)
  const hasApiKey = opts.apiKey?.trim();
  const hasToken = opts.token?.trim();
  let profileId: string | undefined;
  let authMode: "api_key" | "token" | undefined;

  if (normalizedApiKeyEnv) {
    // Using env var in config - no auth profile needed
    // profileId and authMode remain undefined
  } else if (hasApiKey) {
    profileId = `${providerId}:default`;
    authMode = "api_key";
    upsertAuthProfile({
      profileId,
      credential: {
        type: "api_key",
        provider: providerId,
        key: opts.apiKey!.trim(),
      },
    });
  } else if (hasToken) {
    profileId = `${providerId}:default`;
    authMode = "token";
    upsertAuthProfile({
      profileId,
      credential: {
        type: "token",
        provider: providerId,
        token: opts.token!.trim(),
      },
    });
  } else if (process.stdin.isTTY) {
    // Interactive: ask if user wants to add credentials
    const wantsAuth = await confirm({
      message: "Add API key or token for this provider?",
      initialValue: true,
    });

    if (wantsAuth) {
      const credInput = await text({
        message: "API key or token",
        validate: (value) => (value?.trim() ? undefined : "Required"),
      });
      const cred = String(credInput).trim();

      // Heuristic: if it starts with "sk-" it's likely an API key
      const isApiKey = cred.startsWith("sk-") || cred.length < 100;
      profileId = `${providerId}:default`;
      authMode = isApiKey ? "api_key" : "token";

      if (isApiKey) {
        upsertAuthProfile({
          profileId,
          credential: {
            type: "api_key",
            provider: providerId,
            key: cred,
          },
        });
      } else {
        upsertAuthProfile({
          profileId,
          credential: {
            type: "token",
            provider: providerId,
            token: cred,
          },
        });
      }
    }
  }

  // Update config
  await updateConfig((cfg) => {
    let next = { ...cfg };

    // Set models.mode to "merge" if not already set
    next = {
      ...next,
      models: {
        ...next.models,
        mode: next.models?.mode ?? "merge",
        providers: {
          ...next.models?.providers,
          [providerId]: providerConfig,
        },
      },
    };

    // Apply auth profile config if credentials were added
    if (profileId && authMode) {
      next = applyAuthProfileConfig(next, {
        profileId,
        provider: providerId,
        mode: authMode,
      });
    }

    // Set as default model if requested
    if (opts.setDefault) {
      const fullModelId = `${providerId}/${modelId}`;
      const models = { ...next.agents?.defaults?.models };
      models[fullModelId] = models[fullModelId] ?? {};

      next = {
        ...next,
        agents: {
          ...next.agents,
          defaults: {
            ...next.agents?.defaults,
            models,
            model: {
              ...(next.agents?.defaults?.model &&
              typeof next.agents.defaults.model === "object" &&
              "fallbacks" in next.agents.defaults.model
                ? { fallbacks: (next.agents.defaults.model as { fallbacks?: string[] }).fallbacks }
                : undefined),
              primary: fullModelId,
            },
          },
        },
      };
    }

    return next;
  });

  logConfigUpdated(runtime);
  runtime.log(`Provider added: ${providerId}`);
  runtime.log(`  Base URL: ${baseUrl}`);
  runtime.log(`  API: ${api}`);
  runtime.log(`  Model: ${modelId} (${modelName})`);
  if (profileId) {
    runtime.log(`  Auth profile: ${profileId} (${authMode})`);
  }
  if (opts.setDefault) {
    runtime.log(`  Default model: ${providerId}/${modelId}`);
  }
}

export async function modelsProvidersListCommand(
  opts: { json?: boolean; plain?: boolean },
  runtime: RuntimeEnv,
): Promise<void> {
  const { readConfigFileSnapshot } = await import("../../config/config.js");
  const snapshot = await readConfigFileSnapshot();
  const providers = snapshot.config.models?.providers ?? {};

  if (opts.json) {
    runtime.log(JSON.stringify(providers, null, 2));
    return;
  }

  const entries = Object.entries(providers);
  if (entries.length === 0) {
    runtime.log("No custom providers configured.");
    return;
  }

  if (opts.plain) {
    for (const [id, config] of entries) {
      runtime.log(`${id}\t${config.baseUrl}\t${config.api ?? "default"}`);
    }
    return;
  }

  runtime.log("Custom providers:");
  for (const [id, config] of entries) {
    runtime.log(`  ${id}:`);
    runtime.log(`    Base URL: ${config.baseUrl}`);
    if (config.api) {
      runtime.log(`    API: ${config.api}`);
    }
    if (config.models && config.models.length > 0) {
      runtime.log(`    Models: ${config.models.map((m) => m.id).join(", ")}`);
    }
  }
}

export async function modelsProvidersRemoveCommand(
  providerId: string,
  runtime: RuntimeEnv,
): Promise<void> {
  const normalized = normalizeProviderId(providerId.trim());

  await updateConfig((cfg) => {
    const providers = { ...cfg.models?.providers };
    if (!providers[normalized]) {
      throw new Error(`Provider "${normalized}" not found in config.`);
    }
    delete providers[normalized];

    return {
      ...cfg,
      models: {
        ...cfg.models,
        providers,
      },
    };
  });

  logConfigUpdated(runtime);
  runtime.log(`Provider removed: ${normalized}`);
  runtime.log(
    `Note: Auth profiles for this provider (e.g. ${normalized}:default) must be removed manually if needed.`,
  );
}
