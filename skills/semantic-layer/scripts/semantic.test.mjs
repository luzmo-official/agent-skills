import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash, writeJson } from './common.mjs';
import { seedProposal, buildPreview, renderReview, reviseType } from './review-lib.mjs';
import { baselineLines } from './review-evidence.mjs';
import { expressionFacts, statusPhrases, usageReferences, provenancePhrases, maintenancePhrases, contextProblems, redirectTargets, excludedKeep, deferredHold, simpleColumn } from './semantic-checks.mjs';
import { buildBaseline, regressionCandidates, reviewRegressions, precisionTokens } from './baseline-lib.mjs';
import { syntheticCapture } from './synthetic.mjs';
import { main as demoMain } from './demo.mjs';
import { main as reviewMain } from './review.mjs';
import { main as baselineMain } from './baseline.mjs';

// Synthetic fixture: the toolkit's fictional order lines plus a derived column and two formulas with known expression behavior.
const clone = value => structuredClone(value);
const ds = syntheticCapture.selection[0], ref = id => `{${ds}:${id}}`;
const ids = { date: '33333333-3333-4333-8333-333333333333', line: '55555555-5555-4555-8555-555555555555', status: '66666666-6666-4666-8666-666666666666', age: 'abababab-abab-4bab-8bab-abababababab', completed: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd', mean: 'efefefef-efef-4fef-8fef-efefefefefef' };
function capture() {
  const c = clone(syntheticCapture);
  c.resources.push(
    { id: ids.age, name: { en: 'Order age (days)' }, kind: 'column', resource: 'column', dataset_id: ds, type: 'numeric', description: { en: 'Days since the order was created.' }, ai_context: null, expression: `DATE_DIFF('day', ${ref(ids.date)}, NOW())` },
    { id: ids.completed, name: { en: 'Completed orders' }, kind: 'formula', resource: 'formula', dataset_id: ds, description: { en: 'Number of completed orders.' }, ai_context: null, expression: `COUNT(IF(${ref(ids.status)} = 'completed, final', 1, 0))` },
    { id: ids.mean, name: { en: 'Mean order age' }, kind: 'formula', resource: 'formula', dataset_id: ds, description: { en: 'Mean age of orders.' }, ai_context: null, expression: `SUM(${ref(ids.age)}) / COUNTD(${ref(ids.line)})` });
  return c;
}
function proposalFor(c, verdict = 'ready-with-corrections') {
  const p = seedProposal(c, ['en']);
  Object.assign(p, { verdict, business_brief: 'Synthetic order-line analysis.' });
  for (const r of p.resources) r.assessment = 'Reviewed against the synthetic fixture.';
  p.calculation_changes.push({ title: 'Repair completed-order count', classification: 'defect', status: 'not-approved', resource_ids: [ids.completed], reason: 'COUNT(IF(…, 1, 0)) counts every row.', intended_question: 'How many orders were completed?', result_grain: 'One count per group', population: 'Orders with status completed', expression_candidate: null, dependencies: [ids.status], boundary_cases: ['No completed orders'], validation_needed: 'Owner confirms order grain.' });
  return p;
}
const revise = (p, id, description, ai_context = null) => Object.assign(p.resources.find(r => r.id === id), { disposition: 'revise', evidence: [{ summary: 'Expression read directly.', type: 'expression' }], proposed: { description: { en: description }, ai_context } });

test('expression facts trace dependencies and flag COUNT/COUNTD of IF with a non-null else branch', () => {
  const f = expressionFacts(capture().resources.find(r => r.id === ids.completed).expression);
  assert.deepEqual(f.dependencies, [ids.status]); assert.deepEqual(f.aggregations, ['COUNT']); assert.equal(f.pitfalls.length, 1); assert.equal(f.divides, false);
  for (const ok of [`COUNT(IF(${ref(ids.status)} = 'a', 1))`, `COUNT(IF(${ref(ids.status)} = 'a', 1, NULL))`, `COUNTD(${ref(ids.line)})`]) assert.equal(expressionFacts(ok).pitfalls.length, 0, ok);
  assert.equal(expressionFacts(`COUNTD(IF(${ref(ids.status)} = 'x', ${ref(ids.line)}, 0))`).pitfalls.length, 1);
  assert.equal(expressionFacts("IF('a/b' = 'x', 1, 0)").divides, false);
  assert.equal(expressionFacts(capture().resources.find(r => r.id === ids.age).expression).relative_to_now, true);
  assert.equal(expressionFacts(null), null);
});

test('an unaccounted expression pitfall is surfaced; recording it as a calculation follow-up settles it', () => {
  const c = capture(), p = proposalFor(c);
  assert(!buildPreview(p, c).warnings.some(w => w.includes('counts every row')));
  p.calculation_changes = [];
  assert(buildPreview(p, c).warnings.some(w => w.includes(ids.completed) && w.includes('counts every row')));
});

test('verification-status wording is flagged in every locale and context without flagging business status labels', () => {
  assert.equal(statusPhrases({ description: { en: 'Order count. Unit not verified.' }, ai_context: null }).length, 1);
  assert.equal(statusPhrases({ description: { en: 'Mean order value.', 'en-GB': 'Mean order value, to be confirmed.' }, ai_context: 'Must be validated by finance.' }).length, 2);
  assert.equal(statusPhrases({ description: { en: 'Number of confirmed bookings; unconfirmed bookings are excluded.' }, ai_context: null }).length, 0);
  const c = capture(), p = proposalFor(c);
  revise(p, ids.line, 'Order-line identifier, not verified.');
  assert(buildPreview(p, c).warnings.some(w => w.includes('reports verification status')));
});

test('dashboard and chart usage references are detected in every locale without flagging business vocabulary', () => {
  for (const [text, field] of [
    [{ description: { en: 'Number of orders.', 'en-GB': 'Number of orders, as on the sales dashboard.' }, ai_context: null }, 'description.en-GB'],
    [{ description: { en: 'Number of orders.' }, ai_context: 'Dashboards use status = completed for order counts.' }, 'ai_context'],
    [{ description: { en: 'Share of late tasks, as shown in charts.' }, ai_context: null }, 'description.en'],
    [{ description: { en: 'Task duration.' }, ai_context: 'The charts show tasks taking more than 5 days.' }, 'ai_context'],
  ]) assert.deepEqual(usageReferences(text).map(p => p.split(':')[0]), [field], JSON.stringify(text));
  for (const ok of ['Number of orders shown on the invoice.', 'Chart of accounts code for the ledger entry.', 'Board of directors approval date.'])
    assert.deepEqual(usageReferences({ description: { en: ok }, ai_context: null }), [], ok);
  assert.deepEqual(usageReferences({ description: { en: 'Number of dashboards viewed per user.' }, ai_context: null }, { dashboardSubject: true }), []);
  assert.equal(usageReferences({ description: { en: 'Dashboards viewed, as shown in charts.' }, ai_context: null }, { dashboardSubject: true }).length, 1);
  assert.equal(provenancePhrases({ description: { en: 'Mean duration in hours.' }, ai_context: 'According to the owner, exclude test accounts.' }).length, 1);
  assert.equal(provenancePhrases({ description: { en: 'Mean duration, based on the profile.' }, ai_context: null }).length, 1);
  assert.equal(provenancePhrases({ description: { en: 'Mean duration in hours; one row per task.' }, ai_context: 'Fits questions about overall task workload, where long tasks should weigh in.' }).length, 0);
});

test('a changed proposal that cites dashboards is rejected; retained customer text and declared dashboard subjects only warn', () => {
  const c = capture(), p = proposalFor(c);
  revise(p, ids.completed, 'Number of completed orders, like the dashboards.', 'Dashboards count distinct orders here.');
  assert.throws(() => buildPreview(p, c), error => error.report?.problems?.length === 2 && /cite dashboards or charts/.test(error.message));
  revise(p, ids.completed, 'Number of completed orders.', null);
  assert.doesNotThrow(() => buildPreview(p, c));
  const legacy = capture(); legacy.resources.find(r => r.id === ids.line).description = { en: 'Order line, as used in the sales dashboard.' };
  const kept = proposalFor(legacy);
  assert(buildPreview(kept, legacy).warnings.some(w => w.includes(ids.line) && w.includes('mentions dashboards')));
  const subject = proposalFor(c);
  revise(subject, ids.line, 'Identifier of one dashboard view.');
  assert.throws(() => buildPreview(subject, c), /cite dashboards/);
  subject.resources.find(r => r.id === ids.line).dashboard_subject = 'The dataset records product-usage events, so dashboards are the measured subject.';
  assert.doesNotThrow(() => buildPreview(subject, c));
  subject.resources.find(r => r.id === ids.line).dashboard_subject = ' ';
  assert.throws(() => buildPreview(subject, c), /dashboard_subject must explain/);
});

test('AI context that repeats the description, reproduces formula syntax or adds generic warnings is flagged', () => {
  const description = { en: 'Mean order age in days for open orders.' };
  assert.deepEqual(contextProblems({ description, ai_context: null }), []);
  assert.deepEqual(contextProblems({ description, ai_context: 'Fits questions about the overall backlog burden of open orders, where stale orders should weigh in.' }), []);
  assert.match(contextProblems({ description, ai_context: 'Mean age of open orders, in days.' }).join(), /repeats description\.en/);
  assert.match(contextProblems({ description, ai_context: `Computed as SUM(${ref(ids.age)}) / COUNTD(${ref(ids.line)}).` }).join(), /formula syntax/);
  assert.match(contextProblems({ description, ai_context: 'Use with caution when comparing periods.' }).join(), /generic warning/);
  for (const label of ['Vocabulary: backlog, stale orders.', 'Fits backlog questions. Synonyms: stale orders.', 'Keywords: backlog.']) assert.match(contextProblems({ description, ai_context: label }).join(), /prefix them “Aliases:”/, label);
  for (const ok of ['Aliases: backlog, stale orders / achterstand.', 'Fits backlog questions. Aliases: stale orders.', 'Count terms per contract.']) assert.doesNotMatch(contextProblems({ description, ai_context: ok }).join(), /Aliases:”/, ok);
  const c = capture(), p = proposalFor(c);
  revise(p, ids.mean, 'Mean order age in days for open orders.', 'Mean order age in days for open orders. Interpret carefully.');
  const warnings = buildPreview(p, c).warnings.filter(w => w.includes(ids.mean) && w.includes('ai_context'));
  assert.equal(warnings.length, 2);
});

test('maintenance and implementation narration is flagged without flagging business vocabulary', () => {
  for (const [text, field] of [
    [{ description: { en: 'Order value excluding tax. Duplicate of Order value v2.' }, ai_context: null }, 'description.en'],
    [{ description: { en: 'Time from task creation to completion.' }, ai_context: 'Same calculation as Total task time; prefer the other.' }, 'ai_context'],
    [{ description: { en: 'Calculated column: order age in days.' }, ai_context: null }, 'description.en'],
    [{ description: { en: 'Order age in days.', 'en-GB': 'Derived field: order age in days.' }, ai_context: null }, 'description.en-GB'],
    [{ description: { en: 'Mean order age.' }, ai_context: 'The expression divides summed age by distinct lines.' }, 'ai_context'],
    [{ description: { en: 'Legacy field kept for compatibility.' }, ai_context: null }, 'description.en'],
  ]) assert.deepEqual([...new Set(maintenancePhrases(text).map(p => p.split(':')[0]))], [field], JSON.stringify(text));
  for (const ok of ['Number of duplicate invoices.', 'Flag set when a duplicate payment is detected.', 'Date the expression of interest was received.', 'Customers on the legacy pricing plan.', 'Includes working time and waiting time before task completion.'])
    assert.deepEqual(maintenancePhrases({ description: { en: ok }, ai_context: null }), [], ok);
  assert.deepEqual(maintenancePhrases({ description: { en: 'Time from task creation to completion, in hours. Includes waiting time before work begins.' }, ai_context: 'Fits questions about total elapsed time from task creation to completion.' }), []);
});

test('identical expressions need one duplicate follow-up; identity alone names no canonical resource', () => {
  const c = capture(), twin = 'dededede-dede-4ede-8ede-dededededede', other = 'fafafafa-fafa-4afa-8afa-fafafafafafa';
  const meanExpr = c.resources.find(r => r.id === ids.mean).expression;
  c.resources.push(
    { id: twin, name: { en: 'Mean order age v2' }, kind: 'formula', resource: 'formula', dataset_id: ds, description: { en: 'Mean age of orders.' }, ai_context: null, expression: `  ${meanExpr.replace('/', ' / ')}` },
    { id: other, name: { en: 'Median order age' }, kind: 'formula', resource: 'formula', dataset_id: ds, description: { en: 'Median age of orders.' }, ai_context: null, expression: `MEDIAN(${ref(ids.age)})` });
  const p = proposalFor(c), duplicateWarnings = () => buildPreview(p, c).warnings.filter(w => w.includes('identical expressions'));
  assert.equal(duplicateWarnings().length, 1);
  assert(duplicateWarnings()[0].includes(ids.mean) && duplicateWarnings()[0].includes(twin) && !duplicateWarnings()[0].includes(other));
  assert.equal(buildPreview(p, c).summary.readiness.calculations.duplicate, undefined, 'no duplicate count without duplicate follow-ups');
  const entry = { title: 'Two mean order age formulas', classification: 'duplicate', status: 'not-approved', resource_ids: [ids.mean], reason: 'Identical expressions.', intended_question: 'What is the mean order age?', result_grain: 'One mean per group', population: 'Order lines', expression_candidate: null, dependencies: [ids.age, ids.line], boundary_cases: [], validation_needed: 'Owner decides whether to keep both and which one reports should use.' };
  p.calculation_changes.push(entry);
  assert.equal(duplicateWarnings().length, 1, 'a follow-up covering only part of the group does not settle it');
  entry.resource_ids = [ids.mean, twin];
  assert.equal(duplicateWarnings().length, 0);
  assert.equal(buildPreview(p, c).summary.readiness.calculations.duplicate, 1);
  revise(p, twin, 'Mean age of orders in days. Same calculation as Mean order age.');
  assert(buildPreview(p, c).warnings.some(w => w.includes(twin) && w.includes('catalogue maintenance')));
  revise(p, twin, 'Mean age of orders in days, per order line.', 'Duplicate of Mean order age; prefer this one.');
  assert(buildPreview(p, c).warnings.some(w => w.includes(twin) && w.includes('ai_context') && w.includes('catalogue maintenance')), 'narration moved into context is still flagged');
  revise(p, twin, 'Mean age of orders in days, per order line.', null);
  assert(!buildPreview(p, c).warnings.some(w => w.includes(twin)));
  entry.classification = 'canonical';
  assert.throws(() => buildPreview(p, c), /Invalid calculation candidate/);
});

test('retained duplicate narration warns; distinct measures with self-contained scope do not', () => {
  const c = capture(), medianAge = 'dededede-dede-4ede-8ede-dededededede';
  c.resources.find(r => r.id === ids.mean).description = { en: 'Mean age of orders. Duplicate of Mean order age v2.' };
  c.resources.push({ id: medianAge, name: { en: 'Median order age' }, kind: 'formula', resource: 'formula', dataset_id: ds, description: { en: 'Median age of orders.' }, ai_context: null, expression: `MEDIAN(${ref(ids.age)})` });
  const p = proposalFor(c);
  assert(buildPreview(p, c).warnings.some(w => w.includes(ids.mean) && w.includes('existing') && w.includes('catalogue maintenance')));
  const routed = proposalFor(capture());
  revise(routed, ids.mean, 'Mean age of open orders, in days. Stale orders raise the mean.', 'Fits questions about the overall backlog burden of open orders over time.');
  const warnings = buildPreview(routed, capture()).warnings.filter(w => w.includes(ids.mean));
  assert.deepEqual(warnings, []);
});

test('AI context redirects, negative-only scope and validation claims are flagged; query rules naming columns are not', () => {
  const description = { en: 'Time from task creation to completion, in hours. Includes waiting time before work begins.' };
  const flagged = (ai_context, pattern) => assert.match(contextProblems({ description, ai_context }).join(' | '), pattern, ai_context);
  for (const redirect of [
    'For time spent working, select Task duration instead.',
    'For a typical duration, use the median variant.',
    'Another measure covers task duration; prefer it for work-time questions.',
    'Use the dedicated field for active work time.',
    'The other formula is better for typical values.',
    'For work-time questions, rather than this measure, pick a different metric.',
    'For current subscriptions, use “Active subscriptions”.',
  ]) flagged(redirect, /may redirect or rank/);
  flagged('Not suitable for work-time questions.', /only negatively/);
  flagged('Validated KPI; the reliable measure for lead time.', /claims validation/);
  flagged('This metric is verified and accurate.', /claims validation/);
  for (const ok of [
    'Fits questions about elapsed time from task creation to completion, by project.',
    'Fits questions about verified customer accounts over time.',
    'Fits comparisons of task completion time across projects; aliases: lead time, cycle time.',
    'To count completed orders, keep status = completed and count distinct order_id.',
    'For net sales, keep refund lines rather than filtering to positive amounts.',
    'Do not substitute planned_end_at for a missing completed_at.',
    'For period questions, filter the cohort on completion_date.',
    'For a typical duration, use the median aggregation.',
  ]) assert.deepEqual(contextProblems({ description, ai_context: ok }), [], ok);
});

test('context telling IQ to answer with another resource is flagged by name; filters, roles and guards naming columns are not', () => {
  const others = [
    { id: 'a', name: { en: 'Task duration', 'en-GB': 'Working time' } }, { id: 'b', name: { en: 'Status' } }, { id: 'c', name: { en: 'order_date' } },
    { id: 'd', name: { en: 'order_value' } }, { id: 'e', name: { en: 'Active subscriptions' } }, { id: 'f', name: { en: 'status_code' } },
    { id: 'g', name: { en: 'planned_end_at' } }, { id: 'h', name: { en: 'order_status' } }];
  for (const [context, ids] of [
    ['Mean; for a median, use order_value with the Median aggregation.', ['d']],
    ['For current stock, use Active subscriptions.', ['e']],
    ['Prefer Task duration for work-time questions.', ['a']],
    ['Status: use order_status.', ['h']],
    ['For effort questions, report Working time instead.', ['a']],
  ]) assert.deepEqual(redirectTargets(context, others).map(t => t.match(/\((\w)\)$/)[1]), ids, context);
  for (const context of [
    'To count completed orders, use status = completed.',
    'Use order_date for the cohort.',
    'Do not substitute planned_end_at for a missing completed_at.',
    'Fits questions by status and project.',
    'Fits elapsed task time from creation to completion.',
  ]) assert.deepEqual(redirectTargets(context, others), [], context);
  assert.deepEqual(redirectTargets(null, others), []);
});

test('review warns about named redirects and context on unreliable metrics; same-name resources and query rules pass', () => {
  const twin = capture(), sharedName = twin.resources.find(r => r.id === ids.age);
  twin.resources.push({ ...structuredClone(sharedName), id: '12121212-1212-4212-8212-121212121212' });
  const tp = proposalFor(twin);
  revise(tp, ids.age, 'Days since the order was created.', 'For backlog age, use Order age (days) per open order.');
  assert(!buildPreview(tp, twin).warnings.some(w => w.includes('answer with another resource')), 'a resource sharing its own name is not a redirect');
  const c = capture(), p = proposalFor(c);
  revise(p, ids.mean, 'Mean order age in days for open orders.', 'Fits backlog questions; for per-order values, use Order age (days).');
  assert(buildPreview(p, c).warnings.some(w => w.includes(ids.mean) && w.includes('answer with another resource') && w.includes(ids.age)));
  p.resources.find(r => r.id === ids.mean).evidence = [{ type: 'convention', summary: 'Reporting policy distinguishes individual order ages from an aggregate backlog measure.' }];
  const conventional = buildPreview(p, c);
  assert(conventional.warnings.some(w => w.includes(ids.mean) && w.includes('documented selection convention')));
  assert(conventional.changes.some(r => r.id === ids.mean), 'a selection pointer remains reviewable with evidence; its warning does not block the metadata edit');
  revise(p, ids.mean, 'Mean order age in days for open orders.', 'Fits backlog-burden questions. For stale orders only, keep Order age (days) > 30.');
  assert(!buildPreview(p, c).warnings.some(w => w.includes(ids.mean) && w.includes('ai_context')), 'a filter on a related column is a query rule');
  revise(p, ids.completed, 'Number of order lines with any status; every row is counted.', 'Fits completion-volume questions per product.');
  assert(buildPreview(p, c).warnings.some(w => w.includes(ids.completed) && w.includes('open defect or unvalidated')), 'no invented use case for a defective metric');
  revise(p, ids.completed, 'Number of order lines with any status; every row is counted.', null);
  assert(!buildPreview(p, c).warnings.some(w => w.includes(ids.completed) && w.includes('ai_context')));
});

test('evidence types are explicit; profiles carry their scope and usage alone does not establish meaning', () => {
  const c = capture(), p = proposalFor(c), r = revise(p, ids.line, 'Identifier of one order line.');
  r.evidence = [{ summary: 'Median 3 lines per order.', type: 'profile' }];
  assert.throws(() => buildPreview(p, c), /Profile evidence needs scope/);
  r.evidence = [{ summary: 'Shown as order lines on a dashboard.', type: 'dashboard' }];
  assert(buildPreview(p, c).warnings.some(w => w.includes('only on dashboard usage or inference')));
  r.evidence = [{ summary: 'x', type: 'hunch' }];
  assert.throws(() => buildPreview(p, c), /Unknown evidence type/);
});

test('planned and executed evaluations stay distinct and answer readiness is reported separately', () => {
  const c = capture(), p = proposalFor(c);
  const planned = { question: 'How many orders were completed last week?', language: 'en', category: 'normal', expected_resource_ids: [ids.completed], expected_interpretation: 'Distinct completed orders by order_date.', expected_filters: ['order_date in last week'], expected_unit: 'orders', expected_population: 'Orders with status completed', must_not: ['Count order lines'], status: 'not-run', observed: '' };
  p.evaluation_cases = [planned];
  let preview = buildPreview(p, c);
  assert.deepEqual(preview.summary.readiness.answers, { planned: 1, executed: 0, pass: 0, fail: 0, partial: 0, status: 'not-tested' });
  assert(preview.warnings.some(w => w.includes('empty-population')));
  assert.equal(preview.summary.readiness.calculations.defect, 1);
  for (const mutate of [x => { x.observed = 'Answered 12.'; }, x => { x.status = 'pass'; }, x => { x.expected_resource_ids = ['99999999-0000-4000-8000-000000000000']; }, x => { x.category = 'misc'; }, x => { x.language = 'xx'; }]) {
    const q = clone(p); mutate(q.evaluation_cases[0]); assert.throws(() => buildPreview(q, c));
  }
  p.evaluation_cases.push({ ...planned, question: 'And the week before?', status: 'fail', observed: 'Counted order lines (31).', executed_at: '2026-10-28T10:00:00Z' });
  preview = buildPreview(p, c);
  assert.equal(preview.summary.readiness.answers.status, 'partially-tested');
  const { markdown } = renderReview(p, preview);
  assert(markdown.includes('Answer quality: partially-tested; 1 of 2'));
  assert(markdown.includes('No baseline comparison was run'));
});

test('baseline matches by ID, separates shared from newly covered resources and propagates expression changes', () => {
  const before = capture(), now = capture();
  before.resources = before.resources.filter(r => r.id !== ids.mean);
  before.resources.find(r => r.id === ids.line).name = { en: 'line_key' };
  now.resources.find(r => r.id === ids.age).expression = `DATE_DIFF('hour', ${ref(ids.date)}, NOW())`;
  const baseline = buildBaseline(now, [{ path: 'old-capture.json', value: before }]);
  const get = id => baseline.resources.find(r => r.id === id);
  assert.equal(get(ids.mean).status, 'new'); assert.equal(get(ids.line).renamed, true); assert.equal(get(ids.age).expression_changed, true);
  assert.equal(baseline.summary.new, 1); assert.equal(baseline.limitation, null);
  const later = buildBaseline(now, [{ path: 'a.json', value: before }, { path: 'b.json', value: capture() }]);
  assert.deepEqual(later.resources.find(r => r.id === ids.mean).upstream_expression_changed, [ids.age]);
  assert.match(buildBaseline(now, []).limitation, /does not establish continuity/);
});

test('baseline distinguishes captured, proposed, approved and published states', () => {
  const c = capture(), old = proposalFor(c);
  revise(old, ids.line, 'Identifier of one order line.'); revise(old, ids.status, 'Recorded order status, such as completed or cancelled.');
  const preview = buildPreview(old, c), approval = { schema_version: 1, preview_sha256: hash(preview), reviewer: 'Synthetic reviewer', reviewed_at: '2026-10-01T00:00:00Z', approved_ids: [ids.line] };
  const applied = { schema_version: 1, applied_at: '2026-10-02T00:00:00Z', resources: [{ id: ids.line, kind: 'column', name: { en: 'line_id' }, before: old.resources.find(r => r.id === ids.line).original, after: old.resources.find(r => r.id === ids.line).proposed }] };
  const live = capture(); live.resources.find(r => r.id === ids.line).description = { en: 'Identifier of one order line.' };
  assert.throws(() => buildBaseline(live, [{ path: 'approval.json', value: approval }]), /update-preview/);
  const b = buildBaseline(live, [{ path: 'proposal.json', value: old }, { path: 'update-preview.json', value: preview }, { path: 'approval.json', value: approval }, { path: 'applied.json', value: applied }]);
  const get = id => b.resources.find(r => r.id === id);
  assert.equal(get(ids.line).state, 'published'); assert.equal(get(ids.line).approved.source, 2);
  assert.equal(get(ids.status).state, 'proposed-not-published');
  live.resources.find(r => r.id === ids.date).description = { en: 'Edited live by someone else.' };
  assert.equal(buildBaseline(live, [{ path: 'proposal.json', value: old }]).resources.find(r => r.id === ids.date).state, 'live-changed-since-proposal');
});

test('regression review catches reintroduced source errors, lost precision, withdrawn context and dropped follow-ups', () => {
  const c = capture(), old = proposalFor(c);
  revise(old, ids.completed, 'Number of distinct orders with at least 3 lines, excluding cancelled orders.', 'Filter on order_date.');
  revise(old, ids.age, 'Days from order creation to now; describes current age, not historical age.');
  old.evaluation_cases = [{ question: 'How old are open orders?', language: 'en', category: 'current-vs-historical', expected_resource_ids: [ids.age], expected_interpretation: 'Current age only.', must_not: ['Reconstruct last month'], status: 'not-run', observed: '' }];
  const baseline = buildBaseline(c, [{ path: 'previous-proposal.json', value: old }]);
  const now = proposalFor(c);
  now.calculation_changes = [];
  revise(now, ids.completed, 'Number of orders with many lines.');
  revise(now, ids.age, 'Days since the order was created.');
  const checks = regressionCandidates(now, baseline).map(x => x.key);
  for (const key of [`reintroduced-source:${ids.age}`, `precision-loss:${ids.completed}`, `context-removed:${ids.completed}`, 'evaluation-dropped:', 'follow-up-dropped:']) assert(checks.some(k => k.startsWith(key)), key);
  assert(!checks.includes(`rewritten:${ids.completed}`));
  const lost = regressionCandidates(now, baseline).find(x => x.check === 'precision-loss').detail;
  for (const token of ['3', 'at least', 'distinct', 'excluding']) assert(lost.includes(token), token);
  assert(regressionCandidates(now, baseline).find(x => x.check === 'context-removed').detail.includes('withdraws a draft addition'));
  assert.throws(() => reviewRegressions(now, baseline, c), error => error.report?.unclassified?.length === checks.length);
  now.verdict = 'not-ready';
  assert.equal(reviewRegressions(now, baseline, c).candidates.every(x => x.classification === null), true);
  now.verdict = 'ready-with-corrections';
  now.baseline_review = checks.map(key => ({ key, classification: 'justified', note: 'Synthetic.' }));
  now.baseline_review[0].classification = 'regression';
  assert.throws(() => reviewRegressions(now, baseline, c), /fix every regression/);
  now.baseline_review[0].classification = 'unresolved';
  now.resources.find(r => r.id === ids.completed).proposed.ai_context = 'Filter on order_date.';
  now.baseline_review = now.baseline_review.map(v => v.key.startsWith('precision-loss') ? { ...v, classification: 'unresolved' } : v);
  assert.throws(() => reviewRegressions(now, baseline, c), /block this verdict/);
  now.resources.find(r => r.id === ids.completed).disposition = 'hold';
  const result = reviewRegressions(now, baseline, c);
  assert.equal(result.candidates.filter(x => !x.classification).length, 0);
  now.baseline_review.push({ key: 'rewritten:stale', classification: 'equivalent', note: 'Old key.' });
  assert(reviewRegressions(now, baseline, c).warnings.some(w => w.includes('rewritten:stale')));
  assert.throws(() => reviewRegressions(now, { ...baseline, capture_sha256: 'other' }, c), /different capture/);
});

test('an equivalent rewrite keeps its boundary terms and is listed only as a rewrite', () => {
  assert.deepEqual([...precisionTokens({ description: { en: 'At least 1 200 rows.' }, ai_context: null })].sort(), ['1200', 'at least', 'rows'].sort());
  const c = capture(), old = proposalFor(c);
  revise(old, ids.completed, 'Number of distinct orders with at least 3 lines.');
  const now = proposalFor(c);
  revise(now, ids.completed, 'Number of distinct orders that have at least 3 lines.');
  assert.deepEqual(regressionCandidates(now, buildBaseline(c, [{ path: 'p.json', value: old }])).map(x => x.check), ['rewritten']);
});

test('older proposals contribute follow-ups only for resources no newer proposal covered', () => {
  const c = capture(), older = proposalFor(c), newer = proposalFor(c);
  older.calculation_changes.push({ ...older.calculation_changes[0], title: 'Old mean-age concern', resource_ids: [ids.mean] });
  newer.resources = newer.resources.filter(r => r.id !== ids.mean);
  newer.calculation_changes = [];
  const titles = buildBaseline(c, [{ path: 'older.json', value: older }, { path: 'newer.json', value: newer }]).previous.calculation_changes.map(x => x.title);
  assert.deepEqual(titles, ['Old mean-age concern']);
});

test('baseline and review CLIs produce a regression check and an applyable preview', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'luzmo-baseline-test-')), path = join(parent, 'demo');
  await demoMain({ workspace: path });
  const previous = join(parent, 'previous-proposal.json');
  await writeFile(previous, await readFile(join(path, 'artifacts/proposal.json'), 'utf8'));
  await baselineMain({ workspace: path, previous: [previous] });
  await reviewMain({ workspace: path });
  const regression = JSON.parse(await readFile(join(path, 'artifacts/regression-check.json'), 'utf8'));
  assert.equal(regression.summary.shared, 6); assert.deepEqual(regression.candidates, []);
  assert((await readFile(join(path, 'artifacts/review.md'), 'utf8')).includes('Compared by resource ID with proposed previous-proposal.json'));
  const proposal = JSON.parse(await readFile(join(path, 'artifacts/proposal.json'), 'utf8'));
  const capture = JSON.parse(await readFile(join(path, 'artifacts/capture.json'), 'utf8'));
  assert.deepEqual(JSON.parse(await readFile(join(path, 'artifacts/update-preview.json'), 'utf8')), buildPreview(proposal, capture, regression.summary.coverage));
  await writeJson(join(path, 'artifacts/baseline.json'), { ...regression, capture_sha256: 'stale' });
  await assert.rejects(reviewMain({ workspace: path }), /different capture/);
});

