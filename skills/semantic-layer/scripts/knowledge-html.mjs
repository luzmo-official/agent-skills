import { escapeHtml as e, hash, label } from './common.mjs';
import { renderRationale, openInLuzmo } from './review-evidence.mjs';

const display = value => value == null ? 'Not set.' : typeof value === 'string' ? value : Object.entries(value).map(([locale, text]) => `${locale.toUpperCase()}: ${text}`).join('\n');
const capabilities = { data_analysis: 'Data analysis', chart_creation: 'Chart creation', dashboard_creation: 'Dashboard creation' };
const publication = { preserve: 'Save draft; keep current publication', latest: 'Publish proposed version', unpublish: 'Unpublish rule' };
const outcome = { keep: 'Reviewed (no update needed)', revise: 'Suggested updates', create: 'Suggested updates', hold: 'Needs clarification' };
const paragraph = (name, value) => `<h4>${e(name)}</h4><p class="definition">${e(display(value))}</p>`;
const names = (ids, map) => ids.length ? ids.map(id => map.get(id) ?? id).join(', ') : 'None';

export function renderKnowledgeSection(proposal, preview, datasetNames = new Map(), links = null) {
  const resources = new Map(proposal.resources.map(r => [r.key, label(r.proposed.name)]));
  const changed = new Set(preview.changes.map(c => c.key));
  const ruleState = (heading, v, absent) => v ? `${paragraph(heading, v.name)}<p class="definition">${e(v.content)}</p>` : paragraph(heading, absent);
  const cards = proposal.resources.map((r, index) => {
    const unchanged = !changed.has(r.key) && r.disposition !== 'hold';
    let comparison;
    if (r.kind === 'rule') {
      comparison = `<div class="pair"><section>${ruleState('Current published rule', r.original?.published_version, 'Not published.')}${ruleState('Current draft', r.original?.latest_version, r.original ? 'Not set.' : 'New rule')}</section><section class="${changed.has(r.key) ? 'changed' : ''}">${ruleState('Proposed rule', r.proposed)}${paragraph('Publication', publication[r.proposed.publication])}</section></div>${paragraph('Currently linked agents', names(r.original?.linked_agent_ids ?? [], resources))}`;
    } else {
      const agent = (p, heading, changedSide = false) => `<section${changedSide ? ' class="changed"' : ''}>${paragraph(heading, p ? p.name : 'New agent')}${p ? paragraph('Description', p.description) + paragraph('Capabilities', p.capabilities.length ? p.capabilities.map(c => capabilities[c] ?? c).join(', ') : 'All capabilities available to the user') + paragraph('Datasets', p.dataset_ids.length ? names(p.dataset_ids, datasetNames) : 'No dataset allowlist; normal IQ dataset selection applies') + paragraph('Linked AI rules', names(p.rule_refs, resources)) + paragraph('Theme', p.theme_id) : ''}</section>`;
      comparison = `<div class="pair">${agent(r.original, 'Current agent')}${agent(r.proposed, 'Proposed agent', changed.has(r.key))}</div>${changed.has(r.key) ? `<p class="muted">${r.id === null ? 'The new agent is organization-visible before its dataset and rule links are configured. Creation is not atomic.' : 'Agent settings and link changes take effect directly. Replacement links are added before old links are removed.'}</p>` : ''}`;
    }
    return `<article class="resource knowledge-resource" id="knowledge-${e(r.key)}" data-unchanged="${unchanged}"${unchanged ? ' hidden' : ''}><div class="card-heading"><div><p class="eyebrow">${r.kind === 'rule' ? 'AI rule' : 'Agent'}</p><h3><span class="num">${index + 1}</span>${e(label(r.proposed.name))}</h3></div><div class="card-actions"><span class="badge ${e(r.disposition === 'create' ? 'revise' : unchanged ? 'keep' : r.disposition)}">${e(outcome[r.disposition])} · ${r.kind === 'rule' ? 'AI rule' : 'Agent'}</span>${r.id ? openInLuzmo(links?.[r.kind]?.(r.id)) : ''}</div></div>${r.scope_rationale ? `<p class="scope"><strong>Scope and effect:</strong> ${e(r.scope_rationale)}</p>` : ''}${r.questions.length ? `<ul class="questions">${r.questions.map(q => `<li>${e(q)}</li>`).join('')}</ul>` : ''}${comparison}${renderRationale(unchanged ? { ...r, disposition: 'keep' } : r, links)}</article>`;
  }).join('\n');
  return `<section id="knowledge-review"><h2 class="section-title">AI rules and agents</h2><p class="lead-small">${e(proposal.assessment)}</p><p class="muted">${preview.reviewed} reviewed · ${preview.changes.length} proposed ${preview.changes.length === 1 ? 'update' : 'updates'}. AI rules guide how IQ answers, but only for the agents they are linked to and only when a request uses that agent; agents bundle datasets, rules and capabilities into one assistant.</p><label class="checkbox-label"><input id="show-unchanged-knowledge" type="checkbox">Also show reviewed rules and agents (no update needed)</label>${proposal.questions.length ? `<ul>${proposal.questions.map(q => `<li>${e(q)}</li>`).join('')}</ul>` : ''}${cards}<details class="version"><summary>Rules and agents review version</summary><code>${hash(preview)}</code></details></section>`;
}

export function renderKnowledgeMarkdown(proposal, preview) {
  return ['# AI rules and agents review', '', proposal.assessment, '', `Verdict: ${proposal.verdict}. Reviewed: ${preview.reviewed}. Proposed updates: ${preview.changes.length}.`, '', `Preview SHA-256: ${hash(preview)}`, '', ...proposal.questions.map(q => `- ${q}`), '', ...proposal.resources.flatMap(r => [`## ${label(r.proposed.name)} (${r.kind})`, '', `Key: ${r.key}. Outcome: ${r.disposition}.`, '', r.assessment, '', r.scope_rationale, '', '```json', JSON.stringify({ original: r.original, proposed: r.proposed, evidence: r.evidence, questions: r.questions }, null, 2), '```', ''])].join('\n');
}
