import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseArgs, isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { isLocale, DATASET_CONTEXT_BUDGET, FIELD_CONTEXT_BUDGET } from './limits.mjs';

export const uuid = value => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
// Compare real paths: skills installed through a symlink or junction would otherwise never run their main().
const real = path => { try { return realpathSync(path); } catch { return resolve(path); } };
export const isMain = url => !!process.argv[1] && real(process.argv[1]) === real(fileURLToPath(url));
export const same = isDeepStrictEqual;
export const metadata = row => ({ description: row.description ?? null, ai_context: row.ai_context ?? null });
export const normalize = value => value.trim().replace(/\s+/g, ' ');
export const contextLength = value => value == null ? 0 : JSON.stringify(normalize(value)).length;
export const budget = kind => kind === 'dataset' ? DATASET_CONTEXT_BUDGET : FIELD_CONTEXT_BUDGET;
export const label = value => typeof value === 'string' ? value : Object.values(value ?? {}).find(Boolean) ?? '(unnamed)';
export const md = value => String(value ?? '').replace(/[|\r\n]/g, char => char === '|' ? '\\|' : ' ');
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class ReportedError extends Error {
  constructor(message, report) { super(message); this.report = report; }
}
export class ApiError extends Error {
  constructor(message, { status = null, apiMessage = null, uncertain = false, timeout = false, refused = false, interrupted = false } = {}) { super(message); Object.assign(this, { status, apiMessage, uncertain, timeout, refused, interrupted }); }
}

