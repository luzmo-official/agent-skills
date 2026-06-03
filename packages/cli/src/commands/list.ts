import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { readLockfile } from '../lockfile.js';
import { getTarget } from '../targets/index.js';
import type { InstallScope } from '../targets/types.js';

export async function runList(opts: {
  tool?: string;
  scope?: InstallScope;
  projectDir?: string;
}): Promise<void> {
  const projectDir = opts.projectDir ?? cwd();
  const lock = readLockfile(projectDir);
  if (lock) {
    console.log(JSON.stringify(lock, null, 2));
    return;
  }
  const tool = opts.tool ?? 'universal';
  const scope = opts.scope ?? 'project';
  const target = getTarget(tool);
  const base = target.skillsDir(projectDir, scope);
  if (!existsSync(base)) {
    console.log('No skills installed at', base);
    return;
  }
  const ids = readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  console.log(ids.join('\n') || '(empty)');
}
