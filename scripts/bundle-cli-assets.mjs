#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'packages/cli');

for (const name of ['skills', 'skills.manifest.json', 'plugin.config.yaml', 'README.md', 'LICENSE', 'NOTICE']) {
  const src = join(root, name);
  const dest = join(cli, name);
  if (!existsSync(src)) {
    console.warn(`skip missing ${name}`);
    continue;
  }
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}
console.log('bundled assets into packages/cli');
