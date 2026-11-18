import { hash, same, uuid, label, ReportedError } from './common.mjs';
import { AGENT_CAPABILITIES, AGENT_NAME_MAX, RULE_CONTENT_BUDGET, RULE_CONTENT_MAX, RULE_NAME_MAX, isLocale, localizedProblems } from './limits.mjs';

const text = (value, message) => { if (typeof value !== 'string' || !value.trim()) throw new Error(message); };
const unique = values => Array.isArray(values) && new Set(values).size === values.length;
const sortedIds = values => {
  if (!Array.isArray(values) || values.some(v => !uuid(v.id)) || !unique(values.map(v => v.id))) throw new Error('Missing or invalid knowledge associations.');
  return values.map(v => v.id).sort();
};
const ruleInclude = [{ model: 'AIRuleVersion', as: 'latest_version' }, { model: 'AIRuleVersion', as: 'published_version' }, { model: 'Agent', as: 'linked_agents', attributes: ['id', 'name'] }];
const agentInclude = [{ model: 'Securable', attributes: ['id', 'name', 'type'] }, { model: 'AIRule', as: 'linked_rules', attributes: ['id', 'name', 'published_version_id'] }];
const attributes = { airule: ['id', 'name', 'organization_id', 'latest_version_id', 'published_version_id'], agent: ['id', 'name', 'description', 'capabilities', 'theme_id'] };
const version = v => v == null ? null : { id: v.id, name: v.name, content: v.content };

export function knowledgeSnapshot(resource, row) {
  if (!uuid(row.id)) throw new Error('Invalid knowledge resource ID.');
  if (resource === 'airule') {
    if (!row.latest_version || row.latest_version.id !== row.latest_version_id || !uuid(row.latest_version_id) || row.published_version_id !== null && (!uuid(row.published_version_id) || row.published_version?.id !== row.published_version_id)) throw new Error('Rule version content is incomplete.');
    return { id: row.id, resource, kind: 'rule', name: row.name, organization_id: row.organization_id, latest_version: version(row.latest_version), published_version: version(row.published_version), linked_agent_ids: sortedIds(row.linked_agents) };
  }
  if (!Array.isArray(row.capabilities) || !Array.isArray(row.securables) || row.securables.some(s => s.type !== 'dataset')) throw new Error('Agent capabilities or dataset associations are incomplete.');
  return { id: row.id, resource, kind: 'agent', name: row.name, description: row.description ?? null, capabilities: row.capabilities, theme_id: row.theme_id ?? null, dataset_ids: sortedIds(row.securables), rule_refs: sortedIds(row.linked_rules) };
}

export async function readKnowledge(api, resource, id, names = null, { allowMissing = false } = {}) {
  const response = await api.request(resource, { action: 'get', find: { where: { id }, attributes: attributes[resource], include: resource === 'airule' ? ruleInclude : agentInclude, limit: 1 } });
  if (allowMissing && Array.isArray(response.rows) && !response.rows.length) return null;
  if (response.rows?.length !== 1 || response.rows[0].id !== id) throw new Error(`Knowledge resource inaccessible: ${id}.`);
  if (names) for (const row of [response.rows[0], ...(response.rows[0].securables ?? []), ...(response.rows[0].linked_rules ?? []), ...(response.rows[0].linked_agents ?? [])]) if (row.name) names[row.id] = label(row.name);
  return knowledgeSnapshot(resource, response.rows[0]);
}

