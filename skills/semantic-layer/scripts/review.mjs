import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { args, workspace, readJson, writeJson, hash, createOnce, run, isMain, appHost } from './common.mjs';
import { seedProposal, buildPreview, renderReview } from './review-lib.mjs';
import { buildKnowledgePreview } from './knowledge-lib.mjs';
import { reviewRegressions } from './baseline-lib.mjs';
import { loadRun } from './iq.mjs';

export async function main(a) {
  const config = await workspace(a.workspace), out = join(a.workspace, 'artifacts');
  const capture = await readJson(join(out, 'capture.json'));
  if (a.seed) {
    await createOnce(join(out, 'proposal.json'), `${JSON.stringify(seedProposal(capture, config.languages, config.review_scope ?? null), null, 2)}\n`, 'artifacts/proposal.json already exists and was kept. Edit it, or move it aside to seed from the current capture.');
    process.stdout.write('Seeded proposal.json without overwriting an existing draft. Assess every in-scope resource and fill the business brief before rendering.\n');
    return;
  }
  const proposal = await readJson(join(out, 'proposal.json'));
  let knowledge = null;
  let knowledgeCapture;
  try { knowledgeCapture = await readJson(join(out, 'knowledge-capture.json')); } catch (error) { if (!error.message.startsWith('Missing knowledge-capture.json')) throw error; }
  if (knowledgeCapture) {
    let knowledgeProposal;
    try { knowledgeProposal = await readJson(join(out, 'knowledge-proposal.json')); } catch (error) { if (!error.message.startsWith('Missing knowledge-proposal.json')) throw error; }
    if (knowledgeProposal) {
      knowledge = { proposal: knowledgeProposal, preview: buildKnowledgePreview(knowledgeProposal, knowledgeCapture), names: knowledgeCapture.names ?? {} };
      if (knowledge.preview.host !== capture.host) throw new Error('Knowledge and metadata captures belong to different hosts.');
      if (JSON.stringify(knowledgeCapture.selection) !== JSON.stringify(capture.selection)) throw new Error('Knowledge and metadata reviews have different dataset selections; recapture the intended scope.');
    }
  }
  buildPreview(proposal, capture);
  let baseline = null;
  try { baseline = await readJson(join(out, 'baseline.json')); } catch (error) { if (!error.message.startsWith('Missing baseline.json')) throw error; }
  const regression = baseline ? reviewRegressions(proposal, baseline, capture) : null;
  const preview = buildPreview(proposal, capture, regression?.summary.coverage);
  if (regression) await writeJson(join(out, 'regression-check.json'), regression);
  let iq = null;
  try { iq = await loadRun(out, 'before'); } catch (error) { if (!error.message.startsWith('Missing before.json')) throw error; }
  const views = renderReview(proposal, preview, knowledge, regression, iq, { customer: config.customer, dataset_names: capture.resources.filter(r => r.kind === 'dataset'), captured_at: capture.captured_at, app_host: await appHost(a.workspace, capture.host) });
  await writeJson(join(out, 'update-preview.json'), preview);
  await writeFile(join(out, 'review.md'), views.markdown, { mode: 0o600 });
  await writeFile(join(out, 'review.html'), views.html, { mode: 0o600 });
  await writeJson(join(out, 'approval.template.json'), { schema_version: 1, preview_sha256: hash(preview), reviewer: '', reviewed_at: '', approved_ids: [], note: 'Human approval required for these exact metadata updates. Copy this file, fill only after explicit authorization, and select IDs from update-preview.json. Re-rendering a changed proposal invalidates prior approval.' });
  const html = resolve(out, 'review.html');
  process.stdout.write(`Rendered ${preview.summary.reviewed} resources and ${preview.changes.length} updates. Preview SHA-256: ${hash(preview)}. No network or live changes.\n${regression ? `Baseline differences: ${regression.candidates.length}, unclassified ${regression.candidates.filter(c => !c.classification).length}.` : 'No baseline.json: the review states that continuity with earlier work was not established.'}\nReview page: ${html}\nOpen in a browser: ${pathToFileURL(html).href}\nNext: surface this page to the user in the most usable way the host allows, with a clickable link to the rendered page.\n`);
}
if (isMain(import.meta.url)) run(() => main(args({ seed: { type: 'boolean', default: false } })));
