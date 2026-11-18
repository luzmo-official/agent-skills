import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { hash, contextLength, sanitize, origin, metadata, client, writeJson, ReportedError, appOrigin } from './common.mjs';
import { buildProfile } from './profile-lib.mjs';
import { buildInspection } from './inspect-lib.mjs';
import { main as inspectMain } from './inspect.mjs';
import { seedProposal, buildPreview, renderReview } from './review-lib.mjs';
import { approvedChanges, applyChanges } from './apply-lib.mjs';
import { syntheticCapture } from './synthetic.mjs';
import { main as demoMain } from './demo.mjs';
import { main as reviewMain } from './review.mjs';
import { main as collectMain } from './collect.mjs';
import { main as profileMain } from './profile.mjs';
import { main as applyMain } from './apply.mjs';
import { main as restoreMain } from './restore.mjs';
import { renderEvidence } from './review-evidence.mjs';
import { wordDiff } from './review-html.mjs';
import { luzmoLinks } from './review-evidence.mjs';
import { renderKnowledgeSection } from './knowledge-html.mjs';
import { seedKnowledge, buildKnowledgePreview } from './knowledge-lib.mjs';
import { syntheticKnowledgeCapture } from './synthetic.mjs';

const clone = value => structuredClone(value);
function proposalFixture() {
  const capture = clone(syntheticCapture), proposal = seedProposal(capture, ['en', 'en-GB']);
  proposal.business_brief = 'Synthetic order-line analysis.';
  proposal.verdict = 'ready';
  for (const r of proposal.resources) r.assessment = 'Individually reviewed against the fixture.';
  const r = proposal.resources[3];
  r.disposition = 'revise';
  r.evidence = ['Fixture contract: EUR, tax excluded, refunds negative.'];
  r.proposed = { description: { en: 'Net line revenue in EUR excluding tax. Refunds are negative.', 'en-GB': 'Net line revenue in EUR excluding tax. Refunds are negative.' }, ai_context: 'For net-sales questions, keep refund lines; do not filter to positive amounts.' };
  return { capture, proposal };
}
function configFixture() {
  const capture = syntheticCapture;
  return { schema_version: 1, languages: ['en'], timezone: 'UTC', query_budget: 30, profile_days_limit: 31, profile_group_limit: 20, datasets: [{ id: capture.selection[0], scope: { mode: 'filtered', confirmed: true, rationale: 'User confirmed tenant scope.', filters: [{ column_id: capture.resources[1].id, value: 'tenant-demo' }] }, profile: { enabled: true, date_column: capture.resources[2].id, from: '2026-10-01T00:00:00Z', to: '2026-10-08T00:00:00Z', columns: [{ id: capture.resources[3].id, kind: 'numeric' }] } }] };
}
function fakeApi(capture, hooks = {}) {
  const rows = new Map(capture.resources.map(r => [r.id, clone(r)])), calls = [];
  return { rows, calls, host: capture.host, async request(resource, fields) {
    calls.push(clone(fields));
    if (fields.action === 'get') {
      const row = rows.get(fields.find.where.id);
      hooks.read?.(row, calls);
      return { rows: row ? [clone(row)] : [] };
    }
    hooks.write?.(rows.get(fields.id), fields, calls);
    if (!hooks.skipWrite) Object.assign(rows.get(fields.id), clone(fields.properties));
    hooks.afterWrite?.(rows.get(fields.id), fields, calls);
    return {};
  } };
}
async function envWorkspace(values) {
  const path = await mkdtemp(join(tmpdir(), 'luzmo-env-test-'));
  await writeFile(join(path, '.env'), Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'));
  return path;
}
function twoChanges() {
  const { capture, proposal } = proposalFixture(), r = proposal.resources[4];
  r.disposition = 'revise'; r.evidence = ['Fixture: one row per order line.'];
  r.proposed = { description: { en: 'Unique order-line identifier.', 'en-GB': 'Unique order-line identifier.' }, ai_context: null };
  return { capture, proposal, changes: buildPreview(proposal, capture).changes };
}

test('encoded budgets include escaping and normalized whitespace', () => {
  assert.equal(contextLength('  a\n b  '), JSON.stringify('a b').length);
  assert.equal(contextLength('"\\😀'), JSON.stringify('"\\😀').length);
});

test('inline data is removed even inside JSON-encoded dashboard contents', () => {
  assert.deepEqual(sanitize({ contents: JSON.stringify({ inlineData: [{ secret: 'record' }], chart: { inline_data: ['record'], column_id: 'field' } }) }), { contents: { chart: { column_id: 'field' } } });
});

test('HTTPS origin validation rejects redirects through URL components', () => {
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?token=secret']) assert.throws(() => origin(url));
  assert.equal(origin('https://api.example.invalid/'), 'https://api.example.invalid');
});

test('read-only API client rejects writes and reports API messages without credentials', async () => {
  const path = await envWorkspace({ LUZMO_API_KEY: 'synthetic-test-key', LUZMO_API_TOKEN: 'synthetic-test-token', LUZMO_API_HOST: 'https://api.example.invalid' });
  let requests = 0;
  const api = await client(path, { fetcher: async () => { requests++; return { ok: false, status: 400, text: async () => JSON.stringify({ type: { code: 400, description: 'Bad Request' }, message: 'Invalid token synthetic-test-token for description', key: 'must-not-print' }) }; } });
  await assert.rejects(api.request('securable', { action: 'update', id: 'x' }), /permitted client mode/);
  assert.equal(requests, 0);
  await assert.rejects(api.request('securable', { action: 'get' }), error => error.status === 400 && error.message.includes('Invalid token [redacted] for description') && !error.message.includes('synthetic-test-token') && !error.message.includes('must-not-print'));
  const offline = await client(path, { fetcher: async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); } });
  await assert.rejects(offline.request('securable', { action: 'get' }), error => error.uncertain && /within 30 s/.test(error.message));
});

test('metadata lookups exclude public securables; Data API queries are sent unchanged', async () => {
  const path = await envWorkspace({ LUZMO_API_KEY: 'synthetic-test-key', LUZMO_API_TOKEN: 'synthetic-test-token', LUZMO_API_HOST: 'https://api.example.invalid' });
  const bodies = [];
  const api = await client(path, { fetcher: async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, text: async () => JSON.stringify(url.pathname.endsWith('/user') ? { rows: [{ id: 'synthetic-user' }] } : { rows: [], data: [] }) }; } });
  await api.request('securable', { action: 'get', find: { where: { id: syntheticCapture.selection[0] }, include: [{ model: 'Securable', as: 'Dashboards' }], options: { owned: true } } });
  await api.request('data', { action: 'get', find: { queries: [] } });
  assert.equal(bodies.length, 3);
  assert.deepEqual(bodies[0].find.where, { id: 'me' });
  assert.deepEqual(bodies[1].find.options, { owned: true, public: false });
  assert.equal(bodies[2].find.options, undefined);
});

test('an unknown Embed pair stops before its first data query', async () => {
  const path = await envWorkspace({ LUZMO_API_KEY: 'synthetic-test-key', LUZMO_API_TOKEN: 'synthetic-test-token', LUZMO_EMBED_KEY: 'synthetic-embed-key', LUZMO_EMBED_TOKEN: 'synthetic-embed-token', LUZMO_API_HOST: 'https://api.example.invalid' });
  const resources = [];
  const embed = await client(path, { credentialMode: 'embed', fetcher: async url => { resources.push(url.pathname.split('/').pop()); return { ok: true, status: 200, text: async () => JSON.stringify({ rows: [], data: [['public']] }) }; } });
  await assert.rejects(embed.request('data', { action: 'get', find: { queries: [] } }), error => error.refused && /LUZMO_EMBED_KEY\/LUZMO_EMBED_TOKEN/.test(error.message) && /embed-access\.mjs/.test(error.message));
  await assert.rejects(embed.request('data', { action: 'get', find: { queries: [] } }), error => error.refused);
  assert.deepEqual(resources, ['user']);
});

test('a refused token names the .env pair to replace without assuming the host is correct', async () => {
  const path = await envWorkspace({ LUZMO_API_KEY: 'synthetic-test-key', LUZMO_API_TOKEN: 'synthetic-test-token', LUZMO_EMBED_KEY: 'synthetic-embed-key', LUZMO_EMBED_TOKEN: 'synthetic-embed-token', LUZMO_API_HOST: 'https://api.example.invalid' });
  const fetcher = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ type: { code: 401, description: 'Unauthorized' }, message: 'This authorization is currently not valid. Please re-authenticate.' }) });
  await assert.rejects((await client(path, { fetcher })).request('securable', { action: 'get' }), error => error.refused && error.status === 401 && /LUZMO_API_KEY\/LUZMO_API_TOKEN/.test(error.message) && /matches the API Tokens page/.test(error.message) && /re-authenticate/.test(error.message) && !error.message.includes('synthetic-test-token'));
  await assert.rejects((await client(path, { fetcher, credentialMode: 'embed' })).request('data', { action: 'get' }), error => error.refused && /LUZMO_EMBED_KEY/.test(error.message) && /embed-access\.mjs/.test(error.message));
});

