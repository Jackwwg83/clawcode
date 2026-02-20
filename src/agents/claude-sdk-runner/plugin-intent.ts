const INSTALL_RE = /\b(?:install|add)\b|安装|安裝/u;
const PLUGIN_RE = /\b(?:plugin|plugins)\b|插件/u;
const SPEC_TOKEN_RE = /^[a-z0-9][a-z0-9._:/@-]*$/i;
const OFFICIAL_MARKETPLACE = "claude-plugins-official";

export type PluginInstallRewrite = {
  rewrittenPrompt: string;
  pluginSpec: string;
  rewritten: true;
};

export type PluginInstallNoRewrite = {
  rewrittenPrompt: string;
  rewritten: false;
};

export function rewritePromptForClaudePluginInstall(
  prompt: string,
): PluginInstallRewrite | PluginInstallNoRewrite {
  const trimmed = prompt.trim();
  if (!trimmed || trimmed.startsWith("/plugin")) {
    return { rewrittenPrompt: prompt, rewritten: false };
  }

  if (!INSTALL_RE.test(trimmed) || !PLUGIN_RE.test(trimmed)) {
    return { rewrittenPrompt: prompt, rewritten: false };
  }

  const candidate = extractPluginSpec(trimmed);
  if (!candidate) {
    return { rewrittenPrompt: prompt, rewritten: false };
  }

  const pluginSpec = normalizePluginSpec(candidate);
  if (!pluginSpec) {
    return { rewrittenPrompt: prompt, rewritten: false };
  }

  return {
    rewrittenPrompt: `/plugin install ${pluginSpec}`,
    pluginSpec,
    rewritten: true,
  };
}

function extractPluginSpec(text: string): string | undefined {
  const backtick = /`([^`\n]+)`/u.exec(text)?.[1];
  if (backtick) {
    return backtick;
  }

  const quoted =
    /["']([^"'\n]+)["']/u.exec(text)?.[1] ??
    /(?:插件|plugin|plugins)\s*(?:叫|名为|named|called|是|:|：)?\s*([^\s,，。.!?！？]+)/iu.exec(
      text,
    )?.[1] ??
    /(?:安装|安裝|install|add)\s+([^\s,，。.!?！？]+)\s*(?:插件|plugin|plugins)/iu.exec(
      text,
    )?.[1] ??
    /(?:安装|安裝|install|add)\s+(?:the\s+)?(?:claude\s*code\s+)?(?:插件|plugin|plugins)\s*(?:叫|名为|named|called|是|:|：)?\s*([^\s,，。.!?！？]+)/iu.exec(
      text,
    )?.[1];
  return quoted;
}

function normalizePluginSpec(raw: string): string | undefined {
  const trimmed = raw
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[。，,;；.!?！？]+$/u, "");
  if (!trimmed || !SPEC_TOKEN_RE.test(trimmed)) {
    return undefined;
  }
  if (isPathLike(trimmed) || trimmed.includes("@")) {
    return trimmed;
  }
  return `${trimmed}@${OFFICIAL_MARKETPLACE}`;
}

function isPathLike(value: string): boolean {
  return (
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("/") ||
    value.startsWith("~")
  );
}
