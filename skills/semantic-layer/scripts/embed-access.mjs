import { readFile, writeFile, rename } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { args, workspace, client, readJson, writeJson, hash, uuid, run, isMain } from './common.mjs';
import { AUTHORIZATION_ATTRIBUTES, checkEmbedAccess, describeAccess, diagnose, embedFilters, apiTokenRole, tokenSummary, suggestAuthorization, requestBody, validateEmbedProperties } from './embed-access-lib.mjs';

const NEXT_STEP = {
  owner: 'The API token belongs to an organization owner: it can create a replacement Embed token once the user has confirmed every property value (--mode create).',
  'suborganization-owner': 'The API token belongs to a suborganization owner, who cannot create Embed tokens: give the user artifacts/embed-authorization-request.json for their developer.',
  'not-owner': 'The API token does not belong to an organization owner, so it cannot create Embed tokens: give the user artifacts/embed-authorization-request.json for their developer, or ask for an organization owner\'s API token.',
  unknown: 'Could not establish whether the API token belongs to an organization owner: ask the user, or give them artifacts/embed-authorization-request.json for their developer.',
};

async function check(path, capture, ids, factory, created = null) {
  const out = join(path, 'artifacts');
  const embed = await factory(path, { credentialMode: 'embed' });
  if (embed.host !== capture.host) throw new Error(`The workspace .env points at ${embed.host}, but the capture came from ${capture.host}.`);
  let token;
  try { token = tokenSummary(await embed.ownAuthorization(AUTHORIZATION_ATTRIBUTES)); } catch (error) { token = { error: error.message }; }
  const access = await checkEmbedAccess(embed, ids, capture);
  const api = await factory(path, { credentialMode: 'api' });
  const apiToken = await apiTokenRole(api), filters = await embedFilters(api, ids);
  const known = token.error ? null : token;
  const report = { schema_version: 1, host: capture.host, checked_at: access.checked_at, ready: access.ok, ...(created ? { created } : {}), token, datasets: diagnose(access.datasets, known, filters), api_token: apiToken, embed_filters: filters, suggested_properties: suggestAuthorization(ids, filters) };
  await writeJson(join(out, 'embed-access.json'), report);
  await writeJson(join(out, 'embed-authorization-request.json'), requestBody(report.suggested_properties));
  const parameterNames = Object.keys(report.suggested_properties.parameter_overrides ?? {});
  process.stdout.write([
    `Embed token ${report.ready ? 'is ready' : 'is NOT ready'} for ${ids.length} selected dataset(s):`,
    describeAccess(report.datasets),
    ...(token.error ? [`Could not read the Embed token's own configuration: ${token.error}`] : []),
    filters.readable ? `Embed filters: ${parameterNames.length ? `parameter(s) ${parameterNames.join(', ')} need a value per end user in parameter_overrides.` : 'none use parameters.'}` : `Embed filters could not be read with the API token (${filters.error}).`,
    ...(report.ready ? [] : [NEXT_STEP[apiToken.role]]),
    'Details: artifacts/embed-access.json; draft request: artifacts/embed-authorization-request.json. Private; no credentials included.',
  ].join('\n') + '\n');
  if (!report.ready) process.exitCode = 1;
  return report;
}

async function setEmbedCredentials(path, key, token) {
  const file = join(path, '.env');
  let text = await readFile(file, 'utf8');
  for (const [name, value] of [['LUZMO_EMBED_KEY', key], ['LUZMO_EMBED_TOKEN', token]]) {
    const pattern = new RegExp(`^${name}=.*$`, 'm'), line = `${name}=${value}`;
    text = pattern.test(text) ? text.replace(pattern, () => line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
  }
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, text, { mode: 0o600 });
  await rename(temp, file);
}

async function create(a, capture, ids, factory) {
  const file = resolve(a.properties ?? join(a.workspace, 'embed-authorization.json'));
  const properties = await readJson(file);
  const problems = validateEmbedProperties(properties, ids);
  if (problems.length) throw new Error(`${basename(file)} is not ready:\n- ${problems.join('\n- ')}`);
  const digest = hash(properties);
  if (!a.execute) {
    process.stdout.write(`Embed token to create with the API token, for the user to confirm value by value:\n${JSON.stringify(properties, null, 2)}\nExpiry: ${properties.expiry ?? '24 hours after creation (Luzmo default)'}. Creating it adds or updates end user "${properties.username}" in Luzmo and replaces LUZMO_EMBED_KEY and LUZMO_EMBED_TOKEN in the workspace .env; the previous pair is not kept. Nothing sent. Plan SHA-256: ${digest}\n`);
    return { properties, sha256: digest };
  }
  if (a['plan-sha256'] !== digest) throw new Error('The Embed token properties changed or the plan hash is missing; show the user the plan again and get their confirmation.');
  const api = await factory(a.workspace, { credentialMode: 'api', allowEmbedTokens: true });
  if (api.host !== capture.host) throw new Error(`The workspace .env points at ${api.host}, but the capture came from ${capture.host}.`);
  const { role, error } = await apiTokenRole(api);
  if (role !== 'owner') throw new Error(`Only an organization owner's API token can create Embed tokens; this one is ${role}${error ? ` (${error})` : ''}. Nothing was created. Give the user artifacts/embed-authorization-request.json for their developer instead.`);
  const result = await api.request('authorization', { action: 'create', properties });
  if (!uuid(result.id) || typeof result.token !== 'string' || !result.token) throw new Error('Luzmo did not return a new Embed key and token; .env was not changed.');
  await setEmbedCredentials(a.workspace, result.id, result.token);
  process.stdout.write('Created the Embed token and saved its key and token in the workspace .env (not shown). Checking it now.\n');
  return check(a.workspace, capture, ids, factory, { created_at: new Date().toISOString(), properties_sha256: digest, expiry: result.expiry ?? null });
}

export async function main(a, dependencies = {}) {
  const mode = a.mode ?? 'check';
  if (!['check', 'create'].includes(mode)) throw new Error('Use --mode check or create.');
  const config = await workspace(a.workspace);
  const capture = await readJson(join(a.workspace, 'artifacts', 'capture.json'));
  const ids = config.datasets.map(d => d.id), factory = dependencies.clientFactory ?? client;
  return mode === 'create' ? create(a, capture, ids, factory) : check(a.workspace, capture, ids, factory);
}
if (isMain(import.meta.url)) run(() => main(args({ mode: { type: 'string' }, properties: { type: 'string' }, execute: { type: 'boolean', default: false }, 'plan-sha256': { type: 'string' } })));
