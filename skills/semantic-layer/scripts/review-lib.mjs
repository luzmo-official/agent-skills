import { renderHtml } from './review-html.mjs';
import { readinessLines, baselineLines } from './review-evidence.mjs';
import { renderKnowledgeMarkdown } from './knowledge-html.mjs';
import { metadata, same, contextLength, budget, hash, label, md, uuid, ReportedError } from './common.mjs';
import { DESCRIPTION_BUDGET, DESCRIPTION_MAX, isLocale, localizedProblems } from './limits.mjs';
import { expressionFacts, statusPhrases, usageReferences, provenancePhrases, maintenancePhrases, duplicateExpressions, contextProblems, redirectTargets, validateEvidence, onlyIndirectEvidence, validateEvaluationCases, evaluationWarnings, answerReadiness, validateBlockers, excludedKeep, deferredHold, simpleColumn, aliasesOnly, resourceSelection, normalizedExpression, plainAggregation, usageEvidence, FINDING_CATEGORIES, FINDING_BASES, CALCULATION_CLASSES, CALCULATION_ORIGINS } from './semantic-checks.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireText = (value, message) => { if (typeof value !== 'string' || !value.trim()) throw new Error(message); };
export function seedProposal(capture, languages, scope = null) {
  if (capture.resources.some(r => r.kind === 'dashboard')) throw new Error('Dashboard metadata is outside the scope of this skill. Recapture to retain dashboards as usage evidence only.');
  const resources = scope ? capture.resources.filter(r => scope.resource_ids.includes(r.id)) : capture.resources;
  return { schema_version: 1, capture_sha256: hash(capture), ...(scope ? { scope } : {}), languages, review_language: 'en', verdict: 'not-reviewed', business_brief: '', capture_limitations_acknowledged: '', findings: [], questions: [], calculation_changes: [], evaluation_cases: [], blockers: [], baseline_review: [], independent_review: '', resources: resources.map(r => ({ id: r.id, resource: r.resource, kind: r.kind, dataset_id: r.dataset_id, name: r.name, original: structuredClone(metadata(r)), expected_expression: r.expression ?? null, proposed: structuredClone(metadata(r)), disposition: 'keep', assessment: '', evidence: [], knowledge_migrations: [], allow_clear: false })) };
}
// How a revised resource differs from its source, so a translation-only pass is not counted as a rewrite of meaning.
export function reviseType(r) {
  const before = r.original.description ?? {}, after = r.proposed.description ?? {};
  const edited = Object.keys(before).some(l => before[l] !== after[l]), added = Object.keys(after).filter(l => !Object.hasOwn(before, l)).length, context = r.original.ai_context !== r.proposed.ai_context;
  if (edited) return 'text_changed';
  if (!added) return context ? 'context_only' : 'no_difference';
  return context ? 'translation_and_context' : Object.keys(before).length ? 'translation_only' : 'new_description';
}
export function dispositionSummary(resources) {
  const by = Object.fromEntries(['dataset', 'column', 'formula'].map(k => [k, { keep: 0, revise: 0, hold: 0 }])), revise = { translation_only: 0, new_description: 0, text_changed: 0, context_only: 0, translation_and_context: 0, no_difference: 0 };
  for (const r of resources) { by[r.kind][r.disposition]++; if (r.disposition === 'revise') revise[reviseType(r)]++; }
  return { by_kind: by, revise };
}
// A recommended formula's name, description and AI context follow the same contract as captured metadata, because IQ reads them the same way once the formula exists.
function checkProposedFormula(c, languages, resources, otherNames, { warnings, limitProblems, budgetProblems, referenceProblems }) {
  const where = `Calculation candidate “${c.title}”`, p = c.proposed;
  if (c.classification !== 'optional' || !Array.isArray(c.resource_ids) || c.resource_ids.length) throw new Error(`${where} proposed metadata belongs only on a new optional formula without resource_ids.`);
  if (!object(p) || Object.keys(p).some(k => !['name', 'description', 'ai_context'].includes(k))) throw new Error(`${where} proposed supports name, description and ai_context only.`);
  for (const k of ['name', 'description']) {
    if (!object(p[k])) throw new Error(`${where} proposed ${k} must be a locale map such as {"en": "..."}; a recommended formula needs both a name and a description.`);
    limitProblems.push(...localizedProblems(p[k], { field: `${where} ${k}`, max: k === 'description' ? DESCRIPTION_MAX : Infinity, requireTrimmed: true }));
    for (const locale of languages) requireText(p[k][locale], `${where} proposed ${k} is missing target locale ${locale}.`);
  }
  for (const [locale, text] of Object.entries(p.description)) if (typeof text === 'string' && text.length > DESCRIPTION_BUDGET) budgetProblems.push(`${where} description.${locale}: ${text.length} characters exceeds the tooltip budget of ${DESCRIPTION_BUDGET}`);
  if (p.ai_context !== undefined && p.ai_context !== null && (typeof p.ai_context !== 'string' || !p.ai_context.trim())) throw new Error(`${where} proposed ai_context must be nonempty text or null.`);
  if (typeof p.ai_context === 'string' && p.ai_context !== p.ai_context.trim()) limitProblems.push(`${where} ai_context: remove leading/trailing whitespace`);
  if (contextLength(p.ai_context) > budget('formula')) throw new Error(`${where} encoded AI context exceeds the working budget of ${budget('formula')}.`);
  const value = { description: p.description, ai_context: p.ai_context ?? null };
  referenceProblems.push(...usageReferences(value).map(phrase => `${where} ${phrase}`), ...usageReferences({ description: p.name, ai_context: null }).map(phrase => `${where} ${phrase.replace(/^description./, 'name.')}`));
  for (const phrase of [...statusPhrases(value), ...provenancePhrases(value), ...maintenancePhrases(value)]) warnings.push(`${where} ${phrase}; state the meaning directly and keep sources in evidence.`);
  for (const problem of contextProblems(value)) warnings.push(`${where} ai_context ${problem}.`);
  const taken = new Set(Object.values(p.name).filter(n => typeof n === 'string').map(n => n.trim().toLowerCase()));
  const clashes = [...resources.map(r => [r.name, `${label(r.name)} (${r.id})`]), ...otherNames.map(([name, title]) => [name, `candidate “${title}”`])].filter(([name]) => Object.values(name ?? {}).some(n => typeof n === 'string' && taken.has(n.trim().toLowerCase()))).map(([, owner]) => owner);
  if (clashes.length) warnings.push(`${where} proposed name is already used by ${clashes.join(', ')}; choose a distinct name or describe the existing resource instead.`);
}
const newFormula = c => c.classification === 'optional' && Array.isArray(c.resource_ids) && !c.resource_ids.length;
export function buildPreview(proposal, capture, baselineCoverage = null) {
  if (proposal.schema_version !== 1 || capture.schema_version !== 1 || proposal.capture_sha256 !== hash(capture)) throw new Error('Proposal is not bound to this capture.');
  requireText(proposal.business_brief, 'Complete the business brief before review.');
  if (proposal.review_summary !== undefined) {
    const summary = proposal.review_summary;
    if (!object(summary) || Object.keys(summary).some(key => !['purpose', 'highlights', 'limitations'].includes(key))) throw new Error('Review summary supports purpose, highlights and limitations only.');
    if (summary.purpose !== undefined) requireText(summary.purpose, 'Review summary purpose must be text.');
    for (const key of ['highlights', 'limitations']) if (summary[key] !== undefined && (!Array.isArray(summary[key]) || summary[key].some(value => typeof value !== 'string' || !value.trim()))) throw new Error(`Review summary ${key} must be a list of nonempty text.`);
  }
  // Language of agent-authored explanations; fixed interface labels are English.
  if (proposal.review_language !== undefined && (typeof proposal.review_language !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(proposal.review_language))) throw new Error('review_language must be a language code such as en or fr: the language the user writes in.');
  if (!['ready', 'ready-with-corrections', 'not-ready'].includes(proposal.verdict)) throw new Error('Record a metadata publication verdict before rendering.');
  if (!capture.complete) requireText(proposal.capture_limitations_acknowledged, 'Document incomplete capture and its review consequences.');
  if (!Array.isArray(proposal.languages) || !proposal.languages.length || new Set(proposal.languages).size !== proposal.languages.length || proposal.languages.some(l => !isLocale(l))) throw new Error('Proposal languages must be unique supported Luzmo locales.');
  for (const k of ['resources', 'findings', 'questions', 'calculation_changes', 'evaluation_cases']) if (!Array.isArray(proposal[k])) throw new Error(`Missing ${k} array.`);
  const originals = new Map(capture.resources.map(r => [r.id, r]));
  const scope = proposal.scope;
  if (scope !== undefined && (!object(scope) || !Array.isArray(scope.resource_ids) || !scope.resource_ids.length || new Set(scope.resource_ids).size !== scope.resource_ids.length || scope.resource_ids.some(id => !originals.has(id)) || typeof scope.rationale !== 'string' || !scope.rationale.trim())) throw new Error('Focused scope needs unique captured resource_ids and a rationale describing the requested boundaries.');
  const scopedIds = new Set(scope?.resource_ids ?? originals.keys());
  if (originals.size !== capture.resources.length || proposal.resources.length !== scopedIds.size || proposal.resources.some(r => !scopedIds.has(r.id))) throw new Error('Resource inventory is incomplete or duplicated within the declared scope.');
  for (const r of capture.resources) {
    const endpoint = { dataset: 'securable', column: 'column', formula: 'formula' }[r.kind];
    if (!uuid(r.id) || !endpoint || r.resource !== endpoint || !capture.selection.includes(r.dataset_id) || r.kind === 'dataset' && r.id !== r.dataset_id) throw new Error('Invalid captured resource identity or scope; dashboard metadata is outside the scope of this skill.');
    if (r.expression != null && typeof r.expression !== 'string') throw new Error('Captured expression must be a string or null.');
  }
  const keepTexts = new Map(), seen = new Set(), changes = [], warnings = [], limitProblems = [], budgetProblems = [], referenceProblems = [];
  const unreliable = new Set(proposal.calculation_changes.filter(c => ['defect', 'unvalidated'].includes(c.classification)).flatMap(c => c.resource_ids ?? []));
  for (const r of proposal.resources) {
    const source = originals.get(r.id);
    if (!source || seen.has(r.id) || r.kind !== source.kind || r.resource !== source.resource || r.dataset_id !== source.dataset_id || !same(r.name, source.name)) throw new Error('Resource identity differs from capture.');
    seen.add(r.id);
    if (!['keep', 'revise', 'hold'].includes(r.disposition)) throw new Error(`Invalid disposition: ${r.id}.`);
    requireText(r.assessment, `Assess every resource individually: ${r.id}.`);
    if (!Array.isArray(r.evidence) || !Array.isArray(r.knowledge_migrations)) throw new Error('Evidence and knowledge_migrations must be arrays.');
    validateEvidence(r.evidence, r.id);
    if (!same(r.original, metadata(source)) || r.expected_expression !== (source.expression ?? null)) throw new Error(`Original metadata or expression changed: ${r.id}.`);
    if (!object(r.proposed) || Object.keys(r.proposed).sort().join(',') !== 'ai_context,description') throw new Error('Proposals may change only description and ai_context.');
    const p = r.proposed;
    if (p.description !== null && (!object(p.description) || Object.values(p.description).some(v => typeof v !== 'string'))) throw new Error('Descriptions must be locale maps or null.');
    if (p.ai_context !== null && typeof p.ai_context !== 'string') throw new Error('ai_context must be a plain string or null.');
    if (p.ai_context !== r.original.ai_context && typeof p.ai_context === 'string' && !p.ai_context.trim()) throw new Error(`Use null instead of blank AI context: ${r.id}.`);
    const changed = !same(r.original, p);
    if (r.disposition === 'keep') {
      const excluded = excludedKeep(r.assessment);
      if (excluded) warnings.push(`${label(r.name)} (${r.id}) keep ${JSON.stringify(excluded)}: keep must reflect an assessment of sufficiency; use hold only for a concrete owner question, otherwise assess the resource or agree the scope with the user.`);
      const key = r.assessment.trim().toLowerCase();
      keepTexts.set(key, [...keepTexts.get(key) ?? [], r.assessment.trim()]);
    }
    if (r.disposition === 'keep' && changed) throw new Error(`Keep resource has a changed proposal: ${r.id}.`);
    if (contextLength(p.ai_context) > budget(r.kind) && changed) throw new Error(`Encoded AI context exceeds working budget: ${r.id}.`);
    if (contextLength(p.ai_context) > budget(r.kind)) warnings.push(`${r.id}: retained context exceeds working budget.`);
    const touched = new Set(Object.keys(p.description ?? {}).filter(l => p.description[l] !== r.original.description?.[l]));
    for (const [locale, text] of Object.entries(p.description ?? {})) {
      if (text.length <= DESCRIPTION_BUDGET) continue;
      if (touched.has(locale)) budgetProblems.push(`${label(r.name)} (${r.id}) description.${locale}: ${text.length} characters exceeds the tooltip budget of ${DESCRIPTION_BUDGET}`);
      else warnings.push(`${label(r.name)} (${r.id}) existing description.${locale}: ${text.length} characters exceeds the tooltip budget of ${DESCRIPTION_BUDGET}; shorten it when revising this resource.`);
    }
    if (r.dashboard_subject !== undefined && (typeof r.dashboard_subject !== 'string' || !r.dashboard_subject.trim())) throw new Error(`dashboard_subject must explain why dashboards are the business subject of the data: ${r.id}.`);
    const dashboardSubject = Boolean(r.dashboard_subject);
    if (!changed) for (const phrase of usageReferences(p, { dashboardSubject })) warnings.push(`${label(r.name)} (${r.id}) existing ${phrase}; revise it to state the meaning directly.`);
    for (const phrase of maintenancePhrases(p)) warnings.push(`${label(r.name)} (${r.id})${changed ? '' : ' existing'} ${phrase}; record duplicates, legacy status and naming repairs as a follow-up or finding, state only this resource's own scope and query rules in context, and do not move the narration there.`);
    if (changed) {
      const where = `${label(r.name)} (${r.id})`;
      if (p.description) limitProblems.push(...localizedProblems(p.description, { field: `${where} description`, max: DESCRIPTION_MAX, requireTrimmed: true, only: touched }));
      if (typeof p.ai_context === 'string' && p.ai_context !== r.original.ai_context && p.ai_context !== p.ai_context.trim()) limitProblems.push(`${where} ai_context: remove leading/trailing whitespace`);
      if (!r.evidence.length) throw new Error(`Changed resource lacks evidence: ${r.id}.`);
      if (onlyIndirectEvidence(r.evidence)) warnings.push(`${where}: change rests only on dashboard usage or inference; usage does not establish meaning.`);
      for (const phrase of statusPhrases(p)) warnings.push(`${where} ${phrase} reports verification status; state the known meaning or raise an owner question.`);
      referenceProblems.push(...usageReferences(p, { dashboardSubject }).map(phrase => `${where} ${phrase}`));
      for (const phrase of provenancePhrases(p)) warnings.push(`${where} ${phrase}; keep provenance in evidence, not metadata.`);
      for (const problem of contextProblems(p)) warnings.push(`${where} ai_context ${problem}.`);
      if (p.ai_context !== r.original.ai_context) {
        if (p.ai_context?.trim() && !r.original.ai_context?.trim() && simpleColumn(source) && !aliasesOnly(p.ai_context)) warnings.push(`${where} simple identifier/name/geographic column: context is usually null unless a query rule or discovery alias is needed.`);
        const targets = redirectTargets(p.ai_context, capture.resources.filter(o => o.id !== r.id && !Object.values(o.name ?? {}).some(n => Object.values(r.name ?? {}).includes(n))));
        if (targets.length) warnings.push(`${where} ai_context tells IQ to answer with another resource (${targets.join(', ')}); review whether this preserves a necessary documented selection convention with an explicit scope and supported target. Otherwise state this resource's own scope or query rule. Naming a column as a filter, grouping or date role is fine; the warning alone does not establish an error.`);
        if (p.ai_context && unreliable.has(r.id)) warnings.push(`${where} ai_context is added to a resource with an open defect or unvalidated calculation follow-up; do not invent a use case for it. Keep the limitation public and use null or only a query rule the current expression supports.`);
      }
      for (const locale of Object.keys(r.original.description ?? {})) if (!Object.hasOwn(p.description ?? {}, locale)) throw new Error(`Existing locale removed: ${r.id}/${locale}.`);
      for (const locale of proposal.languages) requireText(p.description?.[locale], `Changed resource missing target locale: ${r.id}/${locale}.`);
      if ((r.original.ai_context && !p.ai_context?.trim() || Object.entries(r.original.description ?? {}).some(([l, text]) => text?.trim() && !p.description?.[l]?.trim())) && r.allow_clear !== true) throw new Error(`Explicit allow_clear required: ${r.id}.`);
      if (r.original.ai_context?.trim() && !p.ai_context?.trim() && !r.knowledge_migrations.length) throw new Error(`Record preserved, relocated or removed context in knowledge_migrations: ${r.id}.`);
      if (r.disposition === 'revise') {
        if (proposal.questions.some(q => q.blocking === true && (!(q.resource_ids ?? []).length || q.resource_ids.includes(r.id)))) throw new Error(`Resolve blocking metadata question before revise: ${r.id}.`);
        const properties = {};
        if (!same(r.original.description, p.description)) properties.description = p.description;
        if (r.original.ai_context !== p.ai_context) properties.ai_context = p.ai_context;
        changes.push({ id: r.id, resource: r.resource, kind: r.kind, dataset_id: r.dataset_id, name: r.name, before: r.original, expected_expression: r.expected_expression, target: p, properties });
      }
    }
  }
  const proposedNames = proposal.calculation_changes.filter(c => object(c?.proposed?.name)).map(c => [c.proposed.name, c.title]);
  for (const c of proposal.calculation_changes) if (object(c) && c.proposed !== undefined) checkProposedFormula(c, proposal.languages, capture.resources, proposedNames.filter(([name]) => name !== c.proposed.name), { warnings, limitProblems, budgetProblems, referenceProblems });
  for (const [, texts] of keepTexts) if (texts.length > 10) warnings.push(`${texts.length} keep resources share the same assessment (${JSON.stringify(texts[0].slice(0, 80))}); boilerplate does not show each resource was assessed individually.`);
  if (referenceProblems.length) throw new ReportedError(`${referenceProblems.length} proposed value(s) cite dashboards or charts as a source; state the supported meaning directly, reassess the claim, and move unresolved meaning to an owner question.`, { problems: referenceProblems });
  if (limitProblems.length) throw new ReportedError(`${limitProblems.length} proposed value(s) would be rejected by Luzmo; fix proposal.json and re-render.`, { problems: limitProblems });
  if (budgetProblems.length) throw new ReportedError(`${budgetProblems.length} proposed description(s) exceed the tooltip budget; shorten them to the meaning, unit and limits a reader needs, then re-render.`, { problems: budgetProblems });
  for (const q of proposal.questions) {
    requireText(q.question, 'Owner question needs question text.');
    if (typeof q.blocking !== 'boolean' || !Array.isArray(q.resource_ids) || q.resource_ids.some(id => !originals.has(id))) throw new Error('Owner question needs blocking and valid resource_ids.');
  }
  // A hold needs a question for someone to answer; a skipped assessment is not a hold.
  const held = proposal.resources.filter(r => r.disposition === 'hold'), asked = new Set(proposal.questions.flatMap(q => q.resource_ids)), followed = new Set(proposal.calculation_changes.flatMap(c => c.resource_ids ?? []));
  const deferred = held.filter(r => deferredHold(r.assessment)), unasked = held.filter(r => !asked.has(r.id) && !asked.has(r.dataset_id) && !followed.has(r.id));
  const sample = list => list.slice(0, 3).map(r => `${label(r.name)} (${r.id})`).join(', ') + (list.length > 3 ? ', …' : '');
  if (deferred.length) warnings.push(`${deferred.length} hold resource(s) read as skipped assessments, not blocked decisions (${sample(deferred)}). Assess them from their expression, usage and the question set, or ask the user in chat to narrow the scope; hold only what a named owner or user must decide.`);
  if (unasked.length) warnings.push(`${unasked.length} hold resource(s) are not covered by any owner question or calculation follow-up (${sample(unasked)}). Add a question naming the resource or its dataset and what decision unblocks it, or change the outcome.`);
  if (held.length > proposal.resources.length * 0.2) warnings.push(`${held.length} of ${proposal.resources.length} resources are on hold; state in review_summary.limitations what is held and why, and confirm the scope with the user before surfacing the review.`);
  for (const finding of proposal.findings) {
    if (finding.category !== undefined && !FINDING_CATEGORIES.includes(finding.category)) throw new Error(`Finding category must be one of ${FINDING_CATEGORIES.join(', ')}.`);
    if (finding.basis !== undefined && !FINDING_BASES.includes(finding.basis)) throw new Error(`Finding basis must be one of ${FINDING_BASES.join(', ')}.`);
    if (!['critical', 'high', 'medium', 'low'].includes(finding.severity) || !Array.isArray(finding.resource_ids) || finding.resource_ids.some(id => !originals.has(id))) throw new Error('Finding needs severity and valid resource_ids.');
    for (const k of ['before_quote', 'proposed_quote', 'impact', 'suggested_replacement']) if (typeof finding[k] !== 'string') throw new Error(`Finding needs ${k}; use empty text for an absent original or a non-text fix.`);
  }
  for (const c of proposal.calculation_changes) {
    for (const k of ['title', 'reason', 'intended_question', 'result_grain', 'population', 'validation_needed']) requireText(c[k], `Calculation candidate needs ${k}.`);
    if (!CALCULATION_CLASSES.includes(c.classification) || c.status !== 'not-approved' || !Array.isArray(c.resource_ids) || c.resource_ids.some(id => !originals.has(id)) || !Array.isArray(c.dependencies) || !Array.isArray(c.boundary_cases)) throw new Error('Invalid calculation candidate.');
    const where = `Calculation candidate “${c.title}”`;
    if (c.evidence !== undefined) {
      if (!Array.isArray(c.evidence)) throw new Error(`${where} evidence must be an array.`);
      validateEvidence(c.evidence, where);
    }
    if (c.origin !== undefined && (!newFormula(c) || !CALCULATION_ORIGINS.includes(c.origin))) throw new Error(`${where} origin must be ${CALCULATION_ORIGINS.join(' or ')}, and only on a new optional formula without resource_ids.`);
    if (c.origin === 'evidenced' && !usageEvidence(c.evidence ?? [])) throw new Error(`${where} is evidenced but cites no source-metadata, convention, dashboard or owner evidence; cite where the customer defines or uses it, or mark it suggested.`);
    if (!newFormula(c)) continue;
    if (!c.origin) warnings.push(`${where} proposes a new calculation without an origin; mark it evidenced (the customer defines or uses it) or suggested (your own recommendation).`);
    const candidate = normalizedExpression(c.expression_candidate);
    if (candidate && plainAggregation(candidate) && !(c.origin === 'evidenced' && object(c.proposed?.name))) warnings.push(`${where} is a single aggregation of one column, which charts and IQ build without a saved formula; recommend only calculations that add business logic, grouping or a denominator, or that give a measure the business name the customer already uses (evidenced, with a proposed name).`);
    const existing = capture.resources.filter(r => normalizedExpression(r.expression) === candidate);
    if (candidate && existing.length) warnings.push(`${where} repeats the expression of ${existing.map(r => `${label(r.name)} (${r.id})`).join(', ')}; describe or repair the existing resource instead of adding another.`);
  }
  for (const k of ['blockers', 'baseline_review']) if (proposal[k] !== undefined && !Array.isArray(proposal[k])) throw new Error(`${k} must be an array.`);
  if (proposal.independent_review !== undefined && typeof proposal.independent_review !== 'string') throw new Error('independent_review must be text.');
  validateBlockers(proposal.blockers ?? [], originals);
  validateEvaluationCases(proposal.evaluation_cases, originals);
  warnings.push(...evaluationWarnings(proposal.evaluation_cases));
  const accounted = new Set([...proposal.calculation_changes, ...proposal.questions, ...proposal.findings].flatMap(i => i.resource_ids));
  for (const r of capture.resources.filter(r => scopedIds.has(r.id))) {
    const facts = expressionFacts(r.expression);
    if (!facts || accounted.has(r.id)) continue;
    for (const pitfall of facts.pitfalls) warnings.push(`${label(r.name)} (${r.id}): ${pitfall} Record it in calculation_changes or a finding.`);
    const outside = facts.dependencies.filter(id => !originals.has(id));
    if (outside.length) warnings.push(`${label(r.name)} (${r.id}) depends on resources outside the capture (${outside.join(', ')}); their meaning was not reviewed.`);
  }
  for (const group of duplicateExpressions(capture.resources.filter(r => scopedIds.has(r.id)))) {
    if (proposal.calculation_changes.some(c => c.classification === 'duplicate' && group.every(id => c.resource_ids.includes(id)))) continue;
    warnings.push(`${group.map(id => `${label(originals.get(id).name)} (${id})`).join(', ')} have identical expressions. Record them in one duplicate follow-up; identical expressions establish neither a canonical resource nor that one can be removed.`);
  }
  // `duplicate` and `optional_origins` are counted only when present so previews rendered before they existed keep their hash.
  const followUps = Object.fromEntries(['defect', 'unvalidated', 'data-gap', 'optional', 'duplicate'].map(k => [k, proposal.calculation_changes.filter(c => c.classification === k).length]).filter(([k, n]) => k !== 'duplicate' || n));
  const origins = Object.fromEntries(CALCULATION_ORIGINS.map(o => [o, proposal.calculation_changes.filter(c => c.origin === o).length]));
  if (Object.values(origins).some(Boolean)) followUps.optional_origins = origins;
  return { schema_version: 1, mode: 'preview', verdict: proposal.verdict, host: capture.host, capture_sha256: hash(capture), proposal_sha256: hash(proposal), summary: { ...(scope ? { scope, excluded: capture.resources.length - scopedIds.size } : {}), reviewed: proposal.resources.length, keep: proposal.resources.filter(r => r.disposition === 'keep').length, revise: proposal.resources.filter(r => r.disposition === 'revise').length, hold: proposal.resources.filter(r => r.disposition === 'hold').length, dispositions: dispositionSummary(proposal.resources), ...baselineCoverage && { baseline_coverage: baselineCoverage }, updates: changes.length, contexts_before: proposal.resources.filter(r => r.original.ai_context?.trim()).length, contexts_after: proposal.resources.filter(r => r.proposed.ai_context?.trim()).length, contexts_cleared: proposal.resources.filter(r => r.original.ai_context?.trim() && !r.proposed.ai_context?.trim()).length, readiness: { metadata: proposal.verdict, calculations: followUps, answers: answerReadiness(proposal.evaluation_cases), resource_selection: resourceSelection(proposal.evaluation_cases) } }, warnings, changes };
}
export function renderReview(proposal, preview, knowledge = null, regression = null, iq = null, meta = {}) {
  const lines = ['# Semantic layer review', '', 'PRIVATE REVIEW: includes internal AI context. Share only with authorized reviewers.', '', `Business brief: ${proposal.business_brief}`, '', `Reviewed ${preview.summary.reviewed}; keep ${preview.summary.keep}; revise ${preview.summary.revise}; on hold (needs clarification) ${preview.summary.hold}; proposed updates ${preview.summary.updates}.`, '', 'This is a proposal, not publication or proof of improved IQ answers.', '', `Preview SHA-256: ${hash(preview)}`, '', '## Questions and limitations', '', proposal.capture_limitations_acknowledged || 'No capture limitations acknowledged.', '', ...proposal.questions.map(q => `- ${q.blocking ? 'BLOCKING' : 'Optional'}: ${q.question} (${q.resource_ids.join(', ')})`), ...preview.warnings.map(w => `- ${w}`), '', '## Exhaustive checklist', '', '| Resource | ID | Kind | Outcome | Assessment | Encoded context (before → after) |', '| --- | --- | --- | --- | --- | --- |', ...proposal.resources.map(r => `| ${md(label(r.name))} | ${r.id} | ${r.kind} | ${r.disposition} | ${md(r.assessment)} | ${contextLength(r.original.ai_context)} → ${contextLength(r.proposed.ai_context)}/${budget(r.kind)} |`), '', '## Exact comparisons', ''];
  if (proposal.scope) lines.splice(4, 0, `Review scope: ${proposal.scope.rationale} ${preview.summary.excluded} captured resources are outside this assessment.`, '');
  for (const r of proposal.resources) {
    lines.push(`### ${label(r.name)} — ${r.id}`, '', `Outcome: ${r.disposition}. ${r.assessment}`, '', 'Evidence:', '', ...r.evidence.map(e => `- ${typeof e === 'string' ? e : JSON.stringify(e)}`), '', 'Before:', '', '```json', JSON.stringify(r.original, null, 2), '```', '', 'Proposed:', '', '```json', JSON.stringify(r.proposed, null, 2), '```', '', 'Captured expression:', '', '```text', r.expected_expression ?? '(no expression)', '```', '', 'Preserved or migrated knowledge:', '', ...r.knowledge_migrations.map(m => `- ${typeof m === 'string' ? m : JSON.stringify(m)}`), '');
  }
  for (const [heading, entries] of [['Calculation and data follow-ups (not approved)', proposal.calculation_changes], ['Question evaluation cases', proposal.evaluation_cases]]) if (entries.length) lines.push(`## ${heading}`, '', '```json', JSON.stringify(entries, null, 2), '```', '');
  if (knowledge) lines.push(renderKnowledgeMarkdown(knowledge.proposal, knowledge.preview));
  lines.splice(4, 0, `Metadata verdict: **${proposal.verdict}**. Calculation readiness is assessed separately.`, '', '## Readiness', '', ...readinessLines(proposal, preview).map(l => `- ${l}`), ...(proposal.blockers ?? []).map(b => `- Blocked: ${b.capability} — ${b.reason} (${b.resource_ids.join(', ') || 'whole review'})`), '', '## Baseline and regression review', '', ...baselineLines(regression).map(l => `- ${l}`), ...(regression?.candidates ?? []).map(c => `- ${c.classification ?? 'UNCLASSIFIED'} · ${c.key}: ${c.detail}${c.note ? ` — ${c.note}` : ''}`), '', `Independent review: ${proposal.independent_review?.trim() || 'not recorded.'}`, '');
  lines.splice(lines.indexOf('## Exhaustive checklist'), 0, '## Findings by severity', '', ...proposal.findings.map(f => `- ${f.severity.toUpperCase()}${f.category ? ` · ${f.category}` : ''}${f.basis ? ` · basis: ${f.basis}` : ''} · ${f.impact} (${f.resource_ids.join(', ')})`), '', '```json', JSON.stringify(proposal.findings, null, 2), '```', '');
  const markdown = lines.join('\n');
  return { markdown, html: renderHtml(proposal, preview, knowledge, regression, iq, meta) };
}

