import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hash, writeJson, client, ReportedError } from './common.mjs';
import { syntheticCapture, syntheticKnowledgeCapture } from './synthetic.mjs';
import { seedProposal, buildPreview, renderReview } from './review-lib.mjs';
import { seedKnowledge, captureKnowledge, buildKnowledgePreview, approvedKnowledge } from './knowledge-lib.mjs';
import { applyKnowledge } from './knowledge-apply.mjs';
import { renderKnowledgeSection } from './knowledge-html.mjs';
import { main as knowledgeMain } from './knowledge.mjs';

const clone = value => structuredClone(value);
function fixture() {
  const capture = clone(syntheticKnowledgeCapture), proposal = seedKnowledge(capture);
  proposal.verdict = 'ready'; proposal.assessment = 'Every fictional rule and agent reviewed.';
  for (const r of proposal.resources) { r.assessment = 'Preserves the fictional contract.'; r.evidence = ['Synthetic fixture.']; r.scope_rationale = 'Applies to the linked sales workflow.'; }
  const rule = proposal.resources[0]; rule.disposition = 'revise'; rule.proposed.content = 'Answer concisely in the requested language.';
  return { capture, proposal };
}
function apiFixture(capture, hooks = {}) {
  const rows = new Map(capture.resources.map(r => [r.id, clone(r)])), calls = [];
  const responseRow = r => r.kind === 'rule' ? { ...clone(r), latest_version_id: r.latest_version.id, published_version_id: r.published_version?.id ?? null, linked_agents: r.linked_agent_ids.map(id => ({ id })) } : { ...clone(r), securables: r.dataset_ids.map(id => ({ id, type: 'dataset' })), linked_rules: r.rule_refs.map(id => ({ id })) };
  const toggle = (values, value, add) => add ? [...new Set([...values, value])].sort() : values.filter(v => v !== value);
  return { rows, calls, host: capture.host, credentialMode: 'api', async request(resource, fields) {
    calls.push({ resource, ...clone(fields) });
    if (fields.action === 'get') {
      if (resource === 'securable') return { rows: capture.selection.includes(fields.find.where.id) ? [{ id: fields.find.where.id, type: 'dataset' }] : [] };
      if (!fields.find.where?.id) return { rows: [...rows.values()].filter(r => r.resource === resource).sort((a, b) => a.id.localeCompare(b.id)).slice(fields.find.offset, fields.find.offset + fields.find.limit).map(r => ({ id: r.id })) };
      const r = rows.get(fields.find.where.id); hooks.read?.(r, calls);
      return { rows: r && r.resource === resource ? [responseRow(r)] : [] };
    }
    hooks.write?.(resource, fields, rows);
    let id = fields.id;
    if (fields.action === 'create') {
      id = randomUUID();
      const p = fields.properties;
      rows.set(id, resource === 'airule' ? { id, kind: 'rule', resource, name: p.name, organization_id: capture.resources[0].organization_id, latest_version: { ...clone(p), id: randomUUID() }, published_version: null, linked_agent_ids: [] } : { id, kind: 'agent', resource, name: p.name, description: p.description ?? null, capabilities: p.capabilities, theme_id: p.theme_id ?? null, dataset_ids: [], rule_refs: [] });
    } else if (fields.action === 'delete') {
      const r = rows.get(id);
      if (r.kind === 'rule' && r.published_version) throw Object.assign(new Error('A published rule must be unpublished before it can be deleted.'), { status: 400 });
      rows.delete(id);
    } else {
      const r = rows.get(id);
      if (fields.action === 'update') {
        if (resource === 'airule') {
          if (Object.hasOwn(fields.properties, 'published_version_id')) {
            const versionId = fields.properties.published_version_id;
            r.published_version = versionId === null ? null : versionId === r.latest_version.id ? clone(r.latest_version) : clone(capture.resources.find(c => c.published_version?.id === versionId).published_version);
          } else { r.name = fields.properties.name; r.latest_version = { ...fields.properties, id: randomUUID() }; }
        } else Object.assign(r, clone(fields.properties));
      } else {
        const add = fields.action === 'associate', { role, id: related } = fields.resource;
        if (role === 'Securables') r.dataset_ids = toggle(r.dataset_ids, related, add);
        else {
          const [agent, rule] = role === 'linked_agents' ? [rows.get(related), r] : [r, rows.get(related)];
          agent.rule_refs = toggle(agent.rule_refs, rule.id, add);
          rule.linked_agent_ids = toggle(rule.linked_agent_ids, agent.id, add);
        }
      }
    }
    hooks.afterWrite?.(rows.get(id), fields);
    return { id };
  } };
}
const writes = api => api.calls.filter(c => c.action !== 'get');
const approvalFor = preview => ({ schema_version: 1, preview_sha256: hash(preview), reviewer: 'Fictional reviewer', reviewed_at: '2026-10-28T12:00:00Z', approved_keys: preview.changes.map(c => c.key) });
function addCreations(proposal, capture) {
  proposal.resources.push({ key: 'new:language', id: null, kind: 'rule', disposition: 'create', original: null, proposed: { name: 'Response language', content: "Answer in the user's language.", publication: 'latest' }, assessment: 'New shared preference requested.', evidence: ['Fictional request.'], scope_rationale: 'Publish and link to the new focused agent.', questions: [] });
  proposal.resources.push({ key: 'new:charts', id: null, kind: 'agent', disposition: 'create', original: null, proposed: { name: { en: 'Chart assistant' }, description: { en: 'Creates sales charts.' }, capabilities: ['chart_creation'], theme_id: null, dataset_ids: capture.selection, rule_refs: ['new:language'] }, assessment: 'New narrow chart entry point requested.', evidence: ['Fictional request.'], scope_rationale: 'Organization-visible; add the reviewed dataset and language rule after creation.', questions: [] });
}

