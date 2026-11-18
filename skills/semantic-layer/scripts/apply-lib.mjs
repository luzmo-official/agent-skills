import { hash, metadata, one, label, same, ReportedError } from './common.mjs';

export const PUBLISHABLE_VERDICTS = ['ready', 'ready-with-corrections'];
export function approvedChanges(preview, approval) {
  if (!PUBLISHABLE_VERDICTS.includes(preview.verdict)) throw new Error(`The review verdict is "${preview.verdict}"; only ready or ready-with-corrections proposals can be applied. Resolve the blockers, record a new verdict and render the review again.`);
  if (approval.schema_version !== 1 || approval.preview_sha256 !== hash(preview) || typeof approval.reviewer !== 'string' || !approval.reviewer.trim() || typeof approval.reviewed_at !== 'string' || !Number.isFinite(Date.parse(approval.reviewed_at))) throw new Error('Approval must name a reviewer, date and this exact preview hash.');
  if (!Array.isArray(approval.approved_ids) || !approval.approved_ids.length || new Set(approval.approved_ids).size !== approval.approved_ids.length) throw new Error('Approval needs a nonempty unique ID allowlist.');
  const changes = approval.approved_ids.map(id => preview.changes.find(c => c.id === id));
  if (changes.some(c => !c)) throw new Error('Approval contains an ID outside the proposed updates.');
  for (const c of changes) if (!['dataset', 'column', 'formula'].includes(c.kind) || Object.keys(c.properties).some(k => !['description', 'ai_context'].includes(k))) throw new Error('Only dataset, column and formula metadata updates are supported.');
  return changes;
}

const filled = description => description && Object.keys(description).length ? description : null;
const comparable = value => ({ description: filled(value.description), ai_context: value.ai_context ?? null });
const describe = c => `${c.kind} "${label(c.name)}" (${c.id})`;
export function differences(row, expected, expression) {
  const live = comparable(metadata(row)), want = comparable(expected), fields = [];
  for (const locale of new Set([...Object.keys(live.description ?? {}), ...Object.keys(want.description ?? {})])) if (live.description?.[locale] !== want.description?.[locale]) fields.push(`description.${locale}`);
  if (live.ai_context !== want.ai_context) fields.push('ai_context');
  if ((row.expression ?? null) !== expression) fields.push('expression');
  return fields;
}
const matches = (row, expected, expression) => differences(row, expected, expression).length === 0;
export function hint(error) {
  if (error?.status === 400) return 'Correct the rejected proposal and obtain approval for the new preview.';
  if (error?.status === 401) return 'Check the API host and credential pair, expiry, revocation and IP restrictions in the workspace .env.';
  if (error?.status === 403) return 'Check resource edit rights for the selected credentials.';
  if (error?.status === 404) return 'The resource is gone or inaccessible; recapture and review again.';
  return 'Check the recovery report before retrying. Retry the same approved apply only after all attempted writes are confirmed restored and preflight passes; otherwise recapture and review the remaining changes.';
}

export const backupEntry = (c, live) => ({ id: c.id, resource: c.resource, kind: c.kind, dataset_id: c.dataset_id ?? null, name: c.name, ...metadata(live), expression: live.expression ?? null });

