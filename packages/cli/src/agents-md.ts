import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InstallScope } from './targets/types.js';

const MARKER_START = '<!-- agent-skills:start -->';
const MARKER_END = '<!-- agent-skills:end -->';

export async function patchAgentsMd(
  projectDir: string,
  scope: InstallScope,
  skillIds: string[]
): Promise<void> {
  if (scope === 'global') return;
  const path = join(projectDir, 'AGENTS.md');
  const block = [
    MARKER_START,
    '',
    '# Luzmo agent skills',
    '',
    'Installed skills (load `SKILL.md` when relevant):',
    ...skillIds.map((id) => `- \`${id}\` → \`.agents/skills/${id}/SKILL.md\``),
    '',
    'Canonical Luzmo docs: https://developer.luzmo.com/llms.txt',
    '',
    MARKER_END
  ].join('\n');

  let content = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (content.includes(MARKER_START)) {
    const start = content.indexOf(MARKER_START);
    const end = content.indexOf(MARKER_END) + MARKER_END.length;
    content = content.slice(0, start) + block + content.slice(end);
  } else {
    content = (content.trim() ? content.trim() + '\n\n' : '') + block + '\n';
  }
  writeFileSync(path, content, 'utf8');
}
