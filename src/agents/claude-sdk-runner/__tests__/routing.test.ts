import { describe, it, expect, afterEach } from "vitest";
import { shouldUseClaudeSdk } from "../../pi-embedded.js";

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
    expect(shouldUseClaudeSdk({ provider: "anthropic" } as never)).toBe(false);
  });

  it("returns false when CLAWCODE_RUNTIME=pi-embedded", () => {
    process.env.CLAWCODE_RUNTIME = "pi-embedded";
    expect(shouldUseClaudeSdk({ provider: "anthropic" } as never)).toBe(false);
  });

  it("returns true when CLAWCODE_RUNTIME=claude-sdk and provider=anthropic", () => {
    process.env.CLAWCODE_RUNTIME = "claude-sdk";
    expect(shouldUseClaudeSdk({ provider: "anthropic" } as never)).toBe(true);
  });

  it("returns false when CLAWCODE_RUNTIME=claude-sdk and provider=openai", () => {
    process.env.CLAWCODE_RUNTIME = "claude-sdk";
    expect(shouldUseClaudeSdk({ provider: "openai" } as never)).toBe(false);
  });

  it("returns false when CLAWCODE_RUNTIME=claude-sdk and provider is empty", () => {
    process.env.CLAWCODE_RUNTIME = "claude-sdk";
    expect(shouldUseClaudeSdk({ provider: "" } as never)).toBe(false);
    expect(shouldUseClaudeSdk({ provider: undefined } as never)).toBe(false);
    expect(shouldUseClaudeSdk({} as never)).toBe(false);
  });

  it("returns false when CLAWCODE_RUNTIME=claude-sdk and provider is whitespace", () => {
    process.env.CLAWCODE_RUNTIME = "claude-sdk";
    expect(shouldUseClaudeSdk({ provider: "  " } as never)).toBe(false);
  });
});
