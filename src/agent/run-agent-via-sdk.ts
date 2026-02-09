/**
 * runAgentViaSdk – Drop-in replacement for runEmbeddedPiAgent.
 *
 * Accepts RunEmbeddedPiAgentParams, runs Claude Agent SDK via ClaudeSdkRunner,
 * converts SDK streaming events to OpenClaw callbacks, and returns
 * EmbeddedPiRunResult with the same shape as the old pi-coding-agent runtime.
 *
 * Phase 15b: Behavioral alignment — all three subsystems (tool strategy,
 * system prompt, payloads) now match the old pi-embedded runtime.
 */

import os from "node:os";
import type { RunEmbeddedPiAgentParams } from "../agents/pi-embedded-runner/run/params.js";
import type { EmbeddedPiRunResult } from "../agents/pi-embedded-runner/types.js";
import type { EmbeddedSandboxInfo } from "../agents/pi-embedded-runner/types.js";
import type { SandboxToolPolicy } from "../agents/sandbox/types.js";
import type { ReasoningLevel, VerboseLevel } from "../auto-reply/thinking.js";
import type { OpenClawConfig } from "../config/config.js";
import type { ToolResultFormat } from "../agents/pi-embedded-subscribe.js";
import type { SettingSource } from "./claude-sdk-runner.js";
import { createClaudeSdkRunner } from "./claude-sdk-runner.js";
import { BUILTIN_TOOLS, resolveMcpTools } from "./agent-bridge.js";
import { createOpenClawCodingTools } from "../agents/pi-tools.js";
import {
  resolveEffectiveToolPolicy,
  resolveGroupToolPolicy,
  resolveSubagentToolPolicy,
  isToolAllowedByPolicyName,
} from "../agents/pi-tools.policy.js";
import { resolveToolProfilePolicy } from "../agents/tool-policy.js";
import { isSubagentSessionKey } from "../routing/session-key.js";
import { mapToolToCanonical } from "./sdk-tool-name-map.js";
import { buildEmbeddedSystemPrompt } from "../agents/pi-embedded-runner/system-prompt.js";
import { buildSystemPromptParams } from "../agents/system-prompt-params.js";
import { resolveSessionAgentIds } from "../agents/agent-scope.js";
import { resolveDefaultModelForAgent } from "../agents/model-selection.js";
import { buildModelAliasLines } from "../agents/pi-embedded-runner/model.js";
import { buildTtsSystemPromptHint } from "../tts/tts.js";
import { resolveOpenClawDocsPath } from "../agents/docs-path.js";
import { resolveChannelCapabilities } from "../config/channel-capabilities.js";
import { listChannelSupportedActions, resolveChannelMessageToolHints } from "../agents/channel-tools.js";
import { getMachineDisplayName } from "../infra/machine-name.js";
import { normalizeMessageChannel } from "../utils/message-channel.js";
import { resolveTelegramReactionLevel } from "../telegram/reaction-level.js";
import { resolveSignalReactionLevel } from "../signal/reaction-level.js";
import { resolveTelegramInlineButtonsScope } from "../telegram/inline-buttons.js";
import { resolveHeartbeatPrompt } from "../auto-reply/heartbeat.js";
import { isReasoningTagProvider } from "../utils/provider-utils.js";
import { buildEmbeddedSandboxInfo } from "../agents/pi-embedded-runner/sandbox-info.js";
import { resolveSandboxContext } from "../agents/sandbox/context.js";
import { resolveBootstrapContextForRun } from "../agents/bootstrap-files.js";
import {
  resolveSkillsPromptForRun,
  loadWorkspaceSkillEntries,
  applySkillEnvOverrides,
  applySkillEnvOverridesFromSnapshot,
} from "../agents/skills/workspace.js";
import { DEFAULT_BOOTSTRAP_FILENAME } from "../agents/workspace.js";
import { resolveOpenClawAgentDir } from "../agents/agent-paths.js";
import { parseReplyDirectives } from "../auto-reply/reply/reply-directives.js";
import { isSilentReplyText, SILENT_REPLY_TOKEN } from "../auto-reply/tokens.js";
import { formatToolAggregate } from "../auto-reply/tool-meta.js";
import { formatReasoningMessage } from "../agents/pi-embedded-utils.js";

