import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { args, run, isMain } from './common.mjs';
import { seedProposal } from './review-lib.mjs';
import { syntheticCapture, syntheticKnowledgeCapture } from './synthetic.mjs';
import { seedKnowledge } from './knowledge-lib.mjs';

export async function main(a) {
  await mkdir(a.workspace, { recursive: false, mode: 0o700 });
  await mkdir(join(a.workspace, 'artifacts'), { mode: 0o700 });
  const config = { schema_version: 1, customer: 'Fictional order-line demo', languages: ['en'], datasets: [{ id: syntheticCapture.selection[0] }], discovery_max_pages: 20, dashboard_limit: 100, query_budget: 30, profile_days_limit: 31, profile_group_limit: 20 };
  const proposal = seedProposal(syntheticCapture, config.languages);
  proposal.verdict = 'ready';
  proposal.business_brief = 'Synthetic example only: analyze net revenue at order-line grain. Negative amounts represent refunds. Users need to distinguish line value from order value.';
  for (const r of proposal.resources) { r.assessment = 'Reviewed against the synthetic fixture; original definition remains valid.'; r.evidence = ['Synthetic fixture supplied with this toolkit, not customer evidence.']; }
  const revenue = proposal.resources.find(r => r.id.endsWith('444444444444'));
  revenue.disposition = 'revise';
  revenue.assessment = 'Makes unit, tax basis and the refund convention public; context keeps the query rules IQ needs (refund lines, order-level averaging).';
  revenue.proposed = { description: { en: 'Net order-line revenue in EUR, excluding tax. Negative values are refunds and count toward net sales.' }, ai_context: 'Fits net-sales, refund and revenue-by-product questions at order-line level. For net sales, keep refund lines; do not filter to positive amounts. For average order value, aggregate per order first.' };
  revenue.evidence = [{ summary: 'The captured context already establishes EUR, tax exclusion and negative refunds. Publishing these facts makes the field understandable without internal context.', source: 'Fictional captured dataset context', reference: 'Order-line dataset · existing AI context', type: 'source-metadata' }];
  proposal.evaluation_cases = [{ question: 'What was net revenue last month, including refunds?', language: 'en', category: 'normal', origin: 'new', expected_resource_ids: [syntheticCapture.selection[0], revenue.id], expected_filters: ['order_date in last calendar month'], expected_unit: 'EUR excluding tax', expected_population: 'All order lines, refunds included', expected_interpretation: 'Sum net revenue and keep negative refund lines.', must_not: ['Filter to positive amounts'], status: 'not-run', observed: '' }];
  revenue.knowledge_migrations = ['Retained refund sign convention; added public unit and tax basis from the synthetic fixture contract.'];
  const knowledge = seedKnowledge(syntheticKnowledgeCapture, config.languages);
  knowledge.verdict = 'ready'; knowledge.assessment = 'Fictional example: review existing answer preferences and the sales agent before adding a focused chart assistant.';
  for (const r of knowledge.resources) { r.assessment = 'Reviewed individually against the fictional configuration.'; r.evidence = ['Synthetic fixture, not customer evidence.']; }
  knowledge.resources[0].disposition = 'revise';
  knowledge.resources[0].proposed.content = "Keep answers concise and use the language of the user's question.";
  knowledge.resources[0].proposed.publication = 'latest';
  knowledge.resources[0].assessment = 'Preserves concise answers and adds an explicit response-language preference.';
  knowledge.resources[0].evidence = [{ summary: 'Both the published rule and the newer draft request concise answers; neither specifies response language.', source: 'Fictional captured rule', reference: 'Answer style · published and latest versions' }];
  knowledge.resources[1].assessment = 'Keep the existing analyst: its data-analysis capability, order-line dataset and answer-style rule match the sales-question use case.';
  knowledge.resources[1].evidence = [{ summary: 'The existing agent is configured for data analysis, linked to the order-line dataset and the Answer style rule.', source: 'Fictional captured agent', reference: 'Sales analyst · capabilities and associations' }];
  knowledge.resources[0].scope_rationale = 'Publish the proposed text for every linked agent, including the existing Sales analyst.';
  knowledge.resources.push({ key: 'new:chart-assistant', id: null, kind: 'agent', disposition: 'create', original: null, proposed: { name: { en: 'Sales chart assistant' }, description: { en: 'Creates sales and refund charts from order lines.' }, capabilities: ['chart_creation'], theme_id: null, dataset_ids: [syntheticCapture.selection[0]], rule_refs: [syntheticKnowledgeCapture.resources[0].id] }, assessment: 'A focused chart capability complements the existing analyst; this example assumes that separate entry point was requested.', evidence: ['Fictional demo requirement.'], scope_rationale: 'Organization-wide agent, limited to the order-line dataset once configuration completes. Uses the published answer-style rule. Creation and link setup are separate API calls.', questions: [] });
  for (const [name, value] of [['config.json', config], ['artifacts/capture.json', syntheticCapture], ['artifacts/proposal.json', proposal], ['artifacts/knowledge-capture.json', syntheticKnowledgeCapture], ['artifacts/knowledge-proposal.json', knowledge]]) await writeFile(join(a.workspace, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  process.stdout.write('Created fictional demo. Run review.mjs for this workspace to render the comparison. No credentials or network used.\n');
}
if (isMain(import.meta.url)) run(() => main(args()));
