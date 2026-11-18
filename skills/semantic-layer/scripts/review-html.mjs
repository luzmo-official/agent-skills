import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { escapeHtml as e, hash, label } from './common.mjs';
import { renderKnowledgeSection } from './knowledge-html.mjs';
import { renderRationale, renderEvidence, luzmoLinks, openInLuzmo, appAddressField } from './review-evidence.mjs';
import { expressionFacts } from './semantic-checks.mjs';
import { renderBaselineSection, summarize } from './iq-lib.mjs';

const items = values => values.length ? `<ul>${values.map(v => `<li>${e(v)}</li>`).join('')}</ul>` : '<p class="muted">None recorded.</p>';
const outcomes = { revise: 'Suggested updates', keep: 'Reviewed (no update needed)', hold: 'Needs clarification' };
const kinds = { dataset: 'Dataset', column: 'Column', formula: 'Formula' };
const verdicts = {
  ready: ['Ready to publish', 'The proposed changes can be published as they are.'],
  'ready-with-corrections': ['Ready, with a few things to settle', 'Most changes can be published. Settle the items under “Check these first” before approving.'],
  'not-ready': ['Not ready to publish yet', 'Settle the items under “Check these first” before anything is published.'],
};
const followupLabels = {
  defect: ['Calculation error', 'What is wrong'],
  unvalidated: ['Definition to agree', 'What needs a decision'],
  'data-gap': ['Missing source data', 'What is missing'],
  optional: ['Optional check', 'What to check'],
  duplicate: ['Duplicate calculation', 'What needs a decision'],
  evidenced: ['Formula backed by existing use', 'Why this helps'],
  suggested: ['Suggested formula', 'Why we suggest it'],
};
const followupTone = { defect: 'critical', unvalidated: 'decide', 'data-gap': 'info', optional: 'info', duplicate: 'info', evidenced: 'idea', suggested: 'idea' };
const isRecommendation = c => Boolean(c.origin);

const icon = name => `<svg class="icon" aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">${{
  critical: '<circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 5.5v5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="14.2" r="1.1" fill="currentColor"/>',
  decide: '<circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7.6 7.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="10" cy="14.6" r="1.05" fill="currentColor"/>',
  info: '<circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 9v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="6.2" r="1.1" fill="currentColor"/>',
  hold: '<circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 7v6M12 7v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  check: '<circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m6.5 10.3 2.3 2.3 4.7-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  idea: '<path d="M10 2.8a5.2 5.2 0 0 0-3 9.45V14h6v-1.75A5.2 5.2 0 0 0 10 2.8Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.8 16.6h4.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  lock: '<rect x="4.5" y="8.5" width="11" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 8.5V6.3a3 3 0 0 1 6 0v2.2" fill="none" stroke="currentColor" stroke-width="1.6"/>',
}[name]}</svg>`;
const MARK = '<svg class="mark" aria-hidden="true" viewBox="0 0 32 32" width="28" height="28"><path fill="#1e1d19" d="M3 0h26a3 3 0 0 1 3 3l-.01 26A3 3 0 0 1 29 32H3a3 3 0 0 1-3-3V3a3 3 0 0 1 3-3Z"/><path fill="#ebff00" d="M6.35 0v16.69c0 .36.29.65.65.65h6.43c.85 0 1.47.8 1.26 1.62l-3.06 12.23c-.1.42.21.81.63.81H29a3 3 0 0 0 3-3V17.34H19.74c-.85 0-1.47-.8-1.27-1.62L22.41 0Z"/></svg>';