test('a second-iteration baseline separates newly discovered from existing, newly reviewed resources', () => {
  const before = capture(), now = capture();
  before.resources = before.resources.filter(r => r.id !== ids.mean);
  const old = proposalFor(before);
  const get = (p, id) => p.resources.find(r => r.id === id);
  revise(old, ids.line, 'Order-line identifier.');
  Object.assign(get(old, ids.status), { disposition: 'hold', assessment: 'Owner must confirm the status codes.' });
  get(old, ids.date).assessment = 'Clear timestamp with its role stated; sufficient as written.';
  for (const r of old.resources.filter(r => r.disposition === 'keep' && r.id !== ids.date)) r.assessment = 'Not selected for this proposal.';
  const baseline = buildBaseline(now, [{ path: 'old-capture.json', value: before }, { path: 'old-proposal.json', value: old }]);
  const by = c => baseline.resources.filter(r => r.coverage === c).map(r => r.id);
  assert.deepEqual(by('newly-discovered'), [ids.mean]);
  assert.deepEqual(by('previously-reviewed').sort(), [ids.line, ids.status, ids.date].sort());
  assert.equal(by('newly-reviewed').length, before.resources.length - 3);
  assert.deepEqual(baseline.summary.coverage, { 'newly-discovered': 1, 'newly-reviewed': before.resources.length - 3, 'previously-reviewed': 3 });
  assert.deepEqual(baseline.summary.coverage_by_kind.formula, { 'newly-discovered': 1, 'newly-reviewed': 1, 'previously-reviewed': 0 });
  assert.equal(baseline.summary.new, 1);
  const text = baselineLines({ limitation: null, summary: baseline.summary, sources: baseline.sources, candidates: [], warnings: [] }).join('\n');
  assert(text.includes('1 newly discovered') && text.includes('existing but newly reviewed'));
  const p = proposalFor(now), preview = buildPreview(p, now, baseline.summary.coverage);
  assert.deepEqual(preview.summary.baseline_coverage, baseline.summary.coverage);
  assert.equal(buildPreview(p, now).summary.baseline_coverage, undefined);
});

