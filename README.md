# Luzmo Agent Skills

[![npm](https://img.shields.io/npm/v/@luzmo/agent-skills/alpha)](https://www.npmjs.com/package/@luzmo/agent-skills)
[![CI](https://github.com/luzmo-official/agent-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/luzmo-official/agent-skills/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/luzmo-official/agent-skills/blob/main/LICENSE)

Agent skills for building embedded analytics applications with [Luzmo](https://luzmo.com). Compatible with Cursor, Claude Code, Codex, Windsurf, Google Antigravity, GitHub Copilot, and any tool that supports the [Agent Skills](https://agentskills.io/) standard.

A set of 10 skills that turn your AI coding agent into a Luzmo embedded-analytics expert. They cover the full lifecycle: authentication and the POST + `action` API model, embedding saved dashboards and charts, building Flex and custom charts in code, self-service analytics (Embedded Dashboard Editor or ACK), AI / natural-language Q&A (`/aiprompt`, IQ), multi-tenant isolation, data integration, resource CRUD, theming, and troubleshooting.

So your agent ships correct, secure integrations the first time instead of guessing the API and tripping over the common traps (leaked API keys, missing tenant filters, REST-verb / `action: "search"` mistakes).

## Contents

- [Quick install](#quick-install)
- [In practice](#in-practice)
- [Install options by platform](#install-options-by-platform)
- [Skills](#skills)
- [Agents](#agents)
- [Cursor rules](#cursor-rules)
- [Manual install (fallback)](#manual-install-fallback)
- [Documentation](#documentation)
- [License](#license)

## Quick install

```bash
npx @luzmo/agent-skills@alpha
```

The interactive wizard installs skills into the right directories for your AI tools. Optionally register the hosted Luzmo MCP server (opt-in).

### Non-interactive

```bash
npx @luzmo/agent-skills add --tool cursor --skills all --scope project --yes
npx @luzmo/agent-skills add --tool claude-code,codex --skills core,ai-analytics --yes
npx @luzmo/agent-skills add --tool cursor --with-mcp --region eu --yes
npx @luzmo/agent-skills list
npx @luzmo/agent-skills doctor
```

### MCP server (opt-in)

Hosted MCP (EU example):

```
https://api.luzmo.com/0.1.0/mcp
```

Set credentials in your environment (never commit them):

```bash
export LUZMO_KEY="your-api-key"
export LUZMO_TOKEN="your-api-token"
```

US: `https://api.us.luzmo.com/0.1.0/mcp` — VPC: `https://api.<vpc>.luzmo.com/0.1.0/mcp`

Full MCP guide (tools, auth, themes, MCP App): [developer.luzmo.com/guide/mcp--introduction](https://developer.luzmo.com/guide/mcp--introduction). In-repo summary: `skills/ai-analytics/references/mcp-server.md`.

## In practice

Ask your agent in natural language:

> "Embed the logistics dashboard in this page, filtered to the current organization id."

With `core` + `multitenancy` loaded, it generates the token server-side, scopes it to the tenant, and passes only the safe values to the client:

```js
// Server-side only (never ship API key/token to the browser)
const embed = await client.create('authorization', {
  type: 'embed',
  username: user.id,
  name: user.name,
  email: user.email,
  role: 'viewer',
  access: { /* logistics dashboard in scope */ },
  parameter_overrides: { organizationId: user.organizationId }, // row-level tenant filter
});

// Client-side: only the embed key + token
<luzmo-embed-dashboard authKey={embed.id} authToken={embed.token} />
```

## Install options by platform

Everything ships from **this single repository** — there are no separate per-tool plugin repos.

| Platform | Install method |
|---|---|
| Any tool | `npx @luzmo/agent-skills@alpha` (interactive wizard — copies skills into the right dirs) |
| Cursor | `/add-plugin https://github.com/luzmo-official/agent-skills.git` (reads `.cursor-plugin/`) |
| Claude Code | `/plugin marketplace add luzmo-official/agent-skills` then `/plugin install agent-skills` (reads `.claude-plugin/`) |
| Google Antigravity | `npx @luzmo/agent-skills@alpha add --tool antigravity` (auto-discovered from `.agents/skills/`) |
| Codex / Copilot / Gemini CLI | `npx skills add luzmo-official/agent-skills` (via [skills.sh](https://skills.sh)) |
| Manual | clone or copy `skills/*` (see [Manual install](#manual-install-fallback)) |

### Cursor (native plugin)

```text
/add-plugin https://github.com/luzmo-official/agent-skills.git
```

### Claude Code (native plugin)

```bash
/plugin marketplace add luzmo-official/agent-skills
/plugin install agent-skills
```

### Google Antigravity

Antigravity uses the open Agent Skills standard and auto-discovers skills — there is no separate
plugin manifest to install. The wizard copies skills into the directories Antigravity reads:

```bash
npx @luzmo/agent-skills@alpha add --tool antigravity --skills all --yes            # project: .agents/skills/
npx @luzmo/agent-skills@alpha add --tool antigravity --scope global --yes          # global: ~/.gemini/config/skills/
```

The optional MCP server (`--with-mcp`) is written to Antigravity's global config at
`~/.gemini/config/mcp_config.json`.

### skills.sh-compatible agents (Codex, Copilot, Gemini CLI)

```bash
npx skills add luzmo-official/agent-skills --list   # preview
npx skills add luzmo-official/agent-skills          # install all
npx skills add luzmo-official/agent-skills --skill core
```

Cursor and Claude Code marketplace manifests are generated from [`plugin.config.yaml`](https://github.com/luzmo-official/agent-skills/blob/main/plugin.config.yaml) — see [Contributing](https://github.com/luzmo-official/agent-skills/blob/main/CONTRIBUTING.md) to regenerate them.

## Skills

| Skill | Purpose |
|---|---|
| **core** | Core setup: authentication, API architecture, security, embed saved dashboards/charts by id |
| **troubleshooting** | Diagnose and triage integration issues |
| **data-visualization** | Build ad hoc charts (Flex) |
| **custom-charts** | Build a brand-new chart component when no built-in type fits |
| **analytics-studio** | Self-service analytics: Embedded Dashboard Editor (EDE) or Analytics Components Kit (ACK) |
| **ai-analytics** | `/aiprompt` AI Chat/Answer and embed components |
| **multitenancy** | Multi-tenant data isolation |
| **data-integration** | Connectors, push data, SQL views |
| **resource-management** | CRUD for dashboards, datasets, accounts, ... |
| **theming** | Themes, Lucero/ACK tokens, CSS variables |

Always install `core` at minimum.

## Agents

Subagents for heavier, multi-step workflows where explicit delegation helps. Delivered through the
native Cursor and Claude Code plugins (auto-discovered from `agents/`).

| Agent | Purpose |
|---|---|
| **luzmo-embed-engineer** | End-to-end secure embedding: auth → embed token → dashboard/Flex → tenant isolation |
| **luzmo-data-engineer** | Connect data sources, push data, and model datasets |
| **luzmo-ai-engineer** | Natural-language analytics with `/aiprompt` and IQ Chat/Answer |
| **luzmo-troubleshooter** | Diagnose broken embeds, auth, data, and AI issues, then route to a fix |

## Cursor rules

Always-on / context guidance loaded automatically by the Cursor plugin (from `rules/`). Other tools
rely on the equivalent guidance inside `skills/` instead.

| Rule | Mode | Purpose |
|---|---|---|
| **luzmo-security** | always | Non-negotiable credential + embed-token guardrails |
| **luzmo-api-conventions** | when relevant | POST + `action` model, base URLs, includes |
| **luzmo-terminology** | when relevant | Maps BI terms to Luzmo vocabulary |

## Manual install (fallback)

```bash
git clone https://github.com/luzmo-official/agent-skills .agents/skills/agent-skills
# or symlink skills/* into .cursor/skills/, .claude/skills/, etc.
```

## Documentation

- [Luzmo Developer Docs](https://developer.luzmo.com/) — canonical specs (`llms.txt`, `llms-full.txt`)
- [Agent Skills Specification](https://agentskills.io/)
- [Contributing](https://github.com/luzmo-official/agent-skills/blob/main/CONTRIBUTING.md) — development setup, plugin manifest regeneration, changelog
- [Eval framework](https://github.com/luzmo-official/agent-skills/blob/main/EVAL_FRAMEWORK.md) — skill quality evals ([evals/README.md](https://github.com/luzmo-official/agent-skills/blob/main/evals/README.md) for runner details)

## License

[Apache License 2.0](https://github.com/luzmo-official/agent-skills/blob/main/LICENSE) — Copyright © 2026 Luzmo.

You may use, modify, and distribute these skills under the terms of the Apache 2.0 license. See [LICENSE](https://github.com/luzmo-official/agent-skills/blob/main/LICENSE) and [NOTICE](https://github.com/luzmo-official/agent-skills/blob/main/NOTICE) for details. "Luzmo" and related marks are trademarks of Luzmo and are not licensed for use except as described in the license.