const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });
const languageName = locale => { try { return languageNames.of(locale.replace('_', '-')) ?? locale.toUpperCase(); } catch { return locale.toUpperCase(); } };
const listJoin = values => values.length < 2 ? values.join('') : `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const formatDate = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); };

// Word-level diff (longest common subsequence) so a reader sees exactly which words a proposal adds or removes.
export function wordDiff(before, after) {
  // Each token is a word with its trailing whitespace, so a changed phrase highlights as one run.
  const tokens = text => text.match(/\S+\s*|\s+/g) ?? [];
  const a = tokens(before), b = tokens(after);
  if (a.length * b.length > 400000) return { before: e(before), after: e(after) };
  const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const left = [], right = [];
  let i = 0, j = 0;
  const push = (list, tag, token) => {
    const last = list.at(-1);
    if (last?.tag === tag) last.text += token; else list.push({ tag, text: token });
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { push(left, '', a[i]); push(right, '', b[j]); i++; j++; }
    else if (j < b.length && (i === a.length || table[i][j + 1] >= table[i + 1][j])) push(right, 'ins', b[j++]);
    else push(left, 'del', a[i++]);
  }
  const html = list => list.map(({ tag, text }) => {
    if (!tag || !text.trim()) return e(text);
    const trailing = text.match(/\s*$/)[0];
    return `<${tag}>${e(text.slice(0, text.length - trailing.length))}</${tag}>${e(trailing)}`;
  }).join('');
  return { before: html(left), after: html(right) };
}

function proposedFormula(p) {
  if (!p) return '';
  const locales = [...new Set([...Object.keys(p.name ?? {}), ...Object.keys(p.description ?? {})])];
  return `<h4>Proposed name and description</h4>${locales.map(l => `<p><strong>${e(l.toUpperCase())}: ${e(p.name?.[l] ?? 'No name proposed.')}</strong><br>${e(p.description?.[l] ?? 'No description proposed.')}</p>`).join('')}<h4>Proposed AI context</h4><p class="definition">${e(p.ai_context ?? 'Not set.')}</p>`;
}

const followupId = (proposal, candidate) => `followup-${proposal.calculation_changes.indexOf(candidate) + 1}`;
function calculationFollowup(candidate, proposal, links) {
  const resources = proposal.resources;
  const kind = candidate.origin ?? candidate.classification, [status, question] = followupLabels[kind];
  const affected = candidate.resource_ids.map(id => resources.find(r => r.id === id)).filter(Boolean);
  const dependencies = candidate.dependencies.map(id => {
    const resource = resources.find(r => r.id === id);
    return `<li><code>${e(resource ? `${label(resource.name)} (${id})` : id)}</code></li>`;
  }).join('');
  return `<article class="followup tone-${followupTone[kind]}" id="${followupId(proposal, candidate)}"><p class="followup-kind">${icon(followupTone[kind] === 'idea' ? 'idea' : followupTone[kind])}<strong>${status}</strong></p><h3>${e(candidate.title)}</h3>${affected.length ? `<p class="muted">Affects ${affected.map(r => `<a href="#resource-${e(r.id)}">${e(label(r.name))}</a>`).join(', ')}</p>` : ''}<h4>${question}</h4><p>${e(candidate.reason)}</p>${candidate.evidence?.length ? `<h4>${candidate.origin === 'suggested' ? 'What it is based on' : 'Where the customer defines or uses it'}</h4>${renderEvidence(candidate.evidence, links)}` : ''}${proposedFormula(candidate.proposed)}<h4>Next step</h4><p>${e(candidate.validation_needed)}</p><details><summary>Technical details</summary>${candidate.technical_details ? `<pre><code>${e(candidate.technical_details)}</code></pre>` : ''}<h4>Intended question</h4><p>${e(candidate.intended_question)}</p><h4>Result</h4><p>${e(candidate.result_grain)}</p><h4>Population</h4><p>${e(candidate.population)}</p><h4>Dependencies</h4><ul>${dependencies}</ul><h4>Cases to check</h4>${renderEvidence(candidate.boundary_cases)}${candidate.expression_candidate ? `<h4>Proposed expression</h4><pre><code>${e(candidate.expression_candidate)}</code></pre>` : ''}</details></article>`;
}

function comparison(r, locale) {
  const before = r.original.description?.[locale] ?? '', after = r.proposed.description?.[locale] ?? '';
  if (before === after) return `<div class="translation same" data-locale="${e(locale)}"><span class="locale" title="${e(languageName(locale))}">${e(locale.toUpperCase())}</span><p class="definition">${e(after || 'No description.')}</p></div>`;
  const diff = before && after ? wordDiff(before, after) : { before: e(before || 'No description yet.'), after: e(after || 'No description proposed.') };
  return `<div class="translation" data-locale="${e(locale)}"><span class="locale" title="${e(languageName(locale))}">${e(locale.toUpperCase())}</span><div class="pair"><section><h5>Current description</h5><p class="definition${before ? '' : ' empty'}">${diff.before}</p></section><section class="changed"><h5>Proposed description${before ? ' · changed' : ' · new'}</h5><p class="definition">${diff.after}</p></section></div></div>`;
}

function contextBlock(r) {
  const before = r.original.ai_context, after = r.proposed.ai_context, changed = before !== after;
  const hint = '<span class="hint">Guidance for Luzmo IQ. Metadata readers may have access; do not store secrets here.</span>';
  if (!changed) return `<div class="field-block"><h4 class="block-title">AI context${before ? '' : ' (not set)'}</h4>${hint}<p class="definition single">${e(before ?? 'Not set.')}</p></div>`;
  const diff = before && after ? wordDiff(before, after) : { before: e(before ?? 'Not set.'), after: e(after ?? 'Not set.') };
  return `<details open><summary>AI context · ${after == null ? 'removed' : before == null ? 'new' : 'changed'}</summary>${hint}<div class="pair"><section><h4>Current AI context</h4><p class="definition${before ? '' : ' empty'}">${diff.before}</p></section><section class="changed"><h4>Proposed AI context</h4><p class="definition${after ? '' : ' empty'}">${diff.after}</p></section></div></details>`;
}

const names = proposal => new Map(proposal.resources.map(r => [r.id, label(r.name)]));
function facts(expression, nameOf) {
  const f = expressionFacts(expression);
  if (!f) return '';
  const lines = [f.aggregations.length ? `Aggregations: ${f.aggregations.join(', ')}` : 'No aggregation (row-level value)', f.divides && 'Contains a division: check numerator and denominator populations', f.relative_to_now && 'Relative to the current time: does not reconstruct history', f.coalesces_missing && 'Replaces missing values (COALESCE/IFNULL)', f.grouping.length && `Changes the grouping of an aggregation (${f.grouping.join(', ')}): check which chart dimensions it adds, removes or ignores`, f.dependencies.length && `Depends on: ${f.dependencies.map(id => nameOf.get(id) ?? `${id} (outside capture)`).join(', ')}`, ...f.pitfalls].filter(Boolean);
  return `<h4>Expression facts</h4>${items(lines)}`;
}

function resourceCard(r, index, changeIds, nameOf, links) {
  const executable = changeIds.has(r.id), locales = [...new Set([...Object.keys(r.original.description ?? {}), ...Object.keys(r.proposed.description ?? {})])];
  const description = selected => `<div class="field-block"><h4 class="block-title">Description <span class="hint">Shown to your users, for example as a tooltip.</span></h4>${selected.map(l => comparison(r, l)).join('') || '<p class="muted">No public description in either version.</p>'}</div>`;
  const changedLocales = locales.filter(l => (r.original.description?.[l] ?? '') !== (r.proposed.description?.[l] ?? ''));
  const retainedLocales = locales.filter(l => !changedLocales.includes(l));
  const contextChanged = r.original.ai_context !== r.proposed.ai_context;
  const suggested = `${changedLocales.length ? description(changedLocales) : ''}${contextChanged ? contextBlock(r) : ''}`;
  const retained = `${retainedLocales.length || !locales.length ? description(retainedLocales) : ''}${!contextChanged ? contextBlock(r) : ''}`;
  // Say plainly which parts stay as they are, so the heading never repeats the badge.
  const parts = [retainedLocales.length || !locales.length ? 'description' : '', !contextChanged ? 'AI context' : ''].filter(Boolean).join(' and ');
  const retainedHeading = r.disposition === 'hold' ? 'Current text (not being updated)' : r.disposition === 'keep' ? 'Current text' : `Not changed: ${parts}`;
  return `<article class="resource outcome-${e(r.disposition)}" id="resource-${e(r.id)}" data-id="${e(r.id)}" data-name="${e(label(r.name))}" data-outcome="${e(r.disposition)}" data-dataset="${e(r.dataset_id ?? r.id)}" data-executable="${executable}"${r.disposition === 'keep' ? ' hidden' : ''}>