test('knowledge discovery reads published and draft rules plus both association directions', async () => {
  const { capture } = fixture(), api = apiFixture(capture);
  const actual = await captureKnowledge(api, { selection: capture.selection });
  assert.equal(actual.complete, true); assert.deepEqual(actual.resources, capture.resources);
  assert.notEqual(actual.resources[0].latest_version.content, actual.resources[0].published_version.content);
  api.rows.get(capture.resources[0].id).linked_agent_ids.push(randomUUID());
  assert.equal((await captureKnowledge(api)).complete, false);
});

test('knowledge review is exhaustive, binds originals and holds unresolved changes', () => {
  const { capture, proposal } = fixture();
  assert.equal(buildKnowledgePreview(proposal, capture).changes.length, 1);
  for (const mutate of [p => p.resources.pop(), p => { p.resources[0].original.latest_version.content = 'modified'; }, p => { p.resources[0].assessment = ''; }, p => { p.resources[0].questions = ['Unresolved']; }, p => { p.resources[1].proposed.rule_refs = ['unknown']; }, p => { p.capture_sha256 = 'stale'; }, p => { p.resources[0].proposed.content = ' '; }]) {
    const copy = clone(proposal); mutate(copy); assert.throws(() => buildKnowledgePreview(copy, capture));
  }
  const incomplete = { ...capture, complete: false };
  const p = clone(proposal); p.capture_sha256 = hash(incomplete);
  assert.throws(() => buildKnowledgePreview(p, incomplete), /Complete knowledge/);
  p.resources[0].disposition = 'hold'; assert.equal(buildKnowledgePreview(p, incomplete).changes.length, 0);
});

test('knowledge proposals cannot mutate snapshots, lose agent locales or add unselected datasets', () => {
  const { capture, proposal } = fixture(), originalName = capture.resources[1].name.en;
  proposal.resources[1].proposed.name.en = 'Changed name';
  assert.equal(capture.resources[1].name.en, originalName);
  assert.equal(proposal.resources[1].original.name.en, originalName);
  proposal.resources[1].disposition = 'revise';
  const outside = clone(proposal); outside.resources[1].proposed.dataset_ids = [randomUUID()];
  assert.throws(() => buildKnowledgePreview(outside, capture), /selected dataset scope/);
  const locales = clone(proposal); locales.languages = ['en', 'en-GB'];
  assert.throws(() => buildKnowledgePreview(locales, capture), /each agreed language/);
  const source = clone(capture); source.resources[1].name['en-GB'] = 'Analyst';
  const seeded = seedKnowledge(source); seeded.verdict = 'ready'; seeded.assessment = 'Reviewed';
  for (const r of seeded.resources) r.assessment = 'Reviewed';
  delete seeded.resources[1].proposed.name['en-GB'];
  assert.throws(() => buildKnowledgePreview(seeded, source), /Retain existing agent locales/);
});

