import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { extract } from './tar-extract.js';
import { defaultSkillsRoot } from './manifest.js';
import { packageRoot } from './paths.js';
import { repoRootFromPackage } from './paths.js';

const DEFAULT_REPO = 'luzmo-official/agent-skills';

export interface SkillSource {
  skillsRoot: string;
  cleanup?: () => void;
}

export async function resolveSkillSource(ref?: string): Promise<SkillSource> {
  if (!ref) {
    return { skillsRoot: defaultSkillsRoot() };
  }

  const tmp = join(packageRoot(), '.tmp-fetch', ref.replace(/[^a-zA-Z0-9._-]/g, '_'));
  if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });

  const url = ref.startsWith('http')
    ? ref
    : `https://github.com/${DEFAULT_REPO}/archive/refs/heads/${ref}.tar.gz`;

  const tarPath = join(tmp, 'archive.tar.gz');
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(tarPath));

  const extractDir = join(tmp, 'extracted');
  mkdirSync(extractDir, { recursive: true });
  await extract(tarPath, extractDir);

  const entries = await import('node:fs/promises').then((fs) => fs.readdir(extractDir));
  const rootName = entries.find((e) => e.startsWith('agent-skills'));
  const skillsRoot = rootName
    ? join(extractDir, rootName, 'skills')
    : join(extractDir, 'skills');

  if (!existsSync(skillsRoot)) {
    throw new Error(`Fetched archive has no skills/ at ${skillsRoot}`);
  }

  return {
    skillsRoot,
    cleanup: () => rmSync(tmp, { recursive: true, force: true })
  };
}

export function skillsRootForDev(): string {
  const repo = repoRootFromPackage();
  const skills = join(repo, 'skills');
  if (existsSync(skills)) return skills;
  return defaultSkillsRoot();
}
