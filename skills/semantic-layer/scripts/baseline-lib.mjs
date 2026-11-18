import { hash, label, metadata, same, ReportedError } from './common.mjs';
import { dependencies, excludedKeep } from './semantic-checks.mjs';

export const COVERAGE = ['newly-discovered', 'newly-reviewed', 'previously-reviewed'];
export const BASELINE_CLASSIFICATIONS = ['improvement', 'equivalent', 'justified', 'regression', 'unresolved'];
const comparable = value => ({ description: value?.description && Object.keys(value.description).length ? value.description : null, ai_context: value?.ai_context?.trim() ? value.ai_context : null });
const equal = (a, b) => same(comparable(a), comparable(b));
const changed = entry => !equal(entry.original, entry.proposed);
const short = value => hash(String(value ?? '')).slice(0, 10);
const timeOf = value => value.applied_at ?? value.reviewed_at ?? value.captured_at ?? null;

export function sourceKind(value) {
  if (value?.mode === 'preview' && Array.isArray(value.changes)) return 'preview';
  if (typeof value?.applied_at === 'string' && Array.isArray(value.resources)) return 'published';
  if (Array.isArray(value?.approved_ids) && typeof value?.preview_sha256 === 'string') return 'approval';
  if (typeof value?.capture_sha256 === 'string' && Array.isArray(value.resources) && value.resources.every(r => 'original' in r && 'proposed' in r && ['dataset', 'column', 'formula'].includes(r.kind))) return 'proposed';
  if (typeof value?.captured_at === 'string' && Array.isArray(value.resources) && Array.isArray(value.selection)) return 'captured';
  throw new Error('Unrecognized baseline source: pass captures, metadata proposals, update previews with their approvals, or artifacts/applied records.');
}

// An earlier proposal assessed a resource when it revised or held it, or kept it with a real assessment (not an exclusion from the proposal).
const assessed = e => e.kind === 'approved' || e.kind === 'published' || e.kind === 'proposed' && (['revise', 'hold'].includes(e.disposition) || e.disposition === 'keep' && typeof e.assessment === 'string' && e.assessment.trim() !== '' && !excludedKeep(e.assessment));

function summarizeResources(resources, removed) {
  const shared = resources.filter(r => r.status === 'shared');
  return { shared: shared.length, new: resources.length - shared.length, coverage: Object.fromEntries(COVERAGE.map(c => [c, resources.filter(r => r.coverage === c).length])), coverage_by_kind: Object.fromEntries(['dataset', 'column', 'formula'].map(k => [k, Object.fromEntries(COVERAGE.map(c => [c, resources.filter(r => r.kind === k && r.coverage === c).length]))])), removed: removed.length, expression_changed: shared.filter(r => r.expression_changed).length, upstream_expression_changed: shared.filter(r => r.upstream_expression_changed.length).length, renamed: shared.filter(r => r.renamed).length, states: Object.fromEntries([...new Set(shared.map(r => r.state))].map(s => [s, shared.filter(r => r.state === s).length])) };
}