test('credentials and host come only from the workspace .env, never the shell', async () => {
  const saved = Object.fromEntries(['LUZMO_API_KEY', 'LUZMO_API_TOKEN', 'LUZMO_API_HOST'].map(k => [k, process.env[k]]));
  Object.assign(process.env, { LUZMO_API_KEY: 'shell-key', LUZMO_API_TOKEN: 'shell-token', LUZMO_API_HOST: 'https://shell.example.invalid' });
  try {
    const path = await envWorkspace({ LUZMO_API_KEY: 'workspace-key', LUZMO_API_TOKEN: 'workspace-token', LUZMO_API_HOST: 'https://api.example.invalid' });
    let body;
    const api = await client(path, { fetcher: async (url, options) => { body = JSON.parse(options.body); return { ok: true, status: 200, text: async () => url.pathname.endsWith('/user') ? '{"rows":[{"id":"synthetic-user"}]}' : '{"rows":[]}' }; } });
    await api.request('securable', { action: 'get', find: {} });
    assert.equal(api.host, 'https://api.example.invalid'); assert.equal(body.key, 'workspace-key'); assert.equal(body.token, 'workspace-token');
    assert.equal(process.env.LUZMO_API_KEY, 'shell-key');
    await assert.rejects(client(await envWorkspace({ LUZMO_API_HOST: 'https://api.example.invalid' })), /Set LUZMO_API_KEY and LUZMO_API_TOKEN/);
    await assert.rejects(client(join(tmpdir(), 'nonexistent-luzmo-test-dir')), /No \.env in workspace/);
  } finally { for (const [key, value] of Object.entries(saved)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
});

test('profile includes tenant equality and bounded date predicates in every query', () => {
  const plan = buildProfile(configFixture(), syntheticCapture);
  assert.equal(plan.jobs.length, 4);
  for (const job of plan.jobs) {
    assert.equal(job.query.where[0].parameters[1], 'tenant-demo');
    assert.equal(job.query.where[1].expression, '? >= ?');
    assert.equal(job.query.where[2].expression, '? < ?');
    assert(job.query.measures.length > 0);
    assert.equal(job.query.options.query_timeout, undefined);
  }
});

test('profile fails closed on missing scope, unknown columns, unapproved categories and excess budget', () => {
  for (const mutate of [c => { c.datasets[0].scope.confirmed = false; }, c => { c.datasets[0].scope.filters = []; }, c => { c.datasets[0].profile.date_column = 'unknown'; }, c => { c.datasets[0].profile.columns = [{ id: syntheticCapture.resources[5].id, kind: 'category' }]; }, c => { c.query_budget = 1; }, c => { c.datasets[0].profile.to = '2026-12-01T00:00:00Z'; }]) {
    const config = configFixture(); mutate(config); assert.throws(() => buildProfile(config, syntheticCapture));
  }
});

test('default-connection profiling requires an inspected scope rationale', () => {
  const config = configFixture(); config.datasets[0].scope = { mode: 'default-connection', rationale: 'All fixture rows intended for analysis.', filters: [] };
  assert.equal(buildProfile(config, syntheticCapture).jobs[0].query.where.length, 2);
  config.datasets[0].scope.rationale = ''; assert.throws(() => buildProfile(config, syntheticCapture));
});

test('review accounts for every resource and emits only changed revise targets', () => {
  const { capture, proposal } = proposalFixture();
  const preview = buildPreview(proposal, capture);
  assert.equal(preview.summary.reviewed, 6); assert.equal(preview.changes.length, 1);
  assert.deepEqual(preview.changes[0].before, metadata(capture.resources[3]));
  assert.deepEqual(Object.keys(preview.changes[0].properties).sort(), ['ai_context', 'description']);
  proposal.resources[3].disposition = 'hold'; assert.equal(buildPreview(proposal, capture).changes.length, 0);
});

test('a complete public definition can be revised without adding AI context', () => {
  const { capture, proposal } = proposalFixture();
  proposal.resources[3].proposed.ai_context = null;
  proposal.resources[3].assessment = 'Definition and refund convention are public; no extra computation rule or discovery alias needed in this fixture.';
  const preview = buildPreview(proposal, capture);
  assert.equal(preview.summary.contexts_before, 1);
  assert.equal(preview.summary.contexts_after, 1);
  assert.equal(preview.summary.contexts_cleared, 0);
  assert.equal(preview.changes[0].target.ai_context, null);
  assert.deepEqual(Object.keys(preview.changes[0].properties), ['description']);
});

test('clearing captured context requires acknowledgement and a knowledge record, and applies null exactly', async () => {
  const { capture, proposal } = proposalFixture();
  const r = proposal.resources[0];
  r.disposition = 'revise';
  r.evidence = ['Synthetic dataset contract.'];
  r.assessment = 'Moves the contract into public descriptions; no additional guidance or discovery vocabulary needed in this fixture.';
  r.proposed = { description: { en: 'Order lines for net-sales analysis. Net line amounts are EUR excluding tax; negative amounts are refunds.', 'en-GB': 'Order lines for net-sales analysis. Net line amounts are EUR excluding tax; negative amounts are refunds.' }, ai_context: null };
  assert.throws(() => buildPreview(proposal, capture), /allow_clear/);
  r.allow_clear = true;
  assert.throws(() => buildPreview(proposal, capture), /knowledge_migrations/);
  r.knowledge_migrations = ['Unit, tax basis and refund sign moved from dataset context into both public descriptions.'];
  const preview = buildPreview(proposal, capture);
  assert.equal(preview.summary.contexts_before, 1);
  assert.equal(preview.summary.contexts_after, 1);
  assert.equal(preview.summary.contexts_cleared, 1);
  const change = preview.changes.find(c => c.id === r.id);
  assert.equal(change.properties.ai_context, null);
  const view = renderReview(proposal, preview);
  assert(view.markdown.includes('Encoded context (before → after)'));
  assert(view.markdown.includes(`${contextLength(r.original.ai_context)} → 0/1000`));
  assert(view.html.includes('Proposed AI context</h4><p class="definition empty">Not set.'));
  assert(!view.html.includes('&quot;ai_context&quot;: null'));
  const api = fakeApi(capture);
  const result = await applyChanges(api, [change], { execute: true });
  assert.equal(result.resources[0].before.ai_context, r.original.ai_context);
  assert.equal(api.rows.get(r.id).ai_context, null);
  assert.deepEqual(api.rows.get(r.id).description, r.proposed.description);
});

test('a context change uses null rather than newly introduced whitespace', () => {
  for (const blank of ['', '  \n ']) {
    const { capture, proposal } = proposalFixture();
    proposal.resources[3].proposed.ai_context = blank;
    assert.throws(() => buildPreview(proposal, capture), /Use null instead of blank/);
  }
});

test('review rejects omission, altered originals/expressions, locale loss and oversized context', () => {
  for (const mutate of [p => p.resources.pop(), p => { p.resources[0].assessment = ''; }, p => { p.resources[3].original.ai_context = 'altered'; }, p => { p.resources[3].expected_expression = 'SUM(1)'; }, p => { p.resources[3].proposed.description = { 'en-GB': 'Second locale only.' }; }, p => { p.resources[3].proposed.ai_context = 'x'.repeat(450); }, p => { p.resources[3].proposed.expression = 'SUM(1)'; }]) {
    const { capture, proposal } = proposalFixture(); mutate(proposal); assert.throws(() => buildPreview(proposal, capture));
  }
});

test('review requires explicit acknowledgement of incomplete capture and blocks unresolved definitions', () => {
  const { capture, proposal } = proposalFixture(); capture.complete = false; proposal.capture_sha256 = hash(capture);
  assert.throws(() => buildPreview(proposal, capture), /incomplete capture/);
  proposal.capture_limitations_acknowledged = 'Dashboard unavailable; affected usage not certified.';
  buildPreview(proposal, capture);
  proposal.questions.push({ question: 'Which unit is authoritative?', blocking: true, resource_ids: [proposal.resources[3].id] });
  assert.throws(() => buildPreview(proposal, capture), /blocking metadata question/);
});

test('HTML treats customer text as data and requires no remote scripts', () => {
  const { capture, proposal } = proposalFixture();
  proposal.business_brief = '<script>alert(1)</script>';
  const view = renderReview(proposal, buildPreview(proposal, capture));
  assert.equal((view.html.match(/<script>/g) ?? []).length, 1);
  assert(view.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert(view.html.includes("default-src 'none'"));
  const script = view.html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert(!script.includes('\r'), 'browsers hash the script with LF line endings, so a CRLF checkout must not reach the page');
  assert(view.html.includes(`script-src 'sha256-${createHash('sha256').update(script).digest('base64')}'`));
  assert(!view.html.includes('<script src='));
  for (const r of capture.resources) assert(view.markdown.includes(r.id));
});

test('human review shows comparisons without forms or process coaching', () => {
  const { capture, proposal } = proposalFixture();
  proposal.resources[1].disposition = 'hold';
  proposal.review_summary = { purpose: 'Review order-line definitions.', highlights: ['Publish refund meaning.'], limitations: ['Question testing is pending.'] };
  const { html } = renderReview(proposal, buildPreview(proposal, capture));
  for (const forbidden of ['class="decision"', 'class="comment"', '<textarea', 'Download feedback', 'overall-feedback', 'Continue in your agent chat', 'Return to your agent chat', 'Read the changes using', 'Exact metadata comparison', '&quot;ai_context&quot;:']) assert(!html.includes(forbidden));
  assert(html.includes('<div class="reason"><h4>Why this change</h4>'));
  assert(!html.includes('<details open><summary>Why this change'));
  assert(html.includes('<details class="retained-metadata"><summary>Current text (not being updated)</summary>'));
  const held = html.match(/<article[^>]*data-outcome="hold"[\s\S]*?<\/article>/)[0];
  assert(held.includes('<div class="reason notice"><h4>What needs clarification</h4>'));
  assert(!held.includes('<summary>Why this'));
  assert(html.includes('<details class="dataset-group"'));
  assert(!html.includes('<details class="dataset-group" open'));
  assert(html.includes('<div class="summary-grid">'));
  assert(html.includes('<li>Publish refund meaning.</li>'));
  assert(html.includes('<summary>Business context and evidence</summary>'));
  assert.equal((html.match(/<article class="resource outcome-/g) ?? []).length, capture.resources.length);
  proposal.review_summary.highlights = [null];
  assert.throws(() => buildPreview(proposal, capture), /Review summary highlights/);
  for (const expected of ['Current description', 'Proposed description', 'data-locale="en-GB"', '<details open><summary>AI context', 'Current AI context', 'Proposed AI context']) assert(html.includes(expected), expected);
});

test('resource cards prioritize edits and retain untouched locales and context in collapsed details', () => {
  const { capture, proposal } = proposalFixture(), r = proposal.resources[3];
  const card = () => renderReview(proposal, buildPreview(proposal, capture)).html.match(new RegExp(`<article[^>]*id="resource-${r.id}"[\\s\\S]*?<\\/article>`))[0];
  // Context-only: the current public description follows the expanded context comparison.
  proposal.languages = ['en'];
  r.proposed.description = clone(r.original.description);
  let html = card();
  assert(html.includes('Column: net_revenue'));
  assert(!html.includes('<p class="eyebrow">'));
  assert(html.indexOf('Proposed AI context') < html.indexOf('class="retained-metadata"'));
  assert(html.indexOf('class="retained-metadata"') < html.indexOf('Net line revenue.'));
  assert(html.includes('<details class="retained-metadata"><summary>Not changed: description</summary>'));
  assert(html.includes('<div class="reason"><h4>Why this change</h4>'));
  // Translation-only: the retained English locale and empty context remain in the second section.
  proposal.languages = ['en', 'en-GB'];
  r.proposed.ai_context = r.original.ai_context;
  r.proposed.description['en-GB'] = 'Net line revenue. Negative values represent refunds.';
  html = card();
  const split = html.indexOf('class="retained-metadata"');
  assert(html.indexOf('data-locale="en-GB"') < split);
  assert(html.indexOf('data-locale="en"') > split);
  assert(html.indexOf('AI context (not set)') > split);
  // Both changed: neither edited part is hidden under the retention heading.
  r.proposed.description.en = 'Net line revenue including negative refund amounts.';
  r.proposed.ai_context = 'For net-sales questions, keep refund lines.';
  html = card();
  assert(!html.includes('class="retained-metadata"'));
  // A held draft must not call its retained text reviewed and sufficient.
  proposal.languages = ['en'];
  r.disposition = 'hold'; r.proposed.description = clone(r.original.description);
  html = card();
  assert(html.includes('<summary>Current text (not being updated)</summary>'));
  assert(!html.includes('Reviewed (no update needed)'));
});

test('evidence presents supported facts and references without executing unsafe sources', () => {
  const html = renderEvidence([{ summary: 'Refunds retain negative signs.', source: { title: 'Business definition', url: 'https://example.invalid/contract' }, reference: 'Revenue definition, section 2' }, { summary: '<script>untrusted()</script>', source: { title: 'Untrusted source', url: 'javascript:alert(1)' } }]);
  assert(html.includes('Refunds retain negative signs.'));
  assert(html.includes('href="https://example.invalid/contract"'));
  assert(html.includes('Revenue definition, section 2'));
  assert(html.includes('&lt;script&gt;untrusted()&lt;/script&gt;'));
  assert(!html.includes('href="javascript:'));
  assert(!html.includes('&quot;summary&quot;'));
});

test('calculation follow-ups separate the issue and action from escaped technical evidence', () => {
  const { capture, proposal } = proposalFixture();
  proposal.calculation_changes = ['defect', 'unvalidated', 'data-gap', 'optional', 'duplicate'].map(classification => ({
    title: 'Example follow-up', classification, status: 'not-approved', resource_ids: [capture.resources[0].id],
    reason: 'One event can be counted several times.', validation_needed: 'Count each event once, then compare with a small example.',
    intended_question: 'How many events occurred?', result_grain: 'One count', population: 'Selected events',
    dependencies: [capture.resources[1].id], boundary_cases: ['An event with several history entries'],
    technical_details: '<script>untrusted()</script> COUNTD(event_id)', expression_candidate: null,
  }));
  const { html } = renderReview(proposal, buildPreview(proposal, capture));
  for (const heading of ['What is wrong', 'What needs a decision', 'What is missing', 'What to check', 'Next step']) assert(html.includes(`<h4>${heading}</h4>`));
  assert(html.includes('<details><summary>Technical details</summary><pre><code>&lt;script&gt;untrusted()&lt;/script&gt; COUNTD(event_id)</code></pre>'));
  assert(!html.includes('<script>untrusted()'));
  assert(html.includes(`<code>${capture.resources[1].name.en} (${capture.resources[1].id})</code>`));
  assert(!html.includes('defect · not approved'));
});

test('the review lists what to check first, most important first, and keeps readiness out of the page', () => {
  const { capture, proposal } = proposalFixture();
  const status = proposal.resources[5], revenue = proposal.resources[3];
  status.disposition = 'hold';
  status.assessment = 'Status values have no agreed meaning; needs the owner to confirm which count as completed.';
  proposal.verdict = 'ready-with-corrections';
  proposal.questions = [{ question: 'Which status values count as completed?', blocking: true, resource_ids: [status.id] }, { question: 'Should test orders be excluded?', blocking: false, resource_ids: [] }];
  proposal.calculation_changes = [{ title: 'Completed share divides by the wrong total', classification: 'defect', status: 'not-approved', resource_ids: [status.id], dependencies: [], boundary_cases: [], reason: 'It divides by all lines.', validation_needed: 'Agree the denominator.', intended_question: 'What share of orders completed?', result_grain: 'Share', population: 'All orders' }];
  proposal.findings = [{ severity: 'high', category: 'calculation-defect', basis: 'expression', impact: 'Completed share uses the wrong denominator.', resource_ids: [status.id], before_quote: '', proposed_quote: '', suggested_replacement: '' }, { severity: 'high', category: 'metadata-correction', basis: 'observed', impact: '<b>Refund</b> sign was not public.', resource_ids: [revenue.id], before_quote: '', proposed_quote: '', suggested_replacement: '' }];
  const { html, markdown } = renderReview(proposal, buildPreview(proposal, capture));
  const order = ['Decision needed', 'Problem found', 'Calculation error', '1 item needs clarification', 'Good to confirm'].map(text => html.indexOf(text));
  assert(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `attention order ${order}`);
  assert.equal(html.split('Problem found').length - 1, 1, 'a finding already covered by a calculation follow-up is listed once');
  assert(html.includes('&lt;b&gt;Refund&lt;/b&gt;') && !html.includes('<b>Refund</b>'));
  assert(html.indexOf('id="check-first"') < html.indexOf('id="dataset-view"'));
  for (const technical of ['Disposition coverage', 'Readiness', 'IQ resource selection', 'Answer quality:']) assert(!html.includes(technical), technical);
  assert(markdown.includes('## Readiness') && markdown.includes('Disposition coverage'));
  const clear = proposalFixture();
  const calm = renderReview(clear.proposal, buildPreview(clear.proposal, clear.capture)).html;
  assert(calm.includes('Nothing needs your attention first') && !calm.includes('Check these first'));
});

test('the review reads in the reviewer\'s language, starts without unchanged items and shows test questions plainly', () => {
  const { capture, proposal } = proposalFixture();
  const [revenue, status] = [proposal.resources[3], proposal.resources[5]];
  proposal.review_language = 'en';
  proposal.calculation_changes = ['duplicate', 'data-gap'].map((classification, i) => ({ title: `Follow-up ${i + 1}`, classification, status: 'not-approved', resource_ids: [status.id], dependencies: [], boundary_cases: [], reason: 'Reason.', validation_needed: 'Next step.', intended_question: 'Question?', result_grain: 'Grain', population: 'All' }));
  proposal.evaluation_cases = [{ question: 'Quel est le chiffre d’affaires net ?', language: 'fr', category: 'current-vs-historical', expected_resource_ids: [revenue.id], expected_interpretation: 'Net revenue after refunds, in EUR.', must_not: ['Leave out refunds'], status: 'not-run' }];
  const { html } = renderReview(proposal, buildPreview(proposal, capture));
  assert(html.startsWith('<!doctype html><html lang="en">'));
  assert(!html.includes('About this review'), 'no about section');
  assert.equal(html.split('Calculations to discuss with the data owner').length - 1, 1, 'non-error calculation follow-ups share one entry');
  const keptCards = html.match(/<article class="resource outcome-keep"[^>]*>/g);
  assert(keptCards.length && keptCards.every(tag => tag.endsWith(' hidden>')), 'unchanged items start hidden');
  assert(html.includes('id="show-unchanged" type="checkbox"'));
  assert(html.includes('data-review-view="questions"') && html.includes('<p class="question" lang="fr">Quel est le chiffre d’affaires net ?</p>'));
  assert(html.includes('<dt>A good answer</dt><dd>Net revenue after refunds, in EUR.</dd>') && html.includes('Checks: Now versus in the past') && html.includes('Not asked yet'));
  assert(!html.includes('current-vs-historical') && !html.includes('planned, not run'), 'no internal labels');
  proposal.review_language = 'English';
  assert.throws(() => buildPreview(proposal, capture), /review_language/);
});

test('the review links datasets, fields, metrics, agents, rules and evidence dashboards to the Luzmo app', () => {
  assert.equal(appOrigin('https://api.luzmo.com'), 'https://app.luzmo.com');
  assert.equal(appOrigin('https://api.us.luzmo.com'), 'https://app.us.luzmo.com');
  assert.equal(appOrigin('https://luzmo.internal.example'), null, 'an unknown private address gets no guessed links');
  assert.equal(appOrigin('https://luzmo.internal.example', 'https://bi.internal.example'), 'https://bi.internal.example');
  assert.throws(() => appOrigin('https://api.luzmo.com', 'http://app.luzmo.com/x'), /LUZMO_APP_HOST/);
  const { capture, proposal } = proposalFixture();
  const dashboard = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', dataset = capture.selection[0];
  proposal.resources[3].evidence = [{ summary: 'Charts sum net revenue per month.', source: 'Monthly sales', type: 'dashboard', dashboard_id: dashboard }, { summary: 'Owner confirmed EUR.', type: 'owner' }];
  const preview = buildPreview(proposal, capture);
  const html = renderReview(proposal, preview, null, null, null, { app_host: 'https://app.luzmo.com' }).html;
  assert.equal(html.split(`href="https://app.luzmo.com/datasets/${dataset}/view"`).length - 1, capture.resources.length + 1, 'each item and its dataset header link to the dataset');
  assert(html.includes(`<a data-luzmo-path="/dashboards/${dashboard}" href="https://app.luzmo.com/dashboards/${dashboard}" target="_blank" rel="noopener noreferrer">Monthly sales</a>`));
  assert(html.includes('id="app-address"') && html.includes('value="https://app.luzmo.com"'), 'the address field starts from the known address');
  const unknown = renderReview(proposal, preview).html;
  assert(!unknown.includes('href="https://app.') && unknown.includes('class="open-in" data-luzmo-path='), 'no app address: links wait for one');
  assert(unknown.includes(`<a data-luzmo-path="/dashboards/${dashboard}" target="_blank" rel="noopener noreferrer">Monthly sales</a>`), 'the dashboard name stays readable');
  assert(!/class="open-in" data-luzmo-path="[^"]+" (?!hidden)/.test(unknown), '"Open in Luzmo" stays hidden until an address is entered');
  proposal.resources[3].evidence[0].dashboard_id = 'not-a-uuid';
  assert.throws(() => buildPreview(proposal, capture), /dashboard_id/);
  const knowledgeProposal = seedKnowledge(syntheticKnowledgeCapture, ['en']);
  knowledgeProposal.verdict = 'ready'; knowledgeProposal.assessment = 'Reviewed the fictional rule and agent.';
  for (const r of knowledgeProposal.resources) { r.assessment = 'Reviewed individually.'; r.evidence = ['Synthetic fixture.']; }
  const knowledgeHtml = renderKnowledgeSection(knowledgeProposal, buildKnowledgePreview(knowledgeProposal, syntheticKnowledgeCapture), new Map(), luzmoLinks('https://app.luzmo.com'));
  const [rule, agent] = syntheticKnowledgeCapture.resources;
  assert(knowledgeHtml.includes(`href="https://app.luzmo.com/knowledge/rules/${rule.id}"`) && knowledgeHtml.includes(`href="https://app.luzmo.com/agents/${agent.id}"`));
});

test('description and context changes are shown as a word-level diff', () => {
  const diff = wordDiff('Net line revenue. Refunds <b>negative</b>.', 'Net order-line revenue in EUR. Refunds <b>negative</b>.');
  assert.equal(diff.before, 'Net <del>line revenue.</del> Refunds &lt;b&gt;negative&lt;/b&gt;.');
  assert.equal(diff.after, 'Net <ins>order-line revenue in EUR.</ins> Refunds &lt;b&gt;negative&lt;/b&gt;.');
  assert.deepEqual(wordDiff('Same text.', 'Same text.'), { before: 'Same text.', after: 'Same text.' });
});

test('review filters work without collecting comments or approval decisions', async () => {
  const script = await readFile(new URL('../assets/review.js', import.meta.url), 'utf8');
  const control = value => ({ value, textContent: '', hidden: false, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
  const controls = Object.fromEntries(['search', 'dataset', 'language', 'visible-count', 'no-results', 'print'].map(id => [id, control('')]));
  for (const id of ['show-unchanged-knowledge', 'show-unchanged']) { controls[id] = control(''); controls[id].checked = false; }
  const showKept = checked => { controls['show-unchanged'].checked = checked; controls['show-unchanged'].listeners.input(); };
  controls.dataset.value = 'all'; controls.language.value = 'all';
  const translations = [{ dataset: { locale: 'en' } }, { dataset: { locale: 'en-GB' } }];
  const changed = { dataset: { outcome: 'revise', dataset: 'orders' }, textContent: 'Revenue refunds', querySelectorAll: () => translations };
  const held = { dataset: { outcome: 'hold', dataset: 'orders' }, textContent: 'Margin', querySelectorAll: () => [] };
  const kept = { dataset: { outcome: 'keep', dataset: 'orders' }, textContent: 'Order date', querySelectorAll: () => [] };
  const cards = [changed, held, kept];
  const knowledgeCards = ['true', 'false', 'false'].map(unchanged => ({ dataset: { unchanged }, hidden: false }));
  const group = { tagName: 'DETAILS', open: false, parentElement: null, querySelectorAll: () => cards };
  const panels = ['datasets', 'knowledge'].map(reviewPanel => ({ dataset: { reviewPanel }, hidden: reviewPanel === 'knowledge' }));
  const viewButtons = ['datasets', 'knowledge'].map(reviewView => ({ ...control(''), dataset: { reviewView }, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }));
  const selectors = { '.resource[data-outcome]': cards, '.knowledge-resource': knowledgeCards, '.dataset-group': [group], '[data-review-panel]': panels, '[data-review-view]': viewButtons };
  const document = { getElementById: id => controls[id], querySelectorAll: selector => selectors[selector] ?? [] };
  const reviewWindow = { location: { hash: '' }, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, print() {} };
  runInNewContext(script, { document, window: reviewWindow });
  assert.equal(changed.hidden, false); assert.equal(held.hidden, false); assert.equal(kept.hidden, true, 'unchanged items start hidden');
  assert.equal(group.open, true, 'without unchanged items the list is short, so datasets open');
  group.open = false;
  viewButtons[1].listeners.click();
  assert.deepEqual(panels.map(p => p.hidden), [true, false]);
  assert.equal(viewButtons[1].attributes['aria-pressed'], 'true');
  viewButtons[0].listeners.click();
  assert.deepEqual(panels.map(p => p.hidden), [false, true]);
  assert.deepEqual(knowledgeCards.map(c => c.hidden), [true, false, false]);
  controls['show-unchanged-knowledge'].checked = true;
  controls['show-unchanged-knowledge'].listeners.input();
  assert(knowledgeCards.every(c => !c.hidden));
  controls['show-unchanged-knowledge'].checked = false;
  controls['show-unchanged-knowledge'].listeners.input();
  assert.equal(knowledgeCards[0].hidden, true);
  controls.search.value = 'no match'; controls.search.listeners.input();
  assert.equal(changed.hidden, true); assert.equal(controls['no-results'].hidden, false);
  assert.equal(group.hidden, true);
  controls.search.value = ''; controls.language.value = 'en-GB'; controls.language.listeners.input();
  assert.equal(translations[0].hidden, true); assert.equal(translations[1].hidden, false);
  group.open = false; showKept(true);
  assert.equal(kept.hidden, false);
  assert.equal(group.open, false, 'the full list stays collapsed');
  controls.search.value = 'margin'; controls.search.listeners.input();
  assert.equal(group.open, true); assert.equal(held.hidden, false); assert.equal(kept.hidden, true);
  showKept(false);
  controls.search.value = '';
  controls.dataset.value = 'another dataset'; controls.dataset.listeners.input();
  assert.equal(changed.hidden, true); assert.equal(held.hidden, true);
  controls['resource-held'] = held;
  held.parentElement = group; held.closest = () => panels[0]; held.matches = selector => selector === '.resource[data-outcome]';
  viewButtons[1].listeners.click();
  reviewWindow.location.hash = '#resource-held'; reviewWindow.listeners.hashchange();
  assert.equal(held.hidden, false); assert.equal(group.open, true); assert.equal(panels[0].hidden, false);
  controls['resource-kept'] = kept;
  kept.parentElement = group; kept.closest = () => panels[0]; kept.matches = held.matches;
  reviewWindow.location.hash = '#resource-kept'; reviewWindow.listeners.hashchange();
  assert.equal(controls['show-unchanged'].checked, true, 'a link to an unchanged item shows unchanged items'); assert.equal(kept.hidden, false);
  assert(!script.includes('Blob')); assert(!script.includes('createObjectURL'));
  const standaloneControl = control(''); standaloneControl.checked = false;
  const standalone = { getElementById: id => id === 'show-unchanged-knowledge' ? standaloneControl : null, querySelectorAll: selector => selector === '.knowledge-resource' ? knowledgeCards : [] };
  runInNewContext(script, { document: standalone, window: {} });
  standaloneControl.checked = true; standaloneControl.listeners.input();
  assert(knowledgeCards.every(c => !c.hidden));
  // The address field repoints every Luzmo link for this tab, accepts a bare domain and hides "Open in Luzmo" without one.
  const link = (path, open) => ({ dataset: { luzmoPath: path }, hidden: false, href: 'https://app.luzmo.com' + path, classList: { contains: c => open && c === 'open-in' }, removeAttribute(name) { delete this[name]; } });
  const links = [link('/datasets/a/view', true), link('/dashboards/b', false)];
  const address = { ...control('https://app.luzmo.com'), attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
  const stored = new Map();
  const sessionStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) };
  runInNewContext(script, { document: { getElementById: id => id === 'app-address' ? address : null, querySelectorAll: selector => selector === 'a[data-luzmo-path]' ? links : [] }, window: {}, sessionStorage, URL });
  address.value = 'bi.example.com'; address.listeners.input();
  assert.deepEqual(links.map(l => l.href), ['https://bi.example.com/datasets/a/view', 'https://bi.example.com/dashboards/b']);
  assert.equal(stored.get('luzmo-review-app-address'), 'bi.example.com');
  address.value = 'not a valid address'; address.listeners.input();
  assert.equal(address.attributes['aria-invalid'], 'true');
  address.value = ''; address.listeners.input();
  assert.equal(links[0].hidden, true, 'no address, no "Open in Luzmo" link'); assert.equal(links[1].hidden, false, 'a dashboard name stays readable');
  assert(!('href' in links[0]) && !('href' in links[1]));
});

test('approval is bound to exact preview and explicit subset', () => {
  const { capture, proposal } = proposalFixture(), preview = buildPreview(proposal, capture);
  const approval = { schema_version: 1, reviewer: 'Synthetic reviewer', reviewed_at: '2026-10-28T10:00:00Z', preview_sha256: hash(preview), approved_ids: [preview.changes[0].id] };
  assert.equal(approvedChanges(preview, approval).length, 1);
  for (const mutate of [a => { a.preview_sha256 = 'stale'; }, a => { a.reviewer = ''; }, a => { a.approved_ids = []; }, a => { a.approved_ids = [proposal.resources[0].id]; }]) { const a = clone(approval); mutate(a); assert.throws(() => approvedChanges(preview, a)); }
});

test('preflight performs no writes; execute writes and verifies the result', async () => {
  const { capture, proposal } = proposalFixture(), changes = buildPreview(proposal, capture).changes;
  const api = fakeApi(capture);
  const preflight = await applyChanges(api, changes);
  assert.equal(preflight.applied, 0); assert(api.calls.every(c => c.action === 'get'));
  const result = await applyChanges(api, changes, { execute: true });
  assert.equal(result.applied, 1); assert.equal(api.calls.filter(c => c.action === 'update').length, 1);
  assert.deepEqual(metadata(api.rows.get(changes[0].id)), changes[0].target);
});

test('live expression or metadata drift stops before writes', async () => {
  const { capture, proposal } = proposalFixture(), changes = buildPreview(proposal, capture).changes;
  const api = fakeApi(capture); api.rows.get(changes[0].id).expression = 'NEW_EXPRESSION';
  await assert.rejects(applyChanges(api, changes, { execute: true }), error => error instanceof ReportedError && /nothing was written/.test(error.message) && error.report.drift[0].changed_fields.includes('expression'));
  assert(api.calls.every(c => c.action === 'get'));
});

test('a rename after capture stops before writes', async () => {
  const { capture, proposal } = proposalFixture(), changes = buildPreview(proposal, capture).changes;
  const api = fakeApi(capture); api.rows.get(changes[0].id).name = { en: 'Renamed after capture' };
  await assert.rejects(applyChanges(api, changes, { execute: true }), error => error instanceof ReportedError && /nothing was written/.test(error.message) && error.report.drift[0].changed_fields.includes('name'));
  assert(api.calls.every(c => c.action === 'get'));
});

test('race between preflight and write is detected', async () => {
  const { capture, proposal } = proposalFixture(), changes = buildPreview(proposal, capture).changes;
  let reads = 0;
  const api = fakeApi(capture, { read: row => { if (++reads === 2) row.ai_context = 'Concurrent edit'; } });
  await assert.rejects(applyChanges(api, changes, { execute: true }), /someone edited ai_context after preflight/);
  assert(api.calls.every(c => c.action === 'get'));
});

test('a rejected write rolls back earlier updates and explains how to fix the proposal', async () => {
  const { capture, changes } = twoChanges();
  const rejected = Object.assign(new Error('Luzmo API rejected column update (HTTP 400): Must be internationalized string.'), { status: 400, apiMessage: 'Must be internationalized string.' });
  const api = fakeApi(capture, { write: (row, fields) => { if (fields.id === changes[1].id) throw rejected; } });
  await assert.rejects(applyChanges(api, changes, { execute: true }), error => {
    assert(error instanceof ReportedError);
    assert.match(error.message, /Apply stopped at column "line_id"/); assert.match(error.message, /Correct the rejected proposal/);
    assert.equal(error.report.stopped_at.api_status, 400); assert.equal(error.report.stopped_at.api_message, 'Must be internationalized string.');
    assert.deepEqual(error.report.rollback.map(r => r.status), ['unchanged', 'rolled-back']);
    return true;
  });
  for (const c of changes) assert.deepEqual(metadata(api.rows.get(c.id)), c.before);
});

test('a write that times out but landed counts as applied; one that never landed rolls back the run', async () => {
  const { capture, changes } = twoChanges();
  const timeout = () => Object.assign(new Error('No response'), { uncertain: true });
  const landed = fakeApi(capture, { afterWrite: (row, fields) => { if (fields.id === changes[0].id) throw timeout(); } });
  assert.equal((await applyChanges(landed, changes, { execute: true })).applied, 2);
  const lost = fakeApi(capture, { write: (row, fields) => { if (fields.id === changes[1].id) throw timeout(); } });
  await assert.rejects(applyChanges(lost, changes, { execute: true }), error => error.report.stopped_at.stage === 'write' && error.report.rollback.some(r => r.status === 'rolled-back') && error.report.rollback.some(r => r.status === 'unchanged'));
  for (const c of changes) assert.deepEqual(metadata(lost.rows.get(c.id)), c.before);
});

test('rollback keeps a newer edit by someone else and reports the values to restore', async () => {
  const { capture, changes } = twoChanges();
  const api = fakeApi(capture, { write: (row, fields) => {
    if (fields.id !== changes[1].id) return;
    api.rows.get(changes[0].id).ai_context = 'Edited by a colleague';
    throw Object.assign(new Error('Server error'), { status: 500 });
  } });
  await assert.rejects(applyChanges(api, changes, { execute: true }), error => {
    const entry = error.report.rollback.find(r => r.id === changes[0].id);
    assert.equal(entry.status, 'skipped-newer-edit'); assert.deepEqual(entry.restore, changes[0].before);
    assert(error.report.rollback.some(r => r.status === 'unchanged'));
    return true;
  });
  assert.equal(api.rows.get(changes[0].id).ai_context, 'Edited by a colleague');
});

test('an interruption between writes rolls back what this run changed', async () => {
  const { capture, changes } = twoChanges(), api = fakeApi(capture);
  let checks = 0;
  await assert.rejects(applyChanges(api, changes, { execute: true, interrupted: () => ++checks === 2 ? 'SIGINT' : null }), error => error.report.stopped_at.stage === 'interrupted' && error.report.not_attempted.length === 0);
  for (const c of changes) assert.deepEqual(metadata(api.rows.get(c.id)), c.before);
});

test('changed descriptions over the tooltip budget are rejected; retained long text only warns', () => {
  const { capture, proposal } = proposalFixture(), r = proposal.resources[3];
  r.proposed.description.en = 'x'.repeat(301);
  assert.throws(() => buildPreview(proposal, capture), error => error instanceof ReportedError && error.report.problems.length === 1 && /301 characters exceeds the tooltip budget of 300/.test(error.report.problems[0]));
  const retained = proposalFixture(), kept = retained.proposal.resources[4];
  for (const source of [retained.capture.resources.find(x => x.id === kept.id), kept.original, kept.proposed]) source.description = { en: 'y'.repeat(301) };
  retained.proposal.capture_sha256 = hash(retained.capture);
  assert(buildPreview(retained.proposal, retained.capture).warnings.some(w => /existing description\.en: 301 characters/.test(w)));
});

test('proposals violating Luzmo limits are reported together before review', () => {
  const { capture, proposal } = proposalFixture(), r = proposal.resources[3];
  r.proposed.description = { en: 'x'.repeat(4001), 'en-GB': ' Net revenue ', 'pt-BR': 'Net revenue' };
  assert.throws(() => buildPreview(proposal, capture), error => error instanceof ReportedError && error.report.problems.length === 3 && error.report.problems.some(p => /4001 characters exceeds the Luzmo limit of 4000/.test(p)) && error.report.problems.some(p => /pt-BR: unsupported locale/.test(p)) && error.report.problems.some(p => /en-GB: remove leading/.test(p)));
  const unsupported = proposalFixture(); unsupported.proposal.languages = ['en', 'pt-BR'];
  assert.throws(() => buildPreview(unsupported.proposal, unsupported.capture), /supported Luzmo locales/);
});

test('apply CLI writes a record only after verified success', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'luzmo-apply-cli-')), path = join(parent, 'demo');
  await demoMain({ workspace: path });
  await reviewMain({ workspace: path });
  const preview = JSON.parse(await readFile(join(path, 'artifacts/update-preview.json'), 'utf8')), capture = JSON.parse(await readFile(join(path, 'artifacts/capture.json'), 'utf8'));
  const approval = join(path, 'approval.json');
  await writeJson(approval, { schema_version: 1, preview_sha256: hash(preview), reviewer: 'Synthetic reviewer', reviewed_at: '2026-10-28T12:00:00Z', approved_ids: preview.changes.map(c => c.id) });
  const failing = fakeApi(capture, { write: () => { throw Object.assign(new Error('rejected'), { status: 400 }); } });
  await assert.rejects(applyMain({ workspace: path, approval, execute: true }, { api: failing }), /Apply stopped/);
  assert(!(await readdir(join(path, 'artifacts'))).includes('applied'));
  await applyMain({ workspace: path, approval, execute: true }, { api: fakeApi(capture) });
  assert.equal((await readdir(join(path, 'artifacts/applied'))).length, 1);
});

test('apply backs up live values before writing and restore puts them back after confirmation', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'luzmo-restore-cli-')), path = join(parent, 'demo');
  await demoMain({ workspace: path });
  await reviewMain({ workspace: path });
  const preview = JSON.parse(await readFile(join(path, 'artifacts/update-preview.json'), 'utf8')), capture = JSON.parse(await readFile(join(path, 'artifacts/capture.json'), 'utf8'));
  const approval = join(path, 'approval.json');
  await writeJson(approval, { schema_version: 1, preview_sha256: hash(preview), reviewer: 'Synthetic reviewer', reviewed_at: '2026-10-28T12:00:00Z', approved_ids: preview.changes.map(c => c.id) });
  let backedUpBeforeWrite = false;
  const api = fakeApi(capture, { write: () => { backedUpBeforeWrite = true; } });
  await assert.rejects(applyMain({ workspace: path, approval, execute: true }, { api: fakeApi(capture, { write: () => { throw Object.assign(new Error('rejected'), { status: 400 }); } }) }), /Apply stopped/);
  assert.deepEqual((await readdir(join(path, 'artifacts/backups'))).filter(f => f !== 'manifest.json').length, 1);
  const result = await applyMain({ workspace: path, approval, execute: true }, { api });
  assert(backedUpBeforeWrite);
  const backup = JSON.parse(await readFile(join(path, result.backup), 'utf8')), changed = preview.changes[0];
  assert.deepEqual(backup.resources.map(r => r.id), [changed.id]);
  assert.deepEqual({ description: backup.resources[0].description, ai_context: backup.resources[0].ai_context }, changed.before);
  assert.deepEqual(metadata(api.rows.get(changed.id)), changed.target);

  const plan = await restoreMain({ workspace: path, backup: join(path, result.backup) }, { api });
  assert.equal(plan.changes.length, 1); assert(api.calls.slice(-1).every(c => c.action === 'get'));
  await assert.rejects(restoreMain({ workspace: path, backup: join(path, result.backup), execute: true }, { api }), /plan-sha256/);
  await assert.rejects(restoreMain({ workspace: path, backup: join(path, result.backup), execute: true, 'plan-sha256': 'stale' }, { api }), /nothing was written/);
  await assert.rejects(restoreMain({ workspace: path, backup: join(path, result.backup), ids: '99999999-9999-4999-8999-999999999999' }, { api }), /Not in this backup/);
  const restored = await restoreMain({ workspace: path, backup: join(path, result.backup), execute: true, 'plan-sha256': hash(plan) }, { api });
  assert.equal(restored.applied, 1);
  assert.deepEqual(metadata(api.rows.get(changed.id)), changed.before);
  const undo = JSON.parse(await readFile(join(path, restored.backup), 'utf8'));
  assert.deepEqual({ description: undo.resources[0].description, ai_context: undo.resources[0].ai_context }, changed.target);
  assert.equal((await restoreMain({ workspace: path, backup: join(path, result.backup) }, { api })).changes.length, 0);
});

test('restore refuses files that are not unmodified toolkit backups', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'luzmo-restore-guard-')), path = join(parent, 'demo');
  await demoMain({ workspace: path });
  await reviewMain({ workspace: path });
  const preview = JSON.parse(await readFile(join(path, 'artifacts/update-preview.json'), 'utf8')), capture = JSON.parse(await readFile(join(path, 'artifacts/capture.json'), 'utf8'));
  const approval = join(path, 'approval.json');
  await writeJson(approval, { schema_version: 1, preview_sha256: hash(preview), reviewer: 'Synthetic reviewer', reviewed_at: '2026-10-28T12:00:00Z', approved_ids: preview.changes.map(c => c.id) });
  const api = fakeApi(capture), result = await applyMain({ workspace: path, approval, execute: true }, { api });
  const saved = JSON.parse(await readFile(join(path, result.backup), 'utf8'));
  const forged = join(path, 'artifacts/backups/metadata-forged.json');
  await writeJson(forged, saved);
  await assert.rejects(restoreMain({ workspace: path, backup: forged }, { api }), /not a metadata backup listed/);
  const outside = join(path, 'backup-copy.json');
  await writeJson(outside, saved);
  await assert.rejects(restoreMain({ workspace: path, backup: outside }, { api }), /only accepts backups saved by this toolkit/);
  saved.resources[0].description = { en: 'Edited after the backup was taken.' };
  await writeJson(join(path, result.backup), saved);
  await assert.rejects(restoreMain({ workspace: path, backup: join(path, result.backup) }, { api }), /changed after it was saved/);
});