test('knowledge creations reject duplicate names and approval cannot silently retain an edited rule', () => {
  const { capture, proposal } = fixture(); addCreations(proposal, capture);
  const duplicate = clone(proposal); duplicate.resources[2].proposed.name = capture.resources[0].name;
  assert.throws(() => buildKnowledgePreview(duplicate, capture), /already exists/);
  const duplicateNew = clone(proposal), newRule = clone(duplicateNew.resources[2]); newRule.key = 'new:second-language'; duplicateNew.resources.push(newRule);
  assert.throws(() => buildKnowledgePreview(duplicateNew, capture), /Duplicate proposed creation/);
  proposal.resources[3].proposed.rule_refs = [capture.resources[0].id];
  const preview = buildKnowledgePreview(proposal, capture), approval = approvalFor(preview); approval.approved_keys = ['new:charts'];
  assert.throws(() => approvedKnowledge(preview, approval), /depends on a proposed rule edit/);
});

test('knowledge discovery marks capped inventories and missing associations incomplete', async () => {
  const { capture } = fixture();
  const capped = apiFixture(capture);
  capped.rows.clear();
  for (let i = 0; i < 100; i++) {
    const row = clone(capture.resources[0]); row.id = randomUUID(); row.linked_agent_ids = []; capped.rows.set(row.id, row);
  }
  const result = await captureKnowledge(capped, { maxPages: 1 });
  assert.equal(result.complete, false); assert(result.issues.some(i => i.error.includes('page cap')));
  const missing = apiFixture(capture); missing.rows.get(capture.resources[1].id).capabilities = undefined;
  assert.equal((await captureKnowledge(missing)).complete, false);
});

test('saved rule drafts leave published text intact; explicit latest publication uses verified version', async () => {
  for (const publication of ['preserve', 'latest', 'unpublish']) {
    const { capture, proposal } = fixture(); proposal.resources[0].proposed.publication = publication;
    const preview = buildKnowledgePreview(proposal, capture), api = apiFixture(capture);
    await applyKnowledge(api, capture, preview.changes, { execute: true });
    const rule = api.rows.get(capture.resources[0].id);
    assert.equal(writes(api).length, publication === 'preserve' ? 1 : 2);
    assert.equal(rule.published_version?.content ?? null, publication === 'preserve' ? capture.resources[0].published_version.content : publication === 'latest' ? proposal.resources[0].proposed.content : null);
    if (publication === 'latest') assert.equal(writes(api)[1].properties.published_version_id, rule.latest_version.id);
  }
});

test('new rule and agent creation resolves dependencies and verifies scoped links', async () => {
  const { capture, proposal } = fixture(); addCreations(proposal, capture);
  const preview = buildKnowledgePreview(proposal, capture), approval = approvalFor(preview);
  const missingDependency = clone(approval); missingDependency.approved_keys = ['new:charts'];
  assert.throws(() => approvedKnowledge(preview, missingDependency), /required new rule/);
  const selected = approvedKnowledge(preview, approval), api = apiFixture(capture);
  const preflight = await applyKnowledge(api, capture, selected);
  assert.equal(preflight.applied, 0); assert.equal(writes(api).length, 0);
  const result = await applyKnowledge(api, capture, selected, { execute: true });
  const rule = api.rows.get(result.created['new:language']), agent = api.rows.get(result.created['new:charts']);
  assert.equal(rule.published_version.id, rule.latest_version.id);
  assert.deepEqual(agent.dataset_ids, capture.selection);
  assert.deepEqual(agent.rule_refs, [rule.id]);
  assert.deepEqual(rule.linked_agent_ids, [agent.id]);
  assert.equal(result.applied, 3);
});

test('agent edits preserve unrelated links and perform explicit unlinking without deletion', async () => {
  const { capture, proposal } = fixture(), agent = proposal.resources[1];
  agent.disposition = 'revise'; agent.proposed.capabilities = ['data_analysis', 'chart_creation']; agent.proposed.rule_refs = [];
  const api = apiFixture(capture), preview = buildKnowledgePreview(proposal, capture);
  await applyKnowledge(api, capture, approvedKnowledge(preview, approvalFor(preview)), { execute: true });
  assert.deepEqual(api.rows.get(agent.id).dataset_ids, capture.selection);
  assert.deepEqual(api.rows.get(agent.id).rule_refs, []);
  assert.deepEqual(api.rows.get(capture.resources[0].id).linked_agent_ids, []);
  assert(writes(api).some(c => c.action === 'dissociate'));
  assert(!writes(api).some(c => c.action === 'delete'));
});

