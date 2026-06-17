import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';

const root = process.cwd();
const skillsDir = join(root, 'skills');
const failures = [];

for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;

  const skillPath = join(skillsDir, entry.name, 'SKILL.md');
  const content = readFileSync(skillPath, 'utf8');
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

  if (!match) {
    failures.push(`${entry.name}: missing YAML frontmatter`);
    continue;
  }

  const document = parseDocument(match[1], { prettyErrors: true });
  if (document.errors.length > 0) {
    const messages = document.errors.map((error) => error.message).join('; ');
    failures.push(`${entry.name}: invalid YAML frontmatter: ${messages}`);
    continue;
  }

  const frontmatter = document.toJSON();
  if (typeof frontmatter?.name !== 'string' || frontmatter.name.length === 0) {
    failures.push(`${entry.name}: frontmatter.name must be a non-empty string`);
  }
  if (
    typeof frontmatter?.description !== 'string' ||
    frontmatter.description.length === 0
  ) {
    failures.push(
      `${entry.name}: frontmatter.description must be a non-empty string`
    );
  }
}

if (failures.length > 0) {
  console.error('Skill frontmatter validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Skill frontmatter validation passed.');
