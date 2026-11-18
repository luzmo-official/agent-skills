import { captureKnowledge, readKnowledge, knowledgeTarget } from './knowledge-lib.mjs';
import { same, uuid, label, ReportedError } from './common.mjs';
import { hint } from './apply-lib.mjs';

const ruleText = target => ({ name: target.name, content: target.content });
const agentSettings = target => ({ name: target.name, description: target.description, capabilities: target.capabilities, theme_id: target.theme_id });
const createProperties = target => ({ name: target.name, description: target.description, capabilities: target.capabilities, ...(target.theme_id === null ? {} : { theme_id: target.theme_id }) });

class StepFailure extends Error {
  constructor(stage, { error = null, reason = null, live = null, uncertain = false } = {}) {
    super(reason ?? error?.message ?? stage);
    Object.assign(this, { stage, error, live, uncertain });
  }
}

export async function applyKnowledge(api, capture, changes, { execute = false, maxPages = 20, interrupted = () => null, backup = null } = {}) {
  if (api.host !== capture.host || api.credentialMode === 'embed') throw new Error('Knowledge API host or credentials differ from the review.');
  const fresh = await captureKnowledge(api, { maxPages, selection: capture.selection, scope: capture.scope ?? null });
  if (!fresh.complete) throw new ReportedError('Could not read the complete AI rule/agent inventory; nothing was written.', { issues: fresh.issues });
  const reviewed = new Map(capture.resources.map(r => [r.id, r])), live = new Map(fresh.resources.map(r => [r.id, r]));
  const changed = [...new Set([...reviewed.keys(), ...live.keys()])].filter(id => !same(reviewed.get(id), live.get(id))).map(id => ({ id, name: label((live.get(id) ?? reviewed.get(id)).name), change: !live.has(id) ? 'removed' : !reviewed.has(id) ? 'added' : 'edited' }));
  if (changed.length) throw new ReportedError(`${changed.length} AI rule(s)/agent(s) changed since the capture; nothing was written. Recapture, carry the changes into knowledge-proposal.json and review again.`, { changed });
  const datasetIds = [...new Set(changes.filter(c => c.kind === 'agent').flatMap(c => c.target.dataset_ids))];
  const inaccessible = [];
  for (const id of datasetIds) {
    try {
      const response = await api.request('securable', { action: 'get', find: { where: { id, type: 'dataset' }, attributes: ['id', 'type'], limit: 1 } });
      if (response.rows?.length !== 1 || response.rows[0].id !== id || response.rows[0].type !== 'dataset') inaccessible.push({ id, problem: 'Not an accessible dataset for these credentials.' });
    } catch (error) { if (error.refused) throw error; inaccessible.push({ id, problem: error.message }); }
  }
  if (inaccessible.length) throw new ReportedError(`${inaccessible.length} approved agent dataset link(s) cannot be made; nothing was written.`, { inaccessible });
  if (!execute) return { mode: 'preflight', checked: fresh.resources.length, operations: changes.length, applied: 0 };
  // The backup always holds the full live inventory, also for a scoped review, so any rule or agent can be restored from it.
  let backupFile = null;
  if (backup) {
    const inventory = capture.scope ? await captureKnowledge(api, { maxPages, selection: capture.selection }) : fresh;
    if (!inventory.complete) throw new ReportedError('Could not read the full AI rule/agent inventory for the backup; nothing was written. Raise discovery_max_pages or check access, then rerun.', { issues: inventory.issues });
    backupFile = await backup(inventory);
  }

  const state = new Map(live), resourceOf = new Map(fresh.resources.map(r => [r.id, r.resource]));
  const created = {}, completed = [], undo = [];
  const readLive = (id, resource = resourceOf.get(id)) => readKnowledge(api, resource, id, null, { allowMissing: true });
  const what = id => `${resourceOf.get(id) === 'airule' ? 'rule' : 'agent'} "${label(state.get(id)?.name)}" (${id})`;

  // A create without a trustworthy ID is never adopted or retried: a name match cannot prove which resource this run made.
  async function unclearCreate(op, writeError) {
    let found = [];
    try {
      const candidates = [];
      for (let page = 0; page < maxPages; page++) {
        const response = await api.request(op.resource, { action: 'get', find: { attributes: ['id'], order: [['id', 'ASC']], limit: 100, offset: page * 100 } });
        const rows = Array.isArray(response.rows) ? response.rows : [];
        candidates.push(...rows.map(r => r.id).filter(id => uuid(id) && !resourceOf.has(id)));
        if (rows.length < 100) break;
      }
      for (const id of candidates) { const row = await readLive(id, op.resource); if (row && label(row.name) === label(op.fields.properties.name)) found.push(id); }
    } catch (error) {
      throw new StepFailure('write', { error, reason: `creation outcome unknown; listing resources failed (${error.message}).`, uncertain: true });
    }
    const reason = found.length > 1 ? `creation outcome unclear: ${found.length} new resources named "${label(op.fields.properties.name)}" exist (${found.join(', ')}).` : 'The create response supplied no trustworthy ID. Do not retry creation or delete a resource by name; inspect the candidate IDs against the backup and audit history first.';
    throw new StepFailure('write', { error: writeError, reason, live: { candidate_ids: found }, uncertain: true });
  }

  async function perform(op, onCreated = () => {}, onAttempt = () => {}) {
    const before = new Map(op.watch.map(id => [id, state.get(id)]));
    for (const id of op.watch) {
      let row;
      try { row = await readLive(id); } catch (error) { throw new StepFailure('read-before-write', { error }); }
      if (!same(row, before.get(id))) throw new StepFailure('changed-before-write', { reason: `${what(id)} was edited by someone else during this run.`, live: row });
    }
    onAttempt(before);
    let response = null, writeError = null;
    try { response = await api.request(op.resource, op.fields); } catch (error) { writeError = error; }
    let ids = op.watch;
    if (op.fields.action === 'create') {
      if (!uuid(response?.id)) await unclearCreate(op, writeError);
      const id = response.id;
      resourceOf.set(id, op.resource);
      onCreated(id);
      ids = [id];
    }
    const rows = new Map();
    try { for (const id of ids) rows.set(id, await readLive(id)); } catch (error) { throw new StepFailure('readback', { error: writeError ?? error, uncertain: true }); }
    if (op.done(rows, before)) {
      for (const [id, row] of rows) if (row) state.set(id, row); else state.delete(id);
      return ids[0];
    }
    if (op.fields.action === 'create') {
      for (const [id, row] of rows) if (row) state.set(id, row);
      throw new StepFailure('readback', { error: writeError, reason: 'the created resource differs from the approved values', live: Object.fromEntries(rows) });
    }
    if ([...rows].every(([id, row]) => same(row, before.get(id)))) throw new StepFailure('write', { error: writeError, reason: writeError ? null : 'Luzmo accepted the request but the change is not visible on readback' });
    throw new StepFailure('readback', { error: writeError, reason: 'live state differs from both the previous and the approved state', live: Object.fromEntries(rows), uncertain: true });
  }

  const remove = (key, id, step) => ({ key, step, resource: resourceOf.get(id), fields: { action: 'delete', id }, watch: [id], done: rows => rows.get(id) === null });
  const ruleCreate = (key, text) => ({ key, step: 'create rule', resource: 'airule', fields: { action: 'create', properties: text }, watch: [], done: rows => { const row = [...rows.values()][0]; return !!row && same(ruleText(knowledgeTarget(row)), text) && row.published_version === null && !row.linked_agent_ids.length; } });
  const ruleSave = (key, id, text, previous = ruleText(knowledgeTarget(state.get(id)))) => ({ key, step: 'save rule text', resource: 'airule', fields: { action: 'update', id, properties: text }, watch: [id], done: (rows, before) => {
    const row = rows.get(id), pre = before.get(id);
    return !!row && same(ruleText(knowledgeTarget(row)), text) && same(row.published_version, pre.published_version) && same(row.linked_agent_ids, pre.linked_agent_ids) && row.organization_id === pre.organization_id;
  }, undo: () => ruleSave(key, id, previous) });
  const rulePublish = (key, id, version, previous = state.get(id).published_version) => ({ key, step: version ? 'publish rule version' : 'unpublish rule', resource: 'airule', fields: { action: 'update', id, properties: { published_version_id: version?.id ?? null } }, watch: [id], done: (rows, before) => same(rows.get(id), { ...before.get(id), published_version: version }), undo: () => rulePublish(key, id, previous) });
  const agentCreate = (key, target) => ({ key, step: 'create agent', resource: 'agent', fields: { action: 'create', properties: createProperties(target) }, watch: [], done: rows => { const row = [...rows.values()][0]; return !!row && same(agentSettings(row), agentSettings(target)) && !row.dataset_ids.length && !row.rule_refs.length; } });
  const agentSave = (key, id, settings) => {
    const current = state.get(id), previous = agentSettings(current), properties = { name: settings.name, description: settings.description, capabilities: settings.capabilities, ...(settings.theme_id !== null || current.theme_id !== null ? { theme_id: settings.theme_id } : {}) };
    return { key, step: 'save agent settings', resource: 'agent', fields: { action: 'update', id, properties }, watch: [id], done: (rows, before) => same(rows.get(id), { ...before.get(id), ...settings }), undo: () => agentSave(key, id, previous) };
  };
  // Links go through the agent (documented roles linked_rules and Securables). The agent always applies each rule's published version.
  const link = (key, agentId, field, relatedId, action) => {
    const rule = field === 'rule_refs';
    const toggle = (values, value) => action === 'associate' ? [...new Set([...values, value])].sort() : values.filter(v => v !== value);
    return { key, step: `${action} ${rule ? 'rule' : 'dataset'} ${relatedId}`, resource: 'agent', fields: { action, id: agentId, resource: { role: rule ? 'linked_rules' : 'Securables', id: relatedId } }, watch: rule ? [agentId, relatedId] : [agentId], done: (rows, before) => {
      const agent = structuredClone(before.get(agentId));
      agent[field] = toggle(agent[field], relatedId);
      if (!same(rows.get(agentId), agent)) return false;
      if (!rule) return true;
      const linked = structuredClone(before.get(relatedId));
      linked.linked_agent_ids = toggle(linked.linked_agent_ids, agentId);
      return same(rows.get(relatedId), linked);
    }, undo: () => link(key, agentId, field, relatedId, action === 'associate' ? 'dissociate' : 'associate') };
  };

  const step = async op => {
    const signal = interrupted();
    if (signal) throw Object.assign(new StepFailure('interrupted', { reason: `interrupted by ${signal} before writing` }), { step: op.step });
    try {
      let pending;
      const id = await perform(op, newId => {
        pending = { key: op.key, step: op.step, forward: { ...op, watch: [newId] }, before: new Map([[newId, undefined]]), confirmed: false, build: () => remove(op.key, newId, `delete ${resourceOf.get(newId)} ${newId}`) };
        undo.push(pending);
      }, before => {
        if (op.undo) { pending = { key: op.key, step: op.step, forward: op, before, confirmed: false, build: op.undo }; undo.push(pending); }
      });
      if (pending) pending.confirmed = true;
      return id;
    } catch (error) { throw Object.assign(error instanceof StepFailure ? error : new StepFailure('unexpected', { error }), { step: op.step }); }
  };

  const rollback = async () => {
    const results = [];
    for (const entry of [...undo].reverse()) {
      let op;
      try {
        if (!entry.confirmed) {
          const rows = new Map();
          for (const id of entry.forward.watch) rows.set(id, await readLive(id));
          if ([...rows].every(([id, row]) => same(row, entry.before.get(id)) || row === null && entry.before.get(id) === undefined)) {
            results.push({ key: entry.key, undo: entry.step, status: 'unchanged' }); continue;
          }
          if (!entry.forward.done(rows, entry.before)) {
            results.push({ key: entry.key, undo: entry.step, status: 'skipped-newer-edit', reason: 'Failed step differs from both the prior and approved state; no recovery write was made.', live: Object.fromEntries(rows) }); continue;
          }
          for (const [id, row] of rows) if (row) state.set(id, row); else state.delete(id);
        }
        op = entry.build();
      } catch (error) { results.push({ key: entry.key, undo: entry.step, status: 'not-rolled-back', reason: error.message }); continue; }
      try { await perform(op); results.push({ key: entry.key, undo: entry.step, status: 'rolled-back' }); }
      catch (error) { results.push({ key: entry.key, undo: entry.step, status: error.stage === 'changed-before-write' ? 'skipped-newer-edit' : 'not-rolled-back', reason: error.message, ...(error.error?.apiMessage ? { api_message: error.error.apiMessage } : {}), ...(error.live ? { live: error.live } : {}) }); }
    }
    return results;
  };

  for (const [index, c] of changes.entries()) {
    const target = c.target;
    try {
      let id = c.id;
      if (c.kind === 'rule') {
        if (id === null) { id = await step(ruleCreate(c.key, ruleText(target))); created[c.key] = id; }
        else if (!same(ruleText(knowledgeTarget(state.get(id))), ruleText(target))) await step(ruleSave(c.key, id, ruleText(target)));
        const current = state.get(id);
        const version = target.publication === 'latest' ? current.latest_version : target.publication === 'unpublish' ? null : current.published_version;
        if ((current.published_version?.id ?? null) !== (version?.id ?? null)) await step(rulePublish(c.key, id, version));
      } else {
        if (id === null) { id = await step(agentCreate(c.key, target)); created[c.key] = id; }
        else if (!same(agentSettings(state.get(id)), agentSettings(target))) await step(agentSave(c.key, id, agentSettings(target)));
        for (const [field, wanted] of [['dataset_ids', target.dataset_ids], ['rule_refs', target.rule_refs.map(key => created[key] ?? key).sort()]]) {
          const unresolved = wanted.filter(value => !uuid(value));
          if (unresolved.length) throw Object.assign(new StepFailure('plan', { reason: `new rule ${unresolved.join(', ')} was not created in this run` }), { step: 'resolve rule links' });
          const current = state.get(id)[field];
          for (const relatedId of wanted.filter(v => !current.includes(v))) await step(link(c.key, id, field, relatedId, 'associate'));
          for (const relatedId of current.filter(v => !wanted.includes(v))) await step(link(c.key, id, field, relatedId, 'dissociate'));
        }
      }
      completed.push({ key: c.key, id });
    } catch (error) {
      const failure = error instanceof StepFailure ? error : Object.assign(new StepFailure('unexpected', { error }), { step: 'unknown' });
      const results = await rollback(), restored = results.filter(r => ['rolled-back', 'unchanged'].includes(r.status)).length;
      const message = [
        `Knowledge apply stopped at ${c.kind} ${c.key} (${failure.step}): ${failure.message.replace(/\.$/, '')}.`,
        hint(failure.error),
        !undo.length ? 'Nothing earlier in this run needed rolling back.' : restored === undo.length ? `Recovery verified for all ${restored} tracked step(s), restored or already unchanged.` : `Rollback incomplete: ${restored} of ${undo.length} step(s) undone; the report lists what remains.`,
        failure.uncertain ? 'The failed step had an uncertain outcome. Check its recovery status and any candidate IDs before retrying.' : '',
      ].filter(Boolean).join(' ');
      throw new ReportedError(message, {
        backup: backupFile, created,
        stopped_at: { attempted: c.target, captured: c.id ? reviewed.get(c.id) : null, key: c.key, kind: c.kind, step: failure.step, stage: failure.stage, ...(failure.error?.status ? { api_status: failure.error.status } : {}), ...(failure.error?.apiMessage ? { api_message: failure.error.apiMessage } : {}), ...(failure.live ? { live: failure.live } : {}) },
        rollback: results,
        notes: results.some(r => r.status === 'rolled-back' && r.undo === 'save rule text') ? ['Restored rule text is saved as a new draft version; the reverted draft stays in version history.'] : [],
        not_attempted: changes.slice(index + 1).map(n => n.key),
      });
    }
  }
  return { mode: 'applied', applied: completed.length, ...(backupFile ? { backup: backupFile } : {}), resources: completed, created };
}
