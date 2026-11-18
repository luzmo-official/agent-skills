import { join, resolve } from 'node:path';
import { args, workspace, readJson, writeJson, run, isMain } from './common.mjs';
import { buildBaseline } from './baseline-lib.mjs';

export async function main(a) {
  await workspace(a.workspace);
  const out = join(a.workspace, 'artifacts'), capture = await readJson(join(out, 'capture.json'));
  const sources = [];
  for (const path of a.previous ?? []) sources.push({ path: resolve(path), value: await readJson(resolve(path)) });
  const baseline = buildBaseline(capture, sources);
  await writeJson(join(out, 'baseline.json'), baseline);
  const s = baseline.summary;
  process.stdout.write(`${baseline.limitation ?? `Compared ${baseline.sources.length} source(s) by resource ID: ${s.shared} shared, ${s.new} new, ${s.removed} removed; ${s.expression_changed} expression change(s), ${s.upstream_expression_changed} with changed dependencies.`}\n${baseline.warnings.map(w => `${w}\n`).join('')}Wrote artifacts/baseline.json. Offline; no live changes. review.mjs now lists every baseline difference for classification.\n`);
}
if (isMain(import.meta.url)) run(() => main(args({ previous: { type: 'string', multiple: true } })));