export async function captureKnowledge(api, { maxPages = 20, selection = [], scope = null } = {}) {
  if (api.credentialMode === 'embed') throw new Error('Knowledge discovery requires API credentials.');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('Knowledge discovery page limit must be 1–100.');
  const capture = { schema_version: 1, host: api.host, selection, captured_at: new Date().toISOString(), complete: true, issues: [], names: {}, resources: [] };
  if (scope !== null) {
    if (!Array.isArray(scope) || scope.some(r => !['airule', 'agent'].includes(r?.resource) || !uuid(r.id))) throw new Error('knowledge_scope must list {resource: airule or agent, id: UUID}.');
    capture.scope = scope;
    const queue = [...scope], seen = new Set();
    for (let index = 0; index < queue.length; index++) {
      const { resource, id } = queue[index];
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const row = await readKnowledge(api, resource, id, capture.names);
        capture.resources.push(row);
        for (const linked of row.kind === 'rule' ? row.linked_agent_ids : row.rule_refs) queue.push({ resource: row.kind === 'rule' ? 'agent' : 'airule', id: linked });
      } catch (error) { if (error.refused) throw error; capture.complete = false; capture.issues.push({ resource, id, error: error.message }); }
    }
  } else for (const resource of ['airule', 'agent']) {
    const seen = new Set();
    let finished = false;
    try {
      for (let page = 0; page < maxPages; page++) {
        const response = await api.request(resource, { action: 'get', find: { attributes: ['id'], order: [['id', 'ASC']], limit: 100, offset: page * 100 } });
        if (!Array.isArray(response.rows) || response.rows.length > 100) throw new Error('Invalid knowledge inventory response.');
        for (const row of response.rows) {
          if (!uuid(row.id) || seen.has(row.id)) throw new Error('Invalid or repeated inventory ID.');
          seen.add(row.id);
          capture.resources.push(await readKnowledge(api, resource, row.id, capture.names));
        }
        if (response.rows.length < 100) { finished = true; break; }
      }
      if (!finished) throw new Error('Knowledge inventory page cap reached.');
    } catch (error) { if (error.refused) throw error; capture.complete = false; capture.issues.push({ resource, error: error.message }); }
  }
  const ids = new Set(capture.resources.map(r => r.id));
  if (capture.resources.some(r => (r.kind === 'agent' ? r.rule_refs : r.linked_agent_ids).some(id => !ids.has(id)))) {
    capture.complete = false; capture.issues.push({ error: 'Linked rule or agent is missing from the inventory.' });
  }
  const byId = new Map(capture.resources.map(r => [r.id, r]));
  if (capture.resources.some(r => r.kind === 'agent' ? r.rule_refs.some(id => !byId.get(id)?.linked_agent_ids?.includes(r.id)) : r.linked_agent_ids.some(id => !byId.get(id)?.rule_refs?.includes(r.id)))) {
    capture.complete = false; capture.issues.push({ error: 'Rule/agent associations changed during capture or are inconsistent; recapture before proposing changes.' });
  }
  return capture;
}

export function knowledgeTarget(snapshot) {
  return snapshot.kind === 'rule' ? { name: snapshot.latest_version.name, content: snapshot.latest_version.content, publication: 'preserve' } : { name: snapshot.name, description: snapshot.description, capabilities: snapshot.capabilities, theme_id: snapshot.theme_id, dataset_ids: snapshot.dataset_ids, rule_refs: snapshot.rule_refs };
}

export function seedKnowledge(capture, languages = ['en']) {
  return { schema_version: 1, capture_sha256: hash(capture), languages, verdict: 'not-reviewed', assessment: '', questions: [], resources: capture.resources.map(r => ({ key: r.id, id: r.id, kind: r.kind, disposition: 'keep', original: structuredClone(r), proposed: structuredClone(knowledgeTarget(r)), assessment: '', evidence: [], scope_rationale: '', questions: [] })) };
}

const localeMap = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(v => typeof v === 'string');
function agentProblems(p, key) {
  const problems = [...localizedProblems(p.name, { field: `${key} name`, max: AGENT_NAME_MAX, requireTrimmed: true }), ...(p.description === null ? [] : localizedProblems(p.description, { field: `${key} description`, requireTrimmed: true }))];
  if (!Object.values(p.name).some(v => v.trim())) problems.push(`${key} name: at least one locale needs text`);
  return problems;
}

