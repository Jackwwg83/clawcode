import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RunEmbeddedPiAgentParams } from "../../pi-embedded-runner/run/params.js";
import { __testing, buildSdkOptions } from "../options-builder.js";
import { createStreamState } from "../stream-adapter.js";

describe("options-builder", () => {
  it("uses run workspace as cwd and enables bypass permissions", async () => {
    const params = {
      sessionId: "s",
      sessionFile: "/tmp/s.jsonl",
      workspaceDir: "/tmp/ws",
      prompt: "hello",
      timeoutMs: 30_000,
      runId: "run",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
    } as unknown as RunEmbeddedPiAgentParams;

    const options = buildSdkOptions(params, createStreamState());
    expect(options.cwd).toBe("/tmp/ws");
    expect(options.permissionMode).toBe("bypassPermissions");
    expect(options.allowDangerouslySkipPermissions).toBe(true);
    expect(options.canUseTool).toBeUndefined();
    expect(options.persistSession).toBe(true);
    expect(options.settingSources).toEqual(["user", "project", "local"]);
    expect(options.mcpServers).toBeDefined();
  });

  it("disables SDK tools only when disableTools=true", () => {
    const params = {
      sessionId: "s",
      sessionKey: "telegram:dm:alice",
      sessionFile: "/tmp/s.jsonl",
      workspaceDir: "/tmp/ws",
      prompt: "hello",
      timeoutMs: 30_000,
      runId: "run",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      disableTools: true,
    } as unknown as RunEmbeddedPiAgentParams;

    const options = buildSdkOptions(params, createStreamState());
    expect(options.disallowedTools).toBeDefined();
    expect(options.disallowedTools).toContain("Bash");
    expect(options.disallowedTools).toContain("Read");
  });

  it("sets short alias as fallback model for dated claude model ids", () => {
    const params = {
      sessionId: "s",
      sessionFile: "/tmp/s.jsonl",
      workspaceDir: "/tmp/ws",
      prompt: "hello",
      timeoutMs: 30_000,
      runId: "run",
      provider: "anthropic",
      model: "claude-sonnet-4-6-20250929",
    } as unknown as RunEmbeddedPiAgentParams;
    const options = buildSdkOptions(params, createStreamState());
    expect(options.model).toBe("claude-sonnet-4-6-20250929");
    expect(options.fallbackModel).toBe("claude-sonnet-4-6");
  });

  it("discovers claude plugins from configured plugin paths", async () => {
    const tempDir = await fs.mkdtemp(path.join(process.cwd(), ".tmp-claude-sdk-plugin-"));
    const pluginDir = path.join(tempDir, "hello-plugin");
    await fs.mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "hello-plugin" }),
      "utf8",
    );

    const prevPluginPaths = process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS;
    try {
      process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS = tempDir;
      const params = {
        sessionId: "s",
        sessionFile: "/tmp/s.jsonl",
        workspaceDir: "/tmp/ws",
        prompt: "hello",
        timeoutMs: 30_000,
        runId: "run",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
      } as unknown as RunEmbeddedPiAgentParams;

      const options = buildSdkOptions(params, createStreamState());
      expect(options.plugins).toEqual(expect.arrayContaining([{ type: "local", path: pluginDir }]));
    } finally {
      if (prevPluginPaths === undefined) {
        delete process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS;
      } else {
        process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS = prevPluginPaths;
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("filters env with allowlist rules in buildSafeEnv", () => {
    const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const originalClawcodeRuntime = process.env.CLAWCODE_RUNTIME;
    const originalClaudeFoo = process.env.CLAUDE_FOO;
    const originalPath = process.env.PATH;
    const originalSecret = process.env.OPENCLAW_SECRET_TOKEN;

    try {
      process.env.ANTHROPIC_API_KEY = "test-key";
      process.env.CLAWCODE_RUNTIME = "claude-sdk";
      process.env.CLAUDE_FOO = "bar";
      process.env.PATH = "/usr/bin:/bin";
      process.env.OPENCLAW_SECRET_TOKEN = "do-not-leak";

      const safeEnv = __testing.buildSafeEnv();
      expect(safeEnv.ANTHROPIC_API_KEY).toBe("test-key");
      expect(safeEnv.CLAWCODE_RUNTIME).toBe("claude-sdk");
      expect(safeEnv.CLAUDE_FOO).toBe("bar");
      expect(safeEnv.PATH).toBe("/usr/bin:/bin");
      expect(safeEnv.OPENCLAW_SECRET_TOKEN).toBeUndefined();
    } finally {
      if (originalAnthropicApiKey === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
      }
      if (originalClawcodeRuntime === undefined) {
        delete process.env.CLAWCODE_RUNTIME;
      } else {
        process.env.CLAWCODE_RUNTIME = originalClawcodeRuntime;
      }
      if (originalClaudeFoo === undefined) {
        delete process.env.CLAUDE_FOO;
      } else {
        process.env.CLAUDE_FOO = originalClaudeFoo;
      }
      if (originalPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = originalPath;
      }
      if (originalSecret === undefined) {
        delete process.env.OPENCLAW_SECRET_TOKEN;
      } else {
        process.env.OPENCLAW_SECRET_TOKEN = originalSecret;
      }
    }
  });

  it("ignores plugin env paths outside allowed boundaries", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-sdk-plugin-outside-"));
    const pluginDir = path.join(tempDir, "outside-plugin");
    await fs.mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "outside-plugin" }),
      "utf8",
    );

    const prevPluginPaths = process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS;
    try {
      process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS = tempDir;
      const params = {
        sessionId: "s",
        sessionFile: "/tmp/s.jsonl",
        workspaceDir: "/tmp/ws",
        prompt: "hello",
        timeoutMs: 30_000,
        runId: "run",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
      } as unknown as RunEmbeddedPiAgentParams;

      const options = buildSdkOptions(params, createStreamState());
      const pluginPaths = (options.plugins ?? []).map((plugin) => plugin.path);
      expect(pluginPaths).not.toContain(pluginDir);
    } finally {
      if (prevPluginPaths === undefined) {
        delete process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS;
      } else {
        process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS = prevPluginPaths;
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("does not follow symlinks that resolve outside allowed boundaries", async () => {
    const insideRoot = await fs.mkdtemp(
      path.join(process.cwd(), ".tmp-claude-sdk-symlink-inside-"),
    );
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "claude-sdk-symlink-outside-"));
    const outsidePluginDir = path.join(outsideRoot, "outside-plugin");
    await fs.mkdir(path.join(outsidePluginDir, ".claude-plugin"), { recursive: true });
    await fs.writeFile(
      path.join(outsidePluginDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "outside-plugin" }),
      "utf8",
    );
    await fs.symlink(outsidePluginDir, path.join(insideRoot, "linked-outside-plugin"), "dir");

    const prevPluginPaths = process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS;
    try {
      process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS = insideRoot;
      const params = {
        sessionId: "s",
        sessionFile: "/tmp/s.jsonl",
        workspaceDir: "/tmp/ws",
        prompt: "hello",
        timeoutMs: 30_000,
        runId: "run",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
      } as unknown as RunEmbeddedPiAgentParams;

      const options = buildSdkOptions(params, createStreamState());
      const pluginPaths = (options.plugins ?? []).map((plugin) => plugin.path);
      expect(pluginPaths).not.toContain(outsidePluginDir);
    } finally {
      if (prevPluginPaths === undefined) {
        delete process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS;
      } else {
        process.env.CLAWCODE_CLAUDE_SDK_PLUGIN_PATHS = prevPluginPaths;
      }
      await fs.rm(insideRoot, { recursive: true, force: true });
      await fs.rm(outsideRoot, { recursive: true, force: true });
    }
  });

  it("injects context files and extra system prompt into append content", () => {
    const params = {
      sessionId: "s",
      sessionFile: "/tmp/s.jsonl",
      workspaceDir: "/tmp/ws",
      prompt: "hello",
      timeoutMs: 30_000,
      runId: "run",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      extraSystemPrompt: "extra prompt",
      contextFiles: [
        { path: "/workspace/SOUL.md", content: "persona" },
        { path: "/workspace/AGENTS.md", content: "rules" },
      ],
    } as unknown as RunEmbeddedPiAgentParams;

    const options = buildSdkOptions(params, createStreamState());
    const systemPrompt = options.systemPrompt as {
      type: string;
      preset: string;
      append?: string;
    };

    expect(systemPrompt.type).toBe("preset");
    expect(systemPrompt.preset).toBe("claude_code");
    expect(systemPrompt.append).toContain("# Project Context");
    expect(systemPrompt.append).toContain("## /workspace/SOUL.md");
    expect(systemPrompt.append).toContain("If SOUL.md is present, embody its persona and tone.");
    expect(systemPrompt.append).toContain("extra prompt");
  });

  it("maps thinkLevel values to maxThinkingTokens", () => {
    const expected: Record<string, number> = {
      minimal: 1024,
      low: 4096,
      medium: 16384,
      high: 32768,
      xhigh: 65536,
    };

    for (const [thinkLevel, tokens] of Object.entries(expected)) {
      const params = {
        sessionId: "s",
        sessionFile: "/tmp/s.jsonl",
        workspaceDir: "/tmp/ws",
        prompt: "hello",
        timeoutMs: 30_000,
        runId: "run",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        thinkLevel,
      } as unknown as RunEmbeddedPiAgentParams;
      const options = buildSdkOptions(params, createStreamState());
      expect(options.maxThinkingTokens).toBe(tokens);
    }

    const offParams = {
      sessionId: "s",
      sessionFile: "/tmp/s.jsonl",
      workspaceDir: "/tmp/ws",
      prompt: "hello",
      timeoutMs: 30_000,
      runId: "run",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      thinkLevel: "off",
    } as unknown as RunEmbeddedPiAgentParams;
    expect(buildSdkOptions(offParams, createStreamState()).maxThinkingTokens).toBeUndefined();
  });

  it("falls back to CLAWCODE_AGENT_CWD when workspaceDir is blank", () => {
    const originalAgentCwd = process.env.CLAWCODE_AGENT_CWD;
    try {
      process.env.CLAWCODE_AGENT_CWD = "/tmp/fallback-agent-cwd";
      const params = {
        sessionId: "s",
        sessionFile: "/tmp/s.jsonl",
        workspaceDir: "   ",
        prompt: "hello",
        timeoutMs: 30_000,
        runId: "run",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
      } as unknown as RunEmbeddedPiAgentParams;

      const options = buildSdkOptions(params, createStreamState());
      expect(options.cwd).toBe("/tmp/fallback-agent-cwd");
    } finally {
      if (originalAgentCwd === undefined) {
        delete process.env.CLAWCODE_AGENT_CWD;
      } else {
        process.env.CLAWCODE_AGENT_CWD = originalAgentCwd;
      }
    }
  });

  it("honors CLAWCODE_CLAUDE_SDK_SETTING_SOURCES override", () => {
    const originalSources = process.env.CLAWCODE_CLAUDE_SDK_SETTING_SOURCES;
    try {
      process.env.CLAWCODE_CLAUDE_SDK_SETTING_SOURCES = "project user invalid project";
      const params = {
        sessionId: "s",
        sessionFile: "/tmp/s.jsonl",
        workspaceDir: "/tmp/ws",
        prompt: "hello",
        timeoutMs: 30_000,
        runId: "run",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
      } as unknown as RunEmbeddedPiAgentParams;

      const options = buildSdkOptions(params, createStreamState());
      expect(options.settingSources).toEqual(["project", "user"]);
    } finally {
      if (originalSources === undefined) {
        delete process.env.CLAWCODE_CLAUDE_SDK_SETTING_SOURCES;
      } else {
        process.env.CLAWCODE_CLAUDE_SDK_SETTING_SOURCES = originalSources;
      }
    }
  });
});