export async function applyChanges(api, changes, { execute = false, interrupted = () => null, backup = null } = {}) {
  if (changes.some(c => !['dataset', 'column', 'formula'].includes(c.kind))) throw new Error("Dashboard metadata is outside the scope of this skill.");
  const read = c => one(api, c.resource, c.id, ['id', 'name', 'description', 'ai_context', ...(c.kind === 'dataset' ? ['type'] : ['expression'])], c.kind === 'dataset' ? c.kind : undefined);
  // A rename after capture may make the approved text stale; restore sets expected_name to the live name so it never refuses over one.
  const renamed = (live, c) => same(live.name, c.expected_name ?? c.name) ? [] : ['name'];
  const drift = [], snapshot = [];
  for (const c of changes) {
    try {
      const live = await read(c), fields = [...differences(live, c.before, c.expected_expression), ...renamed(live, c)];
      snapshot.push(backupEntry(c, live));
      if (fields.length) drift.push({ id: c.id, name: label(c.name), changed_fields: fields, live: metadata(live), captured: c.before });
    } catch (error) { if (error.refused) throw error; drift.push({ id: c.id, name: label(c.name), problem: error.message }); }
  }
  if (drift.length) throw new ReportedError(`${drift.length} approved resource(s) changed or became inaccessible since capture; nothing was written. Recapture, carry the live values into the proposal and review again.`, { drift });
  if (!execute) return { mode: 'preflight', checked: changes.length, applied: 0 };
  const backupFile = backup ? await backup(snapshot) : null;

  const attempted = [];
  const rollback = async () => {
    const results = [];
    for (const c of [...attempted].reverse()) {
      const restore = Object.fromEntries(Object.keys(c.properties).map(key => [key, c.before[key]]));
      const entry = { id: c.id, name: label(c.name), restore };
      try {
        const live = await read(c);
        if (matches(live, c.before, c.expected_expression)) { results.push({ id: c.id, name: label(c.name), status: 'unchanged' }); continue; }
        if (!matches(live, c.target, c.expected_expression)) { results.push({ ...entry, status: 'skipped-newer-edit', reason: 'Someone changed it after this run wrote it; their edit was kept.', live: metadata(live) }); continue; }
        let writeError = null;
        try { await api.request(c.resource, { action: 'update', id: c.id, properties: restore }); } catch (error) { writeError = error; }
        const after = await read(c);
        if (matches(after, c.before, c.expected_expression)) results.push({ id: c.id, name: label(c.name), status: 'rolled-back' });
        else results.push({ ...entry, status: 'not-rolled-back', reason: writeError?.message ?? 'Readback differs from the captured values.', live: metadata(after) });
      } catch (error) { results.push({ ...entry, status: 'not-rolled-back', reason: error.message }); }
    }
    return results;
  };
  const fail = async (c, index, { stage, error = null, reason = null, live = null, uncertain = false }) => {
    const results = await rollback();
    const restored = results.filter(r => ['rolled-back', 'unchanged'].includes(r.status)).length;
    const message = [
      `Apply stopped at ${describe(c)}: ${reason ?? error?.message ?? 'unknown failure'}`,
      hint(error),
      !attempted.length ? 'No writes in this run required recovery.' : restored === attempted.length ? `Recovery verified for all ${restored} attempted update(s), restored or already unchanged.` : `Rollback incomplete: ${restored} of ${attempted.length} attempted update(s) restored or unchanged; the report lists the values to restore.`,
      uncertain ? `The failed write outcome was uncertain. The recovery report records what could be verified; unresolved entries require inspection before retrying.` : '',
    ].filter(Boolean).join(' ');
    throw new ReportedError(message, { backup: backupFile, stopped_at: { id: c.id, name: label(c.name), kind: c.kind, stage, attempted: c.properties, captured: c.before, ...(error?.status ? { api_status: error.status } : {}), ...(error?.apiMessage ? { api_message: error.apiMessage } : {}), ...(live ? { live } : {}) }, rollback: results, not_attempted: changes.slice(index + 1).map(n => n.id) });
  };

  for (const [index, c] of changes.entries()) {
    const signal = interrupted();
    if (signal) await fail(c, index, { stage: 'interrupted', reason: `interrupted by ${signal} before writing.` });
    let live;
    try { live = await read(c); } catch (error) { await fail(c, index, { stage: 'read-before-write', error }); }
    const drifted = [...differences(live, c.before, c.expected_expression), ...renamed(live, c)];
    if (drifted.length) await fail(c, index, { stage: 'changed-before-write', reason: `someone edited ${drifted.join(', ')} after preflight.`, live: metadata(live) });
    attempted.push(c); // Track intent before the request: a lost response or readback can follow a successful write.
    let writeError = null;
    try { await api.request(c.resource, { action: 'update', id: c.id, properties: c.properties }); } catch (error) { writeError = error; }
    let after;
    try { after = await read(c); } catch (error) { await fail(c, index, { stage: 'readback', error: writeError ?? error, uncertain: true }); }
    if (matches(after, c.target, c.expected_expression)) { continue; }
    if (matches(after, c.before, c.expected_expression)) await fail(c, index, { stage: 'write', error: writeError, reason: writeError ? null : `Luzmo accepted the update but did not store ${differences(after, c.target, c.expected_expression).join(', ')}.` });
    await fail(c, index, { stage: 'readback', error: writeError, reason: `live values differ from both the captured and the approved values (${differences(after, c.target, c.expected_expression).join(', ')}).`, live: metadata(after), uncertain: true });
  }
  return { mode: 'applied', checked: changes.length, applied: attempted.length, ...(backupFile ? { backup: backupFile } : {}), resources: attempted.map(c => ({ id: c.id, kind: c.kind, name: label(c.name), before: c.before, after: c.target })) };
}
