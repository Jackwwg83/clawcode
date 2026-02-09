# Contributing to ClawCode

Welcome to the lobster tank! 🦞

**ClawCode** is the Claude Agent SDK edition of OpenClaw. This is a fork/variant that replaces the original agent runtime with Anthropic's official Claude Agent SDK while keeping all other OpenClaw systems intact.

## Quick Links

- **ClawCode GitHub:** https://github.com/Jackwwg83/clawcode
- **OpenClaw (upstream):** https://github.com/openclaw/openclaw
- **Discord:** https://discord.gg/qkhbAGHRBT
- **X/Twitter:** [@steipete](https://x.com/steipete) / [@openclaw](https://x.com/openclaw)

## Maintainers

- **Peter Steinberger** - Benevolent Dictator
  - GitHub: [@steipete](https://github.com/steipete) · X: [@steipete](https://x.com/steipete)

- **Shadow** - Discord + Slack subsystem
  - GitHub: [@thewilloftheshadow](https://github.com/thewilloftheshadow) · X: [@4shad0wed](https://x.com/4shad0wed)

- **Jos** - Telegram, API, Nix mode
  - GitHub: [@joshp123](https://github.com/joshp123) · X: [@jjpcodes](https://x.com/jjpcodes)

## How to Contribute

1. **Bugs & small fixes** → Open a PR!
2. **New features / architecture** → Start a [GitHub Discussion](https://github.com/openclaw/openclaw/discussions) or ask in Discord first
3. **Questions** → Discord #setup-help

## Before You PR

- Test locally with your ClawCode instance
- Run tests: `pnpm tsgo && pnpm format && pnpm lint && pnpm build && pnpm test`
- Keep PRs focused (one thing per PR)
- Describe what & why
- If contributing agent runtime changes, ensure compatibility with Claude Agent SDK

## AI/Vibe-Coded PRs Welcome! 🤖

Built with Codex, Claude, or other AI tools? **Awesome - just mark it!**

Please include in your PR:

- [ ] Mark as AI-assisted in the PR title or description
- [ ] Note the degree of testing (untested / lightly tested / fully tested)
- [ ] Include prompts or session logs if possible (super helpful!)
- [ ] Confirm you understand what the code does

AI PRs are first-class citizens here. We just want transparency so reviewers know what to look for.

## Current Focus & Roadmap 🗺

We are currently prioritizing:

- **Claude Agent SDK Integration**: Ensuring full compatibility with Claude Agent SDK features
- **Stability**: Fixing edge cases in channel connections (WhatsApp/Telegram)
- **UX**: Improving the onboarding wizard and error messages
- **Skills**: Expanding the library of bundled skills and improving the Skill Creation developer experience
- **Performance**: Optimizing token usage and compaction logic

Check the GitHub Issues for "good first issue" labels!

## Relationship to OpenClaw

ClawCode is based on OpenClaw but uses Claude Agent SDK instead of the Pi agent runtime. When possible:
- Contribute universal improvements (channels, skills, tools) back to OpenClaw upstream
- Keep ClawCode-specific changes limited to the agent runtime layer
- Document any divergences from OpenClaw in commit messages
