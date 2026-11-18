import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { args, client, hash, readJson, writeJson, same, workspace, createOnce, interruption, run, isMain, saveBackup, saveRecovery, stamp, appHost } from './common.mjs';
import { captureKnowledge, seedKnowledge, buildKnowledgePreview, approvedKnowledge } from './knowledge-lib.mjs';
import { applyKnowledge } from './knowledge-apply.mjs';
import { renderKnowledgeSection, renderKnowledgeMarkdown } from './knowledge-html.mjs';
import { pageScript } from './review-html.mjs';
import { luzmoLinks, appAddressField } from './review-evidence.mjs';

export async function main(a, dependencies = {}) {
  if (!['collect', 'seed', 'review', 'apply'].includes(a.mode)) throw new Error('Use --mode collect, seed, review or apply.');
  if (a.execute && a.mode !== 'apply') throw new Error('--execute is only supported for apply.');
  const config = await workspace(a.workspace), out = join(a.workspace, 'artifacts');
  if (a.mode === 'collect') {
    const api = dependencies.api ?? await client(a.workspace);
    const capture = await captureKnowledge(api, { maxPages: config.discovery_max_pages ?? 20, selection: config.datasets.map(d => d.id), scope: config.knowledge_scope ?? null });
    await mkdir(join(out, 'knowledge-captures'), { recursive: true, mode: 0o700 });
    const serialized = `${JSON.stringify(capture, null, 2)}\n`;
    await createOnce(join(out, 'knowledge-captures', `${hash(capture)}.json`), serialized);
    await writeJson(join(out, 'knowledge-capture.json'), capture);
    process.stdout.write(`Captured ${capture.resources.length} existing AI rules/agents; complete=${capture.complete}. No live changes.\n`);
    if (!capture.complete) process.exitCode = 1;
    return;
  }
  const capture = await readJson(join(out, 'knowledge-capture.json'));
  if (!same(capture.selection, config.datasets.map(d => d.id))) throw new Error('Selected datasets changed; recapture rules and agents.');
  if (a.mode === 'seed') {
    await createOnce(join(out, 'knowledge-proposal.json'), `${JSON.stringify(seedKnowledge(capture, config.languages), null, 2)}\n`, 'artifacts/knowledge-proposal.json already exists and was kept. Edit it, or move it aside to seed from the current capture.');
    process.stdout.write('Seeded every existing AI rule and agent for individual review. No overwrites or live changes.\n');
    return;
  }
  const proposal = await readJson(join(out, 'knowledge-proposal.json')), preview = buildKnowledgePreview(proposal, capture);
  if (a.mode === 'review') {
    const css = await readFile(new URL('../assets/review.css', import.meta.url), 'utf8');
    const { script, scriptHash } = pageScript(), app = await appHost(a.workspace, capture.host);
    await writeJson(join(out, 'knowledge-preview.json'), preview);
    await writeFile(join(out, 'knowledge-review.md'), renderKnowledgeMarkdown(proposal, preview), { mode: 0o600 });
    await writeFile(join(out, 'knowledge-review.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'"><title>AI rules and agents review</title><style>${css}</style></head><body><main>${appAddressField(app)}${renderKnowledgeSection(proposal, preview, new Map(Object.entries(capture.names ?? {})), luzmoLinks(app))}</main><script>${script}</script></body></html>`, { mode: 0o600 });
    await writeJson(join(out, 'knowledge-approval.template.json'), { schema_version: 1, preview_sha256: hash(preview), reviewer: '', reviewed_at: '', approved_keys: [] });
    process.stdout.write(`Rendered ${preview.reviewed} AI rules/agents and ${preview.changes.length} changes. Preview SHA-256: ${hash(preview)}. No network or live changes.\n`);
    return;
  }
  if (!a.approval) throw new Error('Provide the approval file prepared after explicit human authorization.');
  if (!same(preview, await readJson(join(out, 'knowledge-preview.json')))) throw new Error('Knowledge preview is stale; re-render and obtain matching approval.');
  const changes = approvedKnowledge(preview, await readJson(resolve(a.approval)));
  const api = dependencies.api ?? await client(a.workspace, { allowKnowledgeWrites: a.execute });
  const signals = a.execute ? interruption() : null;
  try {
    const backup = inventory => saveBackup(a.workspace, 'knowledge', { host: api.host, preview_sha256: hash(preview), inventory });
    const result = await applyKnowledge(api, capture, changes, { execute: a.execute, maxPages: config.discovery_max_pages ?? 20, interrupted: () => signals?.requested, backup });
    if (a.execute) {
      await mkdir(join(out, 'applied'), { recursive: true, mode: 0o700 });
      await writeJson(join(out, 'applied', `knowledge-${stamp()}.json`), { schema_version: 1, applied_at: new Date().toISOString(), host: api.host, preview_sha256: hash(preview), approved_keys: changes.map(c => c.key), ...result });
    }
    process.stdout.write(`${result.mode === 'preflight' ? `Preflight passed for ${result.operations} approved rule/agent change(s); no writes made.` : `Applied and verified ${result.applied} rule/agent change(s). Backup of the previous rules and agents: ${result.backup}. Record saved under artifacts/applied/.`}\n`);
    return result;
  } catch (error) { await saveRecovery(a.workspace, 'knowledge', error); throw error; }
  finally { signals?.dispose(); }
}
if (isMain(import.meta.url)) run(() => main(args({ mode: { type: 'string' }, approval: { type: 'string' }, execute: { type: 'boolean', default: false } })));
