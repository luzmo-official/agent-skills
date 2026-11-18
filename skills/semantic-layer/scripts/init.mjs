import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, run } from './common.mjs';

run(async () => {
  const a = args();
  await mkdir(a.workspace, { recursive: true, mode: 0o700 });
  for (const [source, target] of [['config.example.json', 'config.json'], ['.env.example', '.env']]) {
    const content = await readFile(fileURLToPath(new URL(`../assets/${source}`, import.meta.url)), 'utf8');
    try { await writeFile(join(a.workspace, target), content, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  // Ignore the whole workspace: it lives in the main working directory and holds credentials and customer data.
  try { await writeFile(join(a.workspace, '.gitignore'), '*\n', { flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  process.stdout.write(`Workspace initialized at ${a.workspace}. Ask the user to replace the placeholders in ${join(a.workspace, '.env')} locally (API host URL, key and token from Settings > API Tokens in Luzmo); do not read the file yourself. Set customer, languages and dataset selection in config.json. Existing files were preserved.\n`);
});
