import { basename } from 'node:path';
import { escapeHtml as e } from './common.mjs';

const readable = value => value == null ? '' : typeof value !== 'object' ? String(value) : Array.isArray(value) ? value.map(readable).filter(Boolean).join('; ') : Object.entries(value).map(([key, item]) => `${key.replace(/_/g, ' ')}: ${readable(item)}`).join('; ');
const webLink = (url, title) => {
  try {
    const parsed = new URL(url);
    if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return `<a href="${e(parsed.href)}" target="_blank" rel="noopener noreferrer">${e(title || parsed.hostname)}</a>`;
  } catch {}
  return e(title || url || '');
};

// Links into the customer's Luzmo app. Each anchor keeps its path, so the address field at the top of the page
// can repoint every link. Without a known address an anchor has no href: "Open in Luzmo" links stay hidden and
// a dashboard name reads as plain text until the reader enters one.
export const luzmoLinks = app => {
  const link = path => ({ app, path });
  return {
    app,
    dataset: id => link(`/datasets/${encodeURIComponent(id)}/view`),
    agent: id => link(`/agents/${encodeURIComponent(id)}`),
    rule: id => link(`/knowledge/rules/${encodeURIComponent(id)}`),
    dashboard: id => link(`/dashboards/${encodeURIComponent(id)}`),
  };
};
const luzmoAnchor = (link, content, className = '') => link ? `<a${className ? ` class="${className}"` : ''} data-luzmo-path="${e(link.path)}"${link.app ? ` href="${e(link.app + link.path)}"` : className ? ' hidden' : ''} target="_blank" rel="noopener noreferrer">${content}</a>` : '';
const ARROW = '<svg aria-hidden="true" viewBox="0 0 12 12" width="11" height="11"><path d="M4.5 2.5h5v5M9.5 2.5 3 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const openInLuzmo = (link, text = 'Open in Luzmo') => luzmoAnchor(link, `${e(text)}${ARROW}`, 'open-in');
// Prefilled with LUZMO_APP_HOST or the address derived from the API host; a change applies to this page only.
export const appAddressField = app => `<div class="app-address"><label for="app-address">Your Luzmo address</label><input id="app-address" type="url" inputmode="url" spellcheck="false" autocomplete="off" placeholder="https://app.luzmo.com" value="${e(app ?? '')}" data-default="${e(app ?? '')}" aria-describedby="app-address-hint"><p id="app-address-hint">${app ? 'Used by every “Open in Luzmo” link. Change it if you log in to Luzmo at another address; it only affects this page.' : 'Enter the address you log in to Luzmo at to show “Open in Luzmo” links. It only affects this page.'}</p></div>`;

const EVIDENCE_LABELS = { expression: 'Expression', 'source-metadata': 'Source metadata', convention: 'Customer convention', dashboard: 'Dashboard usage', profile: 'Profile', query: 'Targeted query', owner: 'Owner confirmation', research: 'Public research', inference: 'Inference' };
export function renderEvidence(values, links = null) {
  if (!values?.length) return '';
  return `<ul>${values.map(item => {
    if (typeof item === 'string') return `<li>${e(item)}</li>`;
    const { summary, fact, claim, text, source, url, reference, type, scope, dashboard_id: dashboard, ...other } = item ?? {};
    const statement = summary ?? fact ?? claim ?? text ?? readable(other);
    const sourceName = typeof source === 'string' ? source : source?.title ?? source?.name ?? source?.path;
    const sourceUrl = url ?? source?.url;
    const citation = sourceUrl ? webLink(sourceUrl, sourceName) : dashboard && links ? luzmoAnchor(links.dashboard(dashboard), e(sourceName || 'Dashboard')) : e(sourceName ?? '');
    return `<li>${type ? `<span class="tag">${e(EVIDENCE_LABELS[type] ?? type)}</span> ` : ''}${e(readable(statement))}${scope ? ` <span class="muted">[scope: ${e(scope)}]</span>` : ''}${citation ? ` <span class="muted">— ${citation}</span>` : ''}${reference ? ` <span class="muted">(${e(readable(reference))})</span>` : ''}</li>`;
  }).join('')}</ul>`;
}

