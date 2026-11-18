import { join } from 'node:path';
import { args, workspace, readJson, writeJson, hash, client, run, isMain } from './common.mjs';
import { buildProfile, fromSample } from './profile-lib.mjs';
import { assertEmbedAccess } from './embed-access-lib.mjs';

export async function main(a, dependencies = {}) {
  const config = await workspace(a.workspace), out = join(a.workspace, 'artifacts');
  const capture = await readJson(join(out, 'capture.json'));
  const plan = buildProfile(config, capture), digest = hash(plan);
  if (!a.execute) {
    await writeJson(join(out, 'profile-plan.json'), plan);
    process.stdout.write(`Offline plan: ${plan.jobs.length} aggregate queries. Check profile-plan.json, scopes and cost; the hash only guards that the executed plan is this one. SHA-256: ${digest}\n`);
    return;
  }
  const saved = await readJson(join(out, 'profile-plan.json'));
  if (a['plan-sha256'] !== digest || hash(saved) !== digest) throw new Error('Profile plan changed or hash missing; regenerate and review before execution.');
  const clients = new Map();
  for (const credentialMode of new Set(plan.jobs.map(j => j.authentication))) {
    const api = await (dependencies.clientFactory ?? client)(a.workspace, { credentialMode });
    if (api.host !== plan.host) throw new Error(`The workspace .env points at ${api.host}, but the capture came from ${plan.host}.`);
    clients.set(credentialMode, api);
  }
  const embedDatasets = [...new Set(plan.jobs.filter(j => j.authentication === 'embed').map(j => j.dataset_id))];
  if (embedDatasets.length) await assertEmbedAccess(clients.get('embed'), embedDatasets, capture);
  const report ={ schema_version: 1, started_at: new Date().toISOString(), plan_sha256: digest, jobs: [], samples: [], complete: false };
  const save = () => writeJson(join(out, 'profile-results.json'), report);
  const query = async (authentication, q, width) => {
    const result = await clients.get(authentication).request('data', { action: 'get', find: { queries: [q] } });
    if (!Array.isArray(result.data) || result.data.length > q.limit.by || result.data.some(row => !Array.isArray(row) || row.length !== width)) throw new Error('Unexpected Data API response shape.');
    return result.data;
  };
  const fetched = new Map();
  const sampleFor = job => {
    const spec = plan.samples.find(s => s.dataset_id === job.dataset_id);
    if (!fetched.has(job.dataset_id)) fetched.set(job.dataset_id, (async () => {
      const entry = { dataset_id: job.dataset_id, started_at: new Date().toISOString() };
      report.samples.push(entry);
      try {
        const rows = await query(spec.authentication, spec.query, spec.columns.length), file = `profile-sample-${job.dataset_id}.json`;
        await writeJson(join(out, file), { dataset_id: job.dataset_id, columns: spec.columns, fetched_at: new Date().toISOString(), rows });
        Object.assign(entry, { rows: rows.length, at_limit: rows.length === spec.query.limit.by, file });
        return { columns: spec.columns, rows };
      } catch (error) {
        entry.error = error.message;
        throw error;
      } finally { await save(); }
    })());
    return fetched.get(job.dataset_id);
  };
  const timedOut = error => error?.timeout === true || /time(d)?[\s-]?out/i.test(error?.apiMessage ?? error?.message ?? '');
  await save();
  for (const job of plan.jobs) {
    const record = { ...job, started_at: new Date().toISOString() };
    report.jobs.push(record);
    try {
      record.data = await query(job.authentication, job.query, job.labels.length);
      record.source = 'aggregate';
      record.output_at_limit = job.query.dimensions.length > 0 && record.data.length === job.query.limit.by;
      record.finished_at = new Date().toISOString();
      await save();
    } catch (error) {
      record.error = error.message;
      await save();
      if (error.refused) throw error;
      if (timedOut(error) && plan.samples?.some(s => s.dataset_id === job.dataset_id)) {
        try {
          const sample = await sampleFor(job);
          delete record.error;
          Object.assign(record, { aggregate_timeout: error.message, data: fromSample(job, sample), source: 'sample', sample_rows: sample.rows.length, finished_at: new Date().toISOString() });
          await save();
          continue;
        } catch (sampleError) {
          throw new Error(`Profile stopped at "${job.purpose}": ${error.message} The ${plan.samples.find(s => s.dataset_id === job.dataset_id).query.limit.by}-row sample fallback also failed: ${sampleError.message} Partial results are in artifacts/profile-results.json. Diagnose the cause, then fix the plan or check whether a tenant or other data filter should be applied.`);
        }
      }
      const advice = job.authentication === 'embed'
        ? `Check that the Embed token is unexpired, has use access to dataset ${job.dataset_id} and that its filters or connection overrides keep the profiled columns.`
        : 'Check the profiled columns, scope filters and API credentials; a timeout can mean a tenant or other data filter, a shorter date window or fewer expensive aggregates is needed.';
      throw new Error(`Profile stopped at "${job.purpose}": ${error.message} ${advice} Partial results are in artifacts/profile-results.json. Diagnose the cause, then fix the plan and regenerate it before running again.`);
    }
  }
  report.complete = true;
  await save();
  const fallbacks = report.jobs.filter(j => j.source === 'sample').length;
  process.stdout.write(`Completed ${report.jobs.length} checks${fallbacks ? `, ${fallbacks} from the row-sample fallback after a timeout (see artifacts/profile-sample-*.json)` : ''}. Review results and cohort limitations before drafting.\n`);
}
if (isMain(import.meta.url)) run(() => main(args({ execute: { type: 'boolean', default: false }, 'plan-sha256': { type: 'string' } })));
