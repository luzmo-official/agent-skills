import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { client, writeJson } from './common.mjs';
import { syntheticCapture } from './synthetic.mjs';
import { rowCheckQuery, accessStatus, checkEmbedAccess, assertEmbedAccess, validateEmbedProperties } from './embed-access-lib.mjs';
import { main as embedMain } from './embed-access.mjs';
import { main as demoMain } from './demo.mjs';

const dataset = syntheticCapture.selection[0], tenant = syntheticCapture.resources[1].id;
const newKey = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', apiUser = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const embedFilter = { origin: 'global', clause: 'where', securable_id: dataset, column_id: tenant, expression: '? in ?', value: { parameter: 'metadata.tenant_id', type: 'hierarchy[]', value: ['tenant-demo'] } };
const denied = message => Object.assign(new Error(`Luzmo API rejected data get (HTTP 403): ${message}.`), { status: 403, apiMessage: message });
const noRead = denied("You have insufficient access rights on datasets in this query. 'Read' access is required to query a dataset");
const confirmed = { type: 'embed', username: 'demo-user-1', name: 'Fictional store manager', email: 'manager@example.invalid', suborganization: 'Fictional retailer', role: 'viewer', access: { datasets: [{ id: dataset, rights: 'use' }] }, parameter_overrides: { tenant_id: ['tenant-demo'] } };

function factory({ data = () => ({ data: [['tenant-demo']] }), role = { flagOwn: true, flagSuborganizationOwn: false }, token = { type: 'embed', access: JSON.stringify({ datasets: [{ id: dataset, rights: 'use' }] }), parameter_overrides: null, filters: null }, filters = () => ({ rows: [{ id: 'g', securables: [{ id: dataset, securableEmbedFilterGroup: { filters: JSON.stringify([embedFilter]) } }] }] }), calls = [] } = {}) {
  return async (_path, options) => ({
    host: syntheticCapture.host,
    async ownAuthorization() { calls.push([options.credentialMode, 'own-authorization']); return options.credentialMode === 'embed' ? token : { user_id: apiUser }; },
    async request(resource, fields) {
      calls.push([options.credentialMode, resource, fields.action]);
      if (resource === 'data') return data(fields);
      if (resource === 'user') return { rows: [{ id: apiUser, organizations: [{ id: 'o', organizationRole: role }] }] };
      if (resource === 'embedfiltergroup') return filters();
      if (resource === 'authorization' && fields.action === 'create' && options.allowEmbedTokens) return { id: newKey, token: 'synthetic-new-embed-token', expiry: '2026-10-30T10:00:00.000Z' };
      throw new Error(`Unexpected ${resource} ${fields.action}.`);
    },
  });
}
async function quietly(action) {
  const original = process.stdout.write;
  let text = '';
  process.stdout.write = chunk => { text += chunk; return true; };
  try { return { result: await action(), text }; } finally { process.stdout.write = original; process.exitCode = 0; }
}
async function embedWorkspace() {
  const path = join(await mkdtemp(join(tmpdir(), 'luzmo-embed-access-')), 'demo');
  await demoMain({ workspace: path });
  await writeFile(join(path, '.env'), ['LUZMO_API_HOST=https://api.example.invalid', 'LUZMO_API_KEY=synthetic-api-key', 'LUZMO_API_TOKEN=synthetic-api-token', 'LUZMO_EMBED_KEY=synthetic-old-key', 'LUZMO_EMBED_TOKEN=synthetic-old-token', ''].join('\n'));
  return path;
}

