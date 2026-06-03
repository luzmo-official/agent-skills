import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function hasManifest(dir: string): boolean {
  return existsSync(join(dir, 'skills.manifest.json'));
}

export function packageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..'), // packages/cli (published bundle)
    join(here, '..', '..'), // repo root when running from packages/cli/dist
    join(here, '..', '..', '..') // repo root when running from packages/cli/src
  ];
  for (const c of candidates) {
    if (hasManifest(c)) return c;
  }
  return join(here, '..');
}

export function repoRootFromPackage(): string {
  return packageRoot();
}
