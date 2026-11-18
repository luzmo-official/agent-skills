import { label } from './common.mjs';
import { rowDimension } from './profile-lib.mjs';

export const AUTHORIZATION_ATTRIBUTES = ['type', 'expiry', 'role', 'suborganization', 'access', 'filters', 'parameter_overrides'];
const STATUS = {
  ok: 'sees data',
  'no-rows': 'has access but sees 0 rows',
  'no-access': 'has no access to this dataset',
  'read-only': "has only 'read' access; asking IQ or querying the dataset needs 'use' access",
  timeout: 'the one-row check timed out, so access and data are unconfirmed',
  error: 'the check failed',
  'token-refused': 'Luzmo refused the Embed token',
};
const json = value => { if (typeof value !== 'string') return value ?? null; try { return JSON.parse(value); } catch { return value; } };

export function rowCheckQuery(capture, datasetId) {
  const columns = capture.resources.filter(r => r.dataset_id === datasetId && r.kind === 'column');
  const column = columns.find(c => c.type === 'hierarchy' && !c.expression) ?? columns.find(c => !c.expression) ?? columns[0];
  if (!column) throw new Error(`Dataset ${datasetId} has no captured columns; run collect.mjs for the selected datasets first.`);
  return { dimensions: [{ dataset_id: datasetId, column_id: column.id, ...rowDimension(column.type) }], measures: [], where: [], limit: { by: 1, offset: 0 }, options: { rollup_data: false } };
}

// Matches the Data API's 403 messages: no 'read' grant at all versus 'read' without 'use'.
export function accessStatus(error) {
  const message = `${error?.apiMessage ?? ''} ${error?.message ?? ''}`;
  if (error?.refused || error?.status === 401) return 'token-refused';
  if (/'Use' access is required/i.test(message)) return 'read-only';
  if (error?.status === 403 || /insufficient access rights|'Read' access is required/i.test(message)) return 'no-access';
  if (error?.timeout || /time(d)?[\s-]?out/i.test(message)) return 'timeout';
  return 'error';
}

export async function checkEmbedAccess(api, datasetIds, capture) {
  const names = new Map(capture.resources.filter(r => r.kind === 'dataset').map(r => [r.id, label(r.name)]));
  const queries = datasetIds.map(id => [id, rowCheckQuery(capture, id)]);
  const datasets = [];
  for (const [id, query] of queries) {
    const entry = { id, name: names.get(id) ?? id };
    try {
      const result = await api.request('data', { action: 'get', find: { queries: [query] } });
      if (!Array.isArray(result.data)) throw new Error('Unexpected Data API response shape.');
      entry.status = result.data.length ? 'ok' : 'no-rows';
    } catch (error) {
      Object.assign(entry, { status: accessStatus(error), error: error.message });
    }
    datasets.push(entry);
    if (entry.status === 'token-refused') break;
  }
  return { checked_at: new Date().toISOString(), ok: datasets.length === datasetIds.length && datasets.every(d => d.status === 'ok'), datasets };
}

export const describeAccess = datasets => datasets.map(d => [`- ${d.name}: ${STATUS[d.status]}${['error', 'timeout', 'token-refused'].includes(d.status) ? ` (${d.error})` : ''}`, ...(d.hints ?? []).map(h => `    ${h}`)].join('\n')).join('\n');

export async function assertEmbedAccess(api, datasetIds, capture, { allowEmpty = false } = {}) {
  const result = await checkEmbedAccess(api, datasetIds, capture);
  const refused = result.datasets.find(d => d.status === 'token-refused');
  if (refused) throw new Error(refused.error);
  if (!result.ok && !(allowEmpty && result.datasets.length === datasetIds.length && result.datasets.every(d => ['ok', 'no-rows'].includes(d.status)))) throw new Error(`The Embed token is not ready for the datasets in scope, so nothing else was sent with it:\n${describeAccess(result.datasets)}\nRun embed-access.mjs to diagnose this and draft the Authorization request that fixes it. Do not switch to the API token instead.`);
  return result;
}

export function parameters(value, found = new Map()) {
  if (Array.isArray(value)) for (const item of value) parameters(item, found);
  else if (value && typeof value === 'object') {
    if (typeof value.parameter === 'string' && value.parameter.startsWith('metadata.')) found.set(value.parameter.slice('metadata.'.length), { type: value.type ?? null, default: value.value ?? null });
    else for (const item of Object.values(value)) parameters(item, found);
  }
  return found;
}

export async function embedFilters(api, datasetIds) {
  try {
    const result = await api.request('embedfiltergroup', { action: 'get', find: { where: {}, attributes: ['id'], include: [{ model: 'Securable', attributes: ['id'], where: { id: { in: datasetIds } } }] } });
    const datasets = Object.fromEntries(datasetIds.map(id => [id, []]));
    for (const group of result.rows ?? []) for (const securable of group.securables ?? []) {
      if (datasets[securable.id]) datasets[securable.id].push(...[json(securable.securableEmbedFilterGroup?.filters)].flat().filter(Boolean));
    }
    return { readable: true, datasets };
  } catch (error) {
    if (error.refused) throw error;
    return { readable: false, error: error.message, datasets: {} };
  }
}

