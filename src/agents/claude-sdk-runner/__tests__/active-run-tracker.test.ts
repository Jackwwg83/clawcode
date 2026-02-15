import { describe, it, expect } from "vitest";
import {
  isEmbeddedPiRunActive,
  isEmbeddedPiRunStreaming,
  queueEmbeddedPiMessage,
} from "../../pi-embedded-runner/runs.js";
import { registerSdkRun, clearSdkRun } from "../active-run-tracker.js";

describe("SDK active run tracker", () => {
  it("registers run as active", () => {
    const handle = registerSdkRun("test-session-1");
    expect(isEmbeddedPiRunActive("test-session-1")).toBe(true);
    clearSdkRun("test-session-1", handle);
  });

  it("reports isStreaming as false", () => {
    const handle = registerSdkRun("test-session-2");
    expect(isEmbeddedPiRunStreaming("test-session-2")).toBe(false);
    clearSdkRun("test-session-2", handle);
  });

  it("steer returns false (not true)", () => {
    const handle = registerSdkRun("test-session-3");
    const result = queueEmbeddedPiMessage("test-session-3", "hello");
    expect(result).toBe(false);
    clearSdkRun("test-session-3", handle);
  });

  it("clears run correctly", () => {
    const handle = registerSdkRun("test-session-4");
    clearSdkRun("test-session-4", handle);
    expect(isEmbeddedPiRunActive("test-session-4")).toBe(false);
  });
});
