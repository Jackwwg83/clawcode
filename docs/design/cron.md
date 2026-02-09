# Cron

## Goal
Reuse OpenClaw cron scheduling with AgentBridge execution.

## Reused Modules
- src/cron/*

## Changes
- Replace agent execution calls with AgentBridge.
- Keep scheduling, persistence, and delivery behavior.

---

## Architecture Overview

### Purpose
ClawCode's cron system enables scheduled agent tasks:
- **Periodic checks**: Monitor external systems (emails, webhooks, APIs)
- **Memory flush**: Archive old conversations, clean up cache
- **Heartbeat**: Keep sessions alive, send status updates
- **Reminders**: Time-based prompts or notifications
- **Hooks**: Process external events (Gmail, calendar, webhooks)

### Design Principles
- **Isolated execution**: Cron jobs run in separate sessions, isolated from main conversations
- **Stateful scheduling**: Job state persists across restarts
- **Delivery control**: Jobs can optionally deliver responses to channels
- **Error resilience**: Failed jobs retry on next schedule (no cascading failures)

---

## Cron Job Scheduling Architecture

### Job Types

#### 1. System Event
Injects a system-level event into the session (like memory flush or context compaction).

**Payload:**
```json
{
  "kind": "systemEvent",
  "text": "Memory flush complete"
}
```

**Use Case:**
- Internal housekeeping (memory management, cache cleanup)
- Session lifecycle events
- No agent turn (no LLM call)

#### 2. Agent Turn
Executes a full agent turn with a message prompt.

**Payload:**
```json
{
  "kind": "agentTurn",
  "message": "Check for new emails",
  "model": "anthropic/claude-sonnet-4-5",
  "thinking": "low",
  "timeoutSeconds": 300,
  "allowUnsafeExternalContent": false,
  "deliver": true,
  "channel": "telegram",
  "to": "+15551234567",
  "bestEffortDeliver": false
}
```

**Use Case:**
- Scheduled queries (email checks, API monitoring)
- Periodic analysis (summarize day's events)
- Automated responses (send reminders, status updates)

---

## Configuration Format

### Job Schema
```typescript
{
  id: string;                  // Unique job ID (auto-generated)
  agentId?: string;            // Target agent (default: main agent)
  name: string;                // Human-readable name
  description?: string;        // Optional description
  enabled: boolean;            // Enable/disable job
  deleteAfterRun?: boolean;    // Delete after first run (one-time job)
  createdAtMs: number;         // Creation timestamp
  updatedAtMs: number;         // Last update timestamp
  schedule: CronSchedule;      // Scheduling config (see below)
  sessionTarget: "main" | "isolated";  // Session mode
  wakeMode: "next-heartbeat" | "now";  // Wake timing
  payload: CronPayload;        // Job payload (systemEvent or agentTurn)
  isolation?: CronIsolation;   // Isolation config (for isolated sessions)
  state: CronJobState;         // Runtime state (next run, last run, errors)
}
```

### Schedule Types

#### 1. At (One-Time)
Run at a specific timestamp.
```json
{
  "kind": "at",
  "atMs": 1707500000000
}
```

#### 2. Every (Periodic)
Run at fixed intervals.
```json
{
  "kind": "every",
  "everyMs": 3600000,          // 1 hour in milliseconds
  "anchorMs": 1707500000000    // Optional: first run time
}
```

#### 3. Cron Expression
Run based on cron expression.
```json
{
  "kind": "cron",
  "expr": "0 9 * * *",         // Every day at 9am
  "tz": "America/Los_Angeles"  // Optional timezone
}
```

**Cron Expression Format:**
```
┌─────── minute (0 - 59)
│ ┌────── hour (0 - 23)
│ │ ┌───── day of month (1 - 31)
│ │ │ ┌──── month (1 - 12)
│ │ │ │ ┌─── day of week (0 - 6) (Sunday=0)
│ │ │ │ │
* * * * *
```

**Examples:**
- `0 9 * * *` - Every day at 9am
- `*/15 * * * *` - Every 15 minutes
- `0 0 * * 0` - Every Sunday at midnight
- `0 12 1 * *` - First day of every month at noon

---

## Isolated Agent Execution

### Session Target Modes

#### 1. Main Session (`"main"`)
Adds the cron event to the main session history.
- **Pros**: Agent has full conversation context
- **Cons**: Pollutes main conversation with cron events

#### 2. Isolated Session (`"isolated"`)
Runs in a separate, ephemeral session.
- **Pros**: Clean separation, main session unaffected
- **Cons**: No access to main session history

**Recommended:** Use `"isolated"` for most cron jobs.

### Isolation Configuration
```typescript
{
  postToMainPrefix?: string;        // Prefix for messages posted back to main
  postToMainMode?: "summary" | "full";  // What to post back
  postToMainMaxChars?: number;      // Max chars when mode="full" (default: 8000)
}
```

**Example:**
```json
{
  "isolation": {
    "postToMainPrefix": "[Cron Check]",
    "postToMainMode": "summary",
    "postToMainMaxChars": 500
  }
}
```

**Post-to-Main Behavior:**
- After isolated run completes, optionally post a summary back to main session
- `"summary"`: Post a short status line (e.g., "Check complete, 3 new items")
- `"full"`: Post the full agent output (truncated to `postToMainMaxChars`)

---

## Job Types in Detail

### Periodic Checks
Monitor external systems and report changes.

**Example: Email Check**
```json
{
  "id": "gmail-check",
  "name": "Check Gmail",
  "enabled": true,
  "schedule": {
    "kind": "every",
    "everyMs": 1800000  // 30 minutes
  },
  "sessionTarget": "isolated",
  "wakeMode": "next-heartbeat",
  "payload": {
    "kind": "agentTurn",
    "message": "Check for new emails and summarize important ones",
    "thinking": "low",
    "timeoutSeconds": 300,
    "deliver": true,
    "channel": "telegram",
    "to": 123456789
  },
  "isolation": {
    "postToMainMode": "summary"
  }
}
```

### Memory Flush
Archive old conversations to long-term storage.

**Example: Session Cleanup**
```json
{
  "id": "memory-flush",
  "name": "Memory Flush",
  "enabled": true,
  "schedule": {
    "kind": "cron",
    "expr": "0 2 * * *",  // 2am daily
    "tz": "UTC"
  },
  "sessionTarget": "main",
  "wakeMode": "now",
  "payload": {
    "kind": "systemEvent",
    "text": "Daily memory flush complete"
  }
}
```

### Heartbeat
Keep sessions alive and send periodic updates.

**Example: Daily Summary**
```json
{
  "id": "daily-summary",
  "name": "Daily Summary",
  "enabled": true,
  "schedule": {
    "kind": "cron",
    "expr": "0 18 * * *",  // 6pm daily
    "tz": "America/Los_Angeles"
  },
  "sessionTarget": "isolated",
  "wakeMode": "now",
  "payload": {
    "kind": "agentTurn",
    "message": "Summarize today's activities and tasks",
    "thinking": "medium",
    "deliver": true,
    "channel": "last",
    "bestEffortDeliver": true
  },
  "isolation": {
    "postToMainPrefix": "[Daily Summary]",
    "postToMainMode": "full",
    "postToMainMaxChars": 2000
  }
}
```

---

## Error Handling and Retry Logic

### Error States
Jobs track their last execution status:
```typescript
{
  lastRunAtMs: 1707500000000,
  lastStatus: "error",          // "ok", "error", or "skipped"
  lastError: "Timeout after 600s",
  lastDurationMs: 600123
}
```

### Retry Strategy
- **No automatic retries**: Failed jobs do NOT retry immediately
- **Next scheduled run**: Job will retry at its next scheduled time
- **Error logging**: Errors are logged and stored in job state
- **Disabled on repeated failures**: Jobs can be manually disabled if they fail repeatedly

**Why no immediate retries?**
- Avoid cascading failures (e.g., API rate limits)
- Respect scheduling discipline (jobs should be idempotent)
- Prevent resource exhaustion

### Skip Conditions
Jobs may be skipped if:
- **Agent busy**: Main session is actively processing another message
- **Missing configuration**: Required channel or recipient not configured
- **System overload**: Too many concurrent cron jobs

**Skipped Status:**
```typescript
{
  lastStatus: "skipped",
  lastError: "Agent busy, skipping heartbeat"
}
```

---

## Interaction with Session Management

### Session Keys
Cron jobs use dedicated session keys:
```
cron:gmail-check                    # Isolated session for job "gmail-check"
agent:mybot:cron:daily-summary      # Multi-agent isolated session
agent:mybot:main                    # Main session (if sessionTarget="main")
```

### Session Isolation
Isolated cron sessions:
- **Separate history**: No access to main conversation
- **Ephemeral**: Can be cleaned up after completion
- **Independent state**: Own token counts, model selection, verbosity

### Session Coordination
- **Wake mode `"next-heartbeat"`**: Job waits for next heartbeat cycle before executing
- **Wake mode `"now"`**: Job executes immediately at scheduled time

**Heartbeat Cycle:**
ClawCode's heartbeat mechanism ensures sessions don't time out. Cron jobs with `wakeMode: "next-heartbeat"` piggyback on this cycle.

---

## Delivery Control

### Delivery Modes
- **Explicit** (`deliver: true`): Always deliver response
- **Off** (`deliver: false`): Never deliver response
- **Auto** (`deliver: undefined`): Deliver only if `to` is specified

### Best-Effort Delivery
```json
{
  "deliver": true,
  "bestEffortDeliver": true
}
```

- **`bestEffortDeliver: false`**: Delivery failure marks job as error
- **`bestEffortDeliver: true`**: Delivery failure is logged but job marked as ok

**Use Case:**
- Use `bestEffortDeliver: true` for non-critical notifications
- Use `bestEffortDeliver: false` for critical alerts

### Channel Selection
- **Explicit channel**: `"channel": "telegram"`
- **Last active channel**: `"channel": "last"` (uses channel from last main session message)

**Recipient Resolution:**
- **Explicit**: `"to": "+15551234567"` or `"to": 123456789`
- **From session**: If `to` is omitted, uses sender from last main session message
- **From allowlist**: If `to` is omitted and allowlist has one entry, uses that

---

## Job Storage and Persistence

### Storage Location
```
~/.clawcode/cron/jobs.json
```

### File Format
```json
{
  "version": 1,
  "jobs": [
    {
      "id": "gmail-check",
      "name": "Check Gmail",
      "enabled": true,
      ...
    },
    {
      "id": "daily-summary",
      "name": "Daily Summary",
      "enabled": true,
      ...
    }
  ]
}
```

### State Persistence
Job state is persisted after each run:
- `nextRunAtMs`: When job will run next
- `lastRunAtMs`: When job last ran
- `lastStatus`: Result of last run
- `lastError`: Error message (if failed)
- `lastDurationMs`: How long last run took

### Atomic Updates
Job file updates use atomic write pattern:
1. Write to temporary file
2. Rename to replace existing file
3. No partial writes (crash-safe)

---

## Scheduling Implementation

### Scheduler Service
The cron scheduler (`src/cron/service.ts`) manages all job timers:
```typescript
export type CronService = {
  start(): Promise<void>;           // Start scheduler
  stop(): Promise<void>;            // Stop all timers
  schedule(job: CronJob): void;     // Schedule a job
  unschedule(jobId: string): void;  // Cancel a job's timer
  listJobs(): CronJob[];            // List all jobs
  getJob(jobId: string): CronJob | undefined;
  createJob(input: CronJobCreate): CronJob;
  updateJob(jobId: string, patch: CronJobPatch): void;
  deleteJob(jobId: string): void;
};
```

### Timer Management
- **Node.js timers**: Uses `setTimeout` for scheduling
- **Duplicate prevention**: Each job has at most one active timer
- **Restart-safe**: Timers are recreated on service restart
- **Missed runs**: If system was offline, job runs immediately on startup (if overdue)

### Next Run Calculation
```typescript
function calculateNextRun(job: CronJob): number {
  if (job.schedule.kind === "at") {
    return job.schedule.atMs;
  }
  if (job.schedule.kind === "every") {
    const now = Date.now();
    const anchor = job.schedule.anchorMs ?? now;
    const elapsed = now - anchor;
    const periods = Math.floor(elapsed / job.schedule.everyMs);
    return anchor + (periods + 1) * job.schedule.everyMs;
  }
  if (job.schedule.kind === "cron") {
    // Use cron parser library to calculate next occurrence
    return parseCronExpression(job.schedule.expr, job.schedule.tz);
  }
}
```

---

## Integration with Agent Runtime

### Agent Execution Flow
1. **Scheduler triggers** job at scheduled time
2. **Resolve session key** based on `sessionTarget` and `agentId`
3. **Load/create session** for the job
4. **Run agent turn** via `AgentBridge`:
   - For `systemEvent`: No LLM call, just append to session history
   - For `agentTurn`: Execute full agent turn via Claude Agent SDK
5. **Capture response** and update job state
6. **Deliver response** (if configured)
7. **Post to main** (if isolated and `postToMain` configured)

### Agent Bridge Integration
```typescript
import { runCronIsolatedAgentTurn } from "./cron/isolated-agent.js";

