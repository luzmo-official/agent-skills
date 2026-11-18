import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { args, workspace, client, readBackup, writeJson, hash, metadata, label, same, one, interruption, run, isMain, saveBackup, saveRecovery, stamp } from './common.mjs';
import { applyChanges, differences } from './apply-lib.mjs';

export async function restorePlan(api, backup, ids = null) {
  if (backup.schema_version !== 1 || backup.kind !== 'metadata' || !Array.isArray(backup.resources)) throw new Error('Not a metadata backup from artifacts/backups/. Restore AI rules and agents through a reviewed knowledge proposal instead.');
  if (backup.host !== api.host) throw new Error(`The backup was taken on ${backup.host}, but the workspace .env points at ${api.host}.`);
  const unknown = (ids ?? []).filter(id => !backup.resources.some(r => r.id === id));
  if (unknown.length) throw new Error(`Not in this backup: ${unknown.join(', ')}.`);
  const changes = [], unchanged = [], warnings = [];
  for (const r of ids ? backup.resources.filter(x => ids.includes(x.id)) : backup.resources) {
    const live = await one(api, r.resource, r.id, ['id', 'name', 'description', 'ai_context', ...(r.kind === 'dataset' ? ['type'] : ['expression'])], r.kind === 'dataset' ? 'dataset' : undefined);
    const target = { description: r.description, ai_context: r.ai_context }, fields = differences(live, target, live.expression ?? null).filter(f => f !== 'expression');
    if (!fields.length) { unchanged.push(r.id); continue; }
    if ((live.expression ?? null) !== r.expression) warnings.push(`${r.kind} "${label(r.name)}" (${r.id}): its expression changed after the backup; check that the restored text still describes it.`);
    if (!same(live.name, r.name)) warnings.push(`${r.kind} "${label(r.name)}" (${r.id}): it was renamed to "${label(live.name)}" after the backup; check that the restored text still describes it.`);
    const properties = {};
    if (fields.some(f => f.startsWith('description.'))) properties.description = target.description;
    if (fields.includes('ai_context')) properties.ai_context = target.ai_context;
    changes.push({ id: r.id, resource: r.resource, kind: r.kind, dataset_id: r.dataset_id, name: r.name, expected_name: live.name, before: metadata(live), expected_expression: live.expression ?? null, target, properties });
  }
  return { schema_version: 1, mode: 'restore-plan', host: api.host, backup_sha256: hash(backup), changes, unchanged, warnings };
}

export async function main(a, dependencies = {}) {
  if (!a.backup) throw new Error('Provide --backup <artifacts/backups/metadata-….json>.');
  if (a.execute && !a['plan-sha256']) throw new Error('Execute needs --plan-sha256 from the restore plan the user confirmed.');
  await workspace(a.workspace);
  const out = join(a.workspace, 'artifacts'), backup = await readBackup(a.workspace, a.backup, 'metadata');
  const ids = a.ids ? a.ids.split(',').map(id => id.trim()).filter(Boolean) : null;
  const api = dependencies.api ?? await client(a.workspace, { allowWrites: a.execute });
  const plan = await restorePlan(api, backup, ids);
  if (!a.execute) {
    await writeJson(join(out, 'restore-plan.json'), plan);
    process.stdout.write(`Restore plan: ${plan.changes.length} resource(s) differ from the backup, ${plan.unchanged.length} already match. Plan SHA-256: ${hash(plan)}. No writes made.\n${plan.warnings.map(w => `Warning: ${w}\n`).join('')}`);
    return plan;
  }
  if (hash(plan) !== a['plan-sha256']) throw new Error('Live metadata or the selection changed since the confirmed restore plan; nothing was written. Rebuild the plan and confirm it again.');
  if (!plan.changes.length) { process.stdout.write('Everything selected already matches the backup; nothing to restore.\n'); return { mode: 'applied', applied: 0 }; }
  const signals = interruption();
  try {
    const backupCurrent = resources => saveBackup(a.workspace, 'metadata', { host: api.host, restore_of: a.backup, resources });
    const result = await applyChanges(api, plan.changes, { execute: true, interrupted: () => signals.requested, backup: backupCurrent });
    await mkdir(join(out, 'applied'), { recursive: true, mode: 0o700 });
    await writeJson(join(out, 'applied', `restore-${stamp()}.json`), { schema_version: 1, applied_at: new Date().toISOString(), host: api.host, restored_from: a.backup, plan_sha256: hash(plan), ...result });
    process.stdout.write(`Restored and verified ${result.applied} resource(s) from ${a.backup}. The values they had before this restore are in ${result.backup}.\n`);
    return result;
  } catch (error) { await saveRecovery(a.workspace, 'restore', error); throw error; }
  finally { signals.dispose(); }
}
if (isMain(import.meta.url)) run(() => main(args({ backup: { type: 'string' }, ids: { type: 'string' }, 'plan-sha256': { type: 'string' }, execute: { type: 'boolean', default: false } })));