export function buildKnowledgePreview(proposal, capture) {
  if (proposal.schema_version !== 1 || capture.schema_version !== 1 || proposal.capture_sha256 !== hash(capture)) throw new Error('Knowledge proposal is not bound to the capture.');
  if (!['ready', 'ready-with-corrections', 'not-ready'].includes(proposal.verdict)) throw new Error('Record the knowledge review verdict.');
  text(proposal.assessment, 'Record an overall knowledge assessment.');
  if (!unique(proposal.languages) || !proposal.languages.length || proposal.languages.some(l => !isLocale(l))) throw new Error('Knowledge proposal languages must be unique supported Luzmo locales.');
  if (!Array.isArray(proposal.resources) || !Array.isArray(proposal.questions) || proposal.questions.some(q => typeof q !== 'string')) throw new Error('Invalid knowledge proposal.');
  const originals = new Map(capture.resources.map(r => [r.id, r])), entries = new Map(), changes = [], limitProblems = [];
  const allowedDatasets = new Set(capture.selection);
  for (const r of proposal.resources) {
    if (typeof r.key !== 'string' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(r.key) || entries.has(r.key) || !['rule', 'agent'].includes(r.kind) || !['keep', 'revise', 'hold', 'create'].includes(r.disposition)) throw new Error('Invalid or repeated knowledge proposal identity.');
    entries.set(r.key, r);
    text(r.assessment, `Review every existing/proposed rule and agent: ${r.key}.`);
    if (!Array.isArray(r.evidence) || !Array.isArray(r.questions) || r.questions.some(q => typeof q !== 'string')) throw new Error('Knowledge evidence and questions must be arrays.');
    if (r.disposition === 'create' || r.id === null) {
      if (r.id !== null || r.original !== null || !r.key.startsWith('new:') || !['create', 'hold'].includes(r.disposition)) throw new Error('New knowledge resources require a local new: key, null ID and original.');
    } else if (r.key !== r.id || !originals.has(r.id) || originals.get(r.id).kind !== r.kind || !same(r.original, originals.get(r.id))) throw new Error('Knowledge originals or identity changed.');
    const p = r.proposed;
    if (!p || typeof p !== 'object') throw new Error('Knowledge target required.');
    const expectedKeys = r.kind === 'rule' ? ['name', 'content', 'publication'] : ['name', 'description', 'capabilities', 'theme_id', 'dataset_ids', 'rule_refs'];
    if (!same(Object.keys(p).sort(), expectedKeys.sort())) throw new Error('Unsupported knowledge properties.');
    if (r.kind === 'rule') {
      text(p.name, 'Rule name required.'); text(p.content, 'Rule text required.');
      if (!['preserve', 'latest', 'unpublish'].includes(p.publication)) throw new Error(`${r.key}: publication must be preserve, latest or unpublish.`);
    } else {
      if (!localeMap(p.name) || p.description !== null && !localeMap(p.description)) throw new Error(`${r.key}: agent name and description must be locale maps (description may be null).`);
      if (!unique(p.capabilities) || p.capabilities.some(c => !AGENT_CAPABILITIES.includes(c)) || p.theme_id !== null && typeof p.theme_id !== 'string' || !unique(p.dataset_ids) || p.dataset_ids.some(id => !uuid(id)) || !unique(p.rule_refs) || p.rule_refs.some(id => typeof id !== 'string')) throw new Error('Invalid agent capabilities, theme or links.');
      if (r.original) for (const field of ['name', 'description']) for (const locale of Object.keys(r.original[field] ?? {})) if (!Object.hasOwn(p[field] ?? {}, locale)) throw new Error('Retain existing agent locales.');
      const previous = new Set(r.original?.dataset_ids ?? []);
      if (p.dataset_ids.some(id => !previous.has(id) && !allowedDatasets.has(id))) throw new Error('New agent dataset links must be in the selected dataset scope.');
    }
    const changed = r.id === null || !same(p, knowledgeTarget(r.original));
    if (r.disposition === 'keep' && changed) throw new Error('Unchanged knowledge entry has a changed target.');
    if (['create', 'revise'].includes(r.disposition) && changed) {
      if (r.kind === 'rule') {
        if (p.name !== p.name.trim() || p.content !== p.content.trim()) limitProblems.push(`${r.key}: remove leading/trailing whitespace from the rule name and text`);
        if (p.name.length > RULE_NAME_MAX) limitProblems.push(`${r.key} name: ${p.name.length} characters exceeds the Luzmo limit of ${RULE_NAME_MAX}`);
        if (p.content.length > RULE_CONTENT_MAX) limitProblems.push(`${r.key} content: ${p.content.length} characters exceeds the Luzmo limit of ${RULE_CONTENT_MAX}`);
        else if (p.content.length > RULE_CONTENT_BUDGET && p.content !== r.original?.latest_version?.content) limitProblems.push(`${r.key} content: ${p.content.length} characters exceeds the working budget of ${RULE_CONTENT_BUDGET}; split it into focused rules or tighten the wording`);
      } else limitProblems.push(...agentProblems(p, r.key));
      if (!capture.complete) throw new Error('Complete knowledge discovery before executable changes.');
      if (proposal.questions.length || r.questions.length) throw new Error('Resolve blocking knowledge questions or hold the affected proposal.');
      if (!r.evidence.length) throw new Error('Knowledge changes require evidence.');
      text(r.scope_rationale, 'Explain rule applicability, publication impact or agent scope before changing it.');
      if (r.kind === 'agent') for (const language of proposal.languages) { text(p.name[language], 'Changed agents need a name in each agreed language.'); text(p.description?.[language], 'Changed agents need a public description in each agreed language.'); }
      changes.push({ key: r.key, id: r.id, kind: r.kind, resource: r.kind === 'rule' ? 'airule' : 'agent', before: r.original, target: p, scope_rationale: r.scope_rationale });
    }
  }
  if (limitProblems.length) throw new ReportedError(`${limitProblems.length} proposed rule/agent value(s) would be rejected by Luzmo or exceed working budgets; fix knowledge-proposal.json and re-render.`, { problems: limitProblems });
  if (capture.resources.some(r => !entries.has(r.id))) throw new Error('Every captured rule and agent requires review.');
  for (const r of proposal.resources.filter(r => r.kind === 'agent')) for (const key of r.proposed.rule_refs) if (entries.get(key)?.kind !== 'rule') throw new Error('Agent rule link is unknown or is not a rule.');
  const created = new Set(changes.filter(c => c.id === null).map(c => c.key));
  for (const c of changes.filter(c => c.kind === 'agent')) if (c.target.rule_refs.some(key => key.startsWith('new:') && !created.has(key))) throw new Error('A new linked rule must also be an executable creation proposal.');
  for (const c of changes.filter(c => c.id === null)) if (capture.resources.some(r => r.kind === c.kind && label(r.name).trim().toLowerCase() === label(c.target.name).trim().toLowerCase())) throw new Error('A resource with this name already exists; review it before creating a duplicate.');
  const newNames = new Set();
  for (const c of changes.filter(c => c.id === null)) {
    const name = `${c.kind}:${label(c.target.name).trim().toLowerCase()}`;
    if (newNames.has(name)) throw new Error('Duplicate proposed creation name; reconcile the new resources.');
    newNames.add(name);
  }
  return { schema_version: 1, mode: 'knowledge-preview', host: capture.host, capture_sha256: hash(capture), proposal_sha256: hash(proposal), verdict: proposal.verdict, changes, reviewed: proposal.resources.length };
}