test('knowledge drift stops before writes and names what changed', async () => {
  const { capture, proposal } = fixture(), preview = buildKnowledgePreview(proposal, capture);
  const drift = apiFixture(capture); drift.rows.get(capture.resources[0].id).latest_version.content = 'Someone edited this.';
  await assert.rejects(applyKnowledge(drift, capture, preview.changes, { execute: true }), error => error instanceof ReportedError && /nothing was written/.test(error.message) && error.report.changed[0].change === 'edited');
  assert.equal(writes(drift).length, 0);
  const race = apiFixture(capture, { read: (row, calls) => { if (calls.length === 5) row.latest_version.content = 'Concurrent edit'; } });
  await assert.rejects(applyKnowledge(race, capture, preview.changes, { execute: true }), /edited by someone else during this run/);
  assert.equal(writes(race).length, 0);
});

test('a created rule edited before readback is preserved and reported', async () => {
  const { capture, proposal } = fixture(); addCreations(proposal, capture);
  const changes = buildKnowledgePreview(proposal, capture).changes.filter(c => c.key === 'new:language');
  const api = apiFixture(capture, { afterWrite(row, fields) { if (fields.action === 'create') row.latest_version.content = 'Unexpected readback'; } });
  await assert.rejects(applyKnowledge(api, capture, changes, { execute: true }), error => {
    assert.match(error.message, /stopped at rule new:language \(create rule\)/); assert.match(error.message, /Rollback incomplete/);
    assert.deepEqual(error.report.rollback.map(r => r.status), ['skipped-newer-edit']);
    return true;
  });
  assert.equal(api.rows.size, capture.resources.length + 1);
  assert.equal(writes(api).filter(c => c.action === 'delete').length, 0);
  assert.equal(writes(api).filter(c => c.action === 'create').length, 1);
});

test('a failure after creations and edits restores the exact previous configuration', async () => {
  const { capture, proposal } = fixture(); addCreations(proposal, capture);
  const preview = buildKnowledgePreview(proposal, capture), selected = approvedKnowledge(preview, approvalFor(preview));
  const api = apiFixture(capture, { write: (resource, fields) => { if (fields.action === 'associate' && fields.resource.role === 'linked_rules') throw Object.assign(new Error('Luzmo API rejected agent associate (HTTP 403): Insufficient rights.'), { status: 403, apiMessage: 'Insufficient rights.' }); } });
  await assert.rejects(applyKnowledge(api, capture, selected, { execute: true }), error => {
    assert.match(error.message, /resource edit rights/);
    assert.equal(error.report.stopped_at.api_status, 403);
    assert(error.report.rollback.every(r => ['rolled-back', 'unchanged'].includes(r.status)), JSON.stringify(error.report.rollback));
    assert.deepEqual(error.report.notes, ['Restored rule text is saved as a new draft version; the reverted draft stays in version history.']);
    return true;
  });
  const fresh = await captureKnowledge(api, { selection: capture.selection });
  const comparable = r => r.kind === 'rule' ? { ...r, latest_version: { ...r.latest_version, id: null } } : r;
  assert.deepEqual(fresh.resources.map(comparable), capture.resources.map(comparable));
  assert.equal(fresh.resources[0].published_version.id, capture.resources[0].published_version.id);
});

test('rule links are made through the agent with documented roles only', async () => {
  const { capture } = fixture(), proposal = seedKnowledge(capture); proposal.verdict = 'ready'; proposal.assessment = 'Reviewed.';
  for (const r of proposal.resources) { r.assessment = 'Reviewed.'; r.evidence = ['Synthetic fixture.']; r.scope_rationale = 'Sales workflow.'; }
  proposal.resources[1].disposition = 'revise'; proposal.resources[1].proposed.rule_refs = [];
  const api = apiFixture(capture);
  await applyKnowledge(api, capture, buildKnowledgePreview(proposal, capture).changes, { execute: true });
  assert.deepEqual(writes(api).map(c => [c.id, c.action, c.resource.role]), [[capture.resources[1].id, 'dissociate', 'linked_rules']]);
  assert(!writes(api).some(c => c.properties && Object.hasOwn(c.properties, 'ai_rule_version_id')));
});

