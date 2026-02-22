import { describe, expect, it, vi } from "vitest";
import { __testing } from "../mcp-tool-bridge.js";
import { createStreamState } from "../stream-adapter.js";

const { toMcpToolDefinition } = __testing;

describe("memory tool MCP conversion", () => {
  it("converts memory_search tool to MCP format", () => {
    const mockTool = {
      name: "memory_search",
      label: "Memory Search",
      description: "Search memory files",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
        required: ["query"],
      },
      execute: vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] })),
    };

    const result = toMcpToolDefinition(mockTool as never, createStreamState());
    expect(result).toBeDefined();
    expect(result?.name).toBe("memory_search");
  });

  it("converts memory_get tool to MCP format", () => {
    const mockTool = {
      name: "memory_get",
      label: "Memory Get",
      description: "Get memory file content",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
      execute: vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] })),
    };

    const result = toMcpToolDefinition(mockTool as never, createStreamState());
    expect(result).toBeDefined();
    expect(result?.name).toBe("memory_get");
  });
});
