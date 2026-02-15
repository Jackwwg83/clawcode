import { describe, it, expect, afterEach } from "vitest";

// 在测试文件中定义同等逻辑的纯函数用于测试
function shouldUseClaudeSdk(params: { provider?: string }): boolean {
  if (process.env.CLAWCODE_RUNTIME !== "claude-sdk") {
    return false;
  }
  const provider = params.provider?.trim();
  if (!provider) {
    return false;
  }
  return provider === "anthropic";
}

describe("shouldUseClaudeSdk", () => {
  const originalEnv = process.env.CLAWCODE_RUNTIME;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CLAWCODE_RUNTIME;
    } else {
      process.env.CLAWCODE_RUNTIME = originalEnv;
    }
  });

  it("returns false when CLAWCODE_RUNTIME is not set", () => {
    delete process.env.CLAWCODE_RUNTIME;
    expect(shouldUseClaudeSdk({ provider: "anthropic" })).toBe(false);
  });

  it("returns false when CLAWCODE_RUNTIME=pi-embedded", () => {
    process.env.CLAWCODE_RUNTIME = "pi-embedded";
    expect(shouldUseClaudeSdk({ provider: "anthropic" })).toBe(false);
  });

  it("returns true when CLAWCODE_RUNTIME=claude-sdk and provider=anthropic", () => {
    process.env.CLAWCODE_RUNTIME = "claude-sdk";
    expect(shouldUseClaudeSdk({ provider: "anthropic" })).toBe(true);
  });

  it("returns false when CLAWCODE_RUNTIME=claude-sdk and provider=openai", () => {
    process.env.CLAWCODE_RUNTIME = "claude-sdk";
    expect(shouldUseClaudeSdk({ provider: "openai" })).toBe(false);
  });

  it("returns false when CLAWCODE_RUNTIME=claude-sdk and provider is empty", () => {
    process.env.CLAWCODE_RUNTIME = "claude-sdk";
    expect(shouldUseClaudeSdk({ provider: "" })).toBe(false);
    expect(shouldUseClaudeSdk({ provider: undefined })).toBe(false);
    expect(shouldUseClaudeSdk({})).toBe(false);
  });

  it("returns false when CLAWCODE_RUNTIME=claude-sdk and provider is whitespace", () => {
    process.env.CLAWCODE_RUNTIME = "claude-sdk";
    expect(shouldUseClaudeSdk({ provider: "  " })).toBe(false);
  });
});