const result = await runCronIsolatedAgentTurn({
  cfg: loadConfig(),
  deps: createCliDeps(),
  job,
  message: job.payload.message,
  sessionKey: `cron:${job.id}`,
  agentId: job.agentId,
  lane: "cron"
});

if (result.status === "error") {
  // Update job state with error
  updateJobState(job.id, {
    lastStatus: "error",
    lastError: result.error
  });
}
```

### Model Selection
- **Job override**: `payload.model` takes precedence
- **Agent override**: `agents.agents[agentId].model` second priority
- **Global default**: `agents.defaults.model` fallback

### Thinking Level
- **Job override**: `payload.thinking`
- **Gmail hook override**: `hooks.gmail.thinking` (for Gmail cron jobs)
- **Agent override**: `agents.agents[agentId].thinkingDefault`
- **Default**: `"auto"`

---

## Security Considerations

### External Hook Content
Cron jobs that process external content (emails, webhooks) are wrapped with security boundaries:

```typescript
// SECURITY: Wrap external hook content to prevent prompt injection
const shouldWrapExternal =
  isExternalHookSession(sessionKey) &&
  !job.payload.allowUnsafeExternalContent;

if (shouldWrapExternal) {
  const safeContent = buildSafeExternalPrompt({
    content: job.payload.message,
    source: getHookType(sessionKey),
    jobName: job.name,
    jobId: job.id,
    timestamp: formattedTime
  });
  // Use wrapped content for agent prompt
}
```

**Why?**
- External content (emails, webhook payloads) may contain prompt injection attempts
- Security wrapper clearly delineates external vs. internal content
- Agent is instructed to treat external content as untrusted data

**Bypass:**
Set `allowUnsafeExternalContent: true` only for trusted sources.

### Allowlist Enforcement
Delivery targets are validated against channel allowlists:
```typescript
const allowFrom = plugin.config.resolveAllowFrom({ cfg, accountId });
const isAllowed = allowFrom?.includes(normalizedRecipient);
if (!isAllowed && dmPolicy === "allowlist") {
  throw new Error("Recipient not in allowlist");
}
```

---

## Monitoring and Diagnostics

### Job Status Query
```typescript
const service = getCronService();
const job = service.getJob("gmail-check");

