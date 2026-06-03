import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { packageRoot, repoRootFromPackage } from './paths.js';

export interface SkillEntry {
  id: string;
  path: string;
  required?: boolean;
  description?: string;
  depends_on?: string[];
}

export interface SkillsManifest {
  version: string;
  skills: SkillEntry[];
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
    defaultRegion: string;
    pathVersion: string;
    regions: Record<string, { apiHost: string; appUrl: string }>;
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function loadSkillsManifest(root = packageRoot()): SkillsManifest {
  const path = join(root, 'skills.manifest.json');
  return readJson<SkillsManifest>(path);
}

export function loadPluginConfig(root = packageRoot()): PluginConfig {
  const path = join(root, 'plugin.config.yaml');
  return parseYaml(readFileSync(path, 'utf8')) as PluginConfig;
}

export function resolveSkillIds(
  requested: string[],
  manifest: SkillsManifest
): string[] {
  if (requested.includes('all')) {
    return manifest.skills.map((s) => s.id);
  }
  const ids = new Set<string>(requested);
  let changed = true;
  while (changed) {
    changed = false;
    for (const skill of manifest.skills) {
      if (ids.has(skill.id)) {
        for (const dep of skill.depends_on ?? []) {
          if (!ids.has(dep)) {
            ids.add(dep);
            changed = true;
          }
        }
      }
    }
  }
  return [...ids];
}

export function skillSourceDir(skillId: string, skillsRoot: string): string {
  return join(skillsRoot, skillId);
}

export function defaultSkillsRoot(): string {
  const pkg = packageRoot();
  if (existsSync(join(pkg, 'skills'))) return join(pkg, 'skills');
  return join(repoRootFromPackage(), 'skills');
}
