import { hash, uuid, label, escapeHtml as e, md, sanitize } from './common.mjs';
import { isLocale } from './limits.mjs';

export const QUESTION_SOURCES = ['user', 'research', 'dashboard', 'gap'];
export const VERDICTS = ['pass', 'partial', 'fail'];
const SOURCE_LABELS = { user: 'From the customer', research: 'From research', dashboard: 'Answered by a dashboard today', gap: 'Not answered by a dashboard today' };
const VERDICT_LABELS = { pass: 'Good answer', partial: 'Partly right', fail: 'Wrong or no answer', error: 'No answer or request failed', 'not-assessed': 'Not assessed yet' };
const RANK = { error: 0, fail: 0, partial: 1, pass: 2 };

export function validateQuestions(file, { languages, datasetIds = null, budget = 30 }) {
  if (file?.schema_version !== 1 || !Array.isArray(file.questions) || !file.questions.length) throw new Error('iq-questions.json needs schema_version 1 and a nonempty questions array.');
  if (file.questions.length > budget) throw new Error(`${file.questions.length} questions exceed iq_question_budget ${budget}; keep the set representative or raise the budget (maximum 100) with the user's agreement.`);
  const problems = [], ids = new Set();
  for (const [index, q] of file.questions.entries()) {
    const where = `questions[${index}]${typeof q?.id === 'string' ? ` (${q.id})` : ''}`;
    const unknown = Object.keys(q ?? {}).filter(k => !['id', 'question', 'language', 'source', 'rationale', 'expected', 'expected_resource_ids', 'dataset_ids', 'agent_id'].includes(k));
    if (unknown.length) problems.push(`${where}: unknown field(s) ${unknown.join(', ')}`);
    if (typeof q?.id !== 'string' || !/^[\w.-]{1,60}$/.test(q.id) || ids.has(q.id)) problems.push(`${where}: id must be a unique short slug`);
    ids.add(q?.id);
    if (typeof q?.question !== 'string' || !q.question.trim() || q.question.length > 1000) problems.push(`${where}: question must be 1-1,000 characters`);
    if (!isLocale(q?.language) || !languages.includes(q.language)) problems.push(`${where}: language must be one of config.languages (${languages.join(', ')})`);
    if (!QUESTION_SOURCES.includes(q?.source)) problems.push(`${where}: source must be ${QUESTION_SOURCES.join(', ')}`);
    if (typeof q?.rationale !== 'string' || !q.rationale.trim()) problems.push(`${where}: rationale must say why the question matters and where it came from`);
    if (q?.expected !== undefined && typeof q.expected !== 'string') problems.push(`${where}: expected must be text`);
    for (const key of ['expected_resource_ids', 'dataset_ids']) if (q?.[key] !== undefined && (!Array.isArray(q[key]) || q[key].some(id => !uuid(id)))) problems.push(`${where}: ${key} must be an array of UUIDs`);
    if (datasetIds && q?.dataset_ids?.some(id => !datasetIds.includes(id))) problems.push(`${where}: dataset_ids must be datasets selected in config.json`);
    if (q?.agent_id !== undefined && !uuid(q.agent_id)) problems.push(`${where}: agent_id must be a saved agent UUID`);
  }
  if (problems.length) throw new Error(`iq-questions.json is invalid:\n- ${problems.join('\n- ')}`);
  return file.questions;
}

export function iqPlan(file, config) {
  const questions = validateQuestions(file, { languages: config.languages, datasetIds: config.datasets.map(d => d.id), budget: Math.min(config.iq_question_budget ?? 30, 100) });
  return { schema_version: 1, mode: 'iq-plan', questions_sha256: hash(questions), questions };
}

const REFERENCE_KEYS = new Set(['set', 'datasetId', 'dataset_id', 'column', 'columnId', 'column_id', 'formula', 'formulaId', 'formula_id']);
export function referencedIds(value, found = new Set()) {
  if (Array.isArray(value)) for (const item of value) referencedIds(item, found);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) { if (REFERENCE_KEYS.has(key) && uuid(item)) found.add(item); else referencedIds(item, found); }
  return found;
}

export function promptRequest(q, timezone) {
  return { action: 'create', properties: { ...(q.agent_id ? { agent_id: q.agent_id } : { agent: 'auto' }), task: 'generate', response_mode: 'mixed', text_format: 'plain', locale_id: q.language, timezone_id: timezone, input: [{ type: 'text', text: q.question }, ...(q.dataset_ids ?? []).map(id => ({ type: 'dataset', id }))] } };
}

