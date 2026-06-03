import { cwd } from 'node:process';
import { readLockfile } from '../lockfile.js';
import { runAdd, type AddOptions } from './add.js';

export async function runUpdate(opts: AddOptions): Promise<void> {
  const projectDir = opts.projectDir ?? cwd();
  const lock = readLockfile(projectDir);
  if (!lock?.entries.length) {
    console.error('No .agent-skills.json — run add first');
    process.exit(1);
  }
  for (const entry of lock.entries) {
    await runAdd({
      ...opts,
      yes: true,
      tool: [entry.tool],
      skills: entry.skills,
      scope: entry.scope,
      withMcp: Boolean(entry.mcp),
      region: (entry.mcp?.region as AddOptions['region']) ?? 'eu',
      vpcHost: entry.mcp?.vpcHost,
      projectDir
    });
  }
}
