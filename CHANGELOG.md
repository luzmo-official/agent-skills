# Changelog

All notable changes to Luzmo Agent Skills are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project is in `alpha`; until `1.0.0`, minor versions may include breaking changes.

## [0.1.5] - 2026-10-16

Catches the skills up with product releases since 2026-06-25 (Agents, Rules, AI context, the expanded MCP server, inline Flex data, web-component embeds, custom chart options and exports, the Archive, sticky overrides, and per-tenant fields).

### Added

- New `mcp` skill (`0.1.0`): the hosted Luzmo MCP server for two use cases. Developers set up a workspace from Claude, Cursor or ChatGPT (connections, datasets, metadata and AI context, formulas, answers, charts, dashboards, docs search). SaaS teams expose an embedded, white-labeled MCP to their own users (embed tokens, enabling extra tools, OAuth login, `agentId` URLs, Agent theme and name). `ai-analytics/references/mcp-server.md` now points to it.

### Skill Changes

- Updated `ai-analytics` from `0.1.1` to `0.1.2`:
  - Saved Agents (`agent_id`), published Rules, the `dashboard` agent, and dataset/column/formula `ai_context`.
  - `agent: "auto"` (universal agent) with `capabilities`. `agent_id` can be combined with `agent`; without it the universal agent uses the Agent's capabilities.
  - IQ Chat `agentId`, the IQ panel enabled from Studio dashboard settings, AI logs (`ailog`), and Custom Charts used by AI agents.
- Updated `data-visualization` from `0.1.1` to `0.1.2`: Flex `inlineData` (charts without a dataset, embed libraries 8.1.0 / ngx 10.1.0) with its limits, plus a warning that token filters do not apply to inline records. Also covers the viz-item `error` event and array filter expressions.
- Updated `core` from `0.1.1` to `0.1.2`:
  - Dashboards default to web-component `embedMode` in embed 8.x (needs `wss://`; edit modes stay in an iframe), plus the `error` event.
  - `@luzmo/shared-embed` is deprecated.
  - Export feature flags `flag_export_data` / `flag_export_email_data`.
  - Pointers to `tenant` / `tenant_fields_rights` and to the Studio-enabled IQ panel.
  - API deletes are documented as permanent instead of "irreversible" everywhere.
- Updated `custom-charts` from `0.1.1` to `0.1.2`:
  - Manifest chart options (configurable in Studio) and `exportData`, which is required for CSV/XLSX on multi-query charts and must be re-exported from `index.ts`.
  - Slot `position`, async `render` before exports, the Private -> Publish flow, command-line upload, chart type naming rules, and metadata that helps AI agents pick a chart.
  - Corrected function signatures (one params object) and slot label rules.
- Updated `analytics-studio` from `0.1.1` to `0.1.2`:
  - ACK 1.0.8 filter additions (`getFilters()` input, `format="clean"`, parameter-backed filters, filter-on-select / brush options).
  - The ACK peer range on `@luzmo/embed` 7.x.
  - Corrected event, prop, and chart type names in the examples.
- Updated `theming` from `0.1.1` to `0.1.2`: corrected IQ Chat/Answer CSS variables (`--luzmo-iq-*`), removed `IQChatOptions` keys that do not exist, and replaced invented ACK variable names with the documented ones.
- Updated `multitenancy` from `0.1.1` to `0.1.2`:
  - `sticky: true` overrides so scheduled exports and alerts keep the creating token's tenant scope.
  - Custom fields per tenant (`tenant`, `tenant_fields_rights`).
  - Fixed `embedfiltergroup` examples.
- Updated `data-integration` from `0.1.1` to `0.1.2`: Databricks OAuth2 M2M and Snowflake key-pair connections (create them in the app, then reuse them), nested aggregation formulas (GA), formulas over linked datasets, and the new Delta sync schema-change default.
- Updated `resource-management` from `0.1.1` to `0.1.2`:
  - App deletes of dashboards and datasets go to a 30-day Archive, while API deletes stay permanent. Confirmation guardrails are unchanged.
  - Exports to a webhook, Admin role scope, and e-mail export rate limits.
- Updated `troubleshooting` from `0.1.1` to `0.1.2`: routes for web-component embed loaders, inline-data errors, ACK `ERESOLVE`, archived datasets, sticky overrides, export `429`s, and MCP issues.
- Updated `skills.manifest.json` from `0.1.1` to `0.1.2` and registered `mcp`.

### Changed

- Agents and rules: the AI engineer covers `agent_id` with or without `agent`, IQ Chat `agentId`, and the `mcp` skill. The embed engineer covers the `embedMode` default and sticky overrides. The data engineer uses the Archive-aware delete wording. `luzmo-security` warns that `inlineData` bypasses token filters, and `luzmo-terminology` was updated.
- `npx @luzmo/agent-skills add --with-mcp` now writes `type: "http"`.
- Generated plugin READMEs now list the bundled skills from `skills.manifest.json` instead of a stale hard-coded list.

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