test('a not-ready rules and agents review cannot be applied', () => {
  const { capture, proposal } = fixture(); proposal.verdict = 'not-ready';
  const preview = buildKnowledgePreview(proposal, capture);
  assert.throws(() => approvedKnowledge(preview, approvalFor(preview)), /verdict is "not-ready"/);
});

test('agent capabilities outside the documented list are refused', () => {
  const { capture, proposal } = fixture();
  Object.assign(proposal.resources[1], { disposition: 'revise' });
  proposal.resources[1].proposed.capabilities = ['data_analysis', 'workspace_operations'];
  assert.throws(() => buildKnowledgePreview(proposal, capture), /Invalid agent capabilities/);
});

test('changed rule text over the working budget is reported', () => {
  const { capture, proposal } = fixture();
  proposal.resources[0].proposed.content = 'x'.repeat(5001);
  assert.throws(() => buildKnowledgePreview(proposal, capture), error => error instanceof ReportedError && error.report.problems.length === 1 && /5001 characters exceeds the working budget of 5000/.test(error.report.problems[0]));
});

test('rule and agent proposals violating Luzmo limits are reported together', () => {
  const { capture, proposal } = fixture();
  proposal.resources[0].proposed.name = 'x'.repeat(121);
  Object.assign(proposal.resources[1], { disposition: 'revise' });
  proposal.resources[1].proposed.name = { en: 'y'.repeat(151), 'pt-BR': 'Analyst' };
  assert.throws(() => buildKnowledgePreview(proposal, capture), error => error instanceof ReportedError && error.report.problems.length === 3 && error.report.problems.some(p => /limit of 120/.test(p)) && error.report.problems.some(p => /limit of 150/.test(p)) && error.report.problems.some(p => /pt-BR: unsupported locale/.test(p)));
});

test('knowledge HTML shows published/draft/proposed content, scope and creation without executable text', () => {
  const { capture, proposal } = fixture(); addCreations(proposal, capture);
  proposal.resources[0].assessment = '<script>untrusted()</script>';
  const html = renderKnowledgeSection(proposal, buildKnowledgePreview(proposal, capture));
  for (const expected of ['Current published rule', 'Current draft', 'Proposed rule', 'Current agent', 'Proposed agent', 'Scope and effect', 'Publish proposed version', 'New agent']) assert(html.includes(expected), expected);
  assert(!html.includes('<script>')); assert(html.includes('&lt;script&gt;'));
  assert(!html.includes('<textarea'));
  assert(!html.includes('Evidence and exact proposal'));
  assert(!html.includes('&quot;original&quot;:'));
  assert(html.includes('<details><summary>Why this change</summary>'));
  assert(html.includes('<details><summary>Why no update is needed</summary>'));
  assert(html.includes('id="show-unchanged-knowledge" type="checkbox"'));
  assert(html.includes('data-unchanged="true" hidden'));
  assert(!html.includes('Loading: Always'));
  assert(!html.includes('<h4>Loading</h4>'));
  const held = proposal.resources.find(r => r.disposition === 'keep');
  held.disposition = 'hold';
  held.assessment = 'Await the owner’s dataset selection before changing this agent.';
  const heldHtml = renderKnowledgeSection(proposal, buildKnowledgePreview(proposal, capture));
  const heldCard = heldHtml.split(`id="knowledge-${held.key}"`)[1].split('</article>')[0];
  assert(heldCard.startsWith(' data-unchanged="false">'));
  assert(heldCard.includes('What needs clarification'));
  assert(!heldCard.includes('<summary>Why this'));
  const metadata = seedProposal(syntheticCapture, ['en']);
  metadata.business_brief = 'Fictional sales data.'; metadata.verdict = 'ready';
  for (const resource of metadata.resources) resource.assessment = 'Keep the fixture definition.';
  const combined = renderReview(metadata, buildPreview(metadata, syntheticCapture), { proposal, preview: buildKnowledgePreview(proposal, capture) });
  assert(combined.html.includes('data-review-view="datasets" aria-pressed="true"'));
  assert(combined.html.includes('data-review-view="knowledge" aria-pressed="false"'));
  assert(combined.html.includes('id="knowledge-view" data-review-panel="knowledge" hidden'));
  assert(combined.html.includes('<details class="dataset-group"'));
});

