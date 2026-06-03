import * as p from '@clack/prompts';
import { cwd } from 'node:process';
import { loadSkillsManifest, resolveSkillIds } from '../manifest.js';
import { removeMcp, removeSkills } from '../install.js';
import { readLockfile, writeLockfile } from '../lockfile.js';
import { getTarget } from '../targets/index.js';
import type { InstallScope } from '../targets/types.js';

export async function runRemove(opts: {
  tool: string[];
  skills?: string[];
  scope?: InstallScope;
  mcp?: boolean;
  projectDir?: string;
}): Promise<void> {
  const projectDir = opts.projectDir ?? cwd();
  const scope = opts.scope ?? 'project';
  const manifest = loadSkillsManifest();
  const skillIds = opts.skills
    ? resolveSkillIds(opts.skills, manifest)
    : manifest.skills.map((s) => s.id);

  for (const toolId of opts.tool) {
    const target = getTarget(toolId);
    removeSkills(target, projectDir, scope, skillIds);
    if (opts.mcp) removeMcp(target, projectDir, scope);
    p.log.success(`Removed from ${target.displayName}`);
  }

  const lock = readLockfile(projectDir);
  if (lock) {
    lock.entries = lock.entries.filter(
      (e) => !opts.tool.includes(e.tool) || e.scope !== scope
    );
    writeLockfile(projectDir, lock);
  }
}
