import { isLocale } from './limits.mjs';

// Mechanical checks for deterministic invariants. They flag candidates for semantic review; they never prove meaning.
// Phrase lists are English only; text in other locales relies on the semantic review.
export const EVIDENCE_TYPES = ['expression', 'source-metadata', 'convention', 'dashboard', 'profile', 'query', 'owner', 'research', 'inference'];
export const FINDING_BASES = ['expression', 'observed', 'untested', 'owner-decision'];
export const FINDING_CATEGORIES = ['metadata-correction', 'calculation-defect', 'needs-validation', 'unresolved-definition', 'data-limitation', 'regression'];
export const CALCULATION_CLASSES = ['defect', 'unvalidated', 'optional', 'data-gap', 'duplicate'];
export const CALCULATION_ORIGINS = ['evidenced', 'suggested'];
export const EVALUATION_STATUSES = ['not-run', 'pass', 'fail', 'partial'];
export const EVALUATION_CATEGORIES = ['normal', 'empty-population', 'boundary', 'duplicate-history', 'date-role', 'current-vs-historical', 'multilingual-discovery', 'recorded-vs-actual', 'public-definition', 'unanswerable', 'regression'];
export const CORE_EVALUATION_CATEGORIES = EVALUATION_CATEGORIES.slice(0, 8);
const AGGREGATIONS = ['COUNT', 'COUNTD', 'DISTINCTCOUNT', 'SUM', 'AVG', 'AVERAGE', 'MEDIAN', 'MIN', 'MAX', 'PERCENTILE', 'STDEV'];
const GROUPINGS = ['GROUPED', 'GROUPFULL', 'GROUPINEX'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;

const REFERENCE = /\{([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}):([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\}/gi;
export function dependencies(expression) {
  const found = new Map();
  for (const [, dataset_id, column_id] of String(expression ?? '').matchAll(REFERENCE)) found.set(column_id, { dataset_id, column_id });
  return [...found.values()];
}
const unquoted = expression => String(expression).replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");
// Top-level argument lists of every call to `name`, honouring nested parentheses; quoted text is blanked first.
function calls(expression, name) {
  const source = unquoted(expression), result = [], pattern = new RegExp(`(?<![A-Z0-9_])${name}\\s*\\(`, 'gi');
  for (const match of source.matchAll(pattern)) {
    const args = [];
    let depth = 0, start = match.index + match[0].length, i = start;
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === '(') depth++;
      else if (c === ')') { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) { args.push(source.slice(start, i).trim()); start = i + 1; }
    }
    args.push(source.slice(start, i).trim());
    result.push(args);
  }
  return result;
}
const nonNullElse = arg => { const [inner] = calls(arg, 'IF'); return /^IF\s*\(/i.test(arg) && inner?.length >= 3 && inner[2].toUpperCase() !== 'NULL'; };

export function expressionFacts(expression) {
  if (typeof expression !== 'string' || !expression.trim()) return null;
  const plain = unquoted(expression).replace(REFERENCE, 'ref');
  const pitfalls = [];
  for (const [arg] of calls(expression, 'COUNT')) if (nonNullElse(arg)) pitfalls.push('COUNT(IF(…)) has a non-null else branch, so it counts every row, not only rows meeting the condition.');
  for (const name of ['COUNTD', 'DISTINCTCOUNT']) for (const [arg] of calls(expression, name)) if (nonNullElse(arg)) pitfalls.push(`${name}(IF(…)) has a non-null else branch, which adds one extra distinct value.`);
  return {
    dependencies: dependencies(expression).map(d => d.column_id),
    aggregations: AGGREGATIONS.filter(a => calls(expression, a).length),
    divides: plain.includes('/'),
    relative_to_now: /(?<![A-Z0-9_])(?:NOW|TODAY)\s*\(/i.test(plain),
    coalesces_missing: /(?<![A-Z0-9_])(?:COALESCE|IFNULL)\s*\(/i.test(plain),
    grouping: GROUPINGS.filter(g => calls(expression, g).length),
    pitfalls,
  };
}
export const normalizedExpression = expression => typeof expression === 'string' && expression.trim() ? expression.replace(/\s+/g, ' ').trim() : null;
// One aggregation of one column or of all rows. Charts and IQ build these without a saved formula, so recommending one adds nothing.
const PLAIN_AGGREGATION = new RegExp(`^(?:(?:${AGGREGATIONS.join('|')})\\s*\\(\\s*(?:ref|[A-Za-z_][\\w.]*|\\*|1)\\s*\\)|COUNTR\\s*\\(\\s*\\))$`, 'i');
export const plainAggregation = expression => PLAIN_AGGREGATION.test(unquoted(normalizedExpression(expression) ?? '').replace(REFERENCE, 'ref'));
// Evidence that the customer already defines or uses a calculation. Research, inference and profiles alone make it a suggestion.
const USAGE_EVIDENCE = ['source-metadata', 'convention', 'dashboard', 'owner'];
export const usageEvidence = items => items.some(i => USAGE_EVIDENCE.includes(i?.type));

// Phrases that report verification status instead of meaning.
const STATUS_PHRASE = /\b(?:not (?:yet )?(?:been )?(?:verified|validated|confirmed|documented|profiled|checked)|unverified|unvalidated|undocumented|unit (?:is )?(?:unspecified|unknown)|(?:must|should|needs to) be (?:validated|verified|confirmed)|to be (?:validated|verified|confirmed)|confirm [^.]{0,40}before use)\b/i;
export function statusPhrases(value) {
  const texts = [...Object.entries(value?.description ?? {}).map(([locale, t]) => [`description.${locale}`, t]), ['ai_context', value?.ai_context]];
  return texts.filter(([, t]) => typeof t === 'string' && STATUS_PHRASE.test(t)).map(([field, t]) => `${field}: “${t.match(STATUS_PHRASE)[0]}”`);
}

// Usage-source references (dashboards, and charts or reports cited as where a meaning was seen) and provenance narration.
// A backstop for the semantic review: absence of these phrases does not make a claim supported.
const DASHBOARD_TERM = /(?<!\p{L})dashboard/iu;
const USAGE_SOURCE = /(?<!\p{L})(?:(?:as |like )?(?:shown|seen|displayed|used|plotted|visuali[sz]ed|reported|labell?ed|tracked) (?:in|on|by) (?:the |a |an |all |existing |several |some )?(?:charts?|graphs?|widgets?|visuali[sz]ations?|reports?)|(?:charts?|graphs?|widgets?|visuali[sz]ations?) (?:use|uses|show|shows|display|displays|track|tracks|plot|plots|label|labels))(?!\p{L})/iu;
const PROVENANCE = /(?<!\p{L})(?:according to (?:the )?(?:brief|owner|documentation|profil\w*|sample|capture|research|website|existing (?:metadata|description))|based on (?:the )?(?:profil\w*|sample|capture|brief|research|existing (?:metadata|description)|previous (?:description|proposal))|(?:observed|found|seen) in (?:the )?(?:sample|profil\w*|capture)|inferred from|(?:the )?owner (?:confirmed|said|stated|indicated)|(?:previous|earlier|original) (?:description|context|proposal|version)|this (?:description|context|definition) (?:was|has been)|(?:was|were) (?:corrected|migrated|moved) (?:from|to))(?!\p{L})/iu;
const metadataTexts = value => [...Object.entries(value?.description ?? {}).map(([locale, t]) => [`description.${locale}`, t]), ['ai_context', value?.ai_context]].filter(([, t]) => typeof t === 'string');
const matches = (value, patterns) => metadataTexts(value).flatMap(([field, t]) => patterns.filter(([p]) => p.test(t)).map(([p, why]) => `${field}: “${t.match(p)[0]}” ${why}`));
// Blocking: metadata states meaning directly, never where it was seen. `dashboardSubject` is set only when dashboards are the business subject of the data itself (for example product-usage analytics).
export const usageReferences = (value, { dashboardSubject = false } = {}) => matches(value, [...dashboardSubject ? [] : [[DASHBOARD_TERM, 'mentions dashboards']], [USAGE_SOURCE, 'cites charts or reports as a usage source']]);
// Warning only: these phrases have rare legitimate business uses.
// Review history ("previous review", "now corrected") and naming repair belong in findings, not metadata. Qualified so business wording such as "status was changed to closed" passes.
const HISTORY = /(?<!\p{L})(?:(?:previous|prior|earlier|last) (?:review|proposal|iteration|revision)|(?:now|has been|have been|was|were) corrected|(?:was|were) (?:changed|updated|revised|rewritten|renamed) (?:in|during|following) (?:the |this |a )?(?:review|audit|iteration|proposal)|(?:following|after|during) (?:the |this |a )?(?:previous |latest |last )?(?:review|audit|iteration))(?!\p{L})/iu;
export const provenancePhrases = value => matches(value, [[PROVENANCE, 'narrates provenance or review history'], [HISTORY, 'narrates review history']]);
// Catalogue maintenance and implementation narration: duplicate inventories, legacy notes and expression walkthroughs.
// Warning only; the semantic pass decides whether a supported selection cue remains.
const MAINTENANCE = /(?<!\p{L})(?:(?:the )?same (?:calculation|expression|formula|computation|logic) as|identical (?:to|expression|calculation|formula)|duplicates? of|duplicates (?:the|this|another)|is (?:a |an exact )?duplicate|copy of (?:the|another|this)|kept for (?:backward )?compatibility|legacy (?:formula|column|field|metric)|deprecated (?:formula|column|field|metric)|(?:is|was) deprecated|(?:the|this) (?:underlying )?(?:expression|formula) (?:computes|calculates|takes|uses|divides|sums|returns)|implemented (?:as|by|with)|this (?:formula|column|field|metric) (?:computes|calculates|divides|sums|takes|uses)|(?:calculated|derived) (?:column|field)\s*:)(?!\p{L})/iu;
// Naming-repair notes, legacy labels and reciprocal "same as <name>" pointers. A resource's context states its own meaning; the repair or sibling relationship is a follow-up.
// Case-sensitive on purpose: only a quoted, snake_case or capitalised resource name after the pointer counts, not "same as the order date" or "equivalent to EUR".
const NAMING_REPAIR = /(?<!\p{L})(?:typos?|misspell(?:ed|ing|s)?|misnamed|mislabell?ed|(?:incorrectly|wrongly|badly) (?:named|labell?ed|spelled)|despite (?:its|the|their) names?|(?:the )?(?:name|label) (?:says|suggests|implies|is misleading)|misleading (?:name|label)|should (?:read|be (?:named|called|labell?ed)))(?!\p{L})/iu;
const LEGACY_LABEL = /(?<!\p{L})(?:legacy (?:name|label|term|code|title)s?|old (?:name|label|title)s?|formerly (?:called|named|known as)|previously (?:called|named|known as)|(?:was|been|is) renamed|renamed (?:from|to))(?!\p{L})/iu;
const RECIPROCAL = /(?<!\p{L})(?:[Ss]ame as|[Ii]dentical to|[Ee]quivalent to|[Mm]irrors?|[Cc]ounterpart of|[Tt]win of)\s+(?:the\s+)?(?:[“"'‘`]|[\p{L}\d]+_[\p{L}\d_]+|(?!\p{Lu}{2,}(?!\p{L}))\p{Lu}[\p{L}\d]*(?:\s+\p{Lu}[\p{L}\d]*)*)/u;
export const maintenancePhrases = value => matches(value, [[MAINTENANCE, 'narrates catalogue maintenance or implementation'], [NAMING_REPAIR, 'repairs or explains a naming problem'], [LEGACY_LABEL, 'narrates a legacy or former label'], [RECIPROCAL, 'points to a sibling resource']]);

// Calculated resources whose whitespace-normalized expressions are identical. Identity says nothing about which one is canonical.
export function duplicateExpressions(resources) {
  const groups = new Map();
  for (const r of resources) {
    const key = normalizedExpression(r.expression);
    if (!key) continue;
    groups.set(key, [...groups.get(key) ?? [], r.id]);
  }
  return [...groups.values()].filter(ids => ids.length > 1);
}

// AI context is self-contained guidance intended for IQ: scope, query rules, interpretation guards and aliases for its own resource.
// These flag the common ways it is not. Query rules that name a column as filter, grouping or date role are expected and not flagged.
const FORMULA_SYNTAX = /\{[0-9a-f-]{36}:[0-9a-f-]{36}\}|(?<![A-Z0-9_])(?:SUM|COUNT|COUNTD|DISTINCTCOUNT|AVG|AVERAGE|MEDIAN|PERCENTILE|IF|IFNULL|COALESCE|DATE_DIFF|DATEDIFF)\s*\(/;
const GENERIC_WARNING = /(?<!\p{L})(?:use (?:with )?caution|be careful|(?:interpret|use) (?:with care|carefully)|ensure (?:accuracy|accurate|correct)\w*|double[- ]check|may (?:vary|not be accurate|be (?:incomplete|inaccurate))|results? may differ|check the data|verify (?:the )?results?)(?!\p{L})/iu;
// Verbs that pick the resource answering a question. Filtering, grouping and counting verbs are deliberately absent.
const SELECT_VERB = '(?:use|select|choose|pick|prefer|switch to|refer to|consult)';
// Unnamed redirects: pointers to an other/alternative/dedicated resource or variant, "… instead", rankings, and selection verbs aimed at a quoted resource.
const OTHER = '(?:other|another|different|alternative|dedicated|separate|corresponding|companion|sibling)';
const KIND = '(?:dataset|table|column|field|formula|measure|metric|kpi|indicator|resource|variant|calculation)s?';
const REDIRECT = new RegExp(`(?<!\\p{L})(?:${SELECT_VERB}[^.;]{1,60}(?<!\\p{L})instead|(?:instead of|rather than) this(?: one| ${KIND})?|${OTHER} ${KIND}|(?:median|mean|average|total) (?:variant|version|formula|measure|metric|kpi|indicator)s?|(?:is|are) (?:better|more appropriate|more suitable) for)(?!\\p{L})|(?<!\\p{L})${SELECT_VERB}(?: [\\p{L}'’]+){0,2} [“"]`, 'iu');
const NEGATIVE_SCOPE = /(?<!\p{L})(?:not (?:suitable|appropriate|intended|meant|designed|to be used) for|do not (?:use|select) (?:this|it)|not this (?:one|measure|metric|formula|column|field))(?!\p{L})/iu;
// Claims about the resource's own status; "verified accounts" as a business population is not flagged.
const CERTAINTY = /(?<!\p{L})(?:(?:is|are|been|fully|already) (?:validated|verified|certified|confirmed|correct|accurate)|(?:validated|verified|certified) (?:measure|metric|kpi|formula|figures?|calculation)|reliable|trustworthy|authoritative|canonical|definitive|source of truth|the (?:correct|right|best|recommended|preferred) (?:measure|metric|choice|formula|column|field|source))(?!\p{L})/iu;
const ALIAS_LABEL = /(?:^|[.;\n]\s*)(vocabulary|synonyms?|alias|also (?:called|known as)|keywords?|glossary|terms)\s*:/i;
const words = t => new Set(String(t).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
export function contextProblems(value) {
  const context = value?.ai_context;
  if (typeof context !== 'string' || !context.trim()) return [];
  const problems = [];
  if (REDIRECT.test(context)) problems.push(`may redirect or rank against another resource (“${context.match(REDIRECT)[0]}”); retain only a necessary documented selection convention with an explicit scope and supported target, otherwise state this resource's own scope or query rule, or use null`);
  if (NEGATIVE_SCOPE.test(context)) problems.push(`states scope only negatively (“${context.match(NEGATIVE_SCOPE)[0]}”); describe the questions this resource fits and keep reader-relevant limitations public`);
  if (CERTAINTY.test(context)) problems.push(`claims validation or reliability (“${context.match(CERTAINTY)[0]}”); state scope without implying checks that have not occurred`);
  if (FORMULA_SYNTAX.test(context)) problems.push('reproduces formula syntax; IQ already receives the expression, so state the query rule in plain words');
  if (GENERIC_WARNING.test(context)) problems.push(`contains a generic warning (“${context.match(GENERIC_WARNING)[0]}”); state a concrete rule or limitation, or remove it`);
  if (ALIAS_LABEL.test(context)) problems.push(`labels discovery terms “${context.match(ALIAS_LABEL)[1]}:”; prefix them “Aliases:”`);
  const own = words(context);
  for (const [locale, description] of Object.entries(value.description ?? {})) {
    const known = words(description);
    if (own.size >= 4 && [...own].filter(w => known.has(w)).length / own.size >= 0.75) { problems.push(`mostly repeats description.${locale}; keep only guidance absent from the description, or use null`); break; }
  }
  return problems;
}

// Other resources that context tells IQ to answer with: a selection verb shortly before a distinctive name, or the name followed by "instead".
// A name used as a filter, comparison or role ("use status = completed", "use order_date for the cohort") is a query rule, not a redirect.
// Only distinctive names (several words, or technical with _ or digits) are matched; single generic words would mostly match topics.
const distinctive = name => name.length >= 5 && (/\s/.test(name.trim()) || /[_\d]/.test(name));
const escape = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ROLE = /^\s*(?:=|<|>|!=|≠|≥|≤|(?:is|in|not)(?!\p{L})|(?:as|for) (?:the |a )?(?:filters?|cohort|dates?|period|group(?:ing)?|grain|denominator)(?!\p{L}))/iu;
export function redirectTargets(context, others) {
  if (typeof context !== 'string' || !context.trim()) return [];
  const found = new Set();
  for (const { id, name } of others) for (const n of Object.values(name ?? {})) {
    if (typeof n !== 'string' || !distinctive(n)) continue;
    const named = new RegExp(`(?<![\\p{L}\\p{N}_])${escape(n.trim())}(?![\\p{L}\\p{N}_])`, 'giu');
    for (const m of context.matchAll(named)) {
      const before = context.slice(Math.max(0, m.index - 60), m.index), after = context.slice(m.index + m[0].length);
      const chosen = new RegExp(`(?<!\\p{L})${SELECT_VERB}(?: [\\p{L}'’]+){0,3} [“"]?\\s*$`, 'iu').test(before) && !ROLE.test(after.replace(/^\s*[”"]/, ''));
      if (chosen || /^[^.;]{0,30}(?<!\p{L})instead(?!\p{L})/iu.test(after)) found.add(`“${n.trim()}” (${id})`);
    }
  }
  return [...found];
}

// A keep must record that the existing text was assessed as sufficient; exclusion from this proposal is "hold" (deferred).
// Simple identifiers, names and geographic attributes are self-explanatory; AI context there is usually padding unless it only lists discovery aliases or a query rule.
const EXCLUDED_KEEP = /(?<!\p{L})(?:not (?:selected|included|reviewed|assessed|in scope|covered|prioriti[sz]ed)|(?:not|n't) (?:selected|included|covered) (?:for|in) (?:this|the) (?:proposal|iteration|review|pass|selection|batch)|out of scope|outside (?:the |this )?scope|excluded from|deferred|later iteration|(?:next|future) (?:iteration|pass|round|batch)|to be reviewed later)(?!\p{L})|^\W*no changes?(?: (?:proposed|needed|required))?\W*$/iu;
export const excludedKeep = assessment => typeof assessment === 'string' ? assessment.trim().match(EXCLUDED_KEEP)?.[0] ?? null : null;
// A hold is a concrete question the owner or user must answer. Wording that only says the resource was not looked at is a skipped assessment, not a hold.
const DEFERRED_HOLD = /(?<!\p{L})(?:not (?:yet )?(?:selected|included|reviewed|assessed|in scope|covered|prioriti[sz]ed)|first pass|(?:next|future|later) (?:iteration|pass|round|batch)|deferred|out of scope|outside (?:the |this )?scope|not needed for|to be reviewed later)(?!\p{L})/iu;
export const deferredHold = assessment => typeof assessment === 'string' ? assessment.trim().match(DEFERRED_HOLD)?.[0] ?? null : null;
const SIMPLE_NAME = /^(?:[\p{L}\d]+ )*(?:id|identifier|uuid|guid|name|label|city|country|zip(?: code)?|postal(?: code)?|postcode|address|latitude|longitude|lat|lon|lng|coordinates)$/u;
const ALIASES_ONLY = /^\s*(?:aliases?|also (?:called|known as|referred to as)|synonyms?)\b[^.]*\.?\s*$/i;
export const aliasesOnly = context => typeof context === 'string' && ALIASES_ONLY.test(context);
export function simpleColumn(resource) {
  if (resource?.kind !== 'column') return false;
  if (resource.type === 'spatial' || /^(?:coordinates?|geo)/i.test(resource.subtype ?? '')) return true;
  if (resource.type === 'datetime') return false;
  return Object.values(resource.name ?? {}).some(n => typeof n === 'string' && SIMPLE_NAME.test(n.trim().replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').toLowerCase()));
}
export function validateEvidence(items, where) {
  for (const item of items) {
    if (typeof item === 'string') continue;
    if (!object(item)) throw new Error(`Evidence must be text or an object: ${where}.`);
    if (item.type !== undefined && !EVIDENCE_TYPES.includes(item.type)) throw new Error(`Unknown evidence type "${item.type}" for ${where}; use ${EVIDENCE_TYPES.join(', ')}.`);
    if (item.dashboard_id !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.dashboard_id)) throw new Error(`Evidence dashboard_id must be the dashboard's UUID, so the review can link to it: ${where}.`);
    if (['profile', 'query'].includes(item.type) && !text(item.scope)) throw new Error(`${item.type === 'query' ? 'Query' : 'Profile'} evidence needs scope (filters, tenant, date window, timezone, population): ${where}.`);
  }
}
// A change backed only by usage or inference has no direct support for its meaning.
export const onlyIndirectEvidence = items => { const types = items.map(i => i?.type).filter(Boolean); return types.length === items.length && types.length > 0 && types.every(t => ['dashboard', 'inference'].includes(t)); };

export function validateEvaluationCases(cases, ids) {
  cases.forEach((c, i) => {
    const where = `evaluation_cases[${i}]`;
    if (!object(c) || !text(c.question) || !isLocale(c.language) || !text(c.expected_interpretation)) throw new Error(`${where} needs question, a supported language and expected_interpretation.`);
    if (!Array.isArray(c.expected_resource_ids) || c.expected_resource_ids.some(id => !ids.has(id)) || !Array.isArray(c.must_not) || c.must_not.some(v => typeof v !== 'string')) throw new Error(`${where} needs captured expected_resource_ids and a must_not text array.`);
    if (!EVALUATION_STATUSES.includes(c.status)) throw new Error(`${where} status must be ${EVALUATION_STATUSES.join(', ')}.`);
    if (c.category !== undefined && !EVALUATION_CATEGORIES.includes(c.category)) throw new Error(`${where} category must be one of ${EVALUATION_CATEGORIES.join(', ')}.`);
    if (c.origin !== undefined && !['new', 'carried-forward'].includes(c.origin)) throw new Error(`${where} origin must be new or carried-forward.`);
    for (const k of ['expected_filters', 'selected_resource_ids']) if (c[k] !== undefined && (!Array.isArray(c[k]) || c[k].some(v => typeof v !== 'string'))) throw new Error(`${where} ${k} must be a text array.`);
    for (const k of ['expected_unit', 'expected_population']) if (c[k] !== undefined && typeof c[k] !== 'string') throw new Error(`${where} ${k} must be text.`);
    if (c.status === 'not-run' && (text(c.observed) || c.executed_at)) throw new Error(`${where} is planned (not-run) but records an observation; set the executed status or clear observed/executed_at.`);
    if (c.status !== 'not-run' && (!text(c.observed) || !Number.isFinite(Date.parse(c.executed_at ?? '')))) throw new Error(`${where} was run: record what was observed and executed_at.`);
  });
}
export function evaluationWarnings(cases) {
  if (!cases.length) return ['No evaluation cases recorded; answer quality cannot be checked after publication.'];
  const uncategorized = cases.filter(c => !c.category).length;
  if (uncategorized) return [`${uncategorized} evaluation case(s) have no category; coverage cannot be checked.`];
  const missing = CORE_EVALUATION_CATEGORIES.filter(k => !cases.some(c => c.category === k));
  return missing.length ? [`Evaluation cases cover no ${missing.join(', ')} case; add one or state in the review why it does not apply.`] : [];
}
// IQ resource selection is a separate question from metadata validity and answer quality: it needs a recorded selected_resource_ids on an executed case.
export function resourceSelection(cases) {
  const executed = cases.filter(c => c.status !== 'not-run'), recorded = executed.filter(c => Array.isArray(c.selected_resource_ids));
  const complete = recorded.filter(c => c.expected_resource_ids.every(id => c.selected_resource_ids.includes(id)));
  return { executed: executed.length, recorded: recorded.length, all_expected_selected: complete.length, not_recorded: executed.length - recorded.length, status: !recorded.length ? 'not-tested' : recorded.length < executed.length ? 'partially-recorded' : 'recorded' };
}
export function answerReadiness(cases) {
  const count = status => cases.filter(c => c.status === status).length;
  const executed = cases.length - count('not-run');
  return { planned: cases.length, executed, pass: count('pass'), fail: count('fail'), partial: count('partial'), status: !executed ? 'not-tested' : executed < cases.length ? 'partially-tested' : 'tested' };
}
export function validateBlockers(blockers, ids) {
  for (const b of blockers) if (!object(b) || !text(b.capability) || !text(b.reason) || !Array.isArray(b.resource_ids) || b.resource_ids.some(id => !ids.has(id))) throw new Error('Each blocker needs capability, reason and captured resource_ids (empty only when the whole review is blocked).');
}