test('disposition coverage counts keep, revise and hold per kind and separates translation-only revisions', () => {
  const c = capture(), p = proposalFor(c);
  p.languages = ['en', 'en-GB'];
  const line = p.resources.find(r => r.id === ids.line), status = p.resources.find(r => r.id === ids.status);
  Object.assign(line, { disposition: 'revise', evidence: [{ summary: 'Read.', type: 'expression' }], proposed: { description: { ...line.original.description, 'en-GB': 'Order-line identifier.' }, ai_context: null } });
  Object.assign(status, { disposition: 'revise', evidence: [{ summary: 'Read.', type: 'expression' }], proposed: { description: { en: 'Recorded order status code.', 'en-GB': 'Recorded order status code.' }, ai_context: null } });
  p.resources.find(r => r.id === ids.mean).disposition = 'hold';
  const { summary } = buildPreview(p, c), d = summary.dispositions;
  assert.deepEqual(d.by_kind.column, { keep: 4, revise: 2, hold: 0 }); assert.deepEqual(d.by_kind.formula, { keep: 1, revise: 0, hold: 1 }); assert.deepEqual(d.by_kind.dataset, { keep: 1, revise: 0, hold: 0 });
  assert.equal(d.revise.translation_only, 1); assert.equal(d.revise.text_changed, 1);
  const markdown = renderReview(p, buildPreview(p, c)).markdown;
  assert(markdown.includes('on hold (needs clarification) 1') && markdown.includes('1 translation-only') && markdown.includes('1 changing existing locale text'));
  const base = { original: { description: { en: 'A.' }, ai_context: null } };
  assert.equal(reviseType({ ...base, proposed: { description: { en: 'A.' }, ai_context: 'Rule.' } }), 'context_only');
  assert.equal(reviseType({ ...base, proposed: { description: { en: 'A.', 'en-GB': 'B.' }, ai_context: 'Rule.' } }), 'translation_and_context');
  assert.equal(reviseType({ original: { description: null, ai_context: null }, proposed: { description: { en: 'A.' }, ai_context: null } }), 'new_description');
});

