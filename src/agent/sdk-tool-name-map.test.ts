import { describe, expect, it } from "vitest";
import { mapToolToCanonical, SDK_TO_OPENCLAW, MCP_TO_OPENCLAW } from "./sdk-tool-name-map.js";

describe("mapToolToCanonical", () => {
  it("maps SDK built-in tool names to canonical names", () => {
    expect(mapToolToCanonical("Read")).toBe("read");
    expect(mapToolToCanonical("Write")).toBe("write");
    expect(mapToolToCanonical("Bash")).toBe("exec");
    expect(mapToolToCanonical("Glob")).toBe("glob");
    expect(mapToolToCanonical("WebSearch")).toBe("web_search");
    expect(mapToolToCanonical("Task")).toBe("task");
  });

  it("maps MCP tool names to canonical names", () => {
    expect(mapToolToCanonical("mcp__memory__recall")).toBe("memory_search");
    expect(mapToolToCanonical("mcp__memory__remember")).toBe("memory_get");
    expect(mapToolToCanonical("mcp__sessions__list")).toBe("sessions_list");
    expect(mapToolToCanonical("mcp__message__send")).toBe("message");
    expect(mapToolToCanonical("mcp__browser__invoke")).toBe("browser");
  });

  it("falls back to lowercase for unknown tool names", () => {
    expect(mapToolToCanonical("CustomTool")).toBe("customtool");
    expect(mapToolToCanonical("SomePlugin")).toBe("someplugin");
  });

  it("handles already-lowercase names", () => {
    expect(mapToolToCanonical("read")).toBe("read");
    expect(mapToolToCanonical("exec")).toBe("exec");
  });
});

describe("SDK_TO_OPENCLAW", () => {
  it("covers all 9 built-in tools", () => {
    expect(Object.keys(SDK_TO_OPENCLAW)).toHaveLength(9);
  });
});

describe("MCP_TO_OPENCLAW", () => {
  it("covers all known MCP tools", () => {
    expect(Object.keys(MCP_TO_OPENCLAW)).toHaveLength(10);
  });
});