<div class="card-heading"><div><h3><span class="num">${index + 1}</span><span>${e(kinds[r.kind])}: ${e(label(r.name))}</span></h3></div><div class="card-actions"><span class="badge ${e(r.disposition)}">${e(outcomes[r.disposition])}</span>${openInLuzmo(links?.dataset(r.dataset_id ?? r.id))}</div></div>
${r.disposition === 'revise' && !executable ? '<p class="notice">There is no metadata difference to publish for this item.</p>' : ''}
${renderRationale(r, links, { expanded: true })}
${suggested}
${retained ? `<details class="retained-metadata"><summary>${retainedHeading}</summary>${retained}</details>` : ''}
${r.knowledge_migrations.length ? `<details><summary>Preserved or relocated knowledge</summary>${renderEvidence(r.knowledge_migrations)}</details>` : ''}
${r.expected_expression ? `<details><summary>Current calculation</summary><pre><code>${e(r.expected_expression)}</code></pre>${facts(r.expected_expression, nameOf)}</details>` : ''}
</article>`;
}

const countChips = resources => {
  const n = d => resources.filter(r => r.disposition === d).length;
  return ['revise', 'hold', 'keep'].filter(d => n(d)).map(d => `<span class="chip ${d}">${n(d)} ${outcomes[d]}</span>`).join('');
};

function datasetGroups(proposal, datasets, changeIds, nameOf, links) {
  return [...datasets].map(([id, name]) => {
    const resources = proposal.resources.filter(r => r.dataset_id === id);
    const followups = proposal.calculation_changes.filter(c => c.resource_ids.some(key => resources.some(r => r.id === key)));
    const fields = resources.filter(r => r.kind === 'column').length;
    const metrics = resources.filter(r => r.kind === 'formula').length;
    // Unchanged items start hidden, so a dataset opens on its changes and items on hold.
    const open = resources.some(r => r.disposition !== 'keep');
    return `<details class="dataset-group" data-dataset-group="${e(id)}"${open ? ' open' : ' hidden'}><summary><span class="dataset-title">${e(name)}</span>${openInLuzmo(links?.dataset(id), 'Open dataset')}<span class="dataset-meta"><span class="muted">${plural(fields, 'column')} · ${plural(metrics, 'formula')}</span>${countChips(resources)}</span></summary><div class="dataset-content">${resources.map(r => resourceCard(r, proposal.resources.indexOf(r), changeIds, nameOf, links)).join('')}${followups.length ? `<details class="dataset-followups"><summary>Calculation follow-ups · ${followups.length}</summary>${followups.map(c => calculationFollowup(c, proposal, links)).join('')}</details>` : ''}</div></details>`;
  }).join('');
}

function recommendations(proposal, links) {
  const all = proposal.calculation_changes.filter(isRecommendation);
  if (!all.length) return '';
  const group = (origin, heading, intro) => {
    const entries = all.filter(c => c.origin === origin);
    return entries.length ? `<h3 class="group-heading">${heading} · ${entries.length}</h3><p class="muted">${intro}</p>${entries.map(c => calculationFollowup(c, proposal, links)).join('')}` : '';
  };
  return `<details class="panel" id="formula-ideas" open><summary>Formula recommendations · ${all.length}</summary><p class="muted">Not created by this update; each needs the owner's agreement before it is built.</p>${group('evidenced', 'Backed by existing use', 'The customer already defines or uses these calculations in metadata, rules or charts.')}${group('suggested', 'Our suggestions', 'Recommended for this data; no existing definition or usage was found.')}</details>`;
}