test('hold is a concrete question: skipped-assessment wording and unasked holds are flagged', () => {
  for (const bad of ['Deferred: this was not assessed in this first pass.', 'Not needed for the main questions.', 'Left for a later iteration.']) assert(deferredHold(bad), bad);
  for (const ok of ['Needs the owner to say whether IQ should use this dataset at all.', 'Two definitions of revenue exist; the owner must pick one before it is described.']) assert.equal(deferredHold(ok), null, ok);
  const c = capture(), p = proposalFor(c), r = p.resources.find(x => x.id === ids.age);
  r.disposition = 'hold'; r.assessment = 'Not assessed in this first pass.';
  const warnings = buildPreview(p, c).warnings;
  assert(warnings.some(w => w.includes('read as skipped assessments') && w.includes(ids.age)));
  assert(warnings.some(w => w.includes('not covered by any owner question') && w.includes(ids.age)));
  p.questions.push({ question: 'Should IQ use this column at all?', blocking: false, resource_ids: [ids.age] });
  r.assessment = 'Needs the owner to say whether IQ should use this column at all.';
  const after = buildPreview(p, c).warnings;
  assert(!after.some(w => w.includes('read as skipped assessments') || w.includes('not covered by any owner question')));
});

test('keep must reflect sufficiency: exclusion wording and copied boilerplate are flagged', () => {
  for (const bad of ['Not selected for this proposal.', 'Out of scope for now.', 'Excluded from this iteration.', 'Deferred to a later iteration.', 'No change proposed.']) assert(excludedKeep(bad), bad);
  for (const ok of ['Sufficient: unit and grain are stated.', 'No change proposed; the description already states unit and refund sign.', 'Existing description is complete; scope does not need context.']) assert.equal(excludedKeep(ok), null, ok);
  const c = capture(), p = proposalFor(c);
  p.resources.find(r => r.id === ids.age).assessment = 'Not included in this proposal.';
  const warnings = buildPreview(p, c).warnings.filter(w => w.includes('keep must reflect an assessment of sufficiency'));
  assert.equal(warnings.length, 1); assert(warnings[0].includes(ids.age) && warnings[0].includes('keep must reflect an assessment of sufficiency'));
  for (let i = 0; i < 12; i++) c.resources.push({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, name: { en: `extra_${i}` }, kind: 'column', resource: 'column', dataset_id: ds, type: 'hierarchy', description: { en: 'Extra.' }, ai_context: null });
  const big = proposalFor(c);
  assert(buildPreview(big, c).warnings.some(w => w.includes('share the same assessment')));
  big.resources.forEach((r, i) => { r.assessment = `Individually assessed as sufficient (${i}).`; });
  assert(!buildPreview(big, c).warnings.some(w => w.includes('share the same assessment')));
});

