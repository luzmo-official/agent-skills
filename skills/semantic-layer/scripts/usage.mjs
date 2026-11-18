import { join } from 'node:path';
import { args, workspace, readJson, writeJson, run, isMain } from './common.mjs';
import { usagePatterns } from './usage-lib.mjs';

export async function main(a) {
  await workspace(a.workspace);
  const out = join(a.workspace, 'artifacts'), report = usagePatterns(await readJson(join(out, 'capture.json')));
  await writeJson(join(out, 'usage-patterns.json'), report);
  process.stdout.write(`Read ${report.measures} chart measure(s) on ${report.dashboards} dashboard(s): ${report.patterns.length} pattern(s), ${report.patterns.filter(p => p.candidate).length} worth assessing as a formula. Wrote artifacts/usage-patterns.json. Offline; usage evidence, not definitions.\n`);
}
if (isMain(import.meta.url)) run(() => main(args()));