export function renderRationale(resource, links = null, { expanded = false } = {}) {
  const content = `<p>${e(resource.assessment)}</p>${renderEvidence(resource.evidence, links)}`;
  if (resource.disposition === 'hold') return `<div class="reason notice"><h4>What needs clarification</h4>${content}</div>`;
  const heading = resource.disposition === 'keep' ? 'Why no update is needed' : 'Why this change';
  if (expanded) return `<div class="reason"><h4>${heading}</h4><p>${e(resource.assessment)}</p>${resource.evidence?.length ? `<details><summary>Supporting evidence</summary>${renderEvidence(resource.evidence, links)}</details>` : ''}</div>`;
  return `<details><summary>${heading}</summary>${content}</details>`;
}

const BASELINE_MISSING = 'No baseline comparison was run. This review does not establish continuity with earlier proposals or published metadata.';
export function readinessLines(proposal, preview) {
  const { calculations: c, answers: a, resource_selection: s } = preview.summary.readiness, d = preview.summary.dispositions, v = d?.revise;
  const kinds = d ? Object.entries(d.by_kind).filter(([, n]) => n.keep + n.revise + n.hold).map(([k, n]) => `${k} ${n.keep} keep / ${n.revise} revise / ${n.hold} on hold (needs clarification)`).join('; ') : '';
  return [`Metadata: ${proposal.verdict}; ${preview.summary.updates} update(s), ${preview.summary.hold} on hold (needs clarification).`, ...d ? [`Disposition coverage: ${kinds}. Keep means the existing text was assessed as sufficient; hold means a named owner or the user must answer a question first; it is never a skipped assessment.`, `Revisions: ${v.translation_only} translation-only (new locales added, existing text unchanged), ${v.new_description} new description, ${v.text_changed} changing existing locale text, ${v.context_only} AI context only${v.translation_and_context ? `, ${v.translation_and_context} translation plus AI context` : ''}.`] : [], `Calculations: ${c.defect} demonstrated defect(s), ${c.unvalidated} needing validation, ${c['data-gap']} data gap(s), ${c.optional} optional candidate(s)${c.optional_origins ? ` (${c.optional_origins.evidenced} backed by existing customer use, ${c.optional_origins.suggested} suggested)` : ''}${c.duplicate ? `, ${c.duplicate} duplicate group(s) for maintenance` : ''}; none are changed by this update.`, `Answer quality: ${a.status}; ${a.executed} of ${a.planned} evaluation case(s) run (${a.pass} pass, ${a.fail} fail, ${a.partial} partial). Valid metadata and successful profiles do not demonstrate answer quality.`, s ? `IQ resource selection: ${s.status === 'not-tested' ? 'not tested' : s.status}; ${s.recorded} of ${s.executed} executed case(s) recorded the selected resources, ${s.all_expected_selected} selected every expected resource, ${s.not_recorded} without a recorded selection. Distinct from metadata validity and answer quality.` : 'IQ resource selection: not tested.'];
}
// Inventory coverage is separate from what a proposal changes: only a resource absent from every earlier inventory is newly discovered.
export const coverageLine = s => `Coverage: ${s.coverage['newly-discovered']} newly discovered (absent from every earlier inventory), ${s.coverage['newly-reviewed']} existing but newly reviewed (in an earlier inventory, not assessed by an earlier proposal), ${s.coverage['previously-reviewed']} previously reviewed${s.coverage_by_kind ? `; by kind: ${Object.entries(s.coverage_by_kind).filter(([, c]) => Object.values(c).some(Boolean)).map(([k, c]) => `${k} ${c['newly-discovered']}/${c['newly-reviewed']}/${c['previously-reviewed']}`).join(', ')} (discovered/newly reviewed/previously reviewed)` : ''}.`;
export function baselineLines(regression) {
  if (!regression) return [BASELINE_MISSING];
  if (regression.limitation) return [regression.limitation];
  const s = regression.summary, open = regression.candidates.filter(c => !c.classification).length;
  return [`Compared by resource ID with ${regression.sources.map(x => `${x.kind} ${basename(x.path)}`).join(', ')}: ${s.shared} shared, ${s.new} newly discovered, ${s.removed} no longer captured; ${s.expression_changed} expression change(s).`, ...s.coverage ? [coverageLine(s)] : [], `${regression.candidates.length} baseline difference(s); ${open} unclassified.`, ...regression.warnings];
}