test('context added to a simple identifier, name or geographic column is flagged unless it is aliases only', () => {
  const simple = id => simpleColumn({ kind: 'column', name: { en: id } });
  for (const yes of ['line_id', 'order_id', 'customer_name', 'City', 'postal code', 'Latitude', 'orderId', 'Name']) assert(simple(yes), yes);
  for (const no of ['status', 'net_revenue', 'order_date', 'identity_check', 'valid']) assert(!simple(no), no);
  assert(simpleColumn({ kind: 'column', name: { en: 'Position' }, type: 'spatial' }));
  assert(!simpleColumn({ kind: 'column', name: { en: 'order_id' }, type: 'datetime' }));
  assert(!simpleColumn({ kind: 'formula', name: { en: 'order_id' } }));
  const c = capture(), p = proposalFor(c), warned = () => buildPreview(p, c).warnings.some(w => w.includes('simple identifier/name/geographic column: context is usually null unless a query rule or discovery alias is needed'));
  revise(p, ids.line, 'Identifier of one order line.', 'Fits questions about individual order lines and their lookups.');
  assert(warned());
  revise(p, ids.line, 'Identifier of one order line.', 'Aliases: line key, line number.');
  assert(!warned());
  revise(p, ids.line, 'Identifier of one order line.', null);
  assert(!warned());
  revise(p, ids.line, 'Identifier of one order line.', null); revise(p, ids.age, 'Whole days since the order was created.', 'Fits backlog-age questions; compare with the open-order population.');
  assert(!warned());
});