export async function readJson(path) {
  let text;
  try { text = await readFile(path, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Missing ${basename(path)} (${path}). Run the step that creates it first.`);
    throw new Error(`Cannot read ${path}: ${error.code ?? error.message}.`);
  }
  try { return JSON.parse(text); } catch (error) { throw new Error(`${basename(path)} is not valid JSON (${error.message}). Fix the file and rerun.`); }
}
export function args(extra = {}) {
  const { values } = parseArgs({ options: { workspace: { type: 'string' }, ...extra }, strict: true });
  if (!values.workspace) throw new Error('Provide --workspace luzmo-semantic-layer-review-artifacts (a directory in the main working directory).');
  return { ...values, workspace: resolve(values.workspace) };
}
export async function writeJson(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
}
export async function createOnce(path, text, exists) {
  try { await writeFile(path, text, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code === 'EEXIST') { if (exists) throw new Error(exists); return; } throw error; }
}
export const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
// Every backup is listed with its SHA-256 in artifacts/backups/manifest.json. restore.mjs only accepts listed, unmodified
// backups, so a hand-written or edited file cannot be restored by mistake. Like the approval file, this guards against
// mistakes; it does not prove who wrote the file.
const backupDir = path => join(path, 'artifacts', 'backups');
const manifestPath = path => join(backupDir(path), 'manifest.json');
async function backupManifest(path) {
  try { return await readJson(manifestPath(path)); } catch (error) { if (error.message.startsWith('Missing manifest.json')) return { schema_version: 1, backups: [] }; throw error; }
}
export async function saveBackup(path, kind, value) {
  await mkdir(backupDir(path), { recursive: true, mode: 0o700 });
  const name = `${kind}-${stamp()}.json`, text = `${JSON.stringify({ schema_version: 1, kind, taken_at: new Date().toISOString(), ...value }, null, 2)}
`;
  await createOnce(join(backupDir(path), name), text, `Backup ${name} already exists; rerun.`);
  const manifest = await backupManifest(path);
  manifest.backups.push({ file: name, kind, sha256: hash(text) });
  await writeJson(manifestPath(path), manifest);
  return `artifacts/backups/${name}`;
}
export async function readBackup(path, given, kind) {
  const file = resolve(given), name = basename(file);
  if (file !== join(backupDir(path), name)) throw new Error(`Restore only accepts backups saved by this toolkit in ${backupDir(path)}.`);
  const entry = (await backupManifest(path)).backups.find(b => b.file === name);
  if (!entry || entry.kind !== kind) throw new Error(`${name} is not a ${kind} backup listed in artifacts/backups/manifest.json; only backups saved by apply.mjs or restore.mjs can be restored.`);
  let text;
  try { text = await readFile(file, 'utf8'); } catch (error) { throw new Error(`Cannot read ${file}: ${error.code ?? error.message}.`); }
  if (hash(text) !== entry.sha256) throw new Error(`${name} changed after it was saved; it cannot be restored.`);
  return JSON.parse(text);
}
export async function saveRecovery(path, kind, error) {
  if (!error.report) return;
  try {
    await mkdir(join(path, 'artifacts', 'recovery'), { recursive: true, mode: 0o700 });
    const file = join(path, 'artifacts', 'recovery', `${kind}-${stamp()}.json`);
    await writeJson(file, { schema_version: 1, recorded_at: new Date().toISOString(), message: error.message, ...error.report });
    error.message += ` Recovery report: ${file}.`;
  } catch { error.message += ' Could not save the recovery report to disk; retain the stderr report before continuing.'; }
}
export async function workspace(path) {
  const config = await readJson(join(path, 'config.json'));
  if (config.schema_version !== 1 || !Array.isArray(config.datasets) || !Array.isArray(config.languages) || !config.languages.length) throw new Error('config.json needs schema_version 1, a datasets array and a nonempty languages array.');
  const unsupported = config.languages.filter(l => typeof l !== 'string' || !isLocale(l));
  if (unsupported.length) throw new Error(`config.json languages contain unsupported Luzmo locales: ${unsupported.join(', ')}.`);
  if (new Set(config.languages).size !== config.languages.length) throw new Error('config.json languages contain duplicates.');
  if (config.datasets.some(d => !uuid(d.id)) || new Set(config.datasets.map(d => d.id)).size !== config.datasets.length) throw new Error('config.json datasets need unique dataset UUIDs in "id".');
  if (config.timezone !== undefined) new Intl.DateTimeFormat('en', { timeZone: config.timezone });
  await mkdir(join(path, 'artifacts'), { recursive: true, mode: 0o700 });
  return config;
}

async function workspaceEnv(path) {
  let text;
  try { text = await readFile(join(path, '.env'), 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`No .env in workspace ${path}. Run init.mjs and let the user fill it locally.`);
    throw new Error('Could not read the workspace .env; details omitted.');
  }
  return parseEnvText(text);
}
// A small dotenv-style parser (util.parseEnv needs Node 20.12+). Supports a UTF-8 byte-order mark, comments, `export `,
// and single, double or backtick quotes. In an unquoted value, # starts a comment only after whitespace, so secrets containing # survive.
export function parseEnvText(text) {
  const env = {};
  for (const [index, raw] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new Error(`The workspace .env could not be parsed at line ${index + 1}; use one KEY=value per line.`);
    let value = match[2];
    const quote = value[0];
    if (['"', "'", '`'].includes(quote)) {
      const end = value.indexOf(quote, 1);
      if (end === -1) throw new Error(`The workspace .env has an unclosed quote at line ${index + 1}.`);
      value = value.slice(1, end);
      if (quote === '"') value = value.replaceAll('\\n', '\n');
    } else value = value.replace(/\s+#.*$/, '').trim();
    env[match[1]] = value;
  }
  return env;
}
const messageOf = result => [result?.message, result?.error?.message, typeof result?.error === 'string' ? result.error : null, result?.type?.description].find(v => typeof v === 'string' && v.trim());

export async function client(path, { allowWrites = false, allowKnowledgeWrites = false, allowPrompts = false, allowEmbedTokens = false, timeoutMs = 30000, credentialMode = 'api', fetcher = fetch, signal = null } = {}) {
  if (!['api', 'embed'].includes(credentialMode) || (allowWrites || allowKnowledgeWrites || allowEmbedTokens) && credentialMode !== 'api') throw new Error('Embed credentials are read-only in this toolkit; metadata writes require API credentials.');
  const env = await workspaceEnv(path);
  const prefix = credentialMode === 'embed' ? 'LUZMO_EMBED' : 'LUZMO_API';
  const key = env[`${prefix}_KEY`]?.trim(), token = env[`${prefix}_TOKEN`]?.trim();
  const host = origin(env.LUZMO_API_HOST?.trim() || 'https://api.luzmo.com');
  if (!key || !token || /^<.*>$/.test(key) || /^<.*>$/.test(token)) throw new Error(`Set ${prefix}_KEY and ${prefix}_TOKEN in ${join(path, '.env')}; never send them in chat. No credential fallback.`);
  const redact = value => String(value ?? '').split(key).join('[redacted]').split(token).join('[redacted]').slice(0, 500);
  const created = new Set();
  const send = async (resource, fields) => {
    const operation = `${resource} ${fields.action}${fields.id ? ` ${fields.id}` : ''}`;
    // Luzmo only hides securables shared through public groups in listings; lookups by ID and includes return them unless asked not to.
    const sent = fields.action === 'get' && fields.find && resource !== 'data' ? { ...fields, find: { ...fields.find, options: { ...fields.find.options, public: false } } } : fields;
    // `signal` (from interruption()) cancels a request in flight. Callers pass it only where cancelling is safe, such as IQ questions;
    // metadata writes instead stop between steps so rollback can still reach the API.
    if (signal?.aborted) throw new ApiError(`Interrupted before ${operation}.`, { interrupted: true });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(new ApiError('timeout')), timeoutMs), cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    let response, body = '', result = null;
    try {
      response = await fetcher(new URL(`/0.1.0/${resource}`, host), { method: 'POST', redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...sent, version: '0.1.0', key, token }) });
      try { body = await response.text(); result = body ? JSON.parse(body) : null; } catch {}
    } catch (error) {
      if (signal?.aborted) throw new ApiError(`Interrupted during ${operation}; the request was cancelled.`, { interrupted: true, uncertain: fields.action !== 'get' });
      const timeout = controller.signal.aborted || ['TimeoutError', 'AbortError'].includes(error?.name);
      throw new ApiError(timeout ? `No response from ${host} within ${timeoutMs / 1000} s for ${operation}.` : `Could not reach ${host} for ${operation} (${redact(error?.cause?.code ?? error?.message ?? 'network error')}). Check network access to the Luzmo API host.`, { uncertain: true, timeout });
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
    if (!response.ok || result?.error || result?.errors || result?.success === false) {
      const apiMessage = redact(messageOf(result) ?? (result ? '' : body.slice(0, 300))) || null;
      if (response.status === 401) throw new ApiError(refusedMessage(credentialMode, host, apiMessage), { status: 401, apiMessage, refused: true });
      throw new ApiError(`Luzmo API rejected ${operation} (HTTP ${response.status})${apiMessage ? `: ${apiMessage}` : ''}.`, { status: response.status, apiMessage });
    }
    if (!result || typeof result !== 'object') throw new ApiError(`Luzmo API returned an unreadable response for ${operation}.`, { status: response.status, uncertain: fields.action !== 'get' });
    if (fields.action === 'create' && uuid(result.id)) created.add(result.id);
    return result;
  };
  let identified = null;
  // Luzmo runs an unknown key/token as an anonymous visitor instead of refusing it, and anonymous requests still see public datasets.
  const identify = () => identified ??= send('user', { action: 'get', find: { where: { id: 'me' }, attributes: ['id'], limit: 1 } }).then(result => {
    if (!result.rows?.length) throw new ApiError(unknownMessage(credentialMode, host), { refused: true });
    return result.rows[0].id;
  });
  return { host, credentialMode, async iqContext() {
    const principal = await identify();
    const authorization = await this.ownAuthorization(['type', 'role', 'suborganization', 'access', 'filters', 'parameter_overrides']);
    const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
    // Credential binding also covers unreadable connection overrides. A refreshed pair requires a new baseline.
    return { fingerprint: hash(canonical({ principal, authorization, credentials: hash([key, token]) })), basis: 'credential-bound authorization', limitation: 'Connection overrides and changes to source data must also be checked by the reviewer. A refreshed credential pair requires a new baseline.' };
  }, async request(resource, fields) {
    const knowledge = ['airule', 'agent'].includes(resource);
    const linkRoles = { agent: ['Securables', 'linked_rules'] };
    const ownAuthorization = resource === 'authorization' && fields.action === 'get' && fields.find?.where?.id === key && Object.keys(fields.find.where).length === 1;
    const allowed = allowPrompts && ['aiprompt', 'aimessage'].includes(resource) ? fields.action === (resource === 'aiprompt' ? 'create' : 'get') : credentialMode === 'embed' ? resource === 'data' && fields.action === 'get' || ownAuthorization : knowledge
      ? ['get', ...(allowKnowledgeWrites ? ['create', 'update', 'associate', 'dissociate', 'delete'] : [])].includes(fields.action)
      : ownAuthorization || allowEmbedTokens && resource === 'authorization' && fields.action === 'create' && fields.properties?.type === 'embed'
        || ['securable', 'column', 'formula', 'data', 'user', 'embedfiltergroup'].includes(resource) && ['get', ...(allowWrites && ['securable', 'column', 'formula'].includes(resource) ? ['update'] : [])].includes(fields.action);
    if (!allowed || ['associate', 'dissociate'].includes(fields.action) && !linkRoles[resource]?.includes(fields.resource?.role)) throw new Error(`Operation outside permitted client mode: ${resource} ${fields.action}.`);
    if (fields.action === 'delete' && !created.has(fields.id)) throw new Error('Only resources created by this run can be deleted, and only to roll that run back.');
    if (['key', 'token', 'version'].some(k => Object.hasOwn(fields, k))) throw new Error('Authentication overrides rejected.');
    await identify();
    return send(resource, fields);
  }, async ownAuthorization(attributes) {
    const result = await this.request('authorization', { action: 'get', find: { where: { id: key }, attributes, limit: 1 } });
    if (!Array.isArray(result.rows) || result.rows.length !== 1) throw new ApiError(`Luzmo did not return the authorization of the ${credentialMode === 'embed' ? 'Embed' : 'API'} key.`);
    return result.rows[0];
  } };
}
function unknownMessage(credentialMode, host) {
  const pair = credentialMode === 'embed' ? 'LUZMO_EMBED_KEY/LUZMO_EMBED_TOKEN' : 'LUZMO_API_KEY/LUZMO_API_TOKEN';
  const cause = `${host} does not recognize the ${pair} pair in the workspace .env and would answer as for an anonymous visitor, so nothing else was requested.`;
  return credentialMode === 'embed'
    ? `${cause} The Embed pair was pasted incompletely or created on another Luzmo environment than LUZMO_API_HOST: paste both LUZMO_EMBED_ lines again in full, or get a new pair for the same end user (embed-access.mjs --mode create, or the customer's developer), then rerun embed-access.mjs.`
    : `${cause} Most likely LUZMO_API_HOST points at another Luzmo environment: copy the "API host URL" shown on the API Tokens page where this token was created into .env. Otherwise paste the key and token again in full, or check that the token is not limited to other IP addresses.`;
}
function refusedMessage(credentialMode, host, apiMessage) {
  const cause = `Luzmo refused the ${credentialMode === 'embed' ? 'LUZMO_EMBED_KEY/LUZMO_EMBED_TOKEN' : 'LUZMO_API_KEY/LUZMO_API_TOKEN'} pair in the workspace .env (HTTP 401${apiMessage ? `: ${apiMessage}` : ''}). Check that ${host} matches the API Tokens page, both credential values are complete, and the token has not expired, been revoked or been restricted to other IP addresses.`;
  return credentialMode === 'embed'
    ? `${cause} Get a new Embed pair for the same end user, with the same suborganization and parameter values (embed-access.mjs --mode create, or the customer's developer), replace both LUZMO_EMBED_ lines in .env and rerun embed-access.mjs before continuing.`
    : `${cause} Create a new API token on the API Tokens page of the same Luzmo environment, replace LUZMO_API_KEY and LUZMO_API_TOKEN in .env (never in chat) and rerun this command.`;
}
export function origin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('LUZMO_API_HOST must be an HTTPS origin such as https://api.luzmo.com.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('API host must be an HTTPS origin without credentials, path or query.');
  return url.origin;
}
// The review's "Open in Luzmo" links start from LUZMO_APP_HOST when set (custom domains and CNAMEs cannot be derived),
// otherwise from the API host's app.… sibling. The address field on the review page can override either.
export function appOrigin(apiHost, override) {
  if (override?.trim()) {
    try { return origin(override.trim()); } catch { throw new Error('LUZMO_APP_HOST must be an HTTPS origin such as https://app.luzmo.com, the address you log in at.'); }
  }
  try {
    const url = new URL(apiHost);
    if (!url.hostname.startsWith('api.')) return null;
    url.hostname = `app.${url.hostname.slice(4)}`;
    return url.origin;
  } catch { return null; }
}
// Reads only the non-secret LUZMO_APP_HOST; rendering stays offline and works without a .env.
export async function appHost(path, apiHost) {
  let env = {};
  try { env = parseEnvText(await readFile(join(path, '.env'), 'utf8')); } catch {}
  return appOrigin(apiHost, env.LUZMO_APP_HOST);
}
export function sanitize(value) {
  if (typeof value === 'string' && /^[\s]*[\[{]/.test(value)) { try { return sanitize(JSON.parse(value)); } catch { return value; } }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['inlineData', 'inline_data'].includes(key)).map(([key, item]) => [key, sanitize(item)]));
  return value;
}
export async function one(api, resource, id, attributes, type) {
  const result = await api.request(resource, { action: 'get', find: { where: { id, ...(type ? { type } : {}) }, attributes, limit: 1 } });
  if (!Array.isArray(result.rows) || result.rows.length !== 1 || result.rows[0].id !== id) throw new Error(`Resource ${id} is no longer accessible with these credentials.`);
  return result.rows[0];
}
// First Ctrl+C or SIGTERM: stop cleanly. Writes finish their current step and roll back; requests given `signal` are cancelled.
// A second signal exits at once (exit code 130) without waiting for rollback; the backup and recovery report may then be incomplete.
export function interruption({ notice = 'Stopping after the current step and rolling back. Press Ctrl+C again to exit immediately.' } = {}) {
  let requested = null;
  const controller = new AbortController();
  const handlers = ['SIGINT', 'SIGTERM'].map(name => [name, () => {
    if (requested) { process.stderr.write(`Second ${name}: exiting now without waiting for recovery. Check the workspace artifacts before retrying.\n`); process.exit(130); }
    requested = name;
    process.stderr.write(`${name} received. ${notice}\n`);
    controller.abort();
  }]);
  for (const [name, handler] of handlers) process.on(name, handler);
  return { get requested() { return requested; }, signal: controller.signal, dispose() { for (const [name, handler] of handlers) process.off(name, handler); } };
}
export const run = main => main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  if (error.report) process.stderr.write(`${JSON.stringify(error.report, null, 2)}\n`);
  process.exitCode = 1;
});