// Only an organization owner (not a suborganization owner) may create Embed tokens.
export async function apiTokenRole(api) {
  try {
    const { user_id: userId } = await api.ownAuthorization(['user_id']);
    const result = await api.request('user', { action: 'get', find: { where: { id: userId }, attributes: ['id'], include: [{ model: 'Organization', attributes: ['id'] }], limit: 1 } });
    const role = result.rows?.[0]?.organizations?.[0]?.organizationRole;
    if (!role) return { role: 'unknown', error: 'Luzmo returned no organization role for the API key.' };
    return { role: role.flagOwn ? 'owner' : role.flagSuborganizationOwn ? 'suborganization-owner' : 'not-owner' };
  } catch (error) {
    if (error.refused) throw error;
    return { role: 'unknown', error: error.message };
  }
}

export function tokenSummary(authorization) {
  const access = json(authorization.access) ?? {};
  return {
    type: authorization.type ?? null, expiry: authorization.expiry ?? null, role: authorization.role ?? null, suborganization: authorization.suborganization ?? null,
    datasets: (access.datasets ?? []).map(d => ({ id: d.id, rights: d.rights })), collections: (access.collections ?? []).length, dashboards: (access.dashboards ?? []).length,
    filters: json(authorization.filters) ?? [], parameter_overrides: json(authorization.parameter_overrides) ?? {},
  };
}

export function diagnose(datasets, token, filters) {
  return datasets.map(d => {
    const hints = [];
    if (['no-access', 'read-only'].includes(d.status)) {
      const grant = token?.datasets.find(g => g.id === d.id);
      hints.push(grant ? `The token grants this dataset with rights ${JSON.stringify(grant.rights)}; it needs "use".`
        : token ? `The token's access list does not name this dataset${token.collections ? '; check whether one of its collections contains it with inheritRights "use"' : ''}.`
          : 'Grant it in access.datasets with rights "use".');
    }
    if (d.status === 'no-rows') {
      const tokenFilters = (token?.filters ?? []).filter(f => JSON.stringify(f).includes(d.id));
      if (tokenFilters.length) hints.push(`${tokenFilters.length} filter(s) on the token itself apply to this dataset.`);
      const own = filters.datasets?.[d.id] ?? [];
      if (own.length) hints.push(`${own.length} embed filter(s) on this dataset always apply.`);
      for (const [name, p] of parameters(own)) {
        if (!Object.hasOwn(token?.parameter_overrides ?? {}, name)) hints.push(`The token sets no parameter_overrides.${name}, so the embed filter uses its default ${JSON.stringify(p.default)}.`);
      }
      if (!filters.readable) hints.push('Embed filters on datasets could not be read: only an organization owner\'s API token can read them.');
      hints.push('Otherwise: a connection override (account_overrides, never readable) may point at a source without data, or this end user has no data in the dataset.');
    }
    return { ...d, hints };
  });
}

const placeholder = (name, type) => /array|\[\]/.test(type ?? '') ? [`<${name} value(s) for this end user>`] : `<${name} value for this end user>`;
export function suggestAuthorization(datasetIds, filters) {
  const found = new Map();
  for (const id of datasetIds) parameters(filters.datasets?.[id] ?? [], found);
  return {
    type: 'embed',
    username: '<unique, immutable ID of this end user in your application>',
    name: '<display name of this end user>',
    email: '<email of this end user>',
    suborganization: '<tenant or customer this end user belongs to>',
    role: 'viewer',
    access: { datasets: datasetIds.map(id => ({ id, rights: 'use' })) },
    ...(found.size ? { parameter_overrides: Object.fromEntries([...found].map(([name, p]) => [name, placeholder(name, p.type)])) } : {}),
  };
}
export const requestBody = properties => ({ action: 'create', version: '0.1.0', key: '<API key of an organization owner>', token: '<API token of an organization owner>', properties });

export function validateEmbedProperties(properties, datasetIds) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return ['the properties must be a JSON object'];
  const problems = [];
  if (properties.type !== 'embed') problems.push('type must be "embed"');
  for (const key of ['username', 'name', 'email']) if (typeof properties[key] !== 'string' || !properties[key].trim()) problems.push(`${key} is required`);
  const placeholders = JSON.stringify(properties).match(/<[^<>"]+>/g);
  if (placeholders) problems.push(`replace every placeholder with a value the user confirmed: ${[...new Set(placeholders)].join(', ')}`);
  if (Object.hasOwn(properties, 'account_overrides')) problems.push('account_overrides carry connection credentials; leave tokens that need them to the customer\'s developer');
  if (properties.role !== undefined && properties.role !== 'viewer') problems.push('role must be "viewer": the toolkit only reads with Embed tokens');
  if (properties.expiry !== undefined && !(Date.parse(properties.expiry) > Date.now())) problems.push('expiry must be a future RFC3339 timestamp, or omitted for 24 hours');
  const granted = new Set((properties.access?.datasets ?? []).filter(d => d?.rights === 'use').map(d => d.id));
  const missing = datasetIds.filter(id => !granted.has(id));
  if (missing.length && !properties.access?.collections?.length) problems.push(`access.datasets needs rights "use" on every selected dataset; missing ${missing.join(', ')}`);
  return problems;
}
