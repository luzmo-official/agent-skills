# Changelog

All notable changes to Luzmo Agent Skills are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project is in `alpha`; until `1.0.0`, minor versions may include breaking changes.

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
