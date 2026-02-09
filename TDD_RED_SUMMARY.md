# TDD RED Phase Summary - MCP Servers Tests

## Overview
Created comprehensive tests for MCP servers functionality following TDD RED phase requirements. All tests are currently **FAILING** as expected, awaiting implementation.

## Files Created/Modified

### 1. New Test File: `src/agent/mcp-servers.test.ts`
**Purpose**: Unit tests for buildMcpServers helper function

**Test Coverage** (20 tests, 19 failing, 1 passing):
- ✅ Default sessionKey handling ("agent:main:main" when undefined/empty)
- ✅ SessionKey derivation using resolveAgentIdFromSessionKey
- ✅ Subagent sessionKey handling
- ✅ Command path quoting with spaces in process.execPath
- ✅ Command path quoting with spaces in process.argv[1]
- ✅ Both paths with spaces
- ✅ Paths without spaces (no quotes)
- ✅ All 6 MCP servers present (memory, sessions, message, nodes, browser, canvas)
- ✅ Correct structure for each server (name, command, args)
- ✅ Edge cases (null, whitespace, complex paths, quote escaping)

**Key Test Requirements**:
- Mock `process.execPath` and `process.argv` getters
- Mock `resolveAgentIdFromSessionKey` from sessions module
- Verify command and args are properly quoted when containing spaces
- Verify all 6 servers are returned with correct structure

### 2. Updated: `src/commands/agent.test.ts`
**Addition**: 1 new test - "passes mcpServers to runAgentViaSdk"

Verifies that:
- mcpServers parameter is defined and is an array
- All 6 servers are present in the array
- Server names match expected values

### 3. Updated: `src/cron/isolated-agent.uses-last-non-empty-agent-text-as.test.ts`
**Addition**: 1 new test - "passes mcpServers to runAgentViaSdk with correct sessionKey"

Verifies that:
- mcpServers parameter is passed during cron runs
- All 6 servers are included
- SessionKey is correctly propagated to server configurations

### 4. New Test File: `src/auto-reply/reply/agent-runner-execution.test.ts`
**Purpose**: Tests for agent-runner-execution.ts

**Test Coverage** (2 tests):
- ✅ Passes mcpServers to runAgentViaSdk
- ✅ Includes correct sessionKey in mcpServers configuration

### 5. New Test File: `src/commands/models/list.probe.test.ts`
**Purpose**: Tests for models list probe functionality

**Test Coverage** (2 tests):
- ✅ Passes mcpServers during auth probe operations
- ✅ Includes sessionKey in mcpServers for probe sessions

### 6. New Test File: `src/hooks/llm-slug-generator.test.ts`
**Purpose**: Tests for LLM slug generator

**Test Coverage** (4 tests):
- ✅ Passes mcpServers when generating slugs
- ✅ Includes sessionKey for temporary slug generation sessions
- ✅ Returns slug from LLM response
- ✅ Handles errors gracefully

## Current Test Status

### Failing Tests (19/20 in mcp-servers.test.ts)
All tests expecting `{ name, command, args }` structure are failing because:
- Current implementation returns `{ name, command }` (command as single string)
- Tests expect `{ name, command, args }` (command and args separate)
- Server names don't match: current uses "memory", tests expect "openclaw-memory"

Example failure:
```
expected undefined to be defined
  at src/agent/mcp-servers.test.ts:50:28
  const memoryServer = result.find((s) => s.name === "openclaw-memory");
  expect(memoryServer).toBeDefined();
                       ^
```

### Passing Tests (1/20 in mcp-servers.test.ts)
- ✅ "returns exactly 6 MCP servers" - verifies array length only

### Integration Test Status
- `src/commands/agent.test.ts`: 1 failing (mcpServers assertion)
- `src/cron/isolated-agent.uses-last-non-empty-agent-text-as.test.ts`: 1 failing (mcpServers assertion)
- Other new test files: All failing (awaiting implementation)