export function answerOf(response) {
  const message = response?.assistant_message;
  if (!message) return { status: 'no-answer', conversation_id: response?.conversation_id ?? null, answer_text: '', charts: [], referenced_resource_ids: [] };
  const assets = Array.isArray(message.aiMessageAssets) ? message.aiMessageAssets : [];
  const titleOf = value => { const title = value?.options?.title ?? value?.title; return title ? label(title) : ''; };
  return {
    status: 'answered',
    conversation_id: response.conversation_id ?? message.conversation_id ?? null,
    assistant_message_id: message.id ?? null,
    agent: message.agent ?? null,
    answer_text: typeof message.message === 'string' ? message.message : '',
    charts: assets.map(a => ({ type: a.type, ...(a.value?.type ? { chart_type: a.value.type } : {}), title: titleOf(a.value) })),
    referenced_resource_ids: [...referencedIds(assets.map(a => a.value))].sort(),
    assets: sanitize(assets), // Keep chart configuration for assessment, excluding inline data blobs.
  };
}

export async function askAll(api, plan, { timezone = 'UTC', interrupted = () => null, now = () => new Date(), checkpoint = async () => {} } = {}) {
  const results = [];
  for (const q of plan.questions) {
    if (interrupted()) return { complete: false, results };
    const started = now(), base = { id: q.id, question: q.question, language: q.language, source: q.source, asked_at: started.toISOString() };
    try {
      const answer = answerOf(await api.request('aiprompt', promptRequest(q, timezone)));
      if (answer.assistant_message_id) {
        try {
          const found = await api.request('aimessage', { action: 'get', find: { where: { id: answer.assistant_message_id }, attributes: ['id'], include: [{ model: 'Securable', attributes: ['id'] }], limit: 1 } });
          answer.used_dataset_ids = (found.rows?.[0]?.securables ?? []).map(d => d.id).filter(uuid);
        } catch (error) { if (error.refused) throw error; answer.used_dataset_ids = null; }
      }
      results.push({ ...base, ...answer, duration_ms: now() - started });
    } catch (error) {
      if (error.interrupted || interrupted()) return { complete: false, stopped: `Interrupted by ${interrupted() ?? 'a signal'}; the question in progress was cancelled and not recorded.`, results };
      results.push({ ...base, status: error.timeout ? 'timeout' : 'error', error: error.message, duration_ms: now() - started });
      if (error.refused) { const outcome = { complete: false, stopped: error.message, results }; await checkpoint(outcome); return outcome; }
      if (error.status === 403) { const outcome = { complete: false, stopped: 'IQ refused the request (HTTP 403). The key/token lacks Luzmo IQ access or use rights on the questioned datasets.', results }; await checkpoint(outcome); return outcome; }
    }
    await checkpoint({ complete: false, results });
  }
  return { complete: true, results };
}

export function verdictOf(result, assessment) {
  if (!result) return 'not-assessed';
  if (result.status !== 'answered') return 'error';
  return assessment?.verdict ?? 'not-assessed';
}

export function validateAssessment(run, assessment) {
  if (assessment?.schema_version !== 1 || assessment.run_sha256 !== hash(run) || !Array.isArray(assessment.assessments)) throw new Error(`The assessment of run "${run.label}" must have schema_version 1, the run's run_sha256 and an assessments array.`);
  const known = new Set(run.results.map(r => r.id)), seen = new Set();
  for (const a of assessment.assessments) {
    if (!known.has(a?.id) || seen.has(a.id)) throw new Error(`Assessment of run "${run.label}" names an unknown or repeated question id: ${a?.id}.`);
    seen.add(a.id);
    if (!VERDICTS.includes(a.verdict) || typeof a.note !== 'string' || !a.note.trim()) throw new Error(`Assessment ${a.id} needs a verdict (${VERDICTS.join(', ')}) and a note explaining it.`);
    if (a.selected_resource_ids !== undefined && (!Array.isArray(a.selected_resource_ids) || a.selected_resource_ids.some(id => !uuid(id)))) throw new Error(`Assessment ${a.id}: selected_resource_ids must be UUIDs.`);
  }
  return new Map(assessment.assessments.map(a => [a.id, a]));
}

const count = (values, key) => values.filter(v => v === key).length;
export function summarize(run, assessments) {
  const results = new Map(run.results.map(r => [r.id, r]));
  const ids = new Set([...(run.questions ?? []).map(q => q.id), ...results.keys()]);
  const verdicts = [...ids].map(id => verdictOf(results.get(id), assessments?.get(id)));
  return { questions: ids.size, pass: count(verdicts, 'pass'), partial: count(verdicts, 'partial'), fail: count(verdicts, 'fail'), error: count(verdicts, 'error'), not_assessed: count(verdicts, 'not-assessed') };
}