// ── Main entry point ─────────────────────────────────────────────────

/**
 * Run the Claude Agent SDK with the same interface as runEmbeddedPiAgent.
 *
 * This function:
 *  1. Builds settings sources from context (user + project when workspace exists).
 *  2. Builds a full system prompt via buildEmbeddedSystemPrompt (matching old runtime).
 *  3. Resolves allowedTools with full policy filtering (sequential narrowing chain).
 *  4. Streams SDK events → OpenClaw callbacks (onPartialReply, onAgentEvent, etc.).
 *  5. Parses reply directives (media, reply tags, silent replies) from SDK output.
 *  6. Returns EmbeddedPiRunResult.
 */
export async function runAgentViaSdk(
  params: RunEmbeddedPiAgentParams,
): Promise<EmbeddedPiRunResult> {
  const started = Date.now();
  const textParts: string[] = [];
  let firstTextSeen = false;

  // ── Build SDK options ──────────────────────────────────────────────
  const settingSources = resolveSettingSources(params);

  // Resolve sandbox context for tool + prompt alignment
  const sandboxSessionKey = params.sessionKey?.trim() || params.sessionId;
  const sandbox = await resolveSandboxContext({
    config: params.config,
    sessionKey: sandboxSessionKey,
    workspaceDir: params.workspaceDir,
  });

  const allowedTools = resolveAllowedTools(params, sandbox?.tools);
  const { systemPrompt, restoreSkillEnv } = await buildSdkSystemPrompt({
    workspaceDir: params.workspaceDir,
    extraSystemPrompt: params.extraSystemPrompt,
    ownerNumbers: params.ownerNumbers,
    config: params.config,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    skillsSnapshot: params.skillsSnapshot,
    provider: params.provider,
    model: params.model,
    thinkLevel: params.thinkLevel,
    reasoningLevel: params.reasoningLevel,
    allowedToolNames: allowedTools,
    channel: params.messageChannel ?? params.messageProvider,
    agentAccountId: params.agentAccountId,
    sandbox,
    bashElevated: params.bashElevated,
    // Pass full context for createOpenClawCodingTools
    messageTo: params.messageTo,
    messageThreadId: params.messageThreadId,
    groupId: params.groupId,
    groupChannel: params.groupChannel,
    groupSpace: params.groupSpace,
    spawnedBy: params.spawnedBy,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
    currentChannelId: params.currentChannelId,
    currentThreadTs: params.currentThreadTs,
    replyToMode: params.replyToMode,
    hasRepliedRef: params.hasRepliedRef,
    agentDir: params.agentDir,
    modelId: params.model,
    abortSignal: params.abortSignal,
  });
  const additionalDirectories = params.agentDir ? [params.agentDir] : undefined;

  const runner = createClaudeSdkRunner();
  const sdkOptions = {
    systemPrompt,
    settingSources,
    additionalDirectories,
    allowedTools,
    mcpServers: params.mcpServers,
    sdkSessionId: undefined as string | undefined,
    workspaceDir: params.workspaceDir,
  };

  // ── Lifecycle start ────────────────────────────────────────────────
  params.onAgentEvent?.({
    stream: "lifecycle",
    data: { phase: "start", startedAt: started },
  });

  // Track tool metadata and thinking blocks for payload building
  const toolMetas: Array<{ toolName: string; meta?: string }> = [];
  const thinkingParts: string[] = [];
  const toolIdToName = new Map<string, string>(); // Map tool_call ID → name for tool_result

  try {
    for await (const event of runner.query(params.prompt, sdkOptions)) {
      switch (event.type) {
        case "text": {
          textParts.push(event.content);

          // Signal assistant message start on first text chunk.
          if (!firstTextSeen) {
            firstTextSeen = true;
            await params.onAssistantMessageStart?.();
          }

          // Streaming callbacks
          if (params.onPartialReply) {
            await params.onPartialReply({ text: event.content });
          }
          if (params.onBlockReply) {
            await params.onBlockReply({ text: event.content });
          }
          break;
        }

        case "thinking": {
          // Capture thinking/reasoning blocks from SDK (extended thinking)
          thinkingParts.push(event.content);

          // Stream reasoning if reasoningLevel is "stream"
          if (params.reasoningLevel === "stream" && params.onReasoningStream) {
            await params.onReasoningStream({ text: event.content });
          }
          break;
        }

        case "tool_call": {
          // Capture tool ID → name mapping for later tool_result events
          toolIdToName.set(event.id, event.name);

          params.onAgentEvent?.({
            stream: "tool",
            data: { phase: "start", name: event.name, id: event.id },
          });
          break;
        }

        case "tool_result": {
          // Resolve tool name from ID mapping (tool_result events may have empty name)
          const resolvedName = toolIdToName.get(event.id) || event.name || "unknown";

          params.onAgentEvent?.({
            stream: "tool",
            data: { phase: "end", name: resolvedName, id: event.id },
          });

          // Track tool meta with CANONICAL names (Read → read, Bash → exec)
          const canonicalName = mapToolToCanonical(resolvedName);
          toolMetas.push({ toolName: canonicalName, meta: event.result });

          if (params.onToolResult && params.shouldEmitToolResult?.()) {
            await params.onToolResult({ text: event.result });
          }
          break;
        }

        case "complete": {
          // Nothing extra to do – lifecycle end is emitted below.
          break;
        }
      }
    }

    // Flush any buffered block replies.
    if (params.onBlockReplyFlush) {
      await params.onBlockReplyFlush();
    }

    // ── Build result ───────────────────────────────────────────────
    const endedAt = Date.now();
    params.onAgentEvent?.({
      stream: "lifecycle",
      data: { phase: "end", startedAt: started, endedAt },
    });

    const finalText = textParts.join("");
    const thinkingText = thinkingParts.join("");
    const payloads = buildSdkPayloads({
      assistantTexts: finalText ? [finalText] : [],
      thinkingTexts: thinkingText ? [thinkingText] : [],
      toolMetas,
      config: params.config,
      sessionKey: params.sessionKey ?? params.sessionId,
      verboseLevel: params.verboseLevel,
      reasoningLevel: params.reasoningLevel,
      toolResultFormat: params.toolResultFormat,
      inlineToolResultsAllowed: true,
    });

    return {
      payloads,
      meta: {
        durationMs: endedAt - started,
        agentMeta: {
          sessionId: params.sessionId,
          provider: params.provider ?? "anthropic",
          model: params.model ?? "claude-sonnet-4-5-20250514",
        },
      },
    };
  } catch (err) {
    const endedAt = Date.now();
    const message = err instanceof Error ? err.message : String(err);

    params.onAgentEvent?.({
      stream: "lifecycle",
      data: { phase: "error", startedAt: started, endedAt, error: message },
    });

    const errorKind = classifyErrorKind(message);

    // Context-overflow and compaction failures are returned as meta.error
    // so callers can trigger recovery (session reset, etc.).
    if (errorKind === "context_overflow" || errorKind === "compaction_failure") {
      return {
        payloads: [],
        meta: {
          durationMs: endedAt - started,
          error: { kind: errorKind, message },
        },
      };
    }

    // All other errors are thrown for the caller's catch block.
    throw err;
  } finally {
    // Restore skill environment variables (matching attempt.ts:905)
    restoreSkillEnv?.();
  }
}

