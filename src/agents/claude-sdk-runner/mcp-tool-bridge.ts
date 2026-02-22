import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { randomUUID } from "node:crypto";
import type { MessagingToolSend } from "../pi-embedded-messaging.js";
import type { StreamState } from "./stream-adapter.js";
import type { RunEmbeddedPiAgentParams } from "./types.js";
import { resolveModelAuthMode } from "../model-auth.js";
import { createOpenClawCodingTools } from "../pi-tools.js";
import { createMemorySearchTool, createMemoryGetTool } from "../tools/memory-tool.js";

const INVALID_TOOL_NAME_PATTERN = /[^A-Za-z0-9._-]/;

type ToolLike = ReturnType<typeof createOpenClawCodingTools>[number];
type SdkMcpServerTool = NonNullable<Parameters<typeof createSdkMcpServer>[0]["tools"]>[number];

export function buildOpenClawMcpServer(params: {
  runParams: RunEmbeddedPiAgentParams;
  streamState: StreamState;
}): McpSdkServerConfigWithInstance | undefined {
  const { runParams, streamState } = params;
  if (runParams.disableTools) {
    return undefined;
  }

  const tools = createOpenClawCodingTools({
    exec: {
      ...runParams.execOverrides,
      elevated: runParams.bashElevated,
    },
    messageProvider: runParams.messageChannel ?? runParams.messageProvider,
    agentAccountId: runParams.agentAccountId,
    messageTo: runParams.messageTo,
    messageThreadId: runParams.messageThreadId,
    groupId: runParams.groupId,
    groupChannel: runParams.groupChannel,
    groupSpace: runParams.groupSpace,
    spawnedBy: runParams.spawnedBy,
    senderId: runParams.senderId,
    senderName: runParams.senderName,
    senderUsername: runParams.senderUsername,
    senderE164: runParams.senderE164,
    senderIsOwner: runParams.senderIsOwner,
    sessionKey: runParams.sessionKey ?? runParams.sessionId,
    agentDir: runParams.agentDir,
    workspaceDir: runParams.workspaceDir,
    config: runParams.config,
    abortSignal: runParams.abortSignal,
    modelProvider: runParams.provider,
    modelId: runParams.model,
    modelAuthMode: resolveModelAuthMode(runParams.provider, runParams.config),
    currentChannelId: runParams.currentChannelId,
    currentThreadTs: runParams.currentThreadTs,
    replyToMode: runParams.replyToMode,
    hasRepliedRef: runParams.hasRepliedRef,
    requireExplicitMessageTarget: runParams.requireExplicitMessageTarget,
    disableMessageTool: runParams.disableMessageTool,
  });

  // Inject memory tools if config supports them.
  const memoryTools: ToolLike[] = [];
  const sessionKey = runParams.sessionKey ?? runParams.sessionId;
  const memorySearchTool = createMemorySearchTool({
    config: runParams.config,
    agentSessionKey: sessionKey,
  });
  if (memorySearchTool) {
    memoryTools.push(memorySearchTool);
  }
  const memoryGetTool = createMemoryGetTool({
    config: runParams.config,
    agentSessionKey: sessionKey,
  });
  if (memoryGetTool) {
    memoryTools.push(memoryGetTool);
  }

  const allTools = [...tools, ...memoryTools];
  const mcpTools = allTools
    .map((tool) => toMcpToolDefinition(tool, streamState))
    .filter((tool): tool is SdkMcpServerTool => Boolean(tool));

  if (mcpTools.length === 0) {
    return undefined;
  }

  return createSdkMcpServer({
    name: "openclaw",
    version: "1.0.0",
    tools: mcpTools,
  });
}

function toMcpToolDefinition(
  tool: ToolLike,
  streamState: StreamState,
): SdkMcpServerTool | undefined {
  const name = tool.name?.trim();
  if (!name || INVALID_TOOL_NAME_PATTERN.test(name) || name.length > 128) {
    return undefined;
  }
  const inputSchema = toMcpInputSchema(tool.parameters);
  return {
    name,
    description: tool.description || tool.label || `${name} tool`,
    inputSchema,
    handler: async (args, extra) => {
      const toolCallId = randomUUID();
      const signal = extractSignal(extra);
      const params =
        args && typeof args === "object"
          ? (args as Record<string, unknown>)
          : ({} as Record<string, unknown>);

      streamState.usedToolNames.add(name);
      collectMessagingSignalsFromInput(name, params, streamState);

      try {
        const result = await tool.execute(toolCallId, params as never, signal);
        collectMessagingSignalsFromResult(name, result?.details, streamState);
        return toMcpCallToolResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `[${name}] ${message}` }],
        };
      }
    },
  };
}