// The things a reviewer must look at before approving, most important first.
function attention(proposal, preview, knowledge, iq, nameOf) {
  const link = id => `<a href="#resource-${e(id)}">${e(nameOf.get(id) ?? id)}</a>`;
  const links = ids => ids?.length ? `<p class="affects">Affects ${ids.map(link).join(', ')}</p>` : '';
  const entry = (tone, kicker, title, body = '', extra = '') => `<li class="attention-item tone-${tone}">${icon(tone)}<div><p class="kicker">${e(kicker)}</p><p class="attention-title">${title}</p>${body ? `<p>${body}</p>` : ''}${extra}</div></li>`;
  const list = [];
  for (const q of proposal.questions.filter(q => q.blocking)) list.push(entry('decide', 'Decision needed', e(q.question), '', links(q.resource_ids)));
  for (const b of proposal.blockers ?? []) list.push(entry('critical', 'Cannot be answered reliably yet', e(b.capability), e(b.reason), links(b.resource_ids)));
  const findings = [...proposal.findings].sort((a, b) => ['critical', 'high', 'medium', 'low'].indexOf(a.severity) - ['critical', 'high', 'medium', 'low'].indexOf(b.severity));
  // Only the wording a reader compares; a suggestion that repeats the proposed text is shown once.
  const finding = f => {
    const suggestion = f.suggested_replacement && f.suggested_replacement !== f.proposed_quote ? f.suggested_replacement : '';
    return f.before_quote || f.proposed_quote || suggestion ? `<details class="finding"><summary>Show the wording</summary>${f.before_quote ? `<h4>Now</h4><blockquote>${e(f.before_quote)}</blockquote>` : ''}${f.proposed_quote ? `<h4>Proposed</h4><blockquote>${e(f.proposed_quote)}</blockquote>` : ''}${suggestion ? `<h4>Suggested correction</h4><p>${e(suggestion)}</p>` : ''}</details>` : '';
  };
  // A finding about resources that a calculation follow-up already lists is shown once, with that follow-up.
  const followedUp = new Set(proposal.calculation_changes.filter(c => !isRecommendation(c)).flatMap(c => c.resource_ids));
  const covered = f => f.resource_ids.length > 0 && f.resource_ids.every(id => followedUp.has(id));
  for (const f of findings.filter(f => ['critical', 'high'].includes(f.severity) && !covered(f))) list.push(entry('critical', 'Problem found', e(f.impact), '', links(f.resource_ids) + finding(f)));
  // Calculation errors stand alone; the other calculation follow-ups share one entry so the list stays short.
  const followups = proposal.calculation_changes.filter(c => !isRecommendation(c));
  for (const c of followups.filter(c => c.classification === 'defect')) list.push(entry('critical', followupLabels.defect[0], `<a href="#${followupId(proposal, c)}">${e(c.title)}</a>`, e(c.reason)));
  const toDiscuss = followups.filter(c => c.classification !== 'defect');
  if (toDiscuss.length) list.push(entry('decide', 'Calculations to discuss with the data owner', `${plural(toDiscuss.length, 'calculation question', 'calculation questions')}`, 'Not changed by this update. Each one explains the issue and the next step.', `<ul class="compact-list">${toDiscuss.map(c => `<li><span class="tag tone-${followupTone[c.classification]}">${e(followupLabels[c.classification][0])}</span><a href="#${followupId(proposal, c)}">${e(c.title)}</a></li>`).join('')}</ul>`));
  const held = proposal.resources.filter(r => r.disposition === 'hold');
  if (held.length) list.push(entry('hold', 'Needs clarification', `${plural(held.length, 'item needs', 'items need')} clarification`, 'No updates will be applied to these items. Each one says what is needed to continue.', `<p class="affects">${held.map(r => link(r.id)).join(', ')}</p>`));
  for (const q of knowledge?.proposal.questions ?? []) list.push(entry('decide', 'About AI rules and agents', e(q)));
  for (const r of knowledge?.proposal.resources.filter(r => r.disposition === 'create' && r.kind === 'agent') ?? []) list.push(entry('info', 'New agent', `<a href="#knowledge-${e(r.key)}">${e(label(r.proposed.name))}</a>`, 'Once created it is visible to your organization; check its name, datasets and rules.'));
  if (iq) {
    const s = summarize(iq.run, iq.assessments), wrong = s.fail + s.error + s.partial;
    if (wrong) list.push(entry('info', 'How IQ answers today', `<a href="#iq-answers" data-open-view="iq">IQ got ${wrong} of ${s.questions} test questions wrong or only partly right</a>`, 'This is what the proposed changes aim to fix. The same questions are asked again after publishing.'));
  }
  for (const q of proposal.questions.filter(q => !q.blocking)) list.push(entry('info', 'Good to confirm', e(q.question), '', links(q.resource_ids)));
  const minor = findings.filter(f => !['critical', 'high'].includes(f.severity) || covered(f));
  const minorNotes = minor.length ? `<details class="minor-notes"><summary>More review notes · ${minor.length}</summary><ul class="note-list">${minor.map(f => `<li><p>${e(f.impact)}</p>${links(f.resource_ids)}${finding(f)}</li>`).join('')}</ul></details>` : '';
  if (!list.length) return `<section class="attention all-clear" id="check-first" aria-label="Before you approve">${icon('check')}<div><h2>Nothing needs your attention first</h2><p>No open decisions, problems or items needing clarification. Read the suggested updates below, then approve in the chat.</p>${minorNotes}</div></section>`;
  return `<section class="attention" id="check-first" aria-labelledby="check-first-title"><h2 id="check-first-title">Check these first</h2><p class="muted">Most important first. Reply in the chat with your answers or questions; the review is updated and shown again.</p><ol class="attention-list">${list.join('')}</ol>${minorNotes}</section>`;
}

