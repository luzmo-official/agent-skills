# Changelog

All notable changes to Luzmo Agent Skills are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project is in `alpha`; until `1.0.0`, minor versions may include breaking changes.

## [0.1.3] - 2026-06-18

### Skill Changes

- Updated `skills.manifest.json` from `0.1.0` to `0.1.1` to reflect the refreshed skill set.
- Updated `core` from `0.1.0` to `0.1.1`: tightened doc retrieval guidance and corrected SDK CRUD examples to use securable operations.
- Updated `troubleshooting` from `0.1.0` to `0.1.1`: added canonical doc retrieval guidance and refreshed tenant-isolation diagnostics.
- Updated `data-visualization` from `0.1.0` to `0.1.1`: refreshed Flex chart guidance, chart schema URLs, and rendering examples.
- Updated `custom-charts` from `0.1.0` to `0.1.1`: aligned custom chart guidance with the refreshed documentation retrieval conventions.
- Updated `analytics-studio` from `0.1.0` to `0.1.1`: corrected ACK imports, component documentation links, and editor-role guidance.
- Updated `ai-analytics` from `0.1.0` to `0.1.1`: corrected `/aiprompt` agent/task guidance, response modes, scoped token usage, and AI resource links.
- Updated `multitenancy` from `0.1.0` to `0.1.1`: consolidated tenant-isolation guidance and clarified parameter overrides, token filters, and connection overrides.
- Updated `data-integration` from `0.1.0` to `0.1.1`: refined connector/data loading guidance, push-data scripts, and eval coverage.
- Updated `resource-management` from `0.1.0` to `0.1.1`: split irreversible deletion guidance into policy and script-pattern references with stronger guardrails.
- Updated `theming` from `0.1.0` to `0.1.1`: refreshed theme schema guidance, ACK theming links, CSS variable notes, and eval coverage.

### Fixed

- Added YAML-aware skill frontmatter validation to CI.
- Corrected hosted MCP server manifest entries to include the required `type: "http"`.
- Updated generated Cursor, Claude Code, and Codex plugin metadata for the `0.1.3` bundle release.

## [0.1.2] - 2026-06-04

### Changed

- Renamed the Cursor/Claude Code plugin from `agent-skills` to `luzmo-agent-skills` for a unique,
  branded marketplace identity. Claude install is now `/plugin install luzmo-agent-skills`. The npm
  package name (`@luzmo/agent-skills`) is unchanged.
- Rewrote the plugin/marketplace description to lead with the embedded-analytics lifecycle (embedding,
  multi-tenancy, charts and dashboards, AI analytics, data integration, resource management).

## [0.1.1] - 2026-06-04

### Fixed

- The published npm package now includes `README.md`. It was listed in the package `files` but never
  copied into `packages/cli/` by the publish-time bundler, so the npm page rendered without a readme.

### Changed

- Converted relative repo-file links in the README to absolute GitHub URLs so they resolve on the npm
  page as well as GitHub.
- Added `keywords`, `homepage`, `repository`, and `bugs` metadata to `@luzmo/agent-skills` for better
  npm discoverability and links.

## [0.1.0] - 2026-06-01

### Added

- Initial alpha release: 10 skills (`core`, `troubleshooting`, `data-visualization`, `custom-charts`,
  `analytics-studio`, `ai-analytics`, `multitenancy`, `data-integration`, `resource-management`,
  `theming`), 4 subagents (`luzmo-embed-engineer`, `luzmo-data-engineer`, `luzmo-ai-engineer`,
  `luzmo-troubleshooter`), and 3 Cursor rules (`luzmo-security`, `luzmo-api-conventions`,
  `luzmo-terminology`). Single-repo distribution for Cursor, Claude Code, and Codex (root
  `.cursor-plugin/`, `.claude-plugin/`, and `.codex-plugin/` manifests), the `@luzmo/agent-skills`
  installer CLI, [skills.sh](https://skills.sh) support for Codex/Copilot/Gemini, hosted MCP server
  registration, and the skill eval framework.