test('knowledge CLI writes reviewed artifacts, binds approval and refuses to reapply a changed inventory', async () => {
  const { capture, proposal } = fixture();
  const workspace = await mkdtemp(join(tmpdir(), 'luzmo-knowledge-cli-'));
  await writeJson(join(workspace, 'config.json'), { schema_version: 1, languages: ['en'], datasets: capture.selection.map(id => ({ id })) });
  await knowledgeMain({ workspace, mode: 'collect' }, { api: apiFixture(capture) });
  await knowledgeMain({ workspace, mode: 'collect' }, { api: apiFixture(capture) });
  const saved = JSON.parse(await readFile(join(workspace, 'artifacts/knowledge-capture.json'), 'utf8'));
  proposal.capture_sha256 = hash(saved);
  await writeJson(join(workspace, 'artifacts/knowledge-proposal.json'), proposal);
  await assert.rejects(knowledgeMain({ workspace, mode: 'seed' }), /already exists and was kept/);
  await knowledgeMain({ workspace, mode: 'review' });
  const html = await readFile(join(workspace, 'artifacts/knowledge-review.html'), 'utf8');
  assert(html.includes("script-src 'sha256-"));
  assert(html.includes('<script>'));
  const preview = JSON.parse(await readFile(join(workspace, 'artifacts/knowledge-preview.json'), 'utf8'));
  const approval = join(workspace, 'approval.json'); await writeJson(approval, approvalFor(preview));
  const api = apiFixture(capture);
  await knowledgeMain({ workspace, mode: 'apply', approval }, { api }); assert.equal(writes(api).length, 0);
  await knowledgeMain({ workspace, mode: 'apply', approval, execute: true }, { api });
  assert.deepEqual((await readdir(join(workspace, 'artifacts'))).filter(name => /attempted|journal|before/.test(name)), []);
  assert.equal((await readdir(join(workspace, 'artifacts/applied'))).length, 1);
  const count = writes(api).length;
  await assert.rejects(knowledgeMain({ workspace, mode: 'apply', approval, execute: true }, { api }), /changed since the capture; nothing was written/);
  assert.equal(writes(api).length, count);
});

test('generic metadata clients cannot write knowledge, Embed access cannot read it and only created resources can be deleted', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'luzmo-knowledge-env-'));
  await writeFile(join(workspace, '.env'), 'LUZMO_API_KEY=synthetic\nLUZMO_API_TOKEN=synthetic\nLUZMO_EMBED_KEY=synthetic\nLUZMO_EMBED_TOKEN=synthetic\nLUZMO_API_HOST=https://api.example.invalid\n');
  const api = await client(workspace, { allowWrites: true });
  await assert.rejects(api.request('airule', { action: 'create', properties: {} }), /permitted client mode/);
  const embed = await client(workspace, { credentialMode: 'embed' });
  await assert.rejects(embed.request('agent', { action: 'get' }), /permitted client mode/);
  const created = randomUUID();
  const writer = await client(workspace, { allowKnowledgeWrites: true, fetcher: async url => ({ ok: true, status: 200, text: async () => JSON.stringify(url.pathname.endsWith('/user') ? { rows: [{ id: 'synthetic-user' }] } : { id: created }) }) });
  await assert.rejects(writer.request('airule', { action: 'delete', id: randomUUID() }), /Only resources created by this run/);
  await writer.request('airule', { action: 'create', properties: {} });
  await writer.request('airule', { action: 'delete', id: created });
  await assert.rejects(writer.request('airule', { action: 'associate', id: created, resource: { role: 'Securables', id: randomUUID() } }), /permitted client mode/);
});

test('knowledge updates recover the current step when its successful write cannot be read back', async () => {
  const { capture, proposal } = fixture();
  let failRead = false;
  const api = apiFixture(capture, {
    afterWrite() { failRead = true; },
    read() { if (failRead) { failRead = false; throw new Error('Transient readback loss'); } },
  });
  await assert.rejects(applyKnowledge(api, capture, buildKnowledgePreview(proposal, capture).changes, { execute: true }), error => {
    assert.equal(error.report.stopped_at.stage, 'readback');
    // Recovery's write also has a failed readback; state is restored but honestly unverified.
    assert.equal(error.report.rollback[0].status, 'not-rolled-back');
    return true;
  });
  assert.equal(api.rows.get(capture.resources[0].id).latest_version.content, capture.resources[0].latest_version.content);
});