test('the row check reads one raw row per dataset and tells missing access, read-only access and empty data apart', async () => {
  const query = rowCheckQuery(syntheticCapture, dataset);
  assert.deepEqual(query.dimensions, [{ dataset_id: dataset, column_id: tenant }]);
  assert.equal(query.limit.by, 1); assert.equal(query.options.rollup_data, false); assert.deepEqual(query.measures, []);
  assert.equal(accessStatus(noRead), 'no-access');
  assert.equal(accessStatus(denied("'Read' access allows you to send queries predefined in a dashboard, but 'Use' access is required for full access to the set")), 'read-only');
  assert.equal(accessStatus(Object.assign(new Error('Unauthorized'), { status: 401 })), 'token-refused');
  assert.equal(accessStatus(Object.assign(new Error('Unknown token'), { refused: true })), 'token-refused');
  assert.equal(accessStatus(Object.assign(new Error('No response'), { timeout: true })), 'timeout');
  assert.equal(accessStatus(new Error('Column not found.')), 'error');
  const api = response => ({ async request() { if (response instanceof Error) throw response; return response; } });
  assert.equal((await checkEmbedAccess(api({ data: [['tenant-demo']] }), [dataset], syntheticCapture)).ok, true);
  const empty = await checkEmbedAccess(api({ data: [] }), [dataset], syntheticCapture);
  assert.equal(empty.ok, false); assert.equal(empty.datasets[0].status, 'no-rows');
  await assert.rejects(assertEmbedAccess(api(noRead), [dataset], syntheticCapture), error => /Fictional order lines: has no access/.test(error.message) && /Do not switch to the API token/.test(error.message));
  assert.throws(() => rowCheckQuery(syntheticCapture, '99999999-9999-4999-8999-999999999999'), /no captured columns/);
});