export function compareRuns(before, beforeAssessments, after, afterAssessments) {
  if (before.questions_sha256 !== after.questions_sha256) throw new Error('The runs used different question sets; compare only runs of the same iq-questions.json.');
  if (before.host !== after.host) throw new Error('The runs were made against different Luzmo hosts.');
  if ((before.authentication ?? null) !== (after.authentication ?? null)) throw new Error('One run asked as an end user (embed token) and the other with the API token; their answers are not comparable. Rerun with the same iq_authentication.');
  if ((before.timezone ?? 'UTC') !== (after.timezone ?? 'UTC') || (before.end_user ?? null) !== (after.end_user ?? null)) throw new Error('The runs used different timezones or end-user contexts.');
  if (!before.context?.fingerprint || !after.context?.fingerprint || before.context.fingerprint !== after.context.fingerprint) throw new Error('The credential-bound IQ data contexts differ or were not recorded. Capture a new baseline with the same credentials, authorization and end-user context; labels alone do not prove equivalent access.');
  const planned = new Map([...(before.questions ?? []), ...(after.questions ?? []), ...before.results, ...after.results].map(q => [q.id, q]));
  const rows = [...planned.values()].map(q => {
    const b = before.results.find(r => r.id === q.id), a = after.results.find(r => r.id === q.id);
    const from = verdictOf(b, beforeAssessments.get(q.id)), to = verdictOf(a, afterAssessments.get(q.id));
    const change = [from, to].includes('not-assessed') ? 'not-assessed' : RANK[to] > RANK[from] ? 'improved' : RANK[to] < RANK[from] ? 'regressed' : 'same';
    return { id: q.id, question: q.question, language: q.language, source: q.source, from, to, change, before: b, after: a, before_assessment: beforeAssessments.get(q.id) ?? null, after_assessment: afterAssessments.get(q.id) ?? null };
  });
  const changes = rows.map(r => r.change);
  return { before: summarize(before, beforeAssessments), after: summarize(after, afterAssessments), improved: count(changes, 'improved'), regressed: count(changes, 'regressed'), same: count(changes, 'same'), not_assessed: count(changes, 'not-assessed'), rows };
}

const names = (ids, nameOf) => ids?.length ? ids.map(id => nameOf.get(id) ?? id).join(', ') : '';
function answerBlock(heading, result, assessment, nameOf) {
  if (!result) return `<section><h4>${e(heading)}</h4><p class="muted">Not run.</p></section>`;
  const verdict = verdictOf(result, assessment), selected = assessment?.selected_resource_ids ?? [...new Set([...(result.used_dataset_ids ?? []), ...(result.referenced_resource_ids ?? [])])];
  return `<section class="answer verdict-${verdict}"><h4>${e(heading)} · ${e(VERDICT_LABELS[verdict])}</h4>${result.status === 'answered' ? `<p class="definition">${e(result.answer_text || 'No text answer; see the chart details.')}</p>` : `<p class="notice">${e(result.error ?? result.status)}</p>`}${result.charts?.length ? `<p class="muted">Charts: ${e(result.charts.map(c => c.title || c.chart_type || c.type).join(', '))}</p>` : ''}${selected?.length ? `<p class="muted">Used: ${e(names(selected, nameOf))}</p>` : ''}${assessment ? `<p><strong>Assessment:</strong> ${e(assessment.note)}</p>` : ''}</section>`;
}

function questionCard(q, index, nameOf, blocks) {
  return `<article class="resource"${q.anchor ? ` id="${e(q.anchor)}"` : ''}><div class="card-heading"><div><p class="eyebrow">${e(SOURCE_LABELS[q.source])} · ${e(q.language.toUpperCase())}</p><h3>${index + 1}. ${e(q.question)}</h3></div>${q.badge ?? ''}</div>${q.rationale ? `<p class="muted">${e(q.rationale)}</p>` : ''}${q.expected ? `<details><summary>What a good answer contains</summary><p>${e(q.expected)}</p>${q.expected_resource_ids?.length ? `<p class="muted">Expected to use: ${e(names(q.expected_resource_ids, nameOf))}</p>` : ''}</details>` : ''}<div class="pair">${blocks}</div></article>`;
}