// Test questions in plain language: the question as end users ask it, what a good answer does and what to avoid.
const CATEGORY_LABELS = { normal: 'Everyday question', 'empty-population': 'No matching data', boundary: 'Edge values', 'duplicate-history': 'Counting without duplicates', 'date-role': 'Which date to use', 'current-vs-historical': 'Now versus in the past', 'multilingual-discovery': 'Other-language wording', 'recorded-vs-actual': 'Recorded versus what happened', 'public-definition': 'What a term means', unanswerable: 'Cannot be answered from the data', regression: 'Answered wrongly before' };
const STATUS_LABELS = { 'not-run': 'Not asked yet', pass: 'Good answer', partial: 'Partly right', fail: 'Wrong answer' };
function testQuestions(cases, nameOf) {
  const row = (label, value) => value ? `<div class="qa-row"><dt>${label}</dt><dd>${value}</dd></div>` : '';
  const chips = ids => (ids ?? []).map(id => `<span class="chip">${e(nameOf.get(id) ?? id)}</span>`).join(' ');
  return `<section class="test-questions" id="test-questions"><h2 class="section-title">Test questions · ${cases.length}</h2><p class="muted">Questions your end users would ask, in their own language. IQ is asked them before and after publishing to check that it picks the right data and reads it correctly.</p><ol class="question-list">${cases.map(c => `<li class="question-card">
<div class="question-head"><span class="locale" title="${e(languageName(c.language))}">${e(c.language.toUpperCase())}</span><p class="question" lang="${e(c.language)}">${e(c.question)}</p><span class="badge ${{ pass: 'keep', partial: 'hold', fail: 'fail' }[c.status] ?? ''}">${e(STATUS_LABELS[c.status] ?? c.status)}</span></div>
<dl class="qa">${row('A good answer', e(c.expected_interpretation))}${row('Should use', chips(c.expected_resource_ids))}${row('Avoid', c.must_not?.length ? e(c.must_not.map(m => typeof m === 'string' ? m : m.summary ?? m.text ?? '').filter(Boolean).join(' · ')) : '')}${row('IQ answered', c.observed ? e(c.observed) : '')}</dl>
${c.category && CATEGORY_LABELS[c.category] ? `<p class="question-meta">Checks: ${e(CATEGORY_LABELS[c.category])}${c.origin === 'carried-forward' ? ' · from an earlier review' : ''}</p>` : ''}
${[['Filters', (c.expected_filters ?? []).join('; ')], ['Unit', c.expected_unit], ['Population', c.expected_population], ['IQ used', (c.selected_resource_ids ?? []).map(id => nameOf.get(id) ?? id).join(', ')]].some(([, v]) => v) ? `<details><summary>More detail</summary><dl class="qa">${[['Filters', (c.expected_filters ?? []).join('; ')], ['Unit', c.expected_unit], ['Population', c.expected_population], ['IQ used', (c.selected_resource_ids ?? []).map(id => nameOf.get(id) ?? id).join(', ')]].map(([k, v]) => row(k, v ? e(v) : '')).join('')}</dl></details>` : ''}
</li>`).join('')}</ol></section>`;
}

