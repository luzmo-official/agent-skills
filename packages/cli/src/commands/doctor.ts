import { existsSync } from 'node:fs';
import { cwd } from 'node:process';
import { loadPluginConfig } from '../manifest.js';
import { readLockfile } from '../lockfile.js';
import { mcpUrl } from '../mcp.js';
import type { McpRegion } from '../mcp.js';
import { getTarget } from '../targets/index.js';

export async function runDoctor(opts: { projectDir?: string }): Promise<void> {
  const projectDir = opts.projectDir ?? cwd();
  const config = loadPluginConfig();
  const lock = readLockfile(projectDir);
  let ok = true;

  const key = process.env.LUZMO_KEY;
  const token = process.env.LUZMO_TOKEN;
  if (!key || !token) {
    console.warn('⚠ LUZMO_KEY / LUZMO_TOKEN not set in environment');
    ok = false;
  } else {
    console.log('✓ LUZMO_KEY and LUZMO_TOKEN are set');
  }

  if (lock) {
    for (const entry of lock.entries) {
      const target = getTarget(entry.tool);
      const base = target.skillsDir(projectDir, entry.scope);
      for (const id of entry.skills) {
        const path = `${base}/${id}/SKILL.md`;
        if (existsSync(path)) console.log(`✓ ${path}`);
        else {
          console.warn(`✗ missing ${path}`);
          ok = false;
        }
      }
      if (entry.mcp) {
        const region = (entry.mcp.region as McpRegion) ?? 'eu';
        const url = entry.mcp.url.startsWith('http')
          ? entry.mcp.url
          : mcpUrl(config, region, entry.mcp.vpcHost);
        try {
          const res = await fetch(url, { method: 'HEAD' });
          console.log(`✓ MCP reachable ${url} (${res.status})`);
        } catch (e) {
          console.warn(`✗ MCP unreachable ${url}:`, e);
          ok = false;
        }
      }
    }
  } else {
    console.log('No lockfile — run add to install skills');
  }

  process.exit(ok ? 0 : 1);
}