test('naming repair, legacy labels, reciprocal pointers and review history in context are flagged; legitimate query rules are not', () => {
  const flagged = ['The name has a typo; it should read net amount.', 'Despite its name, this counts lines.', 'Formerly named Gross value.', 'Old name: amount_eur.', 'Same as Net Revenue.', 'Mirrors net_revenue.', 'Equivalent to "Order lines".', 'Corrected in the previous review.', 'Wording is now corrected.', 'Misnamed column.'];
  for (const text of flagged) assert(maintenancePhrases({ description: {}, ai_context: text }).length + provenancePhrases({ description: {}, ai_context: text }).length > 0, text);
  for (const ok of ['Use order_date for the cohort; the same as the order date only when refunds are excluded.', 'Keep refund lines; the amount is equivalent to EUR excluding tax.', 'Count distinct order ids where status = completed; the status was changed to completed only after payment.', 'Customers on the legacy pricing plan are a separate group.', 'Same as UTC time.', 'Aggregate per order before averaging.'])
    assert.equal(maintenancePhrases({ description: {}, ai_context: ok }).length + provenancePhrases({ description: {}, ai_context: ok }).length, 0, ok);
  const c = capture(), p = proposalFor(c);
  revise(p, ids.age, 'Whole days since the order was created.', 'Despite its name, counts calendar days.');
  assert(buildPreview(p, c).warnings.some(w => w.includes(ids.age) && w.includes('naming problem') && w.includes('naming repairs')));
});

