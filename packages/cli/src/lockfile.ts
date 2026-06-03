import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface LockfileEntry {
  tool: string;
  scope: 'project' | 'global';
  skills: string[];
  mcp?: { region: string; url: string; vpcHost?: string };
}

export interface LuzmoSkillsLockfile {
  version: string;
  packageVersion: string;
  entries: LockfileEntry[];
}

const FILENAME = '.agent-skills.json';

export function lockfilePath(projectDir: string): string {
  return join(projectDir, FILENAME);
}

export function readLockfile(projectDir: string): LuzmoSkillsLockfile | null {
  const path = lockfilePath(projectDir);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as LuzmoSkillsLockfile;
}

export function writeLockfile(projectDir: string, data: LuzmoSkillsLockfile): void {
  writeFileSync(lockfilePath(projectDir), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function upsertLockEntry(
  lock: LuzmoSkillsLockfile,
  entry: LockfileEntry
): LuzmoSkillsLockfile {
  const entries = lock.entries.filter(
    (e) => !(e.tool === entry.tool && e.scope === entry.scope)
  );
  entries.push(entry);
  return { ...lock, entries };
}
