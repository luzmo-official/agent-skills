import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { args, workspace, client, readJson, writeJson, hash, createOnce, interruption, label, run, isMain } from './common.mjs';
import { iqPlan, askAll, validateAssessment, compareRuns, renderComparisonHtml, renderComparisonMarkdown } from './iq-lib.mjs';
import { assertEmbedAccess } from './embed-access-lib.mjs';

const runPath = (out, name) => join(out, 'iq-runs', `${name}.json`);
export async function loadRun(out, name, { requireAssessment = false } = {}) {
  const runFile = await readJson(runPath(out, name));
  let assessment = null;
  try { assessment = await readJson(runPath(out, `${name}.assessment`)); } catch (error) { if (!error.message.startsWith('Missing')) throw error; }
  if (!assessment?.assessments?.length) { if (requireAssessment) throw new Error(`Assess run "${name}" first: fill artifacts/iq-runs/${name}.assessment.json.`); return { run: runFile, assessments: new Map() }; }
  return { run: runFile, assessments: validateAssessment(runFile, assessment) };
}
async function resourceNames(out) {
  try { return new Map((await readJson(join(out, 'capture.json'))).resources.map(r => [r.id, label(r.name)])); } catch { return new Map(); }
}

export async function main(a, dependencies = {}) {
  if (!['plan', 'run', 'compare'].includes(a.mode)) throw new Error('Use --mode plan, run or compare.');
  const config = await workspace(a.workspace), out = join(a.workspace, 'artifacts');
  if (a.mode === 'compare') {
    const before = await loadRun(out, a.before ?? 'before'), after = await loadRun(out, a.after ?? 'after');
    const comparison = compareRuns(before.run, before.assessments, after.run, after.assessments);
    const style = await readFile(new URL('../assets/review.css', import.meta.url), 'utf8');
    await writeFile(join(out, 'iq-comparison.html'), renderComparisonHtml(comparison, { customer: config.customer, before: before.run, after: after.run, style, nameOf: await resourceNames(out) }), { mode: 0o600 });
    await writeFile(join(out, 'iq-comparison.md'), renderComparisonMarkdown(comparison, { before: before.run, after: after.run }), { mode: 0o600 });
    process.stdout.write(`Compared ${comparison.rows.length} questions: ${comparison.improved} improved, ${comparison.regressed} got worse, ${comparison.same} same verdict, ${comparison.not_assessed} not assessed. Report: ${join(out, 'iq-comparison.html')}. Offline.\n`);
    return comparison;
  }
  const plan = iqPlan(await readJson(join(a.workspace, 'iq-questions.json')), config);
  if (a.mode === 'plan') {
    await writeJson(join(out, 'iq-plan.json'), plan);
    process.stdout.write(`Planned ${plan.questions.length} IQ question(s). Plan SHA-256: ${hash(plan)}. Running them sends one IQ prompt per question, counts as IQ usage and stores a conversation per question for the API key's user. No requests made.\n`);
    return plan;
  }
  if (!a.label || !/^[\w-]{1,40}$/.test(a.label)) throw new Error('Provide --label before, after or another short name for this run.');
  if (hash(plan) !== a['plan-sha256']) throw new Error('iq-questions.json changed since the confirmed plan; run --mode plan again. Before and after runs must use the same questions.');
  if (!['embed', 'api'].includes(config.iq_authentication)) throw new Error('Set iq_authentication in config.json to "embed" (ask as one end user, with the LUZMO_EMBED_KEY/TOKEN pair in .env) or "api" (ask with the API credential and its permitted data access). Ask the user which one; there is no default.');
  let capture = null;
  try { capture = await readJson(join(out, 'capture.json')); } catch {}
  if (config.iq_authentication === 'embed' && !capture) throw new Error('Run collect.mjs first: the Embed token is checked against the captured datasets before any question is asked.');
  const timeoutSeconds = config.iq_timeout_seconds ?? 150;
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 10 || timeoutSeconds > 300) throw new Error('iq_timeout_seconds in config.json must be a whole number of seconds from 10 to 300 (default 150).');
  const signals = interruption({ notice: 'Cancelling the current IQ question and saving the answers so far. Press Ctrl+C again to exit immediately.' });
  try {
    const api = dependencies.api ?? await client(a.workspace, { allowPrompts: true, credentialMode: config.iq_authentication, timeoutMs: timeoutSeconds * 1000, signal: signals.signal });
    await mkdir(join(out, 'iq-runs'), { recursive: true, mode: 0o700 });
    const record = { schema_version: 1, label: a.label, host: api.host, executed_at: new Date().toISOString(), authentication: config.iq_authentication, timezone: config.timezone ?? 'UTC', ...(config.iq_end_user ? { end_user: config.iq_end_user } : {}), context: null, questions_sha256: plan.questions_sha256, capture_sha256: capture ? hash(capture) : null, complete: false, questions: plan.questions, results: [] };
    const recordFile = runPath(out, a.label), assessmentFile = runPath(out, `${a.label}.assessment`);
    // Reserve both artifacts exclusively before any network call or billable prompt.
    await createOnce(recordFile, `${JSON.stringify(record, null, 2)}\n`, `artifacts/iq-runs/${a.label}.json already exists and was kept; use another --label.`);
    const assessment = () => ({ schema_version: 1, run_sha256: hash(record), assessments: [] });
    try { await createOnce(assessmentFile, `${JSON.stringify(assessment(), null, 2)}\n`, `artifacts/iq-runs/${a.label}.assessment.json already exists and was kept; use another --label.`); }
    catch (error) { await unlink(recordFile); throw error; }
    const checkpoint = async outcome => {
      Object.assign(record, outcome);
      await writeJson(recordFile, record);
      await writeJson(assessmentFile, assessment());
    };
    try {
      if (api.iqContext) record.context = await api.iqContext();
      if (config.iq_authentication === 'embed') record.access = await assertEmbedAccess(api, config.datasets.map(d => d.id), capture, { allowEmpty: true });
      await checkpoint({ complete: false, results: [] });
      const outcome = await askAll(api, plan, { timezone: record.timezone, interrupted: () => signals.requested, checkpoint });
      await checkpoint(outcome);
      const failed = outcome.results.filter(r => r.status !== 'answered').length;
      process.stdout.write(`Asked ${outcome.results.length} of ${plan.questions.length} question(s); ${failed} without an answer.${outcome.stopped ? ` Stopped: ${outcome.stopped}` : ''} Saved artifacts/iq-runs/${a.label}.json; assess each answer in artifacts/iq-runs/${a.label}.assessment.json.\n`);
      if (!outcome.complete) process.exitCode = 1;
      return record;
    } catch (error) {
      await checkpoint({ complete: false, stopped: error.message });
      throw error;
    }
  } finally { signals.dispose(); }
}
if (isMain(import.meta.url)) run(() => main(args({ mode: { type: 'string' }, label: { type: 'string' }, 'plan-sha256': { type: 'string' }, before: { type: 'string' }, after: { type: 'string' } })));
