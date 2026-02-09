/**
 * Tests for custom provider CLI commands
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("modelsProvidersAddCommand", () => {
  let tempDir: string;
  let configPath: string;
  let previousStateDir: string | undefined;
  let previousAgentDir: string | undefined;
  let previousConfigPath: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-providers-"));
    configPath = path.join(tempDir, "config.json");
    previousStateDir = process.env.OPENCLAW_STATE_DIR;
    previousAgentDir = process.env.OPENCLAW_AGENT_DIR;
    previousConfigPath = process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_STATE_DIR = tempDir;
    process.env.OPENCLAW_AGENT_DIR = path.join(tempDir, "agent");
    process.env.OPENCLAW_CONFIG_PATH = configPath;
    await fs.mkdir(path.join(tempDir, "agent"), { recursive: true });
    vi.resetModules();
  });

  afterEach(async () => {
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    if (previousAgentDir === undefined) {
      delete process.env.OPENCLAW_AGENT_DIR;
    } else {
      process.env.OPENCLAW_AGENT_DIR = previousAgentDir;
    }
    if (previousConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = previousConfigPath;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("adds a custom provider to config with all options", async () => {
    // Create initial config
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    await modelsProvidersAddCommand(
      {
        id: "my-provider",
        baseUrl: "https://api.example.com/v1",
        api: "anthropic-messages",
        model: "my-model",
        modelName: "My Model",
        contextWindow: "100000",
        maxTokens: "4096",
        input: "text,image",
        reasoning: true,
        apiKey: "sk-test-key",
        setDefault: true,
      },
      runtime as never,
    );

    // Check config was updated
    const configContent = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configContent);

    expect(config.models?.mode).toBe("merge");
    expect(config.models?.providers?.["my-provider"]).toBeDefined();
    expect(config.models?.providers?.["my-provider"].baseUrl).toBe("https://api.example.com/v1");
    expect(config.models?.providers?.["my-provider"].api).toBe("anthropic-messages");
    expect(config.models?.providers?.["my-provider"].models[0].id).toBe("my-model");
    expect(config.models?.providers?.["my-provider"].models[0].reasoning).toBe(true);
    expect(config.models?.providers?.["my-provider"].models[0].input).toEqual(["text", "image"]);

    // Check auth profile was created
    expect(config.auth?.profiles?.["my-provider:default"]).toBeDefined();
    expect(config.auth?.profiles?.["my-provider:default"].mode).toBe("api_key");

    // Check default model was set
    expect(config.agents?.defaults?.model?.primary).toBe("my-provider/my-model");

    // Check logs
    expect(logs.some((l) => l.includes("Provider added: my-provider"))).toBe(true);
  });

  it("adds a custom provider without auth", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    // Mock stdin.isTTY to false to skip interactive prompts
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      await modelsProvidersAddCommand(
        {
          id: "no-auth-provider",
          baseUrl: "https://api.example.com/v1",
          api: "openai-completions",
          model: "gpt-4",
        },
        runtime as never,
      );
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }

    const configContent = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configContent);

    expect(config.models?.providers?.["no-auth-provider"]).toBeDefined();
    expect(config.auth?.profiles?.["no-auth-provider:default"]).toBeUndefined();
  });

  it("adds a custom provider with token auth", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    await modelsProvidersAddCommand(
      {
        id: "token-provider",
        baseUrl: "https://api.example.com/v1",
        api: "anthropic-messages",
        model: "claude-3",
        token: "my-long-token-value-that-is-definitely-longer-than-100-characters-to-trigger-token-detection-heuristic",
      },
      runtime as never,
    );

    const configContent = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configContent);

    expect(config.auth?.profiles?.["token-provider:default"]).toBeDefined();
    expect(config.auth?.profiles?.["token-provider:default"].mode).toBe("token");
  });

  it("throws when --context-window is invalid (NaN)", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    await expect(
      modelsProvidersAddCommand(
        {
          id: "test-provider",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          contextWindow: "invalid",
        },
        runtime as never,
      ),
    ).rejects.toThrow('Invalid --context-window: "invalid" (must be a positive integer)');
  });

  it("throws when --max-tokens is zero or negative", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    await expect(
      modelsProvidersAddCommand(
        {
          id: "test-provider",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          maxTokens: "0",
        },
        runtime as never,
      ),
    ).rejects.toThrow('Invalid --max-tokens: "0" (must be a positive integer)');

    await expect(
      modelsProvidersAddCommand(
        {
          id: "test-provider",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          maxTokens: "-100",
        },
        runtime as never,
      ),
    ).rejects.toThrow('Invalid --max-tokens: "-100" (must be a positive integer)');
  });

  it("throws when --context-window is a float (non-integer)", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    await expect(
      modelsProvidersAddCommand(
        {
          id: "test-provider",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          contextWindow: "1.5",
        },
        runtime as never,
      ),
    ).rejects.toThrow('Invalid --context-window: "1.5" (must be a positive integer)');
  });

  it("throws when --max-tokens contains trailing non-numeric characters", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    await expect(
      modelsProvidersAddCommand(
        {
          id: "test-provider",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          maxTokens: "123abc",
        },
        runtime as never,
      ),
    ).rejects.toThrow('Invalid --max-tokens: "123abc" (must be a positive integer)');
  });

  it("throws when --input contains invalid types", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    await expect(
      modelsProvidersAddCommand(
        {
          id: "test-provider",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          input: "text,video",
        },
        runtime as never,
      ),
    ).rejects.toThrow('Invalid --input: "video" (allowed: text, image)');

    await expect(
      modelsProvidersAddCommand(
        {
          id: "test-provider",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          input: "audio",
        },
        runtime as never,
      ),
    ).rejects.toThrow('Invalid --input: "audio" (allowed: text, image)');
  });

  it("writes headers to config when --headers is valid JSON", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    await modelsProvidersAddCommand(
      {
        id: "headers-provider",
        baseUrl: "https://api.example.com/v1",
        api: "anthropic-messages",
        model: "test-model",
        headers: '{"x-api-key":"abc","x-custom":"value"}',
      },
      runtime as never,
    );

    const configContent = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configContent);

    expect(config.models?.providers?.["headers-provider"]).toBeDefined();
    expect(config.models?.providers?.["headers-provider"].headers).toEqual({
      "x-api-key": "abc",
      "x-custom": "value",
    });
  });

  it("throws when --headers is invalid JSON", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    await expect(
      modelsProvidersAddCommand(
        {
          id: "test-provider",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          headers: "not-json",
        },
        runtime as never,
      ),
    ).rejects.toThrow(/Invalid --headers:/);
  });

  it("writes authHeader to config when --auth-header is provided", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    await modelsProvidersAddCommand(
      {
        id: "auth-header-provider",
        baseUrl: "https://api.example.com/v1",
        api: "anthropic-messages",
        model: "test-model",
        authHeader: true,
      },
      runtime as never,
    );

    const configContent = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configContent);

    expect(config.models?.providers?.["auth-header-provider"]).toBeDefined();
    expect(config.models?.providers?.["auth-header-provider"].authHeader).toBe(true);
  });

  it("throws when both --api-key and --token are provided", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    await expect(
      modelsProvidersAddCommand(
        {
          id: "test-provider",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          apiKey: "sk-test",
          token: "my-token",
        },
        runtime as never,
      ),
    ).rejects.toThrow("Cannot specify both --api-key and --token. Use only one.");
  });

  it("throws in non-TTY mode when required params are missing", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    // Mock stdin.isTTY to false
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      await expect(
        modelsProvidersAddCommand(
          {
            // Missing --id, --base-url, --model
          },
          runtime as never,
        ),
      ).rejects.toThrow("Missing required parameters in non-interactive mode: --id, --base-url, --model");

      await expect(
        modelsProvidersAddCommand(
          {
            id: "test-provider",
            // Missing --base-url, --model
          },
          runtime as never,
        ),
      ).rejects.toThrow("Missing required parameters in non-interactive mode: --base-url, --model");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }
  });

  it("defaults to anthropic-messages API in non-TTY mode when --api is missing", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    // Mock stdin.isTTY to false
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      await modelsProvidersAddCommand(
        {
          id: "default-api-provider",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          // --api is NOT provided
        },
        runtime as never,
      );
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }

    const configContent = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configContent);

    // Should use default API type without prompting
    expect(config.models?.providers?.["default-api-provider"]).toBeDefined();
    expect(config.models?.providers?.["default-api-provider"].api).toBe("anthropic-messages");
    expect(logs.some((l) => l.includes("API: anthropic-messages"))).toBe(true);
  });

  it("throws in non-TTY mode when --api is invalid", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    // Mock stdin.isTTY to false
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      await expect(
        modelsProvidersAddCommand(
          {
            id: "test-provider",
            baseUrl: "https://api.example.com/v1",
            model: "test-model",
            api: "invalid-api-type",
          },
          runtime as never,
        ),
      ).rejects.toThrow(
        'Invalid --api: "invalid-api-type" (must be one of: anthropic-messages, openai-completions, openai-responses, google-generative-ai, bedrock-converse-stream)',
      );
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }
  });

  it("--api-key-env writes to config apiKey, not auth profile", async () => {
    await fs.writeFile(configPath, JSON.stringify({}));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    // Mock stdin.isTTY to false (non-interactive)
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      await modelsProvidersAddCommand(
        {
          id: "env-test-provider",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          api: "anthropic-messages",
          apiKeyEnv: "MY_API_KEY_VAR",
        },
        runtime as never,
      );
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }

    // Verify config has apiKey set to env var name
    const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
    expect(config.models?.providers?.["env-test-provider"]?.apiKey).toBe("MY_API_KEY_VAR");

    // Verify no auth profile was created
    expect(config.auth?.profiles?.["env-test-provider:default"]).toBeUndefined();
  });

  it("--api-key-env accepts ${ENV} and normalizes to ENV", async () => {
    await fs.writeFile(configPath, JSON.stringify({}));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    // Mock stdin.isTTY to false (non-interactive)
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      await modelsProvidersAddCommand(
        {
          id: "env-normalize-provider",
          baseUrl: "https://api.example.com/v1",
          model: "test-model",
          api: "anthropic-messages",
          apiKeyEnv: "${MY_WRAPPED_VAR}",
        },
        runtime as never,
      );
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }

    // Verify config has apiKey set to unwrapped env var name
    const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
    expect(config.models?.providers?.["env-normalize-provider"]?.apiKey).toBe("MY_WRAPPED_VAR");
  });

  it("--api-key-env throws when used with --api-key", async () => {
    await fs.writeFile(configPath, JSON.stringify({}));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    // Mock stdin.isTTY to false (non-interactive)
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      await expect(
        modelsProvidersAddCommand(
          {
            id: "conflict-provider",
            baseUrl: "https://api.example.com/v1",
            model: "test-model",
            api: "anthropic-messages",
            apiKey: "some-key",
            apiKeyEnv: "MY_ENV_VAR",
          },
          runtime as never,
        ),
      ).rejects.toThrow("--api-key-env cannot be used with --api-key or --token");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }
  });

  it("--api-key-env throws when used with --token", async () => {
    await fs.writeFile(configPath, JSON.stringify({}));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    // Mock stdin.isTTY to false (non-interactive)
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      await expect(
        modelsProvidersAddCommand(
          {
            id: "conflict-provider-token",
            baseUrl: "https://api.example.com/v1",
            model: "test-model",
            api: "anthropic-messages",
            token: "some-token",
            apiKeyEnv: "MY_ENV_VAR",
          },
          runtime as never,
        ),
      ).rejects.toThrow("--api-key-env cannot be used with --api-key or --token");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }
  });

  it("--api-key-env throws on invalid env var name", async () => {
    await fs.writeFile(configPath, JSON.stringify({}));

    const { modelsProvidersAddCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    // Mock stdin.isTTY to false (non-interactive)
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    try {
      // Test with space in env var name
      await expect(
        modelsProvidersAddCommand(
          {
            id: "invalid-env-provider",
            baseUrl: "https://api.example.com/v1",
            model: "test-model",
            api: "anthropic-messages",
            apiKeyEnv: "bad var",
          },
          runtime as never,
        ),
      ).rejects.toThrow('Invalid --api-key-env: "bad var" (must be ENV_VAR or ${ENV_VAR})');

      // Test with wrapped invalid env var name
      await expect(
        modelsProvidersAddCommand(
          {
            id: "invalid-env-provider2",
            baseUrl: "https://api.example.com/v1",
            model: "test-model",
            api: "anthropic-messages",
            apiKeyEnv: "${bad var}",
          },
          runtime as never,
        ),
      ).rejects.toThrow('Invalid --api-key-env: "${bad var}" (must be ENV_VAR or ${ENV_VAR})');
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
    }
  });
});

describe("modelsProvidersListCommand", () => {
  let tempDir: string;
  let configPath: string;
  let previousStateDir: string | undefined;
  let previousConfigPath: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-providers-list-"));
    configPath = path.join(tempDir, "config.json");
    previousStateDir = process.env.OPENCLAW_STATE_DIR;
    previousConfigPath = process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_STATE_DIR = tempDir;
    process.env.OPENCLAW_CONFIG_PATH = configPath;
    vi.resetModules();
  });

  afterEach(async () => {
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    if (previousConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = previousConfigPath;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("lists configured providers", async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        models: {
          providers: {
            "my-provider": {
              baseUrl: "https://api.example.com/v1",
              api: "anthropic-messages",
              models: [{ id: "my-model", name: "My Model" }],
            },
          },
        },
      }),
    );

    const { modelsProvidersListCommand } = await import("./providers.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    await modelsProvidersListCommand({}, runtime as never);

    expect(logs.some((l) => l.includes("my-provider"))).toBe(true);
    expect(logs.some((l) => l.includes("https://api.example.com/v1"))).toBe(true);
  });

  it("outputs JSON when --json is set", async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        models: {
          providers: {
            "test-provider": {
              baseUrl: "https://test.com/v1",
              api: "openai-completions",
              models: [],
            },
          },
        },
      }),
    );

    const { modelsProvidersListCommand } = await import("./providers.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    await modelsProvidersListCommand({ json: true }, runtime as never);

    const output = logs.join("\n");
    const parsed = JSON.parse(output);
    expect(parsed["test-provider"]).toBeDefined();
    expect(parsed["test-provider"].baseUrl).toBe("https://test.com/v1");
  });
});

describe("modelsProvidersRemoveCommand", () => {
  let tempDir: string;
  let configPath: string;
  let previousStateDir: string | undefined;
  let previousConfigPath: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-providers-remove-"));
    configPath = path.join(tempDir, "config.json");
    previousStateDir = process.env.OPENCLAW_STATE_DIR;
    previousConfigPath = process.env.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_STATE_DIR = tempDir;
    process.env.OPENCLAW_CONFIG_PATH = configPath;
    vi.resetModules();
  });

  afterEach(async () => {
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    if (previousConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = previousConfigPath;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("removes a provider from config", async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        models: {
          providers: {
            "to-remove": {
              baseUrl: "https://api.example.com/v1",
              models: [],
            },
            "to-keep": {
              baseUrl: "https://other.com/v1",
              models: [],
            },
          },
        },
      }),
    );

    const { modelsProvidersRemoveCommand } = await import("./providers.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    await modelsProvidersRemoveCommand("to-remove", runtime as never);

    const configContent = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configContent);

    expect(config.models?.providers?.["to-remove"]).toBeUndefined();
    expect(config.models?.providers?.["to-keep"]).toBeDefined();
    expect(logs.some((l) => l.includes("Provider removed: to-remove"))).toBe(true);
  });

  it("throws when provider not found", async () => {
    await fs.writeFile(configPath, JSON.stringify({ models: { providers: {} } }));

    const { modelsProvidersRemoveCommand } = await import("./providers.js");

    const runtime = {
      log: () => {},
      error: () => {},
    };

    await expect(
      modelsProvidersRemoveCommand("nonexistent", runtime as never),
    ).rejects.toThrow('Provider "nonexistent" not found');
  });

  it("shows auth profile cleanup warning after removing provider", async () => {
    await fs.writeFile(
      configPath,
      JSON.stringify({
        models: {
          providers: {
            "my-provider": {
              baseUrl: "https://api.example.com/v1",
              models: [],
            },
          },
        },
      }),
    );

    const { modelsProvidersRemoveCommand } = await import("./providers.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    await modelsProvidersRemoveCommand("my-provider", runtime as never);

    expect(logs.some((l) => l.includes("Provider removed: my-provider"))).toBe(true);
    expect(logs.some((l) => l.includes("Auth profiles") && l.includes("my-provider:default"))).toBe(
      true,
    );
    expect(logs.some((l) => l.includes("must be removed manually"))).toBe(true);
  });
});
