# Changelog

All notable changes to Luzmo Agent Skills are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project is in `alpha`; until `1.0.0`, minor versions may include breaking changes.

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