test('a check diagnoses the Embed token and drafts an Authorization request with a placeholder per embed-filter parameter', async () => {
  const path = await embedWorkspace(), calls = [];
  const { result, text } = await quietly(() => embedMain({ workspace: path }, { clientFactory: factory({ calls, token: { type: 'embed', access: JSON.stringify({ datasets: [] }) }, data: () => { throw noRead; } }) }));
  assert.equal(result.ready, false);
  assert.equal(result.datasets[0].status, 'no-access'); assert.match(result.datasets[0].hints[0], /does not name this dataset/);
  assert.equal(result.api_token.role, 'owner');
  assert.deepEqual(result.suggested_properties.access, { datasets: [{ id: dataset, rights: 'use' }] });
  assert.deepEqual(result.suggested_properties.parameter_overrides, { tenant_id: ['<tenant_id value(s) for this end user>'] });
  const request = JSON.parse(await readFile(join(path, 'artifacts/embed-authorization-request.json'), 'utf8'));
  assert.equal(request.action, 'create'); assert.match(request.key, /^<.*>$/); assert.deepEqual(request.properties, result.suggested_properties);
  assert.match(text, /NOT ready/); assert.match(text, /organization owner: it can create a replacement/); assert.match(text, /tenant_id need a value per end user/);
  assert.deepEqual(calls.filter(([mode]) => mode === 'embed').map(([, resource]) => resource), ['own-authorization', 'data']);

  const empty = await quietly(() => embedMain({ workspace: path }, { clientFactory: factory({ data: () => ({ data: [] }), role: { flagOwn: false, flagSuborganizationOwn: true } }) }));
  assert.equal(empty.result.datasets[0].status, 'no-rows');
  assert(empty.result.datasets[0].hints.some(h => /no parameter_overrides\.tenant_id.*default \["tenant-demo"\]/.test(h)));
  assert.match(empty.text, /suborganization owner, who cannot create Embed tokens/);

  const unreadable = await quietly(() => embedMain({ workspace: path }, { clientFactory: factory({ data: () => ({ data: [] }), filters: () => { throw denied('Forbidden'); } }) }));
  assert.equal(unreadable.result.embed_filters.readable, false); assert.equal(unreadable.result.suggested_properties.parameter_overrides, undefined);
  assert(unreadable.result.datasets[0].hints.some(h => /only an organization owner's API token can read them/.test(h)));

  const ready = await quietly(() => embedMain({ workspace: path }, { clientFactory: factory() }));
  assert.equal(ready.result.ready, true); assert.match(ready.text, /is ready/); assert.doesNotMatch(ready.text, /--mode create/);
});

test('creating an Embed token needs confirmed values, the plan hash and an organization owner, and stores the pair only in .env', async () => {
  const path = await embedWorkspace(), file = join(path, 'embed-authorization.json');
  const unused = async () => { throw new Error('No request expected.'); };
  await writeJson(file, { ...confirmed, username: '<unique, immutable ID of this end user in your application>' });
  await assert.rejects(embedMain({ workspace: path, mode: 'create' }, { clientFactory: unused }), /replace every placeholder.*<unique, immutable ID/s);
  assert.deepEqual(validateEmbedProperties({ ...confirmed, role: 'designer', account_overrides: {}, access: { datasets: [] } }, [dataset]).length, 3);
  await writeJson(file, confirmed);
  const plan = await quietly(() => embedMain({ workspace: path, mode: 'create' }, { clientFactory: unused }));
  assert.match(plan.text, new RegExp(`Plan SHA-256: ${plan.result.sha256}`)); assert.match(plan.text, /24 hours after creation/); assert.match(plan.text, /Nothing sent/);
  await assert.rejects(embedMain({ workspace: path, mode: 'create', execute: true, 'plan-sha256': 'stale' }, { clientFactory: unused }), /changed or the plan hash is missing/);
  const before = await readFile(join(path, '.env'), 'utf8'), calls = [];
  await assert.rejects(embedMain({ workspace: path, mode: 'create', execute: true, 'plan-sha256': plan.result.sha256 }, { clientFactory: factory({ calls, role: { flagOwn: false } }) }), /organization owner's API token.*not-owner.*Nothing was created/s);
  assert(!calls.some(([, resource, action]) => resource === 'authorization' && action === 'create'));
  assert.equal(await readFile(join(path, '.env'), 'utf8'), before);
  const created = await quietly(() => embedMain({ workspace: path, mode: 'create', execute: true, 'plan-sha256': plan.result.sha256 }, { clientFactory: factory() }));
  const env = await readFile(join(path, '.env'), 'utf8');
  assert.match(env, new RegExp(`^LUZMO_EMBED_KEY=${newKey}$`, 'm')); assert.match(env, /^LUZMO_EMBED_TOKEN=synthetic-new-embed-token$/m);
  assert.doesNotMatch(env, /synthetic-old-/); assert.match(env, /^LUZMO_API_TOKEN=synthetic-api-token$/m);
  assert.doesNotMatch(created.text, /synthetic-new-embed-token/); assert.doesNotMatch(created.text, new RegExp(newKey));
  assert.equal(created.result.ready, true); assert.equal(created.result.created.properties_sha256, plan.result.sha256);
});

test('Embed credentials may read their own authorization, and only an explicit option lets API credentials create Embed tokens', async () => {
  const path = await mkdtemp(join(tmpdir(), 'luzmo-embed-client-')), bodies = [];
  await writeFile(join(path, '.env'), ['LUZMO_API_KEY=synthetic-api-key', 'LUZMO_API_TOKEN=synthetic-api-token', 'LUZMO_EMBED_KEY=synthetic-embed-key', 'LUZMO_EMBED_TOKEN=synthetic-embed-token', 'LUZMO_API_HOST=https://api.example.invalid'].join('\n'));
  const fetcher = async (_url, options) => { bodies.push(JSON.parse(options.body)); return new Response(JSON.stringify({ id: newKey, rows: [{ id: 'synthetic-embed-key' }] })); };
  const embed = await client(path, { credentialMode: 'embed', fetcher });
  await embed.ownAuthorization(['type', 'access']);
  assert.deepEqual(bodies.at(-1).find.where, { id: 'synthetic-embed-key' });
  for (const [resource, fields] of [
    ['authorization', { action: 'get', find: { where: { id: newKey } } }],
    ['authorization', { action: 'get', find: { where: { id: 'synthetic-embed-key', type: 'api' } } }],
    ['authorization', { action: 'get', find: { where: {} } }],
    ['embedfiltergroup', { action: 'get', find: {} }],
    ['user', { action: 'get', find: {} }],
  ]) await assert.rejects(embed.request(resource, fields), /permitted client mode/, `${resource} ${JSON.stringify(fields)}`);
  const api = await client(path, { fetcher });
  await api.request('embedfiltergroup', { action: 'get', find: {} }); await api.request('user', { action: 'get', find: {} });
  await assert.rejects(api.request('authorization', { action: 'create', properties: { type: 'embed' } }), /permitted client mode/);
  await assert.rejects(api.request('user', { action: 'update', id: apiUser, properties: {} }), /permitted client mode/);
  const creator = await client(path, { allowEmbedTokens: true, fetcher });
  await creator.request('authorization', { action: 'create', properties: { type: 'embed' } });
  for (const fields of [{ action: 'create', properties: { type: 'api' } }, { action: 'update', id: newKey, properties: {} }, { action: 'delete', id: newKey }]) await assert.rejects(creator.request('authorization', fields), /permitted client mode|Only resources created/);
  await assert.rejects(client(path, { allowEmbedTokens: true, credentialMode: 'embed' }), /read-only/);
});