## Implementation Requirements

To make tests pass (GREEN phase), implementation needs:

1. **Update `src/agent/mcp-servers.ts`**:
   - Return structure: `{ name: string, command: string, args: string[] }`
   - Server names: prefix with "openclaw-" (e.g., "openclaw-memory")
   - Separate command (node path) from args (script path + mcp subcommands)
   - Quote paths containing spaces: `process.execPath` and `process.argv[1]`
   - Handle edge cases: null/empty sessionKey, whitespace, quote escaping

2. **Expected Server Configurations**:
   ```typescript
   [
     { name: "openclaw-memory", command: "/usr/local/bin/node",
       args: ["/usr/local/bin/clawcode", "mcp", "memory", "agent:main:main"] },
     { name: "openclaw-sessions", command: "/usr/local/bin/node",
       args: ["/usr/local/bin/clawcode", "mcp", "sessions", "agent:main:main"] },
     { name: "openclaw-message", command: "/usr/local/bin/node",
       args: ["/usr/local/bin/clawcode", "mcp", "message", "agent:main:main"] },
     { name: "openclaw-nodes", command: "/usr/local/bin/node",
       args: ["/usr/local/bin/clawcode", "mcp", "nodes", "agent:main:main"] },
     { name: "openclaw-browser", command: "/usr/local/bin/node",
       args: ["/usr/local/bin/clawcode", "mcp", "browser", "agent:main:main"] },
     { name: "openclaw-canvas", command: "/usr/local/bin/node",
       args: ["/usr/local/bin/clawcode", "mcp", "canvas", "agent:main:main"] },
   ]
   ```

3. **Quote Handling**:
   - If path contains spaces: wrap in double quotes
   - Escape internal quotes if present
   - Do not quote if no spaces present

4. **SessionKey Logic**:
   - Default to "agent:main:main" when sessionKey is undefined/empty/null
   - Derive agentId using `resolveAgentIdFromSessionKey(sessionKey)`
   - Construct nodes sessionKey as `"agent:{agentId}:{sessionKey}"`

## Test Execution

Run tests to verify RED state:
```bash
npx vitest run src/agent/mcp-servers.test.ts
npm test -- src/commands/agent.test.ts
npm test -- src/cron/isolated-agent.uses-last-non-empty-agent-text-as.test.ts
npm test -- src/auto-reply/reply/agent-runner-execution.test.ts
npm test -- src/commands/models/list.probe.test.ts
npm test -- src/hooks/llm-slug-generator.test.ts
```

## Deliverables Checklist

- ✅ Created `src/agent/mcp-servers.test.ts` with 20 comprehensive tests
- ✅ Updated `src/commands/agent.test.ts` with mcpServers assertion
- ✅ Updated `src/cron/isolated-agent.uses-last-non-empty-agent-text-as.test.ts`
- ✅ Created `src/auto-reply/reply/agent-runner-execution.test.ts`
- ✅ Created `src/commands/models/list.probe.test.ts`
- ✅ Created `src/hooks/llm-slug-generator.test.ts`
- ✅ All tests are in RED state (failing)
- ✅ Tests use vitest syntax
- ✅ Mocked necessary dependencies (process.execPath, process.argv, resolveAgentIdFromSessionKey)
- ✅ Tests are clear, readable, and cover boundary cases

## Next Steps (GREEN Phase)

Teammate A (Implementation Engineer) should:
1. Update `src/agent/mcp-servers.ts` implementation
2. Ensure all 20 unit tests pass
3. Verify integration tests pass in updated files
4. Test on VM with actual Claude Agent SDK
5. Confirm SDK receives mcpServers in correct format

## Notes

- Using vitest mocking for process.execPath/argv requires getter mocks
- Current implementation exists but uses wrong structure (needs refactoring)
- SDK runner expects `{ command, args }` in Record format (lines 127-129 of claude-sdk-runner.ts)
- All tests follow TDD best practices: test behavior, not implementation
