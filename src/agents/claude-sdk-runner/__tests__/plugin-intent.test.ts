import { describe, expect, it } from "vitest";
import { rewritePromptForClaudePluginInstall } from "../plugin-intent.js";

describe("plugin intent rewrite", () => {
  it("rewrites Chinese install intent to /plugin install", () => {
    const rewritten = rewritePromptForClaudePluginInstall(
      "请帮我安装 claude code 插件 commit-commands",
    );
    expect(rewritten.rewritten).toBe(true);
    if (!rewritten.rewritten) {
      throw new Error("expected rewritten prompt");
    }
    expect(rewritten.pluginSpec).toBe("commit-commands@claude-plugins-official");
    expect(rewritten.rewrittenPrompt).toBe(
      "/plugin install commit-commands@claude-plugins-official",
    );
  });

  it("keeps explicit marketplace suffix", () => {
    const rewritten = rewritePromptForClaudePluginInstall(
      "install claude plugin commit-commands@anthropics-claude-code",
    );
    expect(rewritten.rewritten).toBe(true);
    if (!rewritten.rewritten) {
      throw new Error("expected rewritten prompt");
    }
    expect(rewritten.pluginSpec).toBe("commit-commands@anthropics-claude-code");
    expect(rewritten.rewrittenPrompt).toBe(
      "/plugin install commit-commands@anthropics-claude-code",
    );
  });

  it("does not rewrite existing slash command", () => {
    const rewritten = rewritePromptForClaudePluginInstall(
      "/plugin install commit-commands@anthropics-claude-code",
    );
    expect(rewritten.rewritten).toBe(false);
    expect(rewritten.rewrittenPrompt).toBe(
      "/plugin install commit-commands@anthropics-claude-code",
    );
  });

  it("does not rewrite when plugin spec is missing", () => {
    const rewritten = rewritePromptForClaudePluginInstall("可以安装一下claude插件吗");
    expect(rewritten.rewritten).toBe(false);
    expect(rewritten.rewrittenPrompt).toBe("可以安装一下claude插件吗");
  });
});