function toMcpInputSchema(parameters: unknown): Record<string, unknown> {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    return { type: "object", properties: {}, additionalProperties: true };
  }
  const schema = parameters as Record<string, unknown>;
  if (schema.type === undefined) {
    return {
      type: "object",
      properties: {},
      additionalProperties: true,
    };
  }
  return schema;
}

function extractSignal(extra: unknown): AbortSignal | undefined {
  if (!extra || typeof extra !== "object") {
    return undefined;
  }
  if ("signal" in extra) {
    const signal = (extra as { signal?: unknown }).signal;
    if (signal instanceof AbortSignal) {
      return signal;
    }
  }
  return undefined;
}

function toMcpCallToolResult(result: {
  content?: Array<{
    type?: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  details?: unknown;
}): {
  content: Array<
    { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
  >;
  structuredContent?: Record<string, unknown> | unknown[];
} {
  const content: Array<
    { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
  > = [];
  for (const block of result.content ?? []) {
    if (block?.type === "text" && typeof block.text === "string") {
      content.push({ type: "text", text: block.text });
      continue;
    }
    if (
      block?.type === "image" &&
      typeof block.data === "string" &&
      typeof block.mimeType === "string"
    ) {
      content.push({ type: "image", data: block.data, mimeType: block.mimeType });
    }
  }

  if (content.length === 0) {
    const detailsText =
      typeof result.details === "string"
        ? result.details
        : JSON.stringify(result.details ?? { ok: true }, null, 2);
    content.push({ type: "text", text: detailsText });
  }

  return {
    content,
    structuredContent: toStructuredContent(result.details),
  };
}

function toStructuredContent(details: unknown): Record<string, unknown> | unknown[] | undefined {
  if (!details) {
    return undefined;
  }
  if (Array.isArray(details)) {
    return details;
  }
  if (typeof details === "object") {
    return details as Record<string, unknown>;
  }
  return undefined;
}

function collectMessagingSignalsFromInput(
  toolName: string,
  input: Record<string, unknown>,
  streamState: StreamState,
): void {
  if (!isMessagingToolName(toolName)) {
    return;
  }
  pushMaybeText(streamState.messagingToolSentTexts, input.text);
  pushMaybeText(streamState.messagingToolSentTexts, input.message);
  pushMaybeText(streamState.messagingToolSentTexts, input.content);
  pushMaybeText(streamState.messagingToolSentTexts, input.body);
  pushMaybeTarget(streamState.messagingToolSentTargets, toolName, input.to);
  pushMaybeTarget(streamState.messagingToolSentTargets, toolName, input.target);
  pushMaybeTarget(streamState.messagingToolSentTargets, toolName, input.sessionKey);
}

function collectMessagingSignalsFromResult(
  toolName: string,
  details: unknown,
  streamState: StreamState,
): void {
  if (!isMessagingToolName(toolName) || !details || typeof details !== "object") {
    return;
  }
  const payload = details as Record<string, unknown>;
  pushMaybeText(streamState.messagingToolSentTexts, payload.text);
  pushMaybeText(streamState.messagingToolSentTexts, payload.message);
  pushMaybeTarget(streamState.messagingToolSentTargets, toolName, payload.to);
  pushMaybeTarget(streamState.messagingToolSentTargets, toolName, payload.target);

  const texts = payload.texts;
  if (Array.isArray(texts)) {
    for (const text of texts) {
      pushMaybeText(streamState.messagingToolSentTexts, text);
    }
  }
}

function pushMaybeText(target: string[], value: unknown): void {
  if (typeof value !== "string") {
    return;
  }
  const text = value.trim();
  if (!text) {
    return;
  }
  target.push(text);
}

function pushMaybeTarget(targets: MessagingToolSend[], toolName: string, value: unknown): void {
  if (typeof value !== "string") {
    return;
  }
  const to = value.trim();
  if (!to) {
    return;
  }
  const provider = to.includes(":") ? (to.split(":", 1)[0] ?? "unknown") : "unknown";
  targets.push({
    tool: normalizeToolName(toolName),
    provider,
    to,
  });
}

function isMessagingToolName(toolName: string): boolean {
  const canonical = normalizeToolName(toolName);
  return (
    canonical === "message" || canonical === "sessions_send" || canonical.startsWith("message_")
  );
}

function normalizeToolName(toolName: string): string {
  const normalized = toolName.trim().toLowerCase();
  return normalized.split("__").pop() ?? normalized;
}

export const __testing = {
  toMcpToolDefinition,
  toMcpInputSchema,
  toMcpCallToolResult,
  isMessagingToolName,
  collectMessagingSignalsFromInput,
  collectMessagingSignalsFromResult,
};