test('lost create responses through the real client preserve candidate resources instead of adopting names', async () => {
  const { capture, proposal } = fixture(); addCreations(proposal, capture);
  const changes = buildKnowledgePreview(proposal, capture).changes.filter(c => c.key === 'new:language');
  const backend = apiFixture(capture, { afterWrite(row, fields) { if (fields.action === 'create') throw new Error('Response lost after creation'); } });
  const path = await mkdtemp(join(tmpdir(), 'luzmo-create-response-'));
  await writeFile(join(path, '.env'), `LUZMO_API_KEY=synthetic-key\nLUZMO_API_TOKEN=synthetic-token\nLUZMO_API_HOST=${capture.host}\n`);
  const api = await client(path, { allowKnowledgeWrites: true, fetcher: async (url, options) => {
    if (url.pathname.endsWith('/user')) return new Response(JSON.stringify({ rows: [{ id: 'synthetic-user' }] }));
    const fields = JSON.parse(options.body);
    const response = await backend.request(url.pathname.split('/').at(-1), fields);
    return new Response(JSON.stringify(response));
  } });
  await assert.rejects(applyKnowledge(api, capture, changes, { execute: true }), error => {
    assert.equal(error.report.stopped_at.live.candidate_ids.length, 1);
    assert.deepEqual(error.report.rollback, []);
    return true;
  });
  assert.equal(backend.rows.size, capture.resources.length + 1);
  assert.equal(writes(backend).filter(c => c.action === 'delete').length, 0);
});

test('rollback never deletes a known created resource after a concurrent edit', async () => {
  const { capture, proposal } = fixture(); addCreations(proposal, capture);
  const api = apiFixture(capture, { write(resource, fields, rows) {
    if (fields.action === 'create' && resource === 'agent') {
      const rule = [...rows.values()].find(r => r.name === 'Response language');
      rule.latest_version.content = 'A colleague changed this rule.';
      throw new Error('Later operation failed');
    }
  } });
  await assert.rejects(applyKnowledge(api, capture, buildKnowledgePreview(proposal, capture).changes, { execute: true }), error => {
    assert(error.report.rollback.some(r => r.status === 'skipped-newer-edit'));
    return true;
  });
  assert([...api.rows.values()].some(r => r.latest_version?.content === 'A colleague changed this rule.'));
  assert.equal(writes(api).filter(c => c.action === 'delete').length, 0);
});

test('scoped knowledge capture follows shared impacts and ignores unrelated new resources at preflight', async () => {
  const { capture } = fixture(), api = apiFixture(capture);
  const scoped = await captureKnowledge(api, { selection: capture.selection, scope: [{ resource: 'agent', id: capture.resources[1].id }] });
  assert.equal(scoped.complete, true);
  assert.equal(scoped.resources.length, 2);
  assert(!api.calls.some(c => c.action === 'get' && !c.find.where?.id));
  const unrelated = clone(capture.resources[1]); unrelated.id = randomUUID(); unrelated.rule_refs = [];
  api.rows.set(unrelated.id, unrelated);
  const proposal = seedKnowledge(scoped); proposal.verdict = 'ready'; proposal.assessment = 'Scoped review.';
  for (const r of proposal.resources) { r.assessment = 'Reviewed dependency.'; r.evidence = ['Fixture.']; r.scope_rationale = 'Linked scope.'; }
  const rule = proposal.resources.find(r => r.kind === 'rule'); rule.disposition = 'revise'; rule.proposed.content = 'Use the requested language.';
  const result = await applyKnowledge(api, scoped, buildKnowledgePreview(proposal, scoped).changes);
  assert.equal(result.mode, 'preflight');
  assert.equal(writes(api).length, 0);  let backedUp = null;
  await applyKnowledge(api, scoped, buildKnowledgePreview(proposal, scoped).changes, { execute: true, backup: async inventory => { backedUp = inventory; return 'artifacts/backups/knowledge-test.json'; } });
  assert.equal(backedUp.scope, undefined);
  assert(backedUp.resources.some(r => r.id === unrelated.id), 'the backup holds the full inventory, not only the reviewed scope');
});
