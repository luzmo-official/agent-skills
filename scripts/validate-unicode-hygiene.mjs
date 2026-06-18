import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mdc',
  '.mjs',
  '.py',
  '.sh',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

const skippedDirs = new Set([
  '.git',
  'dist',
  'node_modules',
]);

const authoredRoots = [
  'agents',
  'evals',
  'packages',
  'rules',
  'scripts',
  'skills',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'EVAL_FRAMEWORK.md',
  'package.json',
  'plugin.config.yaml',
  'README.md',
];

const bannedCodePoints = new Map([
  [0x200b, 'ZERO WIDTH SPACE'],
  [0x200c, 'ZERO WIDTH NON-JOINER'],
  [0x200d, 'ZERO WIDTH JOINER'],
  [0x200e, 'LEFT-TO-RIGHT MARK'],
  [0x200f, 'RIGHT-TO-LEFT MARK'],
  [0x202a, 'LEFT-TO-RIGHT EMBEDDING'],
  [0x202b, 'RIGHT-TO-LEFT EMBEDDING'],
  [0x202c, 'POP DIRECTIONAL FORMATTING'],
  [0x202d, 'LEFT-TO-RIGHT OVERRIDE'],
  [0x202e, 'RIGHT-TO-LEFT OVERRIDE'],
  [0x2060, 'WORD JOINER'],
  [0x2061, 'FUNCTION APPLICATION'],
  [0x2062, 'INVISIBLE TIMES'],
  [0x2063, 'INVISIBLE SEPARATOR'],
  [0x2064, 'INVISIBLE PLUS'],
  [0x2066, 'LEFT-TO-RIGHT ISOLATE'],
  [0x2067, 'RIGHT-TO-LEFT ISOLATE'],
  [0x2068, 'FIRST STRONG ISOLATE'],
  [0x2069, 'POP DIRECTIONAL ISOLATE'],
  [0xfeff, 'ZERO WIDTH NO-BREAK SPACE'],
]);

for (let codePoint = 0xfe00; codePoint <= 0xfe0f; codePoint += 1) {
  bannedCodePoints.set(codePoint, 'VARIATION SELECTOR');
}
for (let codePoint = 0xe0100; codePoint <= 0xe01ef; codePoint += 1) {
  bannedCodePoints.set(codePoint, 'VARIATION SELECTOR SUPPLEMENT');
}

const bannedMarkers = new Map([
  [0x26a0, 'WARNING SIGN'],
  [0x2705, 'WHITE HEAVY CHECK MARK'],
  [0x2713, 'CHECK MARK'],
  [0x2717, 'BALLOT X'],
  [0x274c, 'CROSS MARK'],
  [0x1f6a8, 'POLICE CARS REVOLVING LIGHT'],
]);

const markerRestrictedRoots = [
  'agents/',
  'evals/',
  'rules/',
  'skills/',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'EVAL_FRAMEWORK.md',
  'plugin.config.yaml',
  'README.md',
];

const failures = [];

function isTextFile(path) {
  const index = path.lastIndexOf('.');
  return index >= 0 && textExtensions.has(path.slice(index).toLowerCase());
}

function listFiles(path) {
  const stats = statSync(path);
  if (stats.isFile()) return [path];
  if (!stats.isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirs.has(entry.name)) continue;
    files.push(...listFiles(join(path, entry.name)));
  }
  return files;
}

function lineAndColumn(content, offset) {
  let line = 1;
  let column = 1;
  for (let index = 0; index < offset; index += 1) {
    if (content[index] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

for (const entry of authoredRoots) {
  const path = join(root, entry);
  try {
    statSync(path);
  } catch {
    continue;
  }

  for (const file of listFiles(path)) {
    if (!isTextFile(file)) continue;

    const content = readFileSync(file, 'utf8');
    for (let offset = 0; offset < content.length;) {
      const codePoint = content.codePointAt(offset);
      const char = String.fromCodePoint(codePoint);
      const relPath = relative(root, file).split(sep).join('/');
      const name =
        bannedCodePoints.get(codePoint) ??
        (markerRestrictedRoots.some((prefix) => relPath.startsWith(prefix))
          ? bannedMarkers.get(codePoint)
          : undefined);

      if (name) {
        const { line, column } = lineAndColumn(content, offset);
        const code = `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
        failures.push(`${relPath}:${line}:${column} ${code} ${name}`);
      }

      offset += char.length;
    }
  }
}

if (failures.length > 0) {
  console.error('Unicode hygiene validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error('Use ASCII markers such as [WARNING], [OK], [ERROR], and [CRITICAL].');
  process.exit(1);
}

console.log('Unicode hygiene validation passed.');