test('query evidence needs scope and findings take an optional basis, rendered next to the category', () => {
  const c = capture(), p = proposalFor(c), r = revise(p, ids.line, 'Identifier of one order line.');
  r.evidence = [{ summary: 'Three item rows for one order.', type: 'query' }];
  assert.throws(() => buildPreview(p, c), /Query evidence needs scope/);
  r.evidence = [{ summary: 'Three item rows for one order.', type: 'query', scope: 'dataset X; order_id = A; 2026-10-01..2026-10-08; UTC' }];
  buildPreview(p, c);
  const finding = { severity: 'low', category: 'needs-validation', basis: 'observed', resource_ids: [ids.mean], before_quote: '', proposed_quote: '', impact: 'Mean age may include open orders.', suggested_replacement: '' };
  p.findings = [finding];
  const { markdown, html } = renderReview(p, buildPreview(p, c));
  assert(markdown.includes('LOW · needs-validation · basis: observed')); assert(!html.includes('basis: observed'), 'the review page leaves the classification to review.md');
  for (const basis of ['expression', 'untested', 'owner-decision']) { p.findings = [{ ...finding, basis }]; buildPreview(p, c); }
  p.findings = [{ ...finding, basis: 'hunch' }]; assert.throws(() => buildPreview(p, c), /Finding basis must be one of/);
  p.findings = [{ ...finding, basis: undefined }]; buildPreview(p, c);
});