// Sources are passed oldest first. Each resource is matched by ID only; names are reported, never used for matching.
export function buildBaseline(capture, sources) {
  const listed = sources.map(({ path, value }, index) => ({ index, path, value, kind: sourceKind(value), sha256: hash(value), at: timeOf(value) }));
  const previews = new Map(listed.filter(s => s.kind === 'preview').map(s => [s.sha256, s.value]));
  const history = new Map(), add = (id, entry) => { if (!history.has(id)) history.set(id, []); history.get(id).push(entry); };
  for (const s of listed) {
    const source = s.index;
    if (s.kind === 'captured') for (const r of s.value.resources) add(r.id, { source, kind: 'captured', name: r.name, metadata: metadata(r), expression: r.expression ?? null });
    if (s.kind === 'proposed') for (const r of s.value.resources) add(r.id, { source, kind: 'proposed', name: r.name, original: r.original, proposed: r.proposed, disposition: r.disposition, assessment: r.assessment, expression: r.expected_expression ?? null });
    if (s.kind === 'approval') {
      const preview = previews.get(s.value.preview_sha256);
      if (!preview) throw new Error(`Approval ${s.path} needs its approved update-preview.json in the same baseline (pass it before the approval).`);
      for (const c of preview.changes.filter(c => s.value.approved_ids.includes(c.id))) add(c.id, { source, kind: 'approved', name: c.name, before: c.before, target: c.target, expression: c.expected_expression ?? null });
    }
    if (s.kind === 'published') for (const r of s.value.resources) add(r.id, { source, kind: 'published', name: r.name, before: r.before, after: r.after });
  }
  const timed = listed.filter(s => s.at);
  const warnings = timed.some((s, i) => i && Date.parse(s.at) < Date.parse(timed[i - 1].at)) ? ['Baseline sources with timestamps are not in chronological order; pass them oldest first so “latest” is correct.'] : [];
  const current = new Map(capture.resources.map(r => [r.id, r])), resources = [];
  for (const r of capture.resources) {
    const entries = history.get(r.id) ?? [];
    const last = kind => entries.filter(e => e.kind === kind).at(-1) ?? null;
    if (!entries.length) { resources.push({ id: r.id, kind: r.kind, name: r.name, status: 'new', coverage: 'newly-discovered' }); continue; }
    const proposal = last('proposed'), published = last('published'), approved = last('approved'), live = metadata(r);
    const known = entries.filter(e => e.expression !== undefined).at(-1);
    const previousExpression = known ? known.expression : null, expression = r.expression ?? null;
    const before = new Set(dependencies(previousExpression).map(d => d.column_id)), after = new Set(dependencies(expression).map(d => d.column_id));
    const state = published && equal(live, published.after) ? 'published'
      : proposal && changed(proposal) && equal(live, proposal.proposed) ? 'live-matches-previous-proposal'
      : proposal && !equal(live, proposal.original) ? 'live-changed-since-proposal'
      : proposal && changed(proposal) ? 'proposed-not-published' : 'unchanged-since-baseline';
    resources.push({ id: r.id, kind: r.kind, name: r.name, status: 'shared', coverage: entries.some(assessed) ? 'previously-reviewed' : 'newly-reviewed', state, renamed: !same(entries.at(-1).name, r.name), previous_name: entries.at(-1).name,
      expression_changed: known ? previousExpression !== expression : false, previous_expression: previousExpression,
      dependencies_added: [...after].filter(id => !before.has(id)), dependencies_removed: [...before].filter(id => !after.has(id)), upstream_expression_changed: [],
      previous_proposal: proposal && { source: proposal.source, disposition: proposal.disposition, original: proposal.original, proposed: proposal.proposed, assessment: proposal.assessment },
      approved: approved && { source: approved.source, target: approved.target }, published: published && { source: published.source, after: published.after } });
  }
  // Propagate expression changes to dependents, so a semantic difference is not attributed to the dependent's own wording.
  const byId = new Map(resources.map(r => [r.id, r]));
  for (let grew = true; grew;) {
    grew = false;
    for (const r of resources) for (const d of dependencies(current.get(r.id).expression)) {
      const up = byId.get(d.column_id);
      if (r.status === 'shared' && up && (up.expression_changed || up.upstream_expression_changed?.length) && !r.upstream_expression_changed.includes(up.id)) { r.upstream_expression_changed.push(up.id); grew = true; }
    }
  }
  const removed = [...history].filter(([id]) => !current.has(id)).map(([id, entries]) => ({ id, name: entries.at(-1).name, last_source: entries.at(-1).source }));
  // Plan-level lists come from the newest proposal; an older proposal only contributes items about resources no newer proposal covered.
  const proposals = listed.filter(s => s.kind === 'proposed').reverse(), covered = new Set(), carried = { calculation_changes: [], questions: [], evaluation_cases: [] };
  proposals.forEach((s, rank) => {
    for (const k of Object.keys(carried)) for (const item of s.value[k] ?? []) {
      const ids = item.resource_ids ?? item.expected_resource_ids ?? [];
      if (rank === 0 || ids.length && ids.some(id => !covered.has(id))) carried[k].push({ ...item, source: s.index });
    }
    for (const r of s.value.resources) covered.add(r.id);
  });
  const shared = resources.filter(r => r.status === 'shared');
  return {
    schema_version: 1, capture_sha256: hash(capture), created_at: new Date().toISOString(),
    sources: listed.map(({ index, path, kind, sha256, at }) => ({ index, path, kind, sha256, at })),
    limitation: listed.some(s => s.kind !== 'preview') ? null : 'No previous capture, proposal, approval or published record was compared. This review does not establish continuity with earlier work.',
    warnings,
    summary: summarizeResources(resources, removed),
    resources, removed, previous: carried,
  };
}

