import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TargetAdapter } from './targets/types.js';
import type { InstallScope } from './targets/types.js';
import { luzmoMcpServerEntry, mergeMcpConfig, mcpUrl, removeLuzmoMcp } from './mcp.js';
import type { PluginConfig } from './manifest.js';
import type { McpRegion } from './mcp.js';

export interface InstallSkillsOptions {
  skillsRoot: string;
  skillIds: string[];
  target: TargetAdapter;
  projectDir: string;
  scope: InstallScope;
  dryRun?: boolean;
}

export function installSkills(opts: InstallSkillsOptions): string[] {
  const base = opts.target.skillsDir(opts.projectDir, opts.scope);
  const written: string[] = [];
  for (const id of opts.skillIds) {
    const src = join(opts.skillsRoot, id);
    const dest = join(base, id);
    if (!existsSync(src)) throw new Error(`Skill not found: ${src}`);
    if (opts.dryRun) {
      written.push(dest);
      continue;
    }
    mkdirSync(base, { recursive: true });
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    written.push(dest);
  }
  return written;
}

export function installMcp(
  target: TargetAdapter,
  projectDir: string,
  scope: InstallScope,
  config: PluginConfig,
  region: McpRegion,
  vpcHost?: string,
  dryRun?: boolean
): string {
  const path = target.mcpConfigPath(projectDir, scope);
  const url = mcpUrl(config, region, vpcHost);
  const entry = luzmoMcpServerEntry(url);
  let existing: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      existing = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }
  const merged = mergeMcpConfig(existing, entry);
  if (!dryRun) {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  }
  return path;
}

export function removeMcp(
  target: TargetAdapter,
  projectDir: string,
  scope: InstallScope
): void {
  const path = target.mcpConfigPath(projectDir, scope);
  if (!existsSync(path)) return;
  const existing = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  writeFileSync(path, JSON.stringify(removeLuzmoMcp(existing), null, 2) + '\n', 'utf8');
}

export function removeSkills(
  target: TargetAdapter,
  projectDir: string,
  scope: InstallScope,
  skillIds: string[]
): void {
  const base = target.skillsDir(projectDir, scope);
  for (const id of skillIds) {
    const dest = join(base, id);
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  }
}