test('IQ resource selection is reported separately from metadata readiness and answer quality', () => {
  const c = capture(), p = proposalFor(c);
  const base = { question: 'How many orders were completed last week?', language: 'en', category: 'normal', expected_resource_ids: [ids.completed, ids.status], expected_interpretation: 'Distinct completed orders.', must_not: [], status: 'not-run', observed: '' };
  p.evaluation_cases = [base];
  let preview = buildPreview(p, c);
  assert.deepEqual(preview.summary.readiness.resource_selection, { executed: 0, recorded: 0, all_expected_selected: 0, not_recorded: 0, status: 'not-tested' });
  assert(renderReview(p, preview).markdown.includes('IQ resource selection: not tested'));
  const run = { status: 'pass', observed: 'Answered 12.', executed_at: '2026-10-28T10:00:00Z' };
  p.evaluation_cases = [{ ...base, ...run, selected_resource_ids: [ids.completed, ids.status] }, { ...base, ...run, question: 'Second?', selected_resource_ids: [ids.completed] }, { ...base, ...run, question: 'Third?' }, { ...base, question: 'Planned only?' }];
  preview = buildPreview(p, c);
  assert.deepEqual(preview.summary.readiness.resource_selection, { executed: 3, recorded: 2, all_expected_selected: 1, not_recorded: 1, status: 'partially-recorded' });
  const markdown = renderReview(p, preview).markdown;
  assert(markdown.includes('IQ resource selection: partially-recorded; 2 of 3 executed case(s) recorded the selected resources, 1 selected every expected resource, 1 without a recorded selection'));
  assert(markdown.includes('Answer quality: partially-tested'));
});