test('a not-ready review cannot be applied even with a matching approval', async () => {
  const { approvedChanges } = await import('./apply-lib.mjs');
  const parent = await mkdtemp(join(tmpdir(), 'luzmo-not-ready-')), path = join(parent, 'demo');
  await demoMain({ workspace: path });
  await reviewMain({ workspace: path });
  const preview = { ...JSON.parse(await readFile(join(path, 'artifacts/update-preview.json'), 'utf8')), verdict: 'not-ready' };
  const approval = { schema_version: 1, preview_sha256: hash(preview), reviewer: 'Synthetic reviewer', reviewed_at: '2026-10-28T12:00:00Z', approved_ids: preview.changes.map(c => c.id) };
  assert.throws(() => approvedChanges(preview, approval), /verdict is "not-ready"/);
});

test('synthetic demo and review produce consistent offline artifacts', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'luzmo-semantic-layer-test-')), path = join(parent, 'demo');
  await demoMain({ workspace: path });
  await reviewMain({ workspace: path });
  const preview = JSON.parse(await readFile(join(path, 'artifacts/update-preview.json'), 'utf8'));
  const approval = JSON.parse(await readFile(join(path, 'artifacts/approval.template.json'), 'utf8'));
  assert.equal(preview.summary.reviewed, 6); assert.equal(preview.changes.length, 1);
  assert.equal(hash(preview), approval.preview_sha256); assert.deepEqual(approval.approved_ids, []);
});