console.log({
  enabled: job.enabled,
  nextRun: new Date(job.state.nextRunAtMs),
  lastRun: new Date(job.state.lastRunAtMs),
  lastStatus: job.state.lastStatus,
  lastError: job.state.lastError,
  lastDuration: job.state.lastDurationMs
});
```

### Run History
Each job's state tracks the most recent run. For detailed history, check:
- **Session transcripts**: `~/.clawcode/sessions/cron:job-id.json`
- **Gateway logs**: Cron executions are logged with `[cron]` prefix

### Health Indicators
- **Enabled but never ran**: `nextRunAtMs` is set but `lastRunAtMs` is missing → scheduler issue
- **Repeated failures**: `lastStatus === "error"` for multiple consecutive runs → job needs attention
- **Long durations**: `lastDurationMs > timeoutSeconds * 1000` → job is timing out

---

## API Examples

### Create a Job
```typescript
import { getCronService } from "./cron/service.js";

const service = getCronService();
const job = service.createJob({
  name: "Daily Standup",
  enabled: true,
  schedule: {
    kind: "cron",
    expr: "0 9 * * 1-5",  // Weekdays at 9am
    tz: "America/Los_Angeles"
  },
  sessionTarget: "isolated",
  wakeMode: "now",
  payload: {
    kind: "agentTurn",
    message: "What's on my agenda today?",
    thinking: "medium",
    deliver: true,
    channel: "telegram",
    to: 123456789
  }
});
```

### Update a Job
```typescript
service.updateJob("daily-standup", {
  enabled: false,  // Temporarily disable
  payload: {
    thinking: "high"  // Increase thinking level
  }
});
```

### Delete a Job
```typescript
service.deleteJob("daily-standup");
```

---

## Migration from OpenClaw

### What's Unchanged
- Job storage format (`~/.clawcode/cron/jobs.json`)
- Scheduling logic (cron expressions, timers)
- Session isolation behavior
- Delivery control (best-effort, channel selection)

### What's Changed
- **Agent execution**: OpenClaw embedded agent → Claude Agent SDK via `AgentBridge`
- **Config location**: `~/.openclaw` → `~/.clawcode`

### Compatibility Notes
- Existing job definitions from OpenClaw are fully compatible
- No migration script needed (jobs are stored in the same format)
- Session transcripts are NOT migrated (new isolated sessions start fresh)

---

## Best Practices

### Job Design
1. **Idempotent**: Jobs should handle being run multiple times safely
2. **Stateless**: Don't rely on main session state (use isolated sessions)
3. **Timeout-aware**: Set reasonable `timeoutSeconds` for job complexity
4. **Error-tolerant**: Use `bestEffortDeliver: true` for non-critical notifications

### Scheduling
1. **Avoid overlap**: Ensure job duration < scheduling interval
2. **Stagger jobs**: Don't schedule many jobs at the same time (e.g., all at midnight)
3. **Use appropriate intervals**: Not too frequent (avoid rate limits), not too sparse (timely responses)

### Monitoring
1. **Check job status regularly**: Look for repeated failures
2. **Monitor delivery**: Ensure critical jobs are delivering successfully
3. **Review durations**: Long-running jobs may need optimization

### Security
1. **Validate external input**: Never set `allowUnsafeExternalContent: true` without review
2. **Restrict delivery targets**: Use allowlists for sensitive channels
3. **Audit job definitions**: Review jobs created by external systems or APIs
