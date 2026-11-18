import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash, writeJson, client } from './common.mjs';
import { syntheticCapture } from './synthetic.mjs';
import { validateQuestions, promptRequest, answerOf, compareRuns, validateAssessment } from './iq-lib.mjs';
import { main as iqMain } from './iq.mjs';
import { main as demoMain } from './demo.mjs';
import { main as reviewMain } from './review.mjs';

const dataset = syntheticCapture.selection[0], revenue = '44444444-4444-4444-8444-444444444444';
const questions = { schema_version: 1, questions: [
  { id: 'net-revenue', question: 'What was net revenue last month, including refunds?', language: 'en', source: 'research', rationale: 'Fictional: the core sales question.', expected: 'Sum of net revenue including negative refund lines.', expected_resource_ids: [revenue], dataset_ids: [dataset] },
  { id: 'refund-share', question: 'Which share of orders was refunded?', language: 'en', source: 'user', rationale: 'Fictional: asked by the customer.' },
] };
function iqApi(answers) {
  const calls = [];
  return { calls, host: syntheticCapture.host, async iqContext() { return { fingerprint: 'synthetic-equivalent-context' }; }, async request(resource, fields) {
    calls.push({ resource, fields: structuredClone(fields) });
    if (resource === 'aimessage') return { rows: [{ id: fields.find.where.id, securables: [{ id: dataset }] }] };
    if (resource === 'data') return { data: [['tenant-demo']] };
    const answer = answers.shift();
    if (answer instanceof Error) throw answer;
    return answer;
  } };
}
async function iqWorkspace(authentication = 'embed') {
  const parent = await mkdtemp(join(tmpdir(), 'luzmo-iq-')), path = join(parent, 'demo');
  await demoMain({ workspace: path });
  const config = JSON.parse(await readFile(join(path, 'config.json'), 'utf8'));
  await writeJson(join(path, 'config.json'), { ...config, ...(authentication ? { iq_authentication: authentication, iq_end_user: 'Fictional store manager' } : {}) });
  await writeJson(join(path, 'iq-questions.json'), questions);
  return path;
}
const answered = (text, assets = []) => ({ conversation_id: 'c', user_message: {}, assistant_message: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', message: text, agent: 'auto', aiMessageAssets: assets } });

test('question sets need a source, rationale, configured language and selected datasets', () => {
  assert.equal(validateQuestions(questions, { languages: ['en'], datasetIds: [dataset] }).length, 2);
  const bad = structuredClone(questions);
  bad.questions[0].source = 'guess'; bad.questions[1].language = 'fr'; bad.questions[1].dataset_ids = ['99999999-9999-4999-8999-999999999999'];
  assert.throws(() => validateQuestions(bad, { languages: ['en'], datasetIds: [dataset] }), error => /source must be/.test(error.message) && /language must be/.test(error.message) && /selected in config/.test(error.message));
  assert.throws(() => validateQuestions(questions, { languages: ['en'], budget: 1 }), /exceed iq_question_budget/);
});

test('prompts use a fresh conversation in the question language and charts expose the resources they use', () => {
  const request = promptRequest(questions.questions[0], 'Europe/Brussels');
  assert.equal(request.properties.conversation_id, undefined);
  assert.equal(request.properties.locale_id, 'en'); assert.equal(request.properties.agent, 'auto');
  assert.deepEqual(request.properties.input[1], { type: 'dataset', id: dataset });
  assert.equal(promptRequest({ ...questions.questions[1], agent_id: dataset }, 'UTC').properties.agent, undefined);
  const answer = answerOf(answered('Net revenue was 10.', [{ type: 'item', value: { type: 'bar-chart', slots: [{ content: [{ set: dataset, column: revenue }] }] } }]));
  assert.deepEqual(answer.referenced_resource_ids, [dataset, revenue].sort());
  assert.deepEqual(answer.charts, [{ type: 'item', chart_type: 'bar-chart', title: '' }]);
  assert.equal(answerOf({ conversation_id: 'c', assistant_message: null }).status, 'no-answer');
});

test('runs need the confirmed plan, keep going after a failed question and compare assessed runs', async () => {
  const path = await iqWorkspace();
  const plan = await iqMain({ workspace: path, mode: 'plan' });
  await assert.rejects(iqMain({ workspace: path, mode: 'run', label: 'before', 'plan-sha256': 'stale' }, { api: iqApi([]) }), /changed since the confirmed plan/);
  const api = iqApi([answered('Net revenue was 10, excluding refunds.'), Object.assign(new Error('No response'), { timeout: true })]);
  const before = await iqMain({ workspace: path, mode: 'run', label: 'before', 'plan-sha256': hash(plan) }, { api });
  assert.deepEqual(before.results.map(r => r.status), ['answered', 'timeout']);
  assert.deepEqual(before.results[0].used_dataset_ids, [dataset]);
  assert(api.calls.filter(c => c.resource === 'aiprompt').every(c => !c.fields.properties.conversation_id));
  assert.equal(before.authentication, 'embed'); assert.equal(before.end_user, 'Fictional store manager');
  await assert.rejects(iqMain({ workspace: path, mode: 'run', label: 'before', 'plan-sha256': hash(plan) }, { api: iqApi([answered('x'), answered('y')]) }), /already exists/);

  await reviewMain({ workspace: path });
  const review = await readFile(join(path, 'artifacts/review.html'), 'utf8');
  assert.match(review, /How IQ answers today · 2 questions/);
  assert.match(review, /<button type="button" class="stat" data-open-view="iq"><strong>1<small>\/2<\/small><\/strong>/, 'the top number opens the IQ answers');
  assert.match(review, /<a class="stat tone-fail" href="#iq-question-2"><strong>1<\/strong>/, 'each IQ number jumps to its first question');
  assert.match(review, /<p class="stat tone-pass"><strong>0<\/strong>/, 'a zero is not a link');

  const after = await iqMain({ workspace: path, mode: 'run', label: 'after', 'plan-sha256': hash(plan) }, { api: iqApi([answered('Net revenue was 8, including refunds.'), answered('4% of orders were refunded.')]) });
  await writeJson(join(path, 'artifacts/iq-runs/before.assessment.json'), { schema_version: 1, run_sha256: hash(before), assessments: [{ id: 'net-revenue', verdict: 'fail', note: 'Left out refunds.' }] });
  await writeJson(join(path, 'artifacts/iq-runs/after.assessment.json'), { schema_version: 1, run_sha256: hash(after), assessments: [{ id: 'net-revenue', verdict: 'pass', note: 'Includes refunds.' }, { id: 'refund-share', verdict: 'partial', note: 'Counts lines, not orders.' }] });
  const comparison = await iqMain({ workspace: path, mode: 'compare' });
  assert.deepEqual(comparison.rows.map(r => r.change), ['improved', 'improved']);
  const html = await readFile(join(path, 'artifacts/iq-comparison.html'), 'utf8');
  assert.match(html, /2 improved · 0 got worse/); assert.match(html, /Asked as one end user \(Fictional store manager\)/); assert.doesNotMatch(html, /<script/);
  assert.throws(() => validateAssessment(after, { schema_version: 1, run_sha256: hash(before), assessments: [] }), /run_sha256/);
  assert.throws(() => compareRuns(before, new Map(), { ...after, questions_sha256: 'other' }, new Map()), /different question sets/);
  assert.throws(() => compareRuns(before, new Map(), { ...after, authentication: 'api' }, new Map()), /not comparable/);
});

test('a run needs an explicit choice between asking as an end user and asking with the API token', async () => {
  const path = await iqWorkspace(null);
  const plan = await iqMain({ workspace: path, mode: 'plan' });
  await assert.rejects(iqMain({ workspace: path, mode: 'run', label: 'before', 'plan-sha256': hash(plan) }, { api: iqApi([]) }), /Ask the user which one; there is no default/);
});

test('an end-user run permits accessible empty datasets to test no-data answers', async () => {
  const path = await iqWorkspace(), plan = await iqMain({ workspace: path, mode: 'plan' });
  const api = iqApi([answered('No data in this scope.'), answered('No orders.')]);
  const request = api.request.bind(api);
  api.request = async (resource, fields) => resource === 'data' ? { data: [] } : request(resource, fields);
  const record = await iqMain({ workspace: path, mode: 'run', label: 'empty', 'plan-sha256': hash(plan) }, { api });
  assert.equal(record.results.length, 2);
  assert.equal(record.access.datasets[0].status, 'no-rows');
});

test('an IQ access refusal stops the run instead of failing every question', async () => {
  const path = await iqWorkspace('api');
  const plan = await iqMain({ workspace: path, mode: 'plan' });
  const record = await iqMain({ workspace: path, mode: 'run', label: 'before', 'plan-sha256': hash(plan) }, { api: iqApi([Object.assign(new Error('Forbidden'), { status: 403 })]) });
  assert.equal(record.results.length, 1); assert.equal(record.complete, false); assert.match(record.stopped, /Luzmo IQ access/);
  process.exitCode = 0;
});

test('only the IQ run client may send prompts, with API or end-user credentials, and it cannot write metadata', async () => {
  const path = await mkdtemp(join(tmpdir(), 'luzmo-iq-client-'));
  await writeFile(join(path, '.env'), ['LUZMO_API_KEY=synthetic-key', 'LUZMO_API_TOKEN=synthetic-token', 'LUZMO_EMBED_KEY=synthetic-embed-key', 'LUZMO_EMBED_TOKEN=synthetic-embed-token', 'LUZMO_API_HOST=https://api.example.invalid'].join('\n'));
  const fetcher = async url => new Response(JSON.stringify(url.pathname.endsWith('/user') ? { rows: [{ id: 'synthetic-user' }] } : { conversation_id: 'c', assistant_message: null }));
  const readOnly = await client(path, { fetcher }), prompts = await client(path, { allowPrompts: true, fetcher });
  await assert.rejects(readOnly.request('aiprompt', { action: 'create', properties: {} }), /outside permitted client mode/);
  assert.equal((await prompts.request('aiprompt', { action: 'create', properties: {} })).conversation_id, 'c');
  for (const [resource, action] of [['column', 'update'], ['aimessage', 'delete'], ['aiconversation', 'delete']]) await assert.rejects(prompts.request(resource, { action, id: dataset }), /outside permitted client mode/);
  const endUser = await client(path, { allowPrompts: true, credentialMode: 'embed', fetcher });
  assert.equal((await endUser.request('aiprompt', { action: 'create', properties: {} })).conversation_id, 'c');
  for (const [resource, action] of [['column', 'update'], ['securable', 'get'], ['aimessage', 'delete']]) await assert.rejects(endUser.request(resource, { action, id: dataset }), /outside permitted client mode/);
  await assert.rejects(client(path, { allowWrites: true, credentialMode: 'embed' }), /read-only/);
});

test('duplicate IQ labels and orphan assessments make no network calls', async () => {
  const path = await iqWorkspace('api'), plan = await iqMain({ workspace: path, mode: 'plan' });
  const args = { workspace: path, mode: 'run', label: 'saved', 'plan-sha256': hash(plan) };
  await iqMain(args, { api: iqApi([answered('one'), answered('two')]) });
  const api = iqApi([]);
  api.iqContext = async () => { throw new Error('Network identity must not run'); };
  await assert.rejects(iqMain(args, { api }), /already exists/);
  assert.equal(api.calls.length, 0);
  await writeJson(join(path, 'artifacts/iq-runs/orphan.assessment.json'), { preserve: true });
  await assert.rejects(iqMain({ ...args, label: 'orphan' }, { api }), /assessment.json already exists/);
  assert.equal(api.calls.length, 0);
  await assert.rejects(readFile(join(path, 'artifacts/iq-runs/orphan.json')), { code: 'ENOENT' });
  assert.deepEqual(JSON.parse(await readFile(join(path, 'artifacts/iq-runs/orphan.assessment.json'), 'utf8')), { preserve: true });
});

test('IQ checkpoints each completed answer before requesting the next question', async () => {
  const path = await iqWorkspace('api'), plan = await iqMain({ workspace: path, mode: 'plan' });
  const api = iqApi([answered('one'), answered('two')]), request = api.request.bind(api);
  let prompts = 0;
  api.request = async (resource, fields) => {
    if (resource === 'aiprompt' && ++prompts === 2) {
      const saved = JSON.parse(await readFile(join(path, 'artifacts/iq-runs/checkpoint.json'), 'utf8'));
      assert.equal(saved.complete, false); assert.equal(saved.results.length, 1);
      assert.equal(saved.results[0].answer_text, 'one');
    }
    return request(resource, fields);
  };
  await iqMain({ workspace: path, mode: 'run', label: 'checkpoint', 'plan-sha256': hash(plan) }, { api });
  assert.equal(prompts, 2);
});

test('partial IQ runs render missing questions and reject mismatched data contexts', async () => {
  const { renderComparisonHtml, renderComparisonMarkdown } = await import('./iq-lib.mjs');
  const base = { label: 'before', questions: questions.questions, questions_sha256: hash(questions.questions), host: syntheticCapture.host, authentication: 'embed', timezone: 'UTC', context: { fingerprint: 'same-context' }, results: [{ id: 'net-revenue', ...questions.questions[0], status: 'answered', answer_text: 'one' }] };
  const after = { ...base, label: 'after', results: [] };
  const comparison = compareRuns(base, new Map(), after, new Map());
  assert.equal(comparison.rows.length, 2);
  assert.equal(comparison.not_assessed, 2); assert.equal(comparison.improved, 0);
  assert(renderComparisonHtml(comparison, { before: base, after, style: '' }).includes('Not run.'));
  assert(renderComparisonMarkdown(comparison, { before: base, after }).includes('net revenue'));
  for (const changed of [{ timezone: 'Europe/Brussels' }, { end_user: 'another tenant' }, { context: { fingerprint: 'different-credential' } }, { context: null }]) {
    assert.throws(() => compareRuns(base, new Map(), { ...after, ...changed }, new Map()), /context|timezone/);
  }
});

test('IQ context fingerprint detects credential and authorization changes without exposing them', async () => {
  const path = await mkdtemp(join(tmpdir(), 'luzmo-context-'));
  const writeEnv = token => writeFile(join(path, '.env'), `LUZMO_API_KEY=synthetic-key\nLUZMO_API_TOKEN=${token}\nLUZMO_API_HOST=https://api.example.invalid\n`);
  let filters = 'tenant-a';
  const fetcher = async url => new Response(JSON.stringify(url.pathname.endsWith('/user') ? { rows: [{ id: 'principal' }] } : { rows: [{ type: 'api', filters: [{ value: filters }], parameter_overrides: { date: '2026' } }] }));
  await writeEnv('synthetic-token');
  const before = await (await client(path, { fetcher })).iqContext();
  const same = await (await client(path, { fetcher })).iqContext();
  assert.equal(before.fingerprint, same.fingerprint);
  filters = 'tenant-b';
  assert.notEqual(before.fingerprint, (await (await client(path, { fetcher })).iqContext()).fingerprint);
  filters = 'tenant-a'; await writeEnv('refreshed-token');
  assert.notEqual(before.fingerprint, (await (await client(path, { fetcher })).iqContext()).fingerprint);
  for (const value of ['synthetic-key', 'synthetic-token', 'tenant-a', '2026']) assert(!JSON.stringify(before).includes(value));
});