// Browsers hash an inline script after turning CRLF into LF, so a Windows checkout (core.autocrlf) must be normalized first or the CSP blocks the script.
export function pageScript() {
  const script = readFileSync(new URL('../assets/review.js', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
  return { script, scriptHash: createHash('sha256').update(script).digest('base64') };
}

export function renderHtml(proposal, preview, knowledge = null, regression = null, iq = null, meta = {}) {
  const style = readFileSync(new URL('../assets/review.css', import.meta.url), 'utf8');
  const { script, scriptHash } = pageScript();
  const previewHash = hash(preview), changeIds = new Set(preview.changes.map(c => c.id));
  const datasetNames = new Map([...(meta.dataset_names ?? []), ...proposal.resources.filter(r => r.kind === 'dataset')].map(r => [r.id, label(r.name)]));
  const datasets = new Map(proposal.resources.map(r => [r.dataset_id, datasetNames.get(r.dataset_id) ?? (r.kind === 'dataset' ? label(r.name) : r.dataset_id)]));
  const nameOf = names(proposal), links = luzmoLinks(meta.app_host);
  const summary = proposal.review_summary ?? {};
  const [verdictTitle, verdictText] = verdicts[proposal.verdict];
  const count = d => proposal.resources.filter(r => r.disposition === d).length;
  const ideas = proposal.calculation_changes.filter(isRecommendation).length;
  const knowledgeChanges = knowledge?.preview.changes.length ?? 0;
  const locales = [...new Set(proposal.resources.flatMap(r => [...Object.keys(r.original.description ?? {}), ...Object.keys(r.proposed.description ?? {})]))];
  const metaLine = [meta.captured_at && `Data read on ${formatDate(meta.captured_at)}`, plural(datasets.size, 'dataset'), listJoin(proposal.languages.map(languageName))].filter(Boolean);
  const stat = (value, text, attrs) => `<button type="button" class="stat" ${attrs}><strong>${value}</strong><span>${text}</span></button>`;
  const iqToday = iq && summarize(iq.run, iq.assessments), iqWrong = iqToday ? iqToday.fail + iqToday.error + iqToday.partial : 0;
  const cases = proposal.evaluation_cases;
  const tabs = [['datasets', 'Datasets', 'dataset-view'], knowledge && ['knowledge', 'Agents &amp; rules', 'knowledge-view'], cases.length && ['questions', `Test questions · ${cases.length}`, 'questions-view'], iq && ['iq', 'IQ answers today', 'iq-view']].filter(Boolean);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'"><title>${e(meta.customer ? `${meta.customer} · Metadata review` : 'Metadata review')}</title><style>${style}</style></head><body data-preview-hash="${previewHash}">
<header class="hero"><div class="hero-inner">
<div class="brand">${MARK}<span>Luzmo IQ · Semantic layer review</span><span class="private">${icon('lock')}Private: includes AI context</span></div>
<p class="eyebrow">${e(meta.customer || 'Metadata review')}</p><h1>${meta.customer ? 'Metadata review' : 'Better answers from Luzmo IQ'}</h1>${summary.purpose ? `<p class="lead">${e(summary.purpose)}</p>` : ''}<p class="hero-meta">${metaLine.map(e).join('<span aria-hidden="true"> · </span>')}</p>
<div class="verdict verdict-${e(proposal.verdict)}"><span class="verdict-dot" aria-hidden="true"></span><div><h2>${e(verdictTitle)}</h2><p>${e(verdictText)} Nothing changes in Luzmo until you approve it in the chat.</p></div></div>
<div class="stats" aria-label="Review in numbers">${stat(preview.summary.updates, 'Suggested updates', 'data-show="revise"')}${stat(count('hold'), 'Needs clarification', 'data-show="hold"')}${stat(count('keep'), 'Reviewed (no update needed)', 'data-show="keep"')}${knowledge ? stat(knowledgeChanges, 'Suggested AI rule and agent updates', 'data-open-view="knowledge"') : ''}${ideas ? stat(ideas, `formula ${ideas === 1 ? 'idea' : 'ideas'}`, 'data-target="formula-ideas"') : ''}${iqToday ? stat(`${iqWrong}<small>/${iqToday.questions}</small>`, 'IQ answers wrong or partly right today', 'data-open-view="iq"') : ''}</div>
${appAddressField(links.app)}
</div></header>
<main>
<section class="panel review-guide" aria-labelledby="review-guide-title"><h2 id="review-guide-title">What goes where?</h2><dl class="guide-grid"><div><dt>Rules: shared guidance</dt><dd>Tell IQ how to respond and explain business terms used across your data. A Rule applies only to the agents it is linked to, and only when a request uses that agent.</dd></div><div><dt>Descriptions: for people</dt><dd>Explain what a dataset, column or formula means, in plain language.</dd></div><div><dt>AI context: for Luzmo IQ</dt><dd>Explain when to use that data, how to use it and how to interpret the result.</dd></div></dl><p class="muted">Keep specific details with the data they describe: a column detail on the column, a formula detail on the formula, and dataset-wide guidance on the dataset. Use Rules for shared guidance.</p></section>
${attention(proposal, preview, knowledge, iq, nameOf)}
<section class="panel summary" aria-label="Summary">${proposal.scope ? `<p class="notice">Focused review: ${e(proposal.scope.rationale)} ${preview.summary.excluded} captured resources are outside this assessment.</p>` : ''}${summary.highlights?.length || summary.limitations?.length ? `<div class="summary-grid">${summary.highlights?.length ? `<section><h3>Suggested updates</h3>${items(summary.highlights)}</section>` : ''}${summary.limitations?.length ? `<section><h3>Limits and open work</h3>${items(summary.limitations)}</section>` : ''}</div>` : ''}<details><summary>Business context and evidence</summary><p>${e(proposal.business_brief)}</p></details></section>
${tabs.length > 1 ? `<nav class="view-switcher" aria-label="Review sections">${tabs.map(([key, text, panel], i) => `<button type="button" data-review-view="${key}" aria-pressed="${i === 0}" aria-controls="${panel}">${text}</button>`).join('')}</nav>` : ''}
<section id="dataset-view" data-review-panel="datasets">
<div class="toolbar" role="search" aria-label="Review filters"><input id="search" type="search" placeholder="Search names or wording" aria-label="Search names or wording" autocomplete="off">${datasets.size > 1 ? `<select id="dataset" aria-label="Dataset"><option value="all">All datasets</option>${[...datasets].map(([id, name]) => `<option value="${e(id)}">${e(name)}</option>`).join('')}</select>` : `<input id="dataset" type="hidden" value="all">`}${locales.length > 1 ? `<select id="language" aria-label="Description language"><option value="all">All languages</option>${locales.map(l => `<option value="${e(l)}">${e(languageName(l))}</option>`).join('')}</select>` : `<input id="language" type="hidden" value="all">`}${count('keep') ? `<label class="checkbox-label"><input id="show-unchanged" type="checkbox">Also show reviewed items (no update needed) <small>${count('keep')}</small></label>` : ''}<p id="visible-count" role="status" aria-live="polite"></p></div>
<h2 id="dataset-metadata" class="section-title">Datasets</h2><div id="resources">${datasetGroups(proposal, datasets, changeIds, nameOf, links)}</div><p id="no-results" class="empty-state" hidden>No items match. Clear your search${count('keep') ? ' or also show reviewed items (no update needed)' : ''}.</p>
${recommendations(proposal, links)}
${proposal.calculation_changes.some(c => !c.resource_ids.length && !isRecommendation(c)) ? `<details class="panel" open><summary>Other calculation follow-ups</summary>${proposal.calculation_changes.filter(c => !c.resource_ids.length && !isRecommendation(c)).map(c => calculationFollowup(c, proposal, links)).join('')}</details>` : ''}
</section>
${knowledge ? `<section id="knowledge-view" data-review-panel="knowledge" hidden>${renderKnowledgeSection(knowledge.proposal, knowledge.preview, new Map([...Object.entries(knowledge.names ?? {}), ...datasets]), links)}</section>` : ''}
${cases.length ? `<section id="questions-view" data-review-panel="questions" hidden>${testQuestions(cases, nameOf)}</section>` : ''}
${iq ? `<section id="iq-view" data-review-panel="iq" hidden>${renderBaselineSection(iq.run, iq.assessments, nameOf)}</section>` : ''}
<noscript><p>Interactive filters are unavailable. All review sections remain readable.</p><style>[data-review-panel][hidden],.resource[hidden],.dataset-group[hidden]{display:block!important}.view-switcher,.toolbar{display:none}</style></noscript>
<footer><button id="print" type="button" class="secondary">Print or save as PDF</button><p class="muted">Private: share only with people who may see this data and its AI context. Review version <code title="${previewHash}">${previewHash.slice(0, 12)}</code>.</p></footer>
</main><script>${script}</script></body></html>`;
}
