/**
 * Tests for models auth commands
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock clack prompts to avoid TTY issues
vi.mock("@clack/prompts", () => ({
  text: vi.fn().mockResolvedValue("test-token-value"),
  confirm: vi.fn().mockResolvedValue(true),
  select: vi.fn().mockResolvedValue("anthropic"),
}));

describe("modelsAuthPasteTokenCommand", () => {
  let tempDir: string;
  let configPath: string;
  let previousStateDir: string | undefined;
  let previousAgentDir: string | undefined;
  let previousConfigPath: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-auth-"));
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

  it("sets env vars when --base-url is provided for anthropic", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsAuthPasteTokenCommand } = await import("./auth.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    await modelsAuthPasteTokenCommand(
      {
        provider: "anthropic",
        baseUrl: "https://custom.anthropic.com/v1",
      },
      runtime as never,
    );

    // Check config was updated with env vars
    const configContent = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configContent);

    expect(config.env?.ANTHROPIC_BASE_URL).toBe("https://custom.anthropic.com/v1");
    expect(config.env?.ANTHROPIC_AUTH_TOKEN).toBe("test-token-value");

    // Check auth profile was created
    expect(config.auth?.profiles?.["anthropic:manual"]).toBeDefined();
    expect(config.auth?.profiles?.["anthropic:manual"].mode).toBe("token");

    // Check logs mention env vars
    expect(logs.some((l) => l.includes("ANTHROPIC_BASE_URL"))).toBe(true);
    expect(logs.some((l) => l.includes("ANTHROPIC_AUTH_TOKEN"))).toBe(true);
  });

  it("does not set env vars for non-anthropic provider with --base-url", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsAuthPasteTokenCommand } = await import("./auth.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    await modelsAuthPasteTokenCommand(
      {
        provider: "openai",
        baseUrl: "https://custom.openai.com/v1",
      },
      runtime as never,
    );

    const configContent = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configContent);

    // Should NOT set ANTHROPIC env vars for non-anthropic provider
    expect(config.env?.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(config.env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined();

    // Auth profile should still be created
    expect(config.auth?.profiles?.["openai:manual"]).toBeDefined();
  });

  it("works without --base-url (standard flow)", async () => {
    await fs.writeFile(configPath, JSON.stringify({}, null, 2));

    const { modelsAuthPasteTokenCommand } = await import("./auth.js");

    const logs: string[] = [];
    const runtime = {
      log: (msg: string) => logs.push(msg),
      error: (msg: string) => logs.push(`ERROR: ${msg}`),
    };

    await modelsAuthPasteTokenCommand(
      {
        provider: "anthropic",
      },
      runtime as never,
    );

    const configContent = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configContent);

    // Should NOT set env vars without --base-url
    expect(config.env?.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(config.env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined();

    // Auth profile should be created
    expect(config.auth?.profiles?.["anthropic:manual"]).toBeDefined();
  });
});
