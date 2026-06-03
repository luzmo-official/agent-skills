# Luzmo agent skills

This repository ships [Agent Skills](https://agentskills.io/) for embedded analytics with Luzmo.

## Install

```bash
npx @luzmo/agent-skills@alpha
```

Or install skills into `.agents/skills/` manually from the `skills/` directory.

## Skills

| Skill | Purpose |
|---|---|
| `core` | Auth, API patterns, security, embed saved dashboards/charts by id |
| `troubleshooting` | Diagnose and route issues |
| `data-visualization` | Build Flex charts in code |
| `custom-charts` | Build a brand-new chart component when no built-in type fits |
| `analytics-studio` | Self-service analytics: Embedded Dashboard Editor or ACK |
| `ai-analytics` | `/aiprompt` API + IQ embed components |
| `multitenancy` | Tenant isolation |
| `data-integration` | Connectors, push data, SQL views |
| `resource-management` | CRUD for Luzmo resources |
| `theming` | Themes, Lucero/ACK tokens, CSS variables |

Load the relevant `skills/<name>/SKILL.md` when the user's task matches.

## Agents

Multi-step subagents in `agents/` (auto-discovered by Cursor and Claude Code):

| Agent | Purpose |
|---|---|
| `luzmo-embed-engineer` | End-to-end secure embedding (auth → token → dashboard/Flex → isolation) |
| `luzmo-data-engineer` | Connect sources, push data, model datasets |
| `luzmo-ai-engineer` | `/aiprompt` + IQ Chat/Answer natural-language analytics |
| `luzmo-troubleshooter` | Diagnose issues by symptom and route to a fix |

## Cursor rules

`.mdc` rules in `rules/` (Cursor only): `luzmo-security` (always-on), `luzmo-api-conventions`,
`luzmo-terminology`. Keep their guidance in sync with `skills/core`; do not duplicate full skill
content into rules.

## Evals

Skill evals use Anthropic's **skill-creator** pipeline ([`tools/skill-creator/`](tools/skill-creator/), vendored verbatim). Per-skill cases: `skills/<id>/evals/`. Batch driver: [`evals/runner.sh`](evals/runner.sh). See [`EVAL_FRAMEWORK.md`](EVAL_FRAMEWORK.md).

## Repository layout (contributors)

- New skills → `skills/<id>/SKILL.md` (+ optional `references/`, `evals/`); register in `skills.manifest.json`.
- New agents → `agents/<name>.md`. New Cursor rules → `rules/<name>.mdc`. Both are auto-discovered — no manifest entry needed.
- Marketplace manifests at `.cursor-plugin/`, `.claude-plugin/`, and `.codex-plugin/` (plus Codex's `.mcp.json` and `.agents/plugins/marketplace.json`) are generated from `plugin.config.yaml` via `npm run plugins:build` — do not hand-edit.

## Canonical documentation

- `https://developer.luzmo.com/llms.txt`
- `https://developer.luzmo.com/llms-full.txt`

Fetch markdown pages from developer.luzmo.com — do not rely on duplicated specs in this repo.

## MCP server (optional)

Hosted Luzmo MCP (alpha): `https://api.luzmo.com/0.1.0/mcp` — set `LUZMO_KEY` and `LUZMO_TOKEN` in headers or env.

Docs: `https://developer.luzmo.com/guide/mcp--introduction.md` — default tools `search_datasets`, `answer_question`, `create_chart`. Skill reference: `skills/ai-analytics/references/mcp-server.md`.