// ── Settings sources ─────────────────────────────────────────────────

/**
 * Derive Claude SDK settingSources from run context.
 */
export function resolveSettingSources(
  params: Pick<RunEmbeddedPiAgentParams, "workspaceDir" | "agentDir" | "config">,
): SettingSource[] {
  const sources: SettingSource[] = ["user"];

  if (params.workspaceDir) {
    sources.push("project");
  }

  return sources;
}

// ── Tool strategy ────────────────────────────────────────────────────

/**
 * Resolve allowedTools for the Claude SDK with full policy filtering.
 *
 * Replicates the old runtime's sequential narrowing chain from pi-tools.ts:
 *  1. profile policy (with alsoAllow merged)
 *  2. provider profile policy (with alsoAllow merged)
 *  3. global policy
 *  4. global provider policy
 *  5. agent policy
 *  6. agent provider policy
 *  7. group policy
 *  8. sandbox policy
 *  9. subagent policy
 *
 * Each stage filters candidates using the policy's allow/deny patterns.
 */
export function resolveAllowedTools(
  params: Pick<
    RunEmbeddedPiAgentParams,
    | "config"
    | "disableTools"
    | "sessionKey"
    | "provider"
    | "model"
    | "spawnedBy"
    | "messageProvider"
    | "groupId"
    | "groupChannel"
    | "groupSpace"
    | "agentAccountId"
    | "senderId"
    | "senderName"
    | "senderUsername"
    | "senderE164"
    | "mcpServers"
  >,
  sandboxToolPolicy?: SandboxToolPolicy,
): string[] {
  if (params.disableTools) {
    return [];
  }

  // Resolve MCP tools from server configs and combine with builtin tools
  const mcpTools = resolveMcpTools(params.mcpServers);
  const candidates = [...BUILTIN_TOOLS, ...mcpTools];

  // Resolve all policy layers (matching pi-tools.ts lines 162-211)
  const effective = resolveEffectiveToolPolicy({
    config: params.config,
    sessionKey: params.sessionKey,
    modelProvider: params.provider,
    modelId: params.model,
  });

  const groupPolicy = resolveGroupToolPolicy({
    config: params.config,
    sessionKey: params.sessionKey,
    spawnedBy: params.spawnedBy,
    messageProvider: params.messageProvider,
    groupId: params.groupId,
    groupChannel: params.groupChannel,
    groupSpace: params.groupSpace,
    accountId: params.agentAccountId,
    senderId: params.senderId,
    senderName: params.senderName,
    senderUsername: params.senderUsername,
    senderE164: params.senderE164,
  });

  // Resolve BOTH profile policies (not just one)
  const profilePolicy = resolveToolProfilePolicy(effective.profile);
  const providerProfilePolicy = resolveToolProfilePolicy(effective.providerProfile);

  // Merge alsoAllow into profile policies (matching pi-tools.ts lines 195-206)
  const profilePolicyWithAlsoAllow = mergeAlsoAllow(profilePolicy, effective.profileAlsoAllow);
  const providerProfilePolicyWithAlsoAllow = mergeAlsoAllow(
    providerProfilePolicy,
    effective.providerProfileAlsoAllow,
  );

  const subagentPolicy = isSubagentSessionKey(params.sessionKey)
    ? resolveSubagentToolPolicy(params.config)
    : undefined;

  // Apply policies as a sequential narrowing chain (matching pi-tools.ts lines 396-422).
  // Each stage filters the output of the previous.
  const policyChain: Array<SandboxToolPolicy | undefined> = [
    profilePolicyWithAlsoAllow,
    providerProfilePolicyWithAlsoAllow,
    effective.globalPolicy,
    effective.globalProviderPolicy,
    effective.agentPolicy,
    effective.agentProviderPolicy,
    groupPolicy,
    sandboxToolPolicy,
    subagentPolicy,
  ];

  let filtered = candidates as string[];
  for (const policy of policyChain) {
    if (!policy) continue;
    filtered = filtered.filter((sdkName) => {
      const canonical = mapToolToCanonical(sdkName);
      return isToolAllowedByPolicyName(canonical, policy);
    });
  }

  return filtered;
}

