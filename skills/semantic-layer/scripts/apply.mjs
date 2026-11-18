import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { args, workspace, client, readJson, writeJson, same, hash, interruption, run, isMain, saveBackup, saveRecovery, stamp } from './common.mjs';
import { buildPreview } from './review-lib.mjs';
import { reviewRegressions } from './baseline-lib.mjs';
import { approvedChanges, applyChanges } from './apply-lib.mjs';

export async function main(a, dependencies = {}) {
  if (!a.approval) throw new Error('Provide --approval <human-reviewed-approval.json>.');
  await workspace(a.workspace);
  const out = join(a.workspace, 'artifacts');
  const capture = await readJson(join(out, 'capture.json')), proposal = await readJson(join(out, 'proposal.json'));
  const preview = await readJson(join(out, 'update-preview.json'));
  let baseline = null;
  try { baseline = await readJson(join(out, 'baseline.json')); } catch (error) { if (!error.message.startsWith('Missing baseline.json')) throw error; }
  const regression = baseline ? reviewRegressions(proposal, baseline, capture) : null;
  if (!same(preview, buildPreview(proposal, capture, regression?.summary.coverage))) throw new Error('update-preview.json is stale or altered; run review.mjs again and obtain approval for the new preview.');
  const approval = await readJson(resolve(a.approval)), changes = approvedChanges(preview, approval);
  const api = dependencies.api ?? await client(a.workspace, { allowWrites: a.execute });
  if (api.host !== preview.host) throw new Error(`The workspace .env points at ${api.host}, but the approved preview was captured from ${preview.host}.`);
  const signals = a.execute ? interruption() : null;
  try {
    const backup = resources => saveBackup(a.workspace, 'metadata', { host: api.host, preview_sha256: hash(preview), resources });
    const result = await applyChanges(api, changes, { execute: a.execute, interrupted: () => signals?.requested, backup });
    if (a.execute) {
      await mkdir(join(out, 'applied'), { recursive: true, mode: 0o700 });
      await writeJson(join(out, 'applied', `metadata-${stamp()}.json`), { schema_version: 1, applied_at: new Date().toISOString(), host: api.host, preview_sha256: hash(preview), approval, ...result });
    }
    process.stdout.write(`${result.mode === 'preflight' ? `Preflight passed for ${result.checked} approved update(s); no writes made.` : `Applied and verified ${result.applied} update(s). Backup of the previous live values: ${result.backup}. Record saved under artifacts/applied/.`}\n`);
    return result;
  } catch (error) { await saveRecovery(a.workspace, 'metadata', error); throw error; }
  finally { signals?.dispose(); }
}
if (isMain(import.meta.url)) run(() => main(args({ execute: { type: 'boolean', default: false }, approval: { type: 'string' } })));