test('collector captures expressions and dashboard usage with inline records stripped', async () => {
  const path = await mkdtemp(join(tmpdir(), 'luzmo-capture-test-'));
  const config = { ...configFixture(), dashboard_limit: 10, discovery_max_pages: 2 };
  await writeJson(join(path, 'config.json'), config);
  const dataset = clone(syntheticCapture.resources[0]);
  const dashboardId = '77777777-7777-4777-8777-777777777777';
  dataset.columns = syntheticCapture.resources.slice(1).map(clone);
  dataset.formulas = [{ id: '88888888-8888-4888-8888-888888888888', name: { en: 'Fictional sum' }, expression: 'SUM(1)', description: null, ai_context: null }];
  dataset.dashboards = [{ id: dashboardId }];
  const api = { host: syntheticCapture.host, async request(resource, fields) {
    assert.equal(fields.action, 'get');
    return { rows: fields.find.where.id === dataset.id ? [dataset] : [{ id: dashboardId, type: 'dashboard', contents: { column: syntheticCapture.resources[3].id, inlineData: ['private-row'] } }] };
  } };
  await collectMain({ workspace: path }, { api });
  const capture = JSON.parse(await readFile(join(path, 'artifacts/capture.json'), 'utf8'));
  assert.equal(capture.complete, true); assert.equal(capture.resources.length, 7);
  assert(!capture.resources.some(r => r.kind === 'dashboard'));
  assert.equal(capture.dashboards[0].contents.column, syntheticCapture.resources[3].id);
  assert.equal(capture.resources.find(r => r.kind === 'formula').expression, 'SUM(1)');
  assert.equal(capture.dashboards[0].references[0].id, syntheticCapture.resources[3].id);
  assert(!JSON.stringify(capture).includes('private-row'));
});

