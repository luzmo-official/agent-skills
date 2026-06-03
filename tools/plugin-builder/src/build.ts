import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, mcpServersBlock, repoRoot } from './shared.js';

// Single-repo distribution: regenerate the native marketplace manifests that
// live at the repo root so Cursor, Claude Code, and Codex install directly from
// this repository. Source of truth is plugin.config.yaml — do not hand-edit the
// generated *.json files; run `npm run plugins:build` instead.

const config = loadConfig();
const root = repoRoot();

interface PluginManifest {
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: { name: string; email?: string };
  license: string;
  keywords?: string[];
  logo?: string;
  homepage?: string;
  repository?: string;
  mcpServers: Record<string, unknown>;
}

function pluginManifest(withLogo: boolean): PluginManifest {
  const manifest: PluginManifest = {
    name: config.name,
    displayName: config.displayName,
    version: config.version,
    description: config.description,
    author: config.author,
    license: config.license ?? 'Apache-2.0',
    keywords: config.keywords,
    ...(withLogo ? { logo: config.logo ?? 'assets/logo.svg' } : {}),
    homepage: config.homepage,
    repository: config.repository,
    mcpServers: mcpServersBlock(config)
  };
  return manifest;
}

// Codex uses a different manifest shape than Cursor/Claude: skills and MCP
// config are referenced by relative path (not inlined), and install-surface
// metadata lives under `interface`. See developers.openai.com/codex/plugins/build.
function codexPluginManifest(): Record<string, unknown> {
  return {
    name: config.name,
    version: config.version,
    description: config.description,
    author: config.author,
    homepage: config.homepage,
    repository: config.repository,
    license: config.license ?? 'Apache-2.0',
    keywords: config.keywords,
    skills: './skills/',
    mcpServers: './.mcp.json',
    interface: {
      displayName: config.displayName,
      shortDescription: config.description,
      longDescription: config.description,
      developerName: config.author.name,
      category: 'Productivity',
      websiteURL: config.homepage,
      logo: `./${config.logo ?? 'assets/logo.svg'}`
    }
  };
}

// Codex repo marketplace at .agents/plugins/marketplace.json. `source.path` is
// resolved relative to the marketplace root (the repo root), so `./` points at
// the .codex-plugin/plugin.json manifest in this repository.
function codexMarketplaceManifest(): Record<string, unknown> {
  return {
    name: config.name,
    interface: { displayName: config.displayName },
    plugins: [
      {
        name: config.name,
        source: { source: 'local', path: './' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity'
      }
    ]
  };
}

function marketplaceManifest(blurb: string): Record<string, unknown> {
  return {
    name: config.name,
    owner: config.author,
    metadata: { description: blurb, version: config.version },
    plugins: [
      {
        name: config.name,
        source: './',
        description: config.description,
        version: config.version,
        author: { name: config.author.name },
        license: config.license ?? 'Apache-2.0',
        keywords: config.keywords,
        category: 'data'
      }
    ]
  };
}

function write(dir: string, file: string, data: unknown): void {
  const out = join(root, dir);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, file), JSON.stringify(data, null, 2) + '\n');
  console.log('wrote', join(dir, file));
}

function writeRoot(file: string, data: unknown): void {
  writeFileSync(join(root, file), JSON.stringify(data, null, 2) + '\n');
  console.log('wrote', file);
}

write('.cursor-plugin', 'plugin.json', pluginManifest(true));
write(
  '.cursor-plugin',
  'marketplace.json',
  marketplaceManifest(
    'Official Luzmo agent skills for Cursor — embedded analytics: auth, dashboards, Flex charts, AI (/aiprompt), multi-tenancy, theming, and troubleshooting.'
  )
);
write('.claude-plugin', 'plugin.json', pluginManifest(false));
write(
  '.claude-plugin',
  'marketplace.json',
  marketplaceManifest(
    'Official Luzmo agent skills for Claude Code — embedded analytics: auth, dashboards, Flex charts, AI (/aiprompt), multi-tenancy, theming, and troubleshooting.'
  )
);
write('.codex-plugin', 'plugin.json', codexPluginManifest());
writeRoot('.mcp.json', mcpServersBlock(config));
write('.agents/plugins', 'marketplace.json', codexMarketplaceManifest());

console.log('done — root marketplace manifests synced from plugin.config.yaml');