// Words that carry boundaries, populations and aggregation distinctions; numbers and comparison symbols are matched separately.
const PRECISION = ['at least', 'at most', 'more than', 'less than', 'fewer than', 'strictly', 'inclusive', 'exclusive', 'or more', 'or less', 'includ\\p{L}*', 'exclud\\p{L}*', 'except', 'only', 'distinct', 'unique', 'rows?', 'median', 'mean', 'average', 'share of', 'proportion', 'ratio', 'rate', 'percentage', 'without', 'first', 'last', 'planned', 'actual'];
const TERMS = new RegExp(`(?<![\\p{L}\\p{N}])(?:${PRECISION.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
export function precisionTokens(value) {
  const all = [...Object.values(value?.description ?? {}), value?.ai_context ?? ''].join(' \n ');
  const numbers = all.replace(/(\d)[\s  '](?=\d{3}(?!\d))/g, '$1').match(/\d+(?:[.,]\d+)?/g) ?? [];
  return new Set([...numbers.map(n => n.replace(',', '.')), ...(all.match(/[≥≤<>%]/g) ?? []), ...(all.match(TERMS) ?? []).map(t => t.toLowerCase())]);
}

export function regressionCandidates(proposal, baseline) {
  const scopedIds = new Set(proposal.resources.map(r => r.id));
  const relevant = ids => !proposal.scope || ids.some(id => scopedIds.has(id));
  const prior = new Map(baseline.resources.filter(r => r.status === 'shared').map(r => [r.id, r])), out = [];
  const push = (check, ids, detail, { key, ...extra } = {}) => out.push({ key: `${check}:${key ?? ids[0]}`, check, resource_ids: ids, detail, ...extra });
  for (const r of proposal.resources) {
    const b = prior.get(r.id);
    if (!b) continue;
    const name = `${label(r.name)} (${r.id})`;
    if (b.renamed) push('renamed', [r.id], `${name} was “${label(b.previous_name)}” in the baseline; matched by ID.`);
    if (b.expression_changed) push('expression-changed', [r.id], `${name}: expression changed since the baseline. Attribute semantic differences to the expression before the wording.`, { previous: b.previous_expression, current: r.expected_expression });
    if (b.upstream_expression_changed.length) push('dependency-changed', [r.id], `${name}: depends on resources whose expression changed (${b.upstream_expression_changed.join(', ')}).`);
    const p = b.previous_proposal;
    if (!p) continue;
    if (p.disposition === 'hold' && r.disposition === 'revise') push('hold-released', [r.id], `${name} was held in the baseline and is now revised; confirm the reason for holding is resolved.`);
    if (equal(p.proposed, r.proposed)) continue;
    const reintroduced = [...Object.keys(p.proposed?.description ?? {}).map(l => [`description.${l}`, p.original?.description?.[l], p.proposed.description[l], r.proposed.description?.[l]]), ['ai_context', p.original?.ai_context, p.proposed?.ai_context, r.proposed.ai_context]]
      .filter(([, original, previous, now]) => original?.trim() && previous !== original && now === original).map(([field]) => field);
    if (reintroduced.length) push('reintroduced-source', [r.id], `${name}: ${reintroduced.join(', ')} returns to the source wording the baseline proposal corrected.`, { previous: p.proposed, current: r.proposed });
    const lost = [...precisionTokens(p.proposed)].filter(t => !precisionTokens(r.proposed).has(t));
    if (lost.length) push('precision-loss', [r.id], `${name}: terms or values in the baseline proposal are absent now: ${lost.join(', ')}. Absence is a signal only; read both versions.`, { previous: p.proposed, current: r.proposed });
    if (p.proposed?.ai_context?.trim() && !r.proposed.ai_context?.trim()) push('context-removed', [r.id], `${name}: baseline context is removed. ${r.original.ai_context?.trim() ? 'This clears captured context.' : 'This withdraws a draft addition; the captured context was already empty.'}`);
    if (!reintroduced.length && !lost.length) push('rewritten', [r.id], `${name}: wording differs from the baseline proposal.`, { previous: p.proposed, current: r.proposed });
  }
  const mentioned = new Set([...proposal.calculation_changes, ...proposal.questions, ...proposal.findings].flatMap(i => i.resource_ids ?? []));
  const titles = new Set(proposal.calculation_changes.map(c => c.title?.trim().toLowerCase()));
  for (const c of baseline.previous.calculation_changes) if (relevant(c.resource_ids ?? []) && !titles.has(c.title?.trim().toLowerCase()) && !(c.resource_ids ?? []).some(id => mentioned.has(id))) push('follow-up-dropped', c.resource_ids ?? [], `Baseline ${c.classification ?? ''} follow-up “${c.title}” is no longer in calculation_changes, questions or findings.`, { key: short(c.title) });
  const revised = new Set(proposal.resources.filter(r => r.disposition === 'revise').map(r => r.id)), asked = new Set(proposal.questions.map(q => q.question.trim()));
  for (const q of baseline.previous.questions) if (q.blocking && !asked.has(q.question?.trim()) && (q.resource_ids ?? []).some(id => revised.has(id) && !proposal.questions.some(n => n.resource_ids.includes(id)))) push('question-dropped', q.resource_ids, `Baseline blocking question “${q.question}” is gone while its resources are revised.`, { key: short(q.question) });
  const cases = new Set(proposal.evaluation_cases.map(c => c.question?.trim()));
  for (const c of baseline.previous.evaluation_cases) if (relevant(c.expected_resource_ids ?? []) && !cases.has(c.question?.trim())) push('evaluation-dropped', c.expected_resource_ids ?? [], `Baseline evaluation case “${c.question}” is no longer recorded.`, { key: short(c.question) });
  return out;
}

// Every candidate needs a classification before a publishable verdict; a known regression blocks it, and an unresolved conflict cannot ship in a revise.
export function reviewRegressions(proposal, baseline, capture) {
  if (baseline.schema_version !== 1 || baseline.capture_sha256 !== hash(capture)) throw new Error('baseline.json was built for a different capture; rerun baseline.mjs.');
  const reviews = proposal.baseline_review ?? [];
  if (!Array.isArray(reviews) || reviews.some(v => typeof v?.key !== 'string' || !BASELINE_CLASSIFICATIONS.includes(v.classification) || typeof v.note !== 'string' || !v.note.trim())) throw new Error(`baseline_review entries need key, classification (${BASELINE_CLASSIFICATIONS.join(', ')}) and a note.`);
  const byKey = new Map(reviews.map(v => [v.key, v]));
  const candidates = regressionCandidates(proposal, baseline).map(c => ({ ...c, classification: byKey.get(c.key)?.classification ?? null, note: byKey.get(c.key)?.note ?? '' }));
  const keys = new Set(candidates.map(c => c.key)), revised = new Set(proposal.resources.filter(r => r.disposition === 'revise' && !equal(r.original, r.proposed)).map(r => r.id));
  const blocking = candidates.filter(c => c.classification === 'unresolved' && c.resource_ids.some(id => revised.has(id)) || c.classification === 'regression' && proposal.verdict !== 'not-ready');
  if (blocking.length) throw new ReportedError(`${blocking.length} baseline difference(s) block this verdict: fix every regression (or mark the review not-ready) and hold resources with unresolved conflicts.`, { candidates: blocking.map(c => c.key) });
  const open = candidates.filter(c => !c.classification);
  if (open.length && proposal.verdict !== 'not-ready') throw new ReportedError(`${open.length} baseline difference(s) need a classification in proposal.baseline_review before a publishable verdict.`, { unclassified: open.map(c => ({ key: c.key, detail: c.detail })) });
  return { schema_version: 1, baseline_sha256: hash(baseline), sources: baseline.sources, limitation: baseline.limitation, summary: proposal.scope ? summarizeResources(baseline.resources.filter(r => proposal.scope.resource_ids.includes(r.id)), []) : baseline.summary, warnings: [...baseline.warnings, ...reviews.filter(v => !keys.has(v.key)).map(v => `baseline_review key ${v.key} matches no current difference.`)], candidates };
}