test('discovery reports cap instead of silently claiming complete inventory', async () => {
  const path = await mkdtemp(join(tmpdir(), 'luzmo-discover-test-'));
  await mkdir(join(path, 'artifacts'));
  await writeJson(join(path, 'config.json'), { ...configFixture(), discovery_max_pages: 1 });
  const api = { host: syntheticCapture.host, async request() { return { rows: Array.from({ length: 100 }, (_, i) => ({ id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`, name: { en: 'Synthetic dataset' } })) }; } };
  await collectMain({ workspace: path, discover: true }, { api });
  const discovery = JSON.parse(await readFile(join(path, 'artifacts/discovery.json'), 'utf8'));
  assert.equal(discovery.complete, false); assert.equal(discovery.datasets.length, 100);
});

test('an unknown API token stops before anonymous requests can return public datasets', async () => {
  const path = await envWorkspace({ LUZMO_API_KEY: 'synthetic-test-key', LUZMO_API_TOKEN: 'synthetic-test-token', LUZMO_API_HOST: 'https://api.example.invalid' });
  await mkdir(join(path, 'artifacts'));
  await writeJson(join(path, 'config.json'), { ...configFixture(), dashboard_limit: 10 });
  const publicDatasets = Array.from({ length: 37 }, (_, i) => ({ id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`, name: { en: 'Public demo dataset' }, type: 'dataset' }));
  const luzmo = known => {
    const resources = [];
    return { resources, fetcher: async url => {
      const resource = url.pathname.split('/').pop();
      resources.push(resource);
      const rows = resource === 'user' ? (known ? [{ id: 'synthetic-user' }] : []) : known ? [] : publicDatasets;
      return { ok: true, status: 200, text: async () => JSON.stringify({ rows }) };
    } };
  };
  for (const discover of [true, false]) {
    const anonymous = luzmo(false);
    await assert.rejects(collectMain({ workspace: path, discover }, { api: await client(path, { fetcher: anonymous.fetcher }) }), error => error.refused && /does not recognize .*LUZMO_API_HOST/s.test(error.message));
    assert.deepEqual(anonymous.resources, ['user']);
  }
  await assert.rejects(readFile(join(path, 'artifacts/discovery.json'), 'utf8'), { code: 'ENOENT' });
  const exitCode = process.exitCode;
  try {
    await collectMain({ workspace: path, discover: true }, { api: await client(path, { fetcher: luzmo(true).fetcher }) });
    assert.equal(process.exitCode, 1);
  } finally { process.exitCode = exitCode; }
});

test('default connected data needs no tenant identifier, confirmation question or timezone config', () => {
  const config = configFixture();
  delete config.timezone;
  config.datasets[0].scope = { mode: 'default-connection', rationale: 'Inspected default source; no relevant target column.', filters: [] };
  config.datasets[0].profile.from = '2026-10-01';
  config.datasets[0].profile.to = '2026-10-08';
  const plan = buildProfile(config, syntheticCapture);
  assert.equal(plan.jobs[0].authentication, 'api');
  assert.equal(plan.jobs[0].query.options.timezone_id, 'UTC');
  assert.equal(plan.jobs[0].query.where.length, 2);
  assert.equal(plan.jobs[0].query.where[0].parameters[1], '2026-10-01T00:00:00.000Z');
  config.datasets[0].profile.from = '2026-02-30';
  assert.throws(() => buildProfile(config, syntheticCapture), /Invalid date-only/);
});

test('embed profiling uses the API capture schema and keeps a documented mock-data assessment', () => {
  const config = configFixture();
  config.datasets[0].scope = { mode: 'embed-context', rationale: 'Default mock source insufficient; user supplied intended end-user context.', filters: [] };
  config.datasets[0].profile.authentication = 'embed';
  config.datasets[0].profile.data_assessment = { classification: 'mock', sufficiency: 'insufficient', basis: 'Default source documented as structural demo only.' };
  const plan = buildProfile(config, syntheticCapture);
  assert(plan.jobs.every(j => j.authentication === 'embed'));
  assert.equal(plan.jobs[0].data_assessment.sufficiency, 'insufficient');
  config.datasets[0].profile.columns[0].id = '99999999-9999-4999-8999-999999999999';
  assert.throws(() => buildProfile(config, syntheticCapture), /not in captured dataset/);
});

test('embed credentials only query data and never fall back to API credentials', async () => {
  const values = { LUZMO_API_KEY: 'synthetic-api-key', LUZMO_API_TOKEN: 'synthetic-api-token', LUZMO_EMBED_KEY: 'synthetic-embed-key', LUZMO_EMBED_TOKEN: 'synthetic-embed-token', LUZMO_API_HOST: 'https://api.example.invalid' };
  let body;
  const api = await client(await envWorkspace(values), { credentialMode: 'embed', fetcher: async (url, options) => { body = JSON.parse(options.body); return { ok: true, status: 200, text: async () => url.pathname.endsWith('/user') ? '{"rows":[{"id":"synthetic-end-user"}]}' : '{"data":[],"rows":[]}' }; } });
  await api.request('data', { action: 'get', find: { queries: [] } });
  assert.equal(body.key, 'synthetic-embed-key'); assert.equal(body.token, 'synthetic-embed-token');
  const dataset = syntheticCapture.selection[0];
  for (const [resource, fields] of [
    ['securable', { action: 'update' }],
    ['securable', { action: 'get', find: { where: { id: dataset, type: 'dataset' }, attributes: ['id', 'type'], limit: 1 } }],
    ['securable', { action: 'get', find: { where: { type: 'dataset' }, attributes: ['id'] } }],
    ['securable', { action: 'get', find: { where: { id: dataset, type: 'dashboard' }, attributes: ['id'] } }],
    ['securable', { action: 'get', find: { where: { id: dataset, type: 'dataset' }, attributes: ['id', 'description'] } }],
    ['securable', { action: 'get', find: { where: { id: dataset, type: 'dataset' }, attributes: ['id'], include: [{ model: 'Column' }] } }],
    ['column', { action: 'get', find: { where: { id: dataset } } }],
    ['formula', { action: 'get', find: {} }],
    ['airule', { action: 'get', find: {} }],
    ['agent', { action: 'get', find: {} }],
  ]) await assert.rejects(api.request(resource, fields), /permitted client mode/, `${resource} ${JSON.stringify(fields)}`);
  await assert.rejects(client(tmpdir(), { credentialMode: 'embed', allowWrites: true }), /read-only/);
  const { LUZMO_EMBED_TOKEN, ...withoutEmbedToken } = values;
  await assert.rejects(client(await envWorkspace(withoutEmbedToken), { credentialMode: 'embed' }), /No credential fallback/);
});


test('embed profiling sends only data queries with embed credentials and never retries with broader access', async () => {
  const path = await mkdtemp(join(tmpdir(), 'luzmo-embed-profile-test-'));
  const config = configFixture();
  config.datasets[0].scope = { mode: 'embed-context', rationale: 'User supplied intended real end-user context.', filters: [] };
  config.datasets[0].profile.authentication = 'embed';
  config.datasets[0].profile.columns = [];
  await writeJson(join(path, 'config.json'), config);
  await mkdir(join(path, 'artifacts'));
  await writeJson(join(path, 'artifacts/capture.json'), syntheticCapture);
  await profileMain({ workspace: path });
  const plan = JSON.parse(await readFile(join(path, 'artifacts/profile-plan.json'), 'utf8'));
  const modes = [], resources = [];
  await profileMain({ workspace: path, execute: true, 'plan-sha256': hash(plan) }, { clientFactory: async (_path, options) => {
    modes.push(options.credentialMode);
    return { host: syntheticCapture.host, async request(resource) { resources.push(resource); return { data: [[3, '2026-10-01', '2026-10-07']] }; } };
  } });
  assert.deepEqual(modes, ['embed']);
  const results = JSON.parse(await readFile(join(path, 'artifacts/profile-results.json'), 'utf8'));
  assert.deepEqual([...new Set(resources)], ['data']);
  assert.equal(results.complete, true);
  let requests = 0;
  const rowCheck = fields => fields.find.queries[0].limit.by === 1 && fields.find.queries[0].options.rollup_data === false;
  await assert.rejects(profileMain({ workspace: path, execute: true, 'plan-sha256': hash(plan) }, { clientFactory: async (_path, options) => {
    assert.equal(options.credentialMode, 'embed');
    return { host: syntheticCapture.host, async request(_resource, fields) { requests++; if (rowCheck(fields)) return { data: [['tenant-demo']] }; throw new Error('Synthetic expired token.'); } };
  } }), error => /Profile stopped at "Cohort overview/.test(error.message) && /Synthetic expired token/.test(error.message) && /Embed token is unexpired/.test(error.message));
  assert.equal(requests, 2);
  requests = 0;
  await assert.rejects(profileMain({ workspace: path, execute: true, 'plan-sha256': hash(plan) }, { clientFactory: async () => ({ host: syntheticCapture.host, async request() { requests++; return { data: [] }; } }) }),
    error => /Embed token is not ready/.test(error.message) && /sees 0 rows/.test(error.message) && /embed-access\.mjs/.test(error.message));
  assert.equal(requests, 1);
});

test('a timed-out check falls back to one scoped, unordered row sample and other failures still stop', async () => {
  const path = await mkdtemp(join(tmpdir(), 'luzmo-sample-profile-test-'));
  const config = configFixture();
  config.datasets[0].profile.columns.push({ id: syntheticCapture.resources[5].id, kind: 'category', values_approved: true });
  await writeJson(join(path, 'config.json'), config);
  await mkdir(join(path, 'artifacts'));
  await writeJson(join(path, 'artifacts/capture.json'), syntheticCapture);
  await profileMain({ workspace: path });
  const plan = JSON.parse(await readFile(join(path, 'artifacts/profile-plan.json'), 'utf8'));
  const [sample] = plan.samples;
  assert.equal(sample.query.options.rollup_data, false);
  assert.equal(sample.query.limit.by, 1000);
  assert.deepEqual(sample.query.where, [{ expression: '? = ?', parameters: [{ dataset_id: sample.dataset_id, column_id: syntheticCapture.resources[1].id }, 'tenant-demo'] }]);
  assert.deepEqual(sample.query.dimensions.map(d => d.level ?? d.discretization?.type ?? null), [9, 'none', null]);
  const rows = [['2026-10-02T00:00:00.000Z', 5, { id: 'paid' }], ['2026-10-01T00:00:00.000Z', 0, { id: 'paid' }], ['2026-10-03T00:00:00.000Z', -2, { id: 'refunded' }], [null, null, null]];
  const timeout = () => Object.assign(new Error('No response from https://api.example.invalid within 30 s for data get.'), { timeout: true, uncertain: true });
  let sampleRequests = 0;
  await profileMain({ workspace: path, execute: true, 'plan-sha256': hash(plan) }, { clientFactory: async () => ({ host: syntheticCapture.host, async request(_resource, fields) {
    const [q] = fields.find.queries;
    if (q.options.rollup_data === false) { sampleRequests++; return { data: rows }; }
    if (q.measures.some(m => m.aggregation.type === 'min') && q.measures[1].column_id === syntheticCapture.resources[2].id) return { data: [[4, '2026-10-01', '2026-10-03']] };
    throw timeout();
  } }) });
  const results = JSON.parse(await readFile(join(path, 'artifacts/profile-results.json'), 'utf8'));
  assert.equal(sampleRequests, 1);
  assert.equal(results.complete, true);
  assert.equal(results.jobs[0].source, 'aggregate');
  assert(results.jobs.slice(1).every(j => j.source === 'sample' && j.sample_rows === 4 && !j.error && /within 30 s/.test(j.aggregate_timeout)));
  assert.deepEqual(results.jobs.map(j => j.data), [[[4, '2026-10-01', '2026-10-03']], [[4, 3, -2, 5]], [[1]], [[1]], [['paid', 2], ['refunded', 1], [null, 1]]]);
  assert.equal(JSON.parse(await readFile(join(path, `artifacts/${results.samples[0].file}`), 'utf8')).rows.length, 4);
  await assert.rejects(profileMain({ workspace: path, execute: true, 'plan-sha256': hash(plan) }, { clientFactory: async () => ({ host: syntheticCapture.host, async request() { throw new Error('Column not found.'); } }) }), /Profile stopped at "Cohort overview.*Column not found/s);
  await assert.rejects(profileMain({ workspace: path, execute: true, 'plan-sha256': hash(plan) }, { clientFactory: async () => ({ host: syntheticCapture.host, async request() { throw timeout(); } }) }), /1000-row sample fallback also failed/);
});

test('inspection plans bound every check, AND the dataset scope and refuse unselective or oversized checks', () => {
  const [dataset, tenant, date, revenue, line, status] = syntheticCapture.resources.map(r => r.id);
  const plan = file => buildInspection(configFixture(), syntheticCapture, { checks: Array.isArray(file) ? file : [file] });
  const rows = { id: 'rows', question: 'What do the last refund lines of one order look like?', dataset_id: dataset, mode: 'rows', columns: [line, revenue, date], filters: [{ column_id: status, op: '=', value: 'refunded' }], date: { column_id: date, from: '2026-10-01', to: '2026-10-05' }, order: [{ column_id: date, direction: 'desc' }], timezone: 'Europe/Brussels' };
  const [c] = plan(rows).checks;
  assert.equal(c.query.limit.by, 20); assert.equal(c.query.options.rollup_data, false); assert.equal(c.query.options.timezone_id, 'Europe/Brussels');
  assert.deepEqual(c.query.where[0], { expression: '? = ?', parameters: [{ dataset_id: dataset, column_id: tenant }, 'tenant-demo'] });
  assert.deepEqual(c.query.where.map(w => w.expression), ['? = ?', '? = ?', '? >= ?', '? < ?']);
  assert.deepEqual(c.query.order, [{ dataset_id: dataset, column_id: date, order: 'desc' }]);
  assert.deepEqual(c.query.dimensions.map(d => d.level ?? d.discretization?.type ?? null), [null, 'none', 9]);
  assert(c.scope.includes('tenant_id = "tenant-demo"') && c.scope.includes('Europe/Brussels') && c.scope.includes('2026-10-05T00:00:00.000Z') && c.scope.includes('status = "refunded"'));
  const aggregate = { id: 'agg', question: 'Do refunds cluster around zero?', dataset_id: dataset, mode: 'aggregate', filters: [{ column_id: line, op: 'in', values: ['a', 'b'] }, { column_id: revenue, op: '<=', value: 0 }], aggregates: [{ column_id: '*', type: 'count' }, { column_id: revenue, type: 'avg' }, { column_id: revenue, type: 'sum' }], group_by: [status] };
  const [a] = plan(aggregate).checks;
  assert.equal(a.query.limit.by, 20); assert.equal(a.query.options.rollup_data, true);
  assert.deepEqual(a.query.measures.map(m => m.aggregation.type), ['count', 'average', 'sum']);
  assert.deepEqual(a.query.where[1], { expression: '? in ?', parameters: [{ dataset_id: dataset, column_id: line }, ['a', 'b']] });
  for (const [mutate, pattern] of [
    [x => { x.filters = []; delete x.date; }, /selective filter/],
    [x => { x.filters = [{ column_id: revenue, op: '<', value: 0 }]; delete x.date; }, /selective filter/],
    [x => { delete x.timezone; }, /timezone is required/],
    [x => { x.timezone = 'Mars/Base'; }, /unknown timezone/],
    [x => { x.columns = Array(9).fill(line); }, /at most 8/],
    [x => { x.limit = 101; }, /limit must be/],
    [x => { x.date.to = '2026-12-01'; }, /at most 31 days/],
    [x => { x.columns = ['99999999-9999-4999-8999-999999999999']; }, /not in the captured dataset/],
    [x => { x.dataset_id = '99999999-9999-4999-8999-999999999999'; }, /not a selected/],
    [x => { x.filters = [{ column_id: status, op: 'in', values: Array(11).fill('x') }]; }, /1-10 scalar/],
    [x => { x.filters = [{ column_id: status, op: 'like', value: 'x' }]; }, /op must be/],
    [x => { x.order = [{ column_id: tenant, direction: 'asc' }]; }, /projected column/],
    [x => { x.question = ' '; }, /outstanding question/],
    [x => { x.join = 'other'; }, /unknown field/],
  ]) { const x = clone(rows); mutate(x); assert.throws(() => plan(x), pattern); }
  for (const [mutate, pattern] of [
    [x => { x.aggregates = [{ column_id: status, type: 'distinct_count' }]; x.filters = [{ column_id: line, op: 'in', values: ['a'] }]; }, /entity-equality/],
    [x => { x.group_by = [status, line, tenant]; }, /at most 2/],
    [x => { x.aggregates = [{ column_id: '*', type: 'sum' }]; }, /only count/],
    [x => { x.aggregates = [{ column_id: status, type: 'sum' }]; }, /numeric column/],
    [x => { x.columns = [line]; }, /no columns/],
  ]) { const x = clone(aggregate); mutate(x); assert.throws(() => plan(x), pattern); }
  const distinct = clone(aggregate); distinct.aggregates = [{ column_id: status, type: 'distinct_count' }]; distinct.filters = [{ column_id: line, op: '=', value: 'a' }];
  assert.equal(plan(distinct).checks[0].query.measures[0].aggregation.type, 'distinctcount');
  assert.throws(() => plan(Array(31).fill(rows).map((x, i) => ({ ...x, id: `r${i}` }))), /Query budget exceeded/);
  assert.throws(() => plan([rows, rows]), /unique/);
  const config = configFixture(); config.datasets[0].scope.confirmed = false;
  assert.throws(() => buildInspection(config, syntheticCapture, { checks: [rows] }), /scope\.confirmed/);
});

test('inspection runs without an approval hash, merges results by id and continues after a timeout', async () => {
  const path = await mkdtemp(join(tmpdir(), 'luzmo-inspect-test-'));
  const [dataset, , date, revenue, line] = syntheticCapture.resources.map(r => r.id);
  await writeJson(join(path, 'config.json'), configFixture());
  await mkdir(join(path, 'artifacts'));
  await writeJson(join(path, 'artifacts/capture.json'), syntheticCapture);
  const check = (id, extra = {}) => ({ id, question: `Question ${id}?`, dataset_id: dataset, mode: 'rows', columns: [line, revenue], filters: [{ column_id: line, op: '=', value: 'L-1' }], ...extra });
  await writeJson(join(path, 'checks.json'), { checks: [check('first'), check('slow', { date: { column_id: date, from: '2026-10-01', to: '2026-10-02' }, timezone: 'UTC' }), check('last', { mode: 'aggregate', columns: undefined, aggregates: [{ column_id: revenue, type: 'min' }, { column_id: revenue, type: 'max' }] })] });
  let output = '';
  const original = process.stdout.write; process.stdout.write = chunk => { output += chunk; return true; };
  try { await inspectMain({ workspace: path, checks: join(path, 'checks.json'), 'dry-run': true }, { clientFactory: async () => { throw new Error('dry run needs no client'); } }); } finally { process.stdout.write = original; }
  assert(output.includes('Dry run: 3 read-only queries') && output.includes('"expression":"? = ?"'));
  await assert.rejects(readFile(join(path, 'artifacts/inspections.json')), { code: 'ENOENT' });
  const sent = [], modes = [];
  const factory = async (_path, options) => { modes.push(options.credentialMode); return { host: syntheticCapture.host, async request(resource, fields) {
    sent.push([resource, fields]);
    const [q] = fields.find.queries;
    if (q.where.length === 4) throw Object.assign(new Error('No response from https://api.example.invalid within 30 s for data get.'), { timeout: true, uncertain: true });
    return { data: q.options.rollup_data ? [[-5, 12]] : [['L-1', 10], ['L-1', -3]] };
  } }; };
  await inspectMain({ workspace: path, checks: join(path, 'checks.json') }, { clientFactory: factory });
  assert.deepEqual([...new Set(sent.map(s => s[0]))], ['data']); assert.deepEqual(modes, ['api']); assert.equal(sent.length, 3);
  let saved = JSON.parse(await readFile(join(path, 'artifacts/inspections.json'), 'utf8'));
  assert.deepEqual(saved.inspections.map(i => i.id), ['first', 'slow', 'last']);
  assert.equal(saved.inspections[0].row_count, 2); assert.deepEqual(saved.inspections[0].results, [['L-1', 10], ['L-1', -3]]);
  assert(saved.inspections[0].scope.includes('tenant_id = "tenant-demo"') && saved.inspections[0].query.where.length === 2);
  assert(saved.inspections[1].timed_out && /narrower date window/.test(saved.inspections[1].hint) && !saved.inspections[1].results);
  assert(!JSON.stringify(saved).includes('synthetic-'));
  await writeJson(join(path, 'checks.json'), { checks: [check('slow')] });
  await inspectMain({ workspace: path, checks: join(path, 'checks.json') }, { clientFactory: factory });
  saved = JSON.parse(await readFile(join(path, 'artifacts/inspections.json'), 'utf8'));
  assert.deepEqual(saved.inspections.map(i => i.id), ['first', 'last', 'slow']); assert.equal(saved.inspections[2].row_count, 2);
  await assert.rejects(inspectMain({ workspace: path, checks: join(path, 'checks.json') }, { clientFactory: async () => ({ host: syntheticCapture.host, async request() { throw new Error('Column not found.'); } }) }), /Inspection stopped at "slow".*Column not found/);
  assert.equal(JSON.parse(await readFile(join(path, 'artifacts/inspections.json'), 'utf8')).inspections.at(-1).error, 'Column not found.');
  await assert.rejects(inspectMain({ workspace: path, checks: join(path, 'checks.json') }, { clientFactory: async () => ({ host: 'https://other.example.invalid', request: async () => ({}) }) }), /capture came from/);
});

test('a successful metadata write with a failed readback is reconciled and restored', async () => {
  const { capture, proposal } = proposalFixture(), changes = buildPreview(proposal, capture).changes;
  let reads = 0;
  const api = fakeApi(capture, { read() { if (++reads === 3) throw new Error('Transient readback failure'); } });
  await assert.rejects(applyChanges(api, changes, { execute: true }), error => {
    assert.equal(error.report.stopped_at.stage, 'readback');
    assert.equal(error.report.rollback[0].id, changes[0].id);
    assert.equal(error.report.rollback[0].status, 'rolled-back');
    return true;
  });
  assert.deepEqual(metadata(api.rows.get(changes[0].id)), changes[0].before);
});

test('unreadable metadata recovery reports the attempted resource and restore values', async () => {
  const { capture, proposal } = proposalFixture(), changes = buildPreview(proposal, capture).changes;
  let reads = 0;
  const api = fakeApi(capture, { read() { if (++reads >= 3) throw new Error('Connection unavailable'); } });
  await assert.rejects(applyChanges(api, changes, { execute: true }), error => {
    assert.equal(error.report.rollback[0].status, 'not-rolled-back');
    assert.deepEqual(error.report.rollback[0].restore, changes[0].before);
    assert.deepEqual(error.report.stopped_at.attempted, changes[0].properties);
    return true;
  });
  assert.deepEqual(metadata(api.rows.get(changes[0].id)), changes[0].target);
});

test('a focused translation reviews only selected fields and renders them without a dataset assessment', () => {
  const capture = clone(syntheticCapture), id = capture.resources[3].id;
  const proposal = seedProposal(capture, ['en', 'fr'], { resource_ids: [id], rationale: 'Translate this field only.' });
  proposal.verdict = 'ready'; proposal.business_brief = 'Supplied field definition.';
  const r = proposal.resources[0]; r.disposition = 'revise'; r.assessment = 'Adds the requested French meaning.';
  r.evidence = ['Supplied source metadata.']; r.proposed.description.fr = 'Revenu net en EUR, hors taxes. Les remboursements sont négatifs.';
  const preview = buildPreview(proposal, capture), rendered = renderReview(proposal, preview);
  assert.equal(preview.summary.reviewed, 1);
  assert.equal(preview.summary.excluded, capture.resources.length - 1);
  assert.equal(preview.changes[0].id, id);
  assert(rendered.html.includes(`id="resource-${id}"`));
  assert(rendered.html.includes('Translate this field only.'));
  assert.deepEqual(r.proposed.description.en, r.original.description.en);
  assert.deepEqual(r.proposed.ai_context, r.original.ai_context);
  const outside = clone(proposal); outside.scope.resource_ids = [capture.resources[0].id];
  assert.throws(() => buildPreview(outside, capture), /declared scope/);
});

test('metadata rendering can proceed when optional knowledge capture has no proposal', async () => {
  const path = join(await mkdtemp(join(tmpdir(), 'luzmo-focused-')), 'demo');
  await demoMain({ workspace: path });
  const { unlink } = await import('node:fs/promises');
  await unlink(join(path, 'artifacts/knowledge-proposal.json'));
  await reviewMain({ workspace: path });
  const html = await readFile(join(path, 'artifacts/review.html'), 'utf8');
  assert(html.includes('id="dataset-view"'));
  assert(!html.includes('id="knowledge-view"'));
});

test('CLI apply accepts a baseline-bound preview and saves verified recovery to disk', async () => {
  const { buildBaseline } = await import('./baseline-lib.mjs');
  const { capture, proposal } = proposalFixture();
  const path = await mkdtemp(join(tmpdir(), 'luzmo-recovery-record-'));
  await mkdir(join(path, 'artifacts'));
  await writeJson(join(path, 'config.json'), configFixture());
  await writeJson(join(path, 'artifacts/capture.json'), capture);
  await writeJson(join(path, 'artifacts/proposal.json'), proposal);
  await writeJson(join(path, 'artifacts/baseline.json'), buildBaseline(capture, [{ path: 'earlier capture', value: capture }]));
  await reviewMain({ workspace: path });
  const preview = JSON.parse(await readFile(join(path, 'artifacts/update-preview.json'), 'utf8'));
  const approval = join(path, 'approval.json');
  await writeJson(approval, { schema_version: 1, reviewer: 'Fictional reviewer', reviewed_at: new Date().toISOString(), preview_sha256: hash(preview), approved_ids: preview.changes.map(c => c.id) });
  await applyMain({ workspace: path, approval }, { api: fakeApi(capture) });
  let wrote = false, failed = false;
  const api = fakeApi(capture, { afterWrite() { wrote = true; }, read() { if (wrote && !failed) { failed = true; throw new Error('Lost readback'); } } });
  await assert.rejects(applyMain({ workspace: path, approval, execute: true }, { api }), error => error.report.rollback[0].status === 'rolled-back');
  const files = await readdir(join(path, 'artifacts/recovery'));
  assert.equal(files.length, 1);
  const record = JSON.parse(await readFile(join(path, 'artifacts/recovery', files[0]), 'utf8'));
  assert.equal(record.stopped_at.stage, 'readback');
  assert.equal(record.rollback[0].status, 'rolled-back');
  assert(record.backup.startsWith('artifacts/backups/metadata-'));
  assert.deepEqual(metadata(api.rows.get(preview.changes[0].id)), preview.changes[0].before);
});

test('a focused baseline review does not treat unrelated earlier follow-ups as dropped work', async () => {
  const { buildBaseline, regressionCandidates, reviewRegressions } = await import('./baseline-lib.mjs');
  const { capture, proposal: earlier } = proposalFixture();
  const outside = capture.resources[5].id, selected = capture.resources[3].id;
  earlier.calculation_changes.push({ title: 'An unrelated earlier decision', resource_ids: [outside] });
  earlier.evaluation_cases.push({ question: 'Unrelated status question', expected_resource_ids: [outside] });
  const baseline = buildBaseline(capture, [{ path: 'earlier', value: earlier }]);
  const proposal = seedProposal(capture, ['en'], { resource_ids: [selected], rationale: 'Selected field only.' });
  const candidates = regressionCandidates(proposal, baseline);
  assert(!candidates.some(c => ['follow-up-dropped', 'evaluation-dropped'].includes(c.check)));
  const captured = buildBaseline(capture, [{ path: 'old capture', value: capture }]);
  const summary = reviewRegressions(proposal, captured, capture).summary;
  assert.equal(summary.shared, 1);
  assert.equal(Object.values(summary.coverage).reduce((a, b) => a + b, 0), 1);
});

test('the .env parser accepts a byte-order mark, quotes, comments and # inside values', async () => {
  const { parseEnvText } = await import('./common.mjs');
  const bom = String.fromCharCode(0xFEFF);
  assert.deepEqual(parseEnvText(`${bom}LUZMO_API_KEY=k1\r\nexport LUZMO_API_TOKEN="t#2"\n# note\nLUZMO_API_HOST=https://api.luzmo.com # EU\nOTHER='a # b'\n`), { LUZMO_API_KEY: 'k1', LUZMO_API_TOKEN: 't#2', LUZMO_API_HOST: 'https://api.luzmo.com', OTHER: 'a # b' });
  assert.equal(parseEnvText('TOKEN=ab#cd').TOKEN, 'ab#cd');
  assert.throws(() => parseEnvText('KEY="unclosed'), /unclosed quote at line 1/);
  assert.throws(() => parseEnvText('not a pair'), /line 1/);
});

test('scripts still run when the skill is reached through a symlink or junction', async () => {
  const { symlink } = await import('node:fs/promises'), { execFile } = await import('node:child_process'), { fileURLToPath } = await import('node:url');
  const linked = join(await mkdtemp(join(tmpdir(), 'luzmo-linked-')), 'scripts');
  await symlink(fileURLToPath(new URL('.', import.meta.url)), linked, 'junction');
  const outcome = await new Promise(done => execFile(process.execPath, [join(linked, 'review.mjs')], (error, stdout, stderr) => done({ code: error?.code ?? 0, stderr })));
  assert.equal(outcome.code, 1);
  assert.match(outcome.stderr, /Provide --workspace/);
});

test('an interruption cancels a request in flight', async () => {
  const path = await envWorkspace({ LUZMO_API_KEY: 'synthetic-test-key', LUZMO_API_TOKEN: 'synthetic-test-token' });
  const controller = new AbortController();
  const fetcher = (url, init) => new Promise((resolve, reject) => {
    if (JSON.parse(init.body).action === 'get' && new URL(url).pathname.endsWith('/user')) return resolve({ ok: true, status: 200, text: async () => JSON.stringify({ rows: [{ id: 'u' }] }) });
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    setTimeout(() => controller.abort(), 10);
  });
  const api = await client(path, { fetcher, signal: controller.signal, timeoutMs: 60000 });
  await assert.rejects(api.request('securable', { action: 'get' }), error => error.interrupted && /Interrupted during securable get/.test(error.message));
  await assert.rejects(api.request('securable', { action: 'get' }), error => error.interrupted && /Interrupted before/.test(error.message));
});
