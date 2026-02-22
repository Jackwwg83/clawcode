/**
 * Bridge OpenClaw plugin hooks to Claude Agent SDK hook system.
 *
 * Maps:
 *   OpenClaw before_tool_call -> SDK PreToolUse
 *   OpenClaw after_tool_call -> SDK PostToolUse
 *   OpenClaw before_compaction -> SDK PreCompact
 *   OpenClaw session_start -> SDK SessionStart
 *   OpenClaw session_end -> SDK SessionEnd
 */
import type {
  HookEvent,
  HookCallbackMatcher,
  HookCallback,
  HookJSONOutput,
  PreToolUseHookSpecificOutput,
} from "@anthropic-ai/claude-agent-sdk";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { getGlobalHookRunner } from "../../plugins/hook-runner-global.js";
import { isPlainObject } from "../../utils.js";

const log = createSubsystemLogger("agents/claude-sdk/hook-bridge");

type HookBridgeContext = {
  agentId?: string;
  sessionKey?: string;
};

type GlobalHookRunner = NonNullable<ReturnType<typeof getGlobalHookRunner>>;

export function buildSdkHooks(
  ctx: HookBridgeContext,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> | undefined {
  const hookRunner = getGlobalHookRunner();
  if (!hookRunner) {
    return undefined;
  }

  const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};

  // before_tool_call -> PreToolUse
  if (hookRunner.hasHooks("before_tool_call")) {
    hooks.PreToolUse = [
      {
        hooks: [createPreToolUseHook(hookRunner, ctx)],
      },
    ];
  }

  // after_tool_call -> PostToolUse
  if (hookRunner.hasHooks("after_tool_call")) {
    hooks.PostToolUse = [
      {
        hooks: [createPostToolUseHook(hookRunner, ctx)],
      },
    ];
  }

  // before_compaction -> PreCompact
  if (hookRunner.hasHooks("before_compaction")) {
    hooks.PreCompact = [
      {
        hooks: [createPreCompactHook(hookRunner, ctx)],
      },
    ];
  }

  // session_start -> SessionStart
  if (hookRunner.hasHooks("session_start")) {
    hooks.SessionStart = [
      {
        hooks: [createSessionStartHook(hookRunner, ctx)],
      },
    ];
  }

  // session_end -> SessionEnd
  if (hookRunner.hasHooks("session_end")) {
    hooks.SessionEnd = [
      {
        hooks: [createSessionEndHook(hookRunner, ctx)],
      },
    ];
  }

  return Object.keys(hooks).length > 0 ? hooks : undefined;
}

function createPreToolUseHook(hookRunner: GlobalHookRunner, ctx: HookBridgeContext): HookCallback {
  return async (input): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== "PreToolUse") {
      return { continue: true };
    }
    try {
      const toolInput = isPlainObject(input.tool_input) ? input.tool_input : {};
      const result = await hookRunner.runBeforeToolCall(
        {
          toolName: input.tool_name,
          params: toolInput,
        },
        {
          toolName: input.tool_name,
          agentId: ctx.agentId,
          sessionKey: ctx.sessionKey,
        },
      );

      if (result?.block) {
        const specificOutput: PreToolUseHookSpecificOutput = {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: result.blockReason || "Blocked by OpenClaw plugin hook",
        };
        return {
          continue: true,
          hookSpecificOutput: specificOutput,
        };
      }

      if (result?.params && isPlainObject(result.params)) {
        const updatedInput =
          isPlainObject(input.tool_input) && isPlainObject(result.params)
            ? { ...input.tool_input, ...result.params }
            : result.params;
        const specificOutput: PreToolUseHookSpecificOutput = {
          hookEventName: "PreToolUse",
          updatedInput,
        };
        return {
          continue: true,
          hookSpecificOutput: specificOutput,
        };
      }
    } catch (err) {
      log.warn(`PreToolUse bridge error for ${input.tool_name}: ${String(err)}`);
    }

    return { continue: true };
  };
}

function createPostToolUseHook(hookRunner: GlobalHookRunner, ctx: HookBridgeContext): HookCallback {
  return async (input): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== "PostToolUse") {
      return { continue: true };
    }
    try {
      const toolInput = isPlainObject(input.tool_input) ? input.tool_input : {};
      await hookRunner.runAfterToolCall(
        {
          toolName: input.tool_name,
          params: toolInput,
          result: input.tool_response,
        },
        {
          toolName: input.tool_name,
          agentId: ctx.agentId,
          sessionKey: ctx.sessionKey,
        },
      );
    } catch (err) {
      log.warn(`PostToolUse bridge error for ${input.tool_name}: ${String(err)}`);
    }
    return { continue: true };
  };
}

function createPreCompactHook(hookRunner: GlobalHookRunner, ctx: HookBridgeContext): HookCallback {
  return async (input): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== "PreCompact") {
      return { continue: true };
    }
    try {
      await hookRunner.runBeforeCompaction(
        {
          messageCount: 0,
          sessionFile: input.transcript_path,
        },
        {
          agentId: ctx.agentId,
          sessionKey: ctx.sessionKey,
          sessionId: input.session_id,
        },
      );
    } catch (err) {
      log.warn(`PreCompact bridge error: ${String(err)}`);
    }
    return { continue: true };
  };
}

function createSessionStartHook(
  hookRunner: GlobalHookRunner,
  ctx: HookBridgeContext,
): HookCallback {
  return async (input): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== "SessionStart") {
      return { continue: true };
    }
    try {
      await hookRunner.runSessionStart(
        {
          sessionId: input.session_id,
        },
        {
          agentId: ctx.agentId,
          sessionId: input.session_id,
        },
      );
    } catch (err) {
      log.warn(`SessionStart bridge error: ${String(err)}`);
    }
    return { continue: true };
  };
}

function createSessionEndHook(hookRunner: GlobalHookRunner, ctx: HookBridgeContext): HookCallback {
  return async (input): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== "SessionEnd") {
      return { continue: true };
    }
    try {
      await hookRunner.runSessionEnd(
        {
          sessionId: input.session_id,
          messageCount: 0,
        },
        {
          agentId: ctx.agentId,
          sessionId: input.session_id,
        },
      );
    } catch (err) {
      log.warn(`SessionEnd bridge error: ${String(err)}`);
    }
    return { continue: true };
  };
}

export const __testing = {
  buildSdkHooks,
};
