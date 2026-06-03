# Contributing

## Source of truth

- **License:** [Apache-2.0](LICENSE) — root [`LICENSE`](LICENSE) + [`NOTICE`](NOTICE), bundled into the npm package on publish
- **Skills:** `skills/<id>/SKILL.md` + optional `references/`
- **Agents:** `agents/<name>.md` (multi-step subagents; auto-discovered, no manifest entry)
- **Cursor rules:** `rules/<name>.mdc` (Cursor-only context; keep under ~50 lines, link to `core` instead of duplicating)
- **Index:** `skills.manifest.json`
- **Bundle metadata:** `plugin.config.yaml`
- **Canonical API/specs:** `https://developer.luzmo.com/api/{action}{Resource}.md` — **link, don't copy**
- **Per-language examples:** `/api/{action}{Resource}/call/{lang}` and `/api/{action}{Resource}/examples/{slug}/{lang}` (HTML only — no `.md` suffix)
- **MCP:** `https://developer.luzmo.com/guide/mcp--introduction.md`

If content already exists on developer.luzmo.com, add a pointer stub in `references/` instead of duplicating it. Use call forms/examples for multi-language snippets; keep in-repo code only for orchestration (pagination, batching, retries) that the docs don't cover.

**AI API filenames** use CamelCase: `createAIPrompt.md`, `createAIConversation.md`, `searchAIMessage.md`, `searchAIMessageAsset.md`.

## Skill guidelines

1. Description ≤120 words with "Use when…" / "Not for…"
2. `SKILL.md` under 500 lines — move detail to `references/`
3. Shared auth/API content lives only in `core`
4. Include `## Avoid` before `## Hand Off`
5. End with `## Canonical Sources` (see `scripts/canonical-sources-block.md`)

## Development

```bash
npm install
npm run build
npm run plugins:build             # regenerates root .cursor-plugin/ + .claude-plugin/ manifests
npm run evals:validate              # skill-creator eval fixture check
```

Skills, agents, and marketplace plugins all ship from **this single repo**. Cursor reads
`.cursor-plugin/` and Claude Code reads `.claude-plugin/`; both manifests are generated from
[`plugin.config.yaml`](plugin.config.yaml) by `npm run plugins:build`. Do not hand-edit the
generated `*.json` manifests, and commit the regenerated files when bumping the version or
metadata (CI fails if they drift).

## Changelog

Add a dated entry to [`CHANGELOG.md`](CHANGELOG.md) for any change that affects installed skill or
plugin behavior. Documentation-only or internal tooling changes do not require an entry.

## Releases

Tag `v0.1.0` (alpha): publishes `@luzmo/agent-skills` to npm. Cursor/Claude Code install directly
from the tagged repo via the root marketplace manifests — there are no separate plugin repos to
publish.
