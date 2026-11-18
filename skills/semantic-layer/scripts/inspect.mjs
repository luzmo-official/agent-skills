import { join, resolve } from 'node:path';
import { args, workspace, readJson, writeJson, client, run, isMain } from './common.mjs';
import { buildInspection } from './inspect-lib.mjs';
import { assertEmbedAccess } from './embed-access-lib.mjs';

// Routine read-only investigation: no hash or approval gate. --dry-run prints the exact queries without credentials or network.
export async function main(a, dependencies = {}) {
  if (!a.checks) throw new Error('Provide --checks <file.json> with a "checks" array.');
  const config = await workspace(a.workspace), out = join(a.workspace, 'artifacts');
  const capture = await readJson(join(out, 'capture.json'));
  const plan = buildInspection(config, capture, await readJson(resolve(a.checks)));
  if (a['dry-run']) {
    for (const c of plan.checks) process.stdout.write(`${c.id}: ${c.question}\n  ${c.scope}\n  ${JSON.stringify(c.query)}\n`);
    process.stdout.write(`Dry run: ${plan.checks.length} read-only queries; nothing sent.\n`);
    return;
  }
  const clients = new Map();
  for (const credentialMode of new Set(plan.checks.map(c => c.authentication))) {
    const api = await (dependencies.clientFactory ?? client)(a.workspace, { credentialMode });
    if (api.host !== plan.host) throw new Error(`The workspace .env points at ${api.host}, but the capture came from ${plan.host}.`);
    clients.set(credentialMode, api);
  }
  const embedDatasets = [...new Set(plan.checks.filter(c => c.authentication === 'embed').map(c => c.dataset_id))];
  if (embedDatasets.length) await assertEmbedAccess(clients.get('embed'), embedDatasets, capture);
  let report = { schema_version: 1, host: plan.host, capture_sha256: plan.capture_sha256, inspections: [] };
  try { const saved = await readJson(join(out, 'inspections.json')); if (saved.capture_sha256 === plan.capture_sha256) report = saved; } catch (error) { if (!error.message.startsWith('Missing inspections.json')) throw error; }
  const record = entry => { report.inspections = [...report.inspections.filter(i => i.id !== entry.id), entry]; return writeJson(join(out, 'inspections.json'), report); };
  const timedOut = error => error?.timeout === true || /time(d)?[\s-]?out/i.test(error?.apiMessage ?? error?.message ?? '');
  let failed = 0;
  for (const c of plan.checks) {
    const entry = { id: c.id, question: c.question, dataset_id: c.dataset_id, mode: c.mode, authentication: c.authentication, scope: c.scope, query: c.query, labels: c.labels, executed_at: new Date().toISOString() };
    try {
      const result = await clients.get(c.authentication).request('data', { action: 'get', find: { queries: [c.query] } });
      if (!Array.isArray(result.data) || result.data.length > c.query.limit.by || result.data.some(row => !Array.isArray(row) || row.length !== c.labels.length)) throw new Error('Unexpected Data API response shape.');
      Object.assign(entry, { row_count: result.data.length, at_limit: result.data.length === c.query.limit.by, results: result.data });
    } catch (error) {
      if (error.refused) { entry.error = error.message; await record(entry); throw error; }
      if (!timedOut(error)) { entry.error = error.message; await record(entry); throw new Error(`Inspection stopped at "${c.id}": ${error.message} Check the columns, filters and credentials; earlier results are in artifacts/inspections.json.`); }
      failed++;
      Object.assign(entry, { error: error.message, timed_out: true, hint: 'Narrow the check: fewer columns, a narrower date window or a more selective filter. It was not retried.' });
    }
    await record(entry);
  }
  process.stdout.write(`Ran ${plan.checks.length} checks${failed ? `, ${failed} timed out (narrow them; see hint in artifacts/inspections.json)` : ''}. Cite a result as query evidence with its recorded scope. Private: rows can contain customer data.\n`);
}
if (isMain(import.meta.url)) run(() => main(args({ checks: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } })));