/**
 * Merge alsoAllow items into a policy's allow list.
 * Matches pi-tools.ts lines 195-200.
 */
function mergeAlsoAllow(
  policy: SandboxToolPolicy | undefined,
  alsoAllow?: string[],
): SandboxToolPolicy | undefined {
  if (!policy?.allow || !Array.isArray(alsoAllow) || alsoAllow.length === 0) {
    return policy;
  }
  return { ...policy, allow: Array.from(new Set([...policy.allow, ...alsoAllow])) };
}

// ── System prompt ────────────────────────────────────────────────────

/**
 * Build a full system prompt for the Claude SDK.
 *
 * Delegates to buildEmbeddedSystemPrompt — the exact same function the old
 * runtime uses — with all params resolved from RunEmbeddedPiAgentParams context.
 *
 * Covers: runtimeInfo (full), skillsPrompt, docsPath, ttsHint,
 * workspaceNotes, reactionGuidance, messageToolHints, sandboxInfo,
 * modelAliasLines, userTimezone/time/timeFormat, contextFiles,
 * heartbeatPrompt, reasoningTagHint.
 */
export async function buildSdkSystemPrompt(params: {
  workspaceDir: string;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  skillsSnapshot?: RunEmbeddedPiAgentParams["skillsSnapshot"];
  provider?: string;
  model?: string;
  thinkLevel?: RunEmbeddedPiAgentParams["thinkLevel"];
  reasoningLevel?: RunEmbeddedPiAgentParams["reasoningLevel"];
  allowedToolNames: string[];
  channel?: string;
  agentAccountId?: string;
  sandbox?: Awaited<ReturnType<typeof resolveSandboxContext>> | null;
  bashElevated?: RunEmbeddedPiAgentParams["bashElevated"];
  // Additional context for createOpenClawCodingTools (matching attempt.ts)
  messageTo?: string;
  messageThreadId?: string | number;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  spawnedBy?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  senderUsername?: string | null;
  senderE164?: string | null;
  currentChannelId?: string;
  currentThreadTs?: string;
  replyToMode?: "off" | "first" | "all";
  hasRepliedRef?: { value: boolean };
  agentDir?: string;
  modelId?: string;
  abortSignal?: AbortSignal;
}): Promise<{ systemPrompt: string; restoreSkillEnv?: () => void }> {
  const isSubagent = isSubagentSessionKey(params.sessionKey);
  const promptMode = isSubagent ? "minimal" : "full";

  // Resolve session/agent identity
  const { defaultAgentId, sessionAgentId } = resolveSessionAgentIds({
    sessionKey: params.sessionKey,
    config: params.config,
  });
  const isDefaultAgent = sessionAgentId === defaultAgentId;

  // Resolve machine name and channel context
  const machineName = await getMachineDisplayName();
  const runtimeChannel = normalizeMessageChannel(params.channel);

  // Resolve channel capabilities
  let runtimeCapabilities = runtimeChannel
    ? (resolveChannelCapabilities({
        cfg: params.config,
        channel: runtimeChannel,
        accountId: params.agentAccountId,
      }) ?? [])
    : undefined;

  // Add Telegram inline buttons capability if enabled
  if (runtimeChannel === "telegram" && params.config) {
    const inlineButtonsScope = resolveTelegramInlineButtonsScope({
      cfg: params.config,
      accountId: params.agentAccountId ?? undefined,
    });
    if (inlineButtonsScope !== "off") {
      if (!runtimeCapabilities) runtimeCapabilities = [];
      if (!runtimeCapabilities.some((cap) => String(cap).trim().toLowerCase() === "inlinebuttons")) {
        runtimeCapabilities.push("inlineButtons");
      }
    }
  }

  // Resolve channel actions and message tool hints
  const channelActions = runtimeChannel
    ? listChannelSupportedActions({ cfg: params.config, channel: runtimeChannel })
    : undefined;
  const messageToolHints = runtimeChannel
    ? resolveChannelMessageToolHints({
        cfg: params.config,
        channel: runtimeChannel,
        accountId: params.agentAccountId,
      })
    : undefined;

  // Resolve default model label
  const defaultModelRef = resolveDefaultModelForAgent({
    cfg: params.config ?? {},
    agentId: sessionAgentId,
  });
  const defaultModelLabel = `${defaultModelRef.provider}/${defaultModelRef.model}`;

  // Build runtime info (full: matching attempt.ts lines 318-334)
  const { runtimeInfo, userTimezone, userTime, userTimeFormat } = buildSystemPromptParams({
    config: params.config,
    agentId: sessionAgentId,
    workspaceDir: params.workspaceDir,
    cwd: process.cwd(),
    runtime: {
      host: machineName,
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      node: process.version,
      model: params.model ? `${params.provider ?? "anthropic"}/${params.model}` : "unknown",
      defaultModel: defaultModelLabel,
      channel: runtimeChannel,
      capabilities: runtimeCapabilities,
      channelActions,
    },
  });

  // Resolve reaction guidance (Telegram / Signal)
  const reactionGuidance =
    runtimeChannel && params.config
      ? (() => {
          if (runtimeChannel === "telegram") {
            const resolved = resolveTelegramReactionLevel({
              cfg: params.config!,
              accountId: params.agentAccountId ?? undefined,
            });
            const level = resolved.agentReactionGuidance;
            return level ? { level, channel: "Telegram" } : undefined;
          }
          if (runtimeChannel === "signal") {
            const resolved = resolveSignalReactionLevel({
              cfg: params.config!,
              accountId: params.agentAccountId ?? undefined,
            });
            const level = resolved.agentReactionGuidance;
            return level ? { level, channel: "Signal" } : undefined;
          }
          return undefined;
        })()
      : undefined;

  // Resolve remaining prompt inputs
  const reasoningTagHint = isReasoningTagProvider(params.provider);
  const sandboxInfo = buildEmbeddedSandboxInfo(
    params.sandbox?.enabled ? params.sandbox : undefined,
    params.bashElevated,
  );
  const docsPath = await resolveOpenClawDocsPath({
    workspaceDir: params.workspaceDir,
    argv1: process.argv[1],
    cwd: process.cwd(),
    moduleUrl: import.meta.url,
  });
  const ttsHint = params.config ? buildTtsSystemPromptHint(params.config) : undefined;
  const heartbeatPrompt = isDefaultAgent
    ? resolveHeartbeatPrompt(params.config?.agents?.defaults?.heartbeat?.prompt)
    : undefined;

  // Resolve bootstrap context files (BOOTSTRAP.md, MEMORY.md, scratch/*, etc.)
  const { bootstrapFiles, contextFiles } = await resolveBootstrapContextForRun({
    workspaceDir: params.workspaceDir,
    config: params.config,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
  });

  // Derive workspaceNotes from BOOTSTRAP.md presence (matching attempt.ts:198-202)
  const workspaceNotes = bootstrapFiles.some(
    (file) => file.name === DEFAULT_BOOTSTRAP_FILENAME && !file.missing,
  )
    ? ["Reminder: commit your changes in this workspace after edits."]
    : undefined;

  // Load skill entries when snapshot is missing or incomplete (matching attempt.ts:165-169)
  const shouldLoadSkillEntries = !params.skillsSnapshot || !params.skillsSnapshot.resolvedSkills;
  const skillEntries = shouldLoadSkillEntries
    ? loadWorkspaceSkillEntries(params.workspaceDir, { config: params.config })
    : [];

  // Apply skill environment overrides (matching attempt.ts:171-179)
  const restoreSkillEnv = params.skillsSnapshot
    ? applySkillEnvOverridesFromSnapshot({
        snapshot: params.skillsSnapshot,
        config: params.config,
      })
    : applySkillEnvOverrides({
        skills: skillEntries ?? [],
        config: params.config,
      });

  // Protect against errors after skill env override: use try/finally to ensure restore
  try {
    // Resolve skills prompt from snapshot or workspace (matching attempt.ts:182-187)
    const skillsPrompt = resolveSkillsPromptForRun({
      skillsSnapshot: params.skillsSnapshot,
      entries: shouldLoadSkillEntries ? skillEntries : undefined,
      config: params.config,
      workspaceDir: params.workspaceDir,
    });

    // Create real tool definitions via createOpenClawCodingTools (matching attempt.ts)
    // Resolve agentDir
    const agentDir = params.agentDir ?? resolveOpenClawAgentDir();

    const allTools = createOpenClawCodingTools({
      workspaceDir: params.workspaceDir,
      config: params.config,
      sandbox: params.sandbox?.enabled ? params.sandbox : null,
      sessionKey: params.sessionKey ?? params.sessionId,
      agentDir,
      messageProvider: runtimeChannel,
      agentAccountId: params.agentAccountId,
      messageTo: params.messageTo,
      messageThreadId: params.messageThreadId,
      groupId: params.groupId,
      groupChannel: params.groupChannel,
      groupSpace: params.groupSpace,
      spawnedBy: params.spawnedBy,
      senderId: params.senderId,
      senderName: params.senderName,
      senderUsername: params.senderUsername,
      senderE164: params.senderE164,
      currentChannelId: params.currentChannelId,
      currentThreadTs: params.currentThreadTs,
      replyToMode: params.replyToMode,
      hasRepliedRef: params.hasRepliedRef,
      modelProvider: params.provider,
      modelId: params.modelId ?? params.model,
      abortSignal: params.abortSignal,
      exec: params.bashElevated ? { elevated: params.bashElevated } : undefined,
    });

    // Filter tools to match allowedToolNames (SDK names → canonical)
    const toolNames = params.allowedToolNames.map(mapToolToCanonical);
    const tools = allTools.filter((t) => toolNames.includes(t.name));

    const systemPrompt = buildEmbeddedSystemPrompt({
      workspaceDir: params.workspaceDir,
      defaultThinkLevel: params.thinkLevel,
      reasoningLevel: params.reasoningLevel ?? "off",
      extraSystemPrompt: params.extraSystemPrompt,
      ownerNumbers: params.ownerNumbers,
      reasoningTagHint,
      heartbeatPrompt,
      docsPath: docsPath ?? undefined,
      ttsHint,
      reactionGuidance,
      promptMode,
      runtimeInfo,
      messageToolHints,
      sandboxInfo,
      tools,
      modelAliasLines: buildModelAliasLines(params.config),
      userTimezone,
      userTime,
      userTimeFormat,
      contextFiles,
      skillsPrompt,
      workspaceNotes,
    });

    return { systemPrompt, restoreSkillEnv };
  } catch (err) {
    // Ensure skill env is restored even on error
    restoreSkillEnv?.();
    throw err;
  }
}

