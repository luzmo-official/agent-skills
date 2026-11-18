import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { args, workspace, client, writeJson, hash, sanitize, uuid, run, isMain } from './common.mjs';

const fieldAttributes = ['id', 'name', 'description', 'ai_context', 'type', 'subtype', 'format', 'expression', 'order', 'lowestLevel', 'duration_levels', 'duration_format', 'currency_id', 'securable_id'];
export function resourceRows(dataset) {
  if (!Array.isArray(dataset.columns) || !Array.isArray(dataset.formulas)) throw new Error('Dataset response lacks columns or formulas; capture is incomplete.');
  return [{ ...dataset, kind: 'dataset', resource: 'securable', dataset_id: dataset.id },
    ...dataset.columns.map(c => ({ ...c, kind: 'column', resource: 'column', dataset_id: dataset.id })),
    ...dataset.formulas.map(f => ({ ...f, kind: 'formula', resource: 'formula', dataset_id: dataset.id }))];
}
export function references(contents, ids) {
  const hits = [];
  const walk = (value, path) => {
    if (typeof value === 'string') {
      for (const id of ids) if (value.includes(id)) hits.push({ id, path });
    } else if (Array.isArray(value)) value.forEach((item, i) => walk(item, `${path}[${i}]`));
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) walk(item, `${path}.${key}`);
  };
  walk(contents, '$');
  return hits;
}
export async function main(a, dependencies = {}) {
  const config = await workspace(a.workspace), api = dependencies.api ?? await client(a.workspace);
  const out = join(a.workspace, 'artifacts');
  if (a.discover) {
    const pages = config.discovery_max_pages ?? 20;
    if (!Number.isInteger(pages) || pages < 1 || pages > 100) throw new Error('discovery_max_pages must be 1–100.');
    const datasets = [], seen = new Set();
    let complete = false;
    for (let page = 0; page < pages; page++) {
      const response = await api.request('securable', { action: 'get', find: { where: { type: 'dataset' }, attributes: ['id', 'name', 'description', 'type'], limit: 100, offset: page * 100, order: [['id', 'ASC']] } });
      if (!Array.isArray(response.rows) || response.rows.length > 100) throw new Error('Unexpected discovery response.');
      for (const row of response.rows) {
        if (!uuid(row.id) || seen.has(row.id)) throw new Error('Invalid or repeated discovery ID; selection may have changed during pagination.');
        seen.add(row.id); datasets.push(row);
      }
      if (response.rows.length < 100) { complete = true; break; }
    }
    await writeJson(join(out, 'discovery.json'), { schema_version: 1, captured_at: new Date().toISOString(), host: api.host, complete, note: 'Credential-visible inventory only; not selected scope. Incomplete when page cap is reached. May change during pagination.', datasets });
    if (!datasets.length) {
      process.stdout.write('Discovered 0 candidates: the API token is valid on this host, but its Luzmo user cannot access any dataset (public datasets are excluded). Share the datasets with that user, or create the API token as a user who can open them.\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`Discovered ${datasets.length} candidates; complete=${complete}. Review artifacts/discovery.json and select dataset IDs in config.json.\n`);
    return;
  }
  if (!config.datasets.length) throw new Error('Select datasets in config.json before capture.');
  if (!Number.isInteger(config.dashboard_limit) || config.dashboard_limit < 0 || config.dashboard_limit > 500) throw new Error('dashboard_limit must be 0–500.');
  const report = { schema_version: 1, captured_at: new Date().toISOString(), host: api.host, selection: config.datasets.map(d => d.id), resources: [], dashboards: [], issues: [], complete: false };
  const checkpoint = () => writeJson(join(out, 'capture.partial.json'), report);
  const dashboardIds = new Set();
  for (const d of config.datasets) {
    try {
      const response = await api.request('securable', { action: 'get', find: { where: { id: d.id, type: 'dataset' }, attributes: ['id', 'name', 'description', 'ai_context', 'type', 'subtype', 'rows', 'modified_at'], include: [{ model: 'Column', attributes: fieldAttributes }, { model: 'Formula', attributes: fieldAttributes }, { model: 'Securable', as: 'Dashboards', attributes: ['id', 'name', 'type'] }], limit: 1 } });
      if (response.rows?.length !== 1 || response.rows[0].id !== d.id) throw new Error('Dataset inaccessible.');
      const dataset = response.rows[0];
      report.resources.push(...resourceRows(dataset).map(row => {
        const { columns, formulas, dashboards, ...resource } = row;
        return resource;
      }));
      if (!Array.isArray(dataset.dashboards)) report.issues.push({ id: d.id, error: 'Dashboard association missing; usage incomplete.' });
      for (const dash of dataset.dashboards ?? []) {
        if (!uuid(dash.id)) throw new Error('Invalid dashboard association.');
        dashboardIds.add(dash.id);
      }
    } catch (error) { if (error.refused) throw error; report.issues.push({ id: d.id, error: error.message }); }
    await checkpoint();
  }
  const ids = new Set(report.resources.map(r => r.id));
  if (ids.size !== report.resources.length) throw new Error('Duplicate resource IDs in capture.');
  for (const id of dashboardIds) {
    if (report.dashboards.length >= config.dashboard_limit) { report.issues.push({ error: 'Dashboard cap reached; increase dashboard_limit or explicitly document incomplete usage review.' }); break; }
    try {
      const response = await api.request('securable', { action: 'get', find: { where: { id, type: 'dashboard' }, attributes: ['id', 'name', 'description', 'ai_context', 'type', 'contents', 'modified_at'], limit: 1 } });
      if (response.rows?.length !== 1 || response.rows[0].id !== id) throw new Error('Dashboard inaccessible.');
      const row = sanitize(response.rows[0]);
      report.dashboards.push({ ...row, references: references(row.contents, ids), note: 'Usage evidence only; dashboard metadata is outside the scope of this skill. Potential reference locations, not semantic lineage. Credential-visible configuration, not active UI filters. Inline data removed; remaining definitions can still be sensitive.' });
    } catch (error) { if (error.refused) throw error; report.issues.push({ id, error: error.message }); }
    await checkpoint();
  }
  report.complete = report.issues.length === 0;
  await mkdir(join(out, 'captures'), { recursive: true, mode: 0o700 });
  await writeJson(join(out, 'captures', `${hash(report)}.json`), report);
  await writeJson(join(out, 'capture.json'), report);
  process.stdout.write(`Captured ${report.resources.length} resources; complete=${report.complete}. Inspect artifacts/capture.json, including issues.\n`);
  if (!report.complete) process.exitCode = 1;
}
if (isMain(import.meta.url)) run(() => main(args({ discover: { type: 'boolean', default: false } })));