// With targets (verdict → id of its first question), each non-zero number links to that question.
const stats = (s, targets = {}) => {
  const tile = (verdict, tone, value, text) => targets[verdict] && value ? `<a class="stat${tone}" href="#${e(targets[verdict])}"><strong>${value}</strong><span>${text}</span></a>` : `<p class="stat${tone}"><strong>${value}</strong><span>${text}</span></p>`;
  return `<div class="stats iq-stats">${tile('pass', ' tone-pass', s.pass, 'good answers')}${tile('partial', ' tone-partial', s.partial, 'partly right')}${tile('fail', ' tone-fail', s.fail + s.error, 'wrong, missing or failed')}${tile('not-assessed', '', s.not_assessed, 'not assessed')}</div>`;
};
const when = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value ?? '') : date.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }); };
const CAVEAT = 'IQ answers can vary between runs; a single run shows tendencies, not measured accuracy. Verify that effective data access, source data, tenant filters, parameters and connection overrides stayed equivalent. Credential refresh requires a new baseline.';
export const askedAs = run => run.authentication === 'embed' ? `Asked as one end user${run.end_user ? ` (${run.end_user})` : ''}, with that user's data access.` : run.authentication === 'api' ? 'Asked with the API token, with access determined by that credential; this may span tenants.' : '';

export function renderBaselineSection(run, assessments, nameOf = new Map()) {
  const questions = new Map((run.questions ?? []).map(q => [q.id, q])), targets = {};
  run.results.forEach((r, i) => { const verdict = verdictOf(r, assessments?.get(r.id)); targets[verdict === 'error' ? 'fail' : verdict] ??= `iq-question-${i + 1}`; });
  return `<section class="iq-today" id="iq-answers"><h2 class="section-title">How IQ answers today · ${run.results.length} questions</h2><p class="muted">Asked on ${e(when(run.executed_at))} before any change. ${e(askedAs(run))} ${e(CAVEAT)}</p>${stats(summarize(run, assessments), targets)}${run.results.map((r, i) => questionCard({ ...questions.get(r.id), ...r, anchor: `iq-question-${i + 1}` }, i, nameOf, answerBlock('Current answer', r, assessments?.get(r.id), nameOf))).join('')}</section>`;
}

const CHANGE_LABELS = { improved: 'Improved', regressed: 'Got worse', same: 'Same verdict', 'not-assessed': 'Not assessed' };
export function renderComparisonHtml(comparison, { customer = '', before, after, style, nameOf = new Map() }) {
  const questions = new Map((before.questions ?? []).map(q => [q.id, q]));
  const cards = comparison.rows.map((r, i) => questionCard({ ...questions.get(r.id), ...r, badge: `<span class="badge ${r.change === 'improved' ? 'keep' : r.change === 'regressed' ? 'hold' : ''}">${e(CHANGE_LABELS[r.change])}</span>` }, i, nameOf, answerBlock('Before', r.before, r.before_assessment, nameOf) + answerBlock('After', r.after, r.after_assessment, nameOf))).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>IQ answers before and after</title><style>${style}</style></head><body><main>
<header><p class="eyebrow">Luzmo semantic layer · private report</p><h1>IQ answers before and after</h1><p class="lead">${e(customer ? `${customer}: ` : '')}the same ${comparison.rows.length} questions, asked before and after the approved metadata changes.</p><p class="muted">Before: ${e(when(before.executed_at))} · After: ${e(when(after.executed_at))}. ${e(askedAs(after))} ${e(CAVEAT)}</p></header>
<section class="overview"><h2>${comparison.improved} improved · ${comparison.regressed} got worse · ${comparison.same} same verdict</h2><div class="summary-grid"><section><h3>Before</h3>${stats(comparison.before)}</section><section><h3>After</h3>${stats(comparison.after)}</section></div></section>
${cards}
<footer><details><summary>Report version</summary><code>${e(hash(comparison))}</code></details></footer></main></body></html>`;
}

export function renderComparisonMarkdown(comparison, { before, after }) {
  return ['# IQ answers before and after', '', `Before: ${before.executed_at}. After: ${after.executed_at}. ${askedAs(after)} ${CAVEAT}`, '', `Improved ${comparison.improved}, got worse ${comparison.regressed}, same verdict ${comparison.same}, not assessed ${comparison.not_assessed}.`, '', '| # | Question | Language | Before | After | Change |', '| --- | --- | --- | --- | --- | --- |', ...comparison.rows.map((r, i) => `| ${i + 1} | ${md(r.question)} | ${r.language} | ${r.from} | ${r.to} | ${r.change} |`), '', ...comparison.rows.flatMap((r, i) => [`## ${i + 1}. ${r.question}`, '', `Before (${r.from}): ${r.before?.answer_text ?? r.before?.error ?? ''}`, '', r.before_assessment ? `Assessment: ${r.before_assessment.note}` : '', '', `After (${r.to}): ${r.after?.answer_text ?? r.after?.error ?? ''}`, '', r.after_assessment ? `Assessment: ${r.after_assessment.note}` : '', ''])].join('\n');
}