// ── Payloads ─────────────────────────────────────────────────────────

/**
 * Parse SDK assistant output into OpenClaw payloads.
 *
 * Matches buildEmbeddedRunPayloads semantics:
 *  - Error text handling (formatAssistantErrorText not applicable — SDK doesn't expose stopReason)
 *  - Inline tool results (formatToolAggregate + parseReplyDirectives)
 *  - Reasoning text (formatReasoningMessage when reasoningLevel === "on")
 *  - Media URL extraction (MEDIA: directives)
 *  - Reply-to tags ([[reply_to_current]], [[reply_to:<id>]])
 *  - Audio-as-voice tags ([[audio_as_voice]])
 *  - Silent reply filtering (NO_REPLY)
 *  - audioAsVoice propagation to all media items
 */
export function buildSdkPayloads(params: {
  assistantTexts: string[];
  thinkingTexts?: string[];
  toolMetas?: Array<{ toolName: string; meta?: string }>;
  lastToolError?: { toolName: string; meta?: string; error?: string };
  config?: OpenClawConfig;
  sessionKey?: string;
  verboseLevel?: VerboseLevel;
  reasoningLevel?: ReasoningLevel;
  toolResultFormat?: ToolResultFormat;
  inlineToolResultsAllowed?: boolean;
}): Array<{
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  replyToId?: string;
  isError?: boolean;
  audioAsVoice?: boolean;
  replyToTag?: boolean;
  replyToCurrent?: boolean;
}> {
  type ReplyItem = {
    text: string;
    media?: string[];
    isError?: boolean;
    replyToId?: string;
    replyToTag?: boolean;
    replyToCurrent?: boolean;
    audioAsVoice?: boolean;
  };

  const replyItems: ReplyItem[] = [];
  const useMarkdown = params.toolResultFormat === "markdown";

  // ── Inline tool results (matching payloads.ts lines 83-108) ──────
  const inlineToolResults =
    params.inlineToolResultsAllowed &&
    params.verboseLevel !== "off" &&
    (params.toolMetas?.length ?? 0) > 0;

  if (inlineToolResults && params.toolMetas) {
    for (const { toolName, meta } of params.toolMetas) {
      const agg = formatToolAggregate(toolName, meta ? [meta] : [], {
        markdown: useMarkdown,
      });
      const {
        text: cleanedText,
        mediaUrls,
        audioAsVoice,
        replyToId,
        replyToTag,
        replyToCurrent,
      } = parseReplyDirectives(agg);
      if (cleanedText) {
        replyItems.push({
          text: cleanedText,
          media: mediaUrls,
          audioAsVoice,
          replyToId,
          replyToTag,
          replyToCurrent,
        });
      }
    }
  }

  // ── Reasoning text (matching payloads.ts lines 111-117) ────────────
  if (
    params.reasoningLevel === "on" &&
    params.thinkingTexts &&
    params.thinkingTexts.length > 0
  ) {
    const combinedThinking = params.thinkingTexts.join("");
    if (combinedThinking.trim()) {
      const reasoningText = formatReasoningMessage(combinedThinking);
      if (reasoningText) {
        const {
          text: cleanedText,
          mediaUrls,
          audioAsVoice,
          replyToId,
          replyToTag,
          replyToCurrent,
        } = parseReplyDirectives(reasoningText);
        if (cleanedText) {
          replyItems.push({
            text: cleanedText,
            media: mediaUrls,
            audioAsVoice,
            replyToId,
            replyToTag,
            replyToCurrent,
          });
        }
      }
    }
  }

  // ── Answer texts (matching payloads.ts lines 163-191) ────────────
  for (const raw of params.assistantTexts) {
    const {
      text: cleanedText,
      mediaUrls,
      audioAsVoice,
      replyToId,
      replyToTag,
      replyToCurrent,
      isSilent,
    } = parseReplyDirectives(raw);

    if (isSilent) continue;
    if (!cleanedText && (!mediaUrls || mediaUrls.length === 0) && !audioAsVoice) continue;

    replyItems.push({
      text: cleanedText,
      media: mediaUrls,
      audioAsVoice,
      replyToId,
      replyToTag,
      replyToCurrent,
    });
  }

  // ── Last tool error (matching payloads.ts lines 193-231) ─────────
  if (params.lastToolError) {
    const hasUserFacingReply = replyItems.length > 0;
    const errorLower = (params.lastToolError.error ?? "").toLowerCase();
    const isRecoverableError =
      errorLower.includes("required") ||
      errorLower.includes("missing") ||
      errorLower.includes("invalid") ||
      errorLower.includes("must be") ||
      errorLower.includes("must have") ||
      errorLower.includes("needs") ||
      errorLower.includes("requires");

    if (!hasUserFacingReply && !isRecoverableError) {
      const toolSummary = formatToolAggregate(
        params.lastToolError.toolName,
        params.lastToolError.meta ? [params.lastToolError.meta] : undefined,
        { markdown: useMarkdown },
      );
      const errorSuffix = params.lastToolError.error ? `: ${params.lastToolError.error}` : "";
      replyItems.push({
        text: `⚠️ ${toolSummary} failed${errorSuffix}`,
        isError: true,
      });
    }
  }

  // ── Map to output shape + propagate audioAsVoice (lines 234-254) ─
  const hasAudioAsVoiceTag = replyItems.some((item) => item.audioAsVoice);

  return replyItems
    .map((item) => ({
      text: item.text?.trim() ? item.text.trim() : undefined,
      mediaUrls: item.media?.length ? item.media : undefined,
      mediaUrl: item.media?.[0],
      isError: item.isError,
      replyToId: item.replyToId,
      replyToTag: item.replyToTag,
      replyToCurrent: item.replyToCurrent,
      audioAsVoice: item.audioAsVoice || Boolean(hasAudioAsVoiceTag && item.media?.length),
    }))
    .filter((p) => {
      if (!p.text && !p.mediaUrl && (!p.mediaUrls || p.mediaUrls.length === 0)) {
        return false;
      }
      if (p.text && isSilentReplyText(p.text, SILENT_REPLY_TOKEN)) {
        return false;
      }
      return true;
    });
}

// ── Error classification ─────────────────────────────────────────────

/**
 * Classify an error message into OpenClaw error kinds.
 */
function classifyErrorKind(
  message: string,
): "context_overflow" | "compaction_failure" | "unknown" {
  const lower = message.toLowerCase();
  if (
    lower.includes("context_length_exceeded") ||
    lower.includes("context overflow") ||
    lower.includes("too many tokens")
  ) {
    return "context_overflow";
  }
  if (lower.includes("compaction") && lower.includes("fail")) {
    return "compaction_failure";
  }
  return "unknown";
}
