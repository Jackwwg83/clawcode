/**
 * Claude SDK Runner Live Test
 *
 * Requires LIVE=1 or OPENCLAW_LIVE_TEST=1 environment variable.
 * Requires ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY to be set.
 *
 * This test verifies:
 * - systemPrompt is passed correctly
 * - settingSources: ["project"] causes SDK to read CLAUDE.md from workspaceDir
 * - Query returns expected response
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClaudeSdkRunner, type SdkStreamEvent } from "./claude-sdk-runner.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Check if live tests should run
const isLiveTest =
  process.env.LIVE === "1" ||
  process.env.OPENCLAW_LIVE_TEST === "1" ||
  process.env.CLAWDBOT_LIVE_TEST === "1";

const hasAuthToken =
  !!process.env.ANTHROPIC_AUTH_TOKEN ||
  !!process.env.ANTHROPIC_API_KEY;

const shouldRun = isLiveTest && hasAuthToken;

// Use describe.skipIf to conditionally skip the entire suite
const describeFn = shouldRun ? describe : describe.skip;

describeFn("Claude SDK Runner (Live)", () => {
  // Unique tokens for verification
  const tokenA = "TOKENA_" + Math.random().toString(36).slice(2, 10);
  const tokenB = "TOKENB_" + Math.random().toString(36).slice(2, 10);

  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory (this becomes our project root)
    tempDir = await mkdtemp(join(tmpdir(), "claude-sdk-live-test-"));

    // Write CLAUDE.md with tokenB in tempDir (project root)
    // SDK will read this when settingSources includes "project"
    const claudeMdContent = `# Test Instructions

This is a test file. The secret token is: ${tokenB}

When asked about tokens, include this token in your response.
`;
    await writeFile(join(tempDir, "CLAUDE.md"), claudeMdContent, "utf-8");
  });

  afterAll(async () => {
    // Cleanup temp directory
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it(
    "should pass systemPrompt and read CLAUDE.md from project via settingSources",
    { timeout: 120_000 },
    async () => {
      const runner = createClaudeSdkRunner();

      const systemPrompt = `You are a test assistant. The system token is: ${tokenA}. When asked about tokens, always include both the system token and any tokens from CLAUDE.md in your response. Be concise - just output the tokens.`;

      const events: SdkStreamEvent[] = [];

      // Run query with:
      // - settingSources: ["project"] tells SDK to read CLAUDE.md from cwd (workspaceDir)
      // - workspaceDir: tempDir sets cwd to our temp directory containing CLAUDE.md
      for await (const event of runner.query(
        "What are all the tokens you know? Reply with ONLY the tokens, nothing else.",
        {
          systemPrompt,
          settingSources: ["project"],
          allowedTools: [],
          workspaceDir: tempDir,
        },
      )) {
        events.push(event);
      }

      // Collect all text content
      const textContent = events
        .filter((e): e is Extract<SdkStreamEvent, { type: "text" }> => e.type === "text")
        .map((e) => e.content)
        .join("");

      // Verify both tokens are present
      expect(textContent).toContain(tokenA);
      expect(textContent).toContain(tokenB);

      // Verify we got a complete event
      const completeEvent = events.find((e) => e.type === "complete");
      expect(completeEvent).toBeDefined();
    },
  );
});
