import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

export function repoRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

export interface PluginConfig {
  name: string;
  displayName: string;
  description: string;
  version: string;
  author: { name: string; email?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  logo?: string;
  mcp?: {
    pathVersion: string;
    regions: { eu: { apiHost: string }; us: { apiHost: string } };
  };
  publish?: Record<string, string>;
}

export function loadConfig(): PluginConfig {
  return parseYaml(readFileSync(join(repoRoot(), 'plugin.config.yaml'), 'utf8')) as PluginConfig;
}

export function mcpServersBlock(config: PluginConfig): Record<string, unknown> {
  const version = config.mcp?.pathVersion ?? '0.1.0';
  const host = config.mcp?.regions?.eu?.apiHost ?? 'https://api.luzmo.com';
  return {
    luzmo: {
      url: `${host}/${version}/mcp`,
      headers: {
        'X-Luzmo-Key': '${LUZMO_KEY}',
        'X-Luzmo-Token': '${LUZMO_TOKEN}'
      }
    }
  };
}

export function copySkills(destSkills: string): void {
  const src = join(repoRoot(), 'skills');
  if (existsSync(destSkills)) rmSync(destSkills, { recursive: true, force: true });
  cpSync(src, destSkills, { recursive: true });
}

export function writeReadme(
  dest: string,
  title: string,
  installSnippet: string,
  extra = ''
): void {
  const config = loadConfig();
  const body = `# ${title}

${config.description}

## Install

${installSnippet}

## Skills

All 9 Luzmo agent skills are bundled: foundation, visualizations, analytics-studio, ai-analytics, multitenancy, data-integration, resource-management, theming, troubleshooting.

## MCP server (optional)

This plugin registers the hosted Luzmo MCP server. Set environment variables:

\`\`\`bash
export LUZMO_KEY="your-api-key"
export LUZMO_TOKEN="your-api-token"
\`\`\`

Default URL: \`https://api.luzmo.com/${config.mcp?.pathVersion ?? '0.1.0'}/mcp\`

For US: \`https://api.us.luzmo.com/${config.mcp?.pathVersion ?? '0.1.0'}/mcp\`

${extra}

## Docs

https://developer.luzmo.com/llms.txt
`;
  writeFileSync(join(dest, 'README.md'), body, 'utf8');
}

export function copyAssets(dest: string): void {
  const assets = join(repoRoot(), 'assets');
  if (existsSync(assets)) {
    cpSync(assets, join(dest, 'assets'), { recursive: true });
  }
}

export function copyLicense(dest: string): void {
  const lic = join(repoRoot(), 'LICENSE');
  if (!existsSync(lic)) {
    console.error('missing LICENSE at repo root — add LICENSE before building plugins');
    process.exit(1);
  }
  cpSync(lic, join(dest, 'LICENSE'));
}

export function ensureDir(p: string): void {
  mkdirSync(p, { recursive: true });
}
