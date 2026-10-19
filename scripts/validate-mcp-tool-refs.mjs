// Checks that every backticked Luzmo MCP tool name in skills/ exists in
// scripts/mcp-tools.snapshot.json, so skills never point agents at a tool
// the hosted MCP server does not have.
//
// A backticked snake_case identifier counts as a tool reference when its first
// word is a tool verb (taken from the snapshot, plus a few common ones), for
// example `update_dataset_metadata` or `get_dashboard`. Identifiers that look
// like that but are not tools go in NON_TOOL_IDENTIFIERS below.
//
// Refreshing the snapshot:
//   node scripts/validate-mcp-tool-refs.mjs --print-guide-tools
// fetches the public MCP guide, prints the tools in its Tools table, and lists
// differences with the snapshot. Update scripts/mcp-tools.snapshot.json by hand
// (tools the guide does not list yet keep "guide": false), bump "updated", and
// when a live server is at hand, compare with its `tools/list` response too.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const skillsDir = join(root, 'skills');
const snapshotPath = join(root, 'scripts', 'mcp-tools.snapshot.json');
const guideUrl = 'https://developer.luzmo.com/guide/mcp--introduction.md';

const NON_TOOL_IDENTIFIERS = new Set([]);
const EXTRA_VERBS = ['get', 'remove', 'set', 'fetch', 'run', 'query'];

const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const toolNames = new Set(snapshot.tools.map((tool) => tool.name));

if (process.argv.includes('--print-guide-tools')) {
  const response = await fetch(guideUrl);
  if (!response.ok) {
    console.error(`Could not fetch ${guideUrl}: HTTP ${response.status}`);
    process.exit(1);
  }
  const guide = await response.text();
  const guideTools = [
    ...guide.matchAll(/^\|\s*`([a-z][a-z0-9_]*)`\s*\|\s*(Read|Write|Destructive)\s*\|/gm),
  ].map((match) => ({ name: match[1], impact: match[2].toLowerCase() }));
  console.log(`Tools in the guide's Tools table (${guideUrl}):`);
  for (const tool of guideTools) console.log(`- ${tool.name} (${tool.impact})`);
  const guideNames = new Set(guideTools.map((tool) => tool.name));
  const missing = guideTools.filter((tool) => !toolNames.has(tool.name));
  const notInGuide = snapshot.tools.filter((tool) => !guideNames.has(tool.name));
  console.log(`\nIn the guide, missing from the snapshot: ${missing.map((t) => t.name).join(', ') || 'none'}`);
  console.log(`In the snapshot, not in the guide table: ${notInGuide.map((t) => t.name).join(', ') || 'none'}`);
  process.exit(0);
}

const verbs = new Set([...snapshot.tools.map((tool) => tool.name.split('_')[0]), ...EXTRA_VERBS]);
const referencePattern = /`([a-z]+(?:_[a-z0-9]+)+)`/g;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.(md|json)$/.test(entry.name)) yield path;
  }
}

const failures = [];
let checked = 0;

for (const path of walk(skillsDir)) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(referencePattern)) {
      const name = match[1];
      if (!verbs.has(name.split('_')[0]) || NON_TOOL_IDENTIFIERS.has(name)) continue;
      checked += 1;
      if (!toolNames.has(name)) {
        failures.push(`${relative(root, path)}:${index + 1}: \`${name}\` is not in scripts/mcp-tools.snapshot.json`);
      }
    }
  });
}

if (failures.length > 0) {
  console.error('MCP tool reference validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    '\nFix the tool name, add a real new tool to the snapshot (see the header of this script), or add a non-tool identifier to NON_TOOL_IDENTIFIERS.'
  );
  process.exit(1);
}

console.log(`MCP tool reference validation passed (${checked} references, ${toolNames.size} known tools).`);