export function approvedKnowledge(preview, approval) {
  if (!['ready', 'ready-with-corrections'].includes(preview.verdict)) throw new Error(`The rules and agents verdict is "${preview.verdict}"; only ready or ready-with-corrections proposals can be applied. Resolve the blockers, record a new verdict and render the review again.`);
  if (approval.schema_version !== 1 || approval.preview_sha256 !== hash(preview) || !approval.reviewer?.trim() || !Number.isFinite(Date.parse(approval.reviewed_at)) || !unique(approval.approved_keys) || !approval.approved_keys.length) throw new Error('Knowledge approval requires this preview hash, reviewer, timestamp and explicit keys.');
  const selected = approval.approved_keys.map(key => preview.changes.find(c => c.key === key));
  if (selected.some(c => !c)) throw new Error('Knowledge approval contains an unknown or held proposal.');
  const selectedKeys = new Set(selected.map(c => c.key));
  if (selected.some(c => c.kind === 'agent' && c.target.rule_refs.some(key => key.startsWith('new:') && !selectedKeys.has(key)))) throw new Error('Approve the required new rule along with its agent, or revise the links.');
  const changedRules = new Set(preview.changes.filter(c => c.kind === 'rule').map(c => c.key));
  if (selected.some(c => c.kind === 'agent' && c.target.rule_refs.some(key => changedRules.has(key) && !selectedKeys.has(key)))) throw new Error('The agent review depends on a proposed rule edit. Approve that rule too or review the agent against the retained rule.');
  return [...selected].sort((a, b) => (a.kind === 'rule' ? 0 : 1) - (b.kind === 'rule' ? 0 : 1));
}
