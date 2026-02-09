/**
 * ClawCode Paths Tests (TDD)
 *
 * Validates:
 * - State dir = ~/.clawcode (NEW)
 * - Config filename = openclaw.json (UNCHANGED from OpenClaw)
 * - ~/.openclaw recognized as legacy dir
 */
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  resolveStateDir,
  resolveCanonicalConfigPath,
  resolveNewStateDir,
  resolveLegacyStateDirs,
} from "./paths.js";
import { resolveSessionTranscriptsDir } from "./sessions/paths.js";

describe("ClawCode Paths (TDD)", () => {
  const mockHomedir = () => "/home/testuser";

  describe("state dir must be ~/.clawcode", () => {
    it("resolveNewStateDir returns ~/.clawcode", () => {
      const result = resolveNewStateDir(mockHomedir);
      expect(result).toBe("/home/testuser/.clawcode");
    });

    it("resolveStateDir defaults to ~/.clawcode when no dirs exist", () => {
      const result = resolveStateDir({}, mockHomedir);
      expect(result).toBe("/home/testuser/.clawcode");
    });

    it("state dir does not default to ~/.openclaw", () => {
      const result = resolveNewStateDir(mockHomedir);
      expect(result).not.toBe("/home/testuser/.openclaw");
    });
  });

  describe("config filename must remain openclaw.json (minimal change)", () => {
    it("resolveCanonicalConfigPath returns ~/.clawcode/openclaw.json", () => {
      const stateDir = "/home/testuser/.clawcode";
      const result = resolveCanonicalConfigPath({}, stateDir);
      expect(result).toBe("/home/testuser/.clawcode/openclaw.json");
    });

    it("config filename is openclaw.json (not clawcode.json)", () => {
      const stateDir = "/home/testuser/.clawcode";
      const result = resolveCanonicalConfigPath({}, stateDir);
      expect(path.basename(result)).toBe("openclaw.json");
    });
  });

  describe("~/.openclaw must be recognized as legacy", () => {
    it("resolveLegacyStateDirs includes ~/.openclaw", () => {
      const legacyDirs = resolveLegacyStateDirs(mockHomedir);
      const hasOpenclaw = legacyDirs.some((d) => d.endsWith(".openclaw"));
      expect(hasOpenclaw).toBe(true);
    });

    it("legacy dirs include all historical names", () => {
      const legacyDirs = resolveLegacyStateDirs(mockHomedir);
      const names = legacyDirs.map((d) => path.basename(d));
      expect(names).toContain(".clawdbot");
      expect(names).toContain(".moltbot");
      expect(names).toContain(".moldbot");
      expect(names).toContain(".openclaw");
    });
  });

  describe("sessions dir must be under ~/.clawcode", () => {
    it("resolveSessionTranscriptsDir is under ~/.clawcode", () => {
      const result = resolveSessionTranscriptsDir({}, mockHomedir);
      expect(result).toContain(".clawcode");
    });

    it("sessions path structure is ~/.clawcode/agents/{id}/sessions", () => {
      const result = resolveSessionTranscriptsDir({}, mockHomedir);
      expect(result).toMatch(/\.clawcode[\\/]agents[\\/][^/\\]+[\\/]sessions$/);
    });
  });
});
