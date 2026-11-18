import { hash, uuid } from './common.mjs';

export const timestamp = value => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid date-only profile bound.');
    return date.toISOString();
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Use YYYY-MM-DD or RFC3339 timestamps for profile bounds.');
  return new Date(value).toISOString();
};
export const rowDimension = type => type === 'datetime' ? { level: 9 } : type === 'numeric' ? { discretization: { type: 'none' } } : {};
// Connection mode and scope filters shared by profiling and targeted inspection; every query is ANDed with these predicates.
export function datasetScope(d, ref) {
  const authentication = d.profile?.authentication ?? 'api';
  if (!['api', 'embed'].includes(authentication)) throw new Error('Profile authentication must be api or embed.');
  if (!d.scope?.rationale?.trim()) throw new Error('Record the inspected profiling target or connection rationale.');
  if (!['filtered', 'default-connection', 'embed-context'].includes(d.scope.mode)) throw new Error('Choose filtered, default-connection or embed-context profiling.');
  if (d.scope.mode === 'filtered' && d.scope.confirmed !== true) throw new Error('Filtered profiling needs scope.confirmed=true with an already established test or tenant ID.');
  if (d.scope.mode === 'embed-context' && authentication !== 'embed' || d.scope.mode === 'default-connection' && authentication !== 'api') throw new Error('Connection mode and selected credentials do not match.');
  if (!Array.isArray(d.scope.filters) || d.scope.mode === 'filtered' && !d.scope.filters.length || d.scope.mode !== 'filtered' && d.scope.filters.length) throw new Error('Invalid scope filters.');
  const scope = d.scope.filters.map(f => {
    if (!uuid(f.column_id) || !['string', 'number', 'boolean'].includes(typeof f.value) || typeof f.value === 'number' && !Number.isFinite(f.value)) throw new Error('Scope filters require explicit scalar equality values.');
    return { expression: '? = ?', parameters: [ref(f.column_id), f.value] };
  });
  return { authentication, scope };
}
export function buildProfile(config, capture) {
  const jobs = [], samples = [];
  const sampleRows = config.sample_rows ?? 1000;
  if (!Number.isInteger(sampleRows) || sampleRows < 1 || sampleRows > 1000) throw new Error('Invalid sample_rows; maximum 1000.');
  if (config.datasets.length !== capture.selection.length || config.datasets.some(d => !capture.selection.includes(d.id))) throw new Error('Configuration selection differs from capture.');
  for (const [key, maximum] of [['query_budget', 100], ['profile_days_limit', Infinity], ['profile_group_limit', 40]]) {
    if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > maximum) throw new Error(`Invalid ${key}; maximum ${maximum}.`);
  }
  for (const d of config.datasets) {
    if (!d.profile?.enabled) continue;
    if (d.profile.data_assessment && (!['real', 'mock', 'unknown'].includes(d.profile.data_assessment.classification) || !['sufficient', 'insufficient', 'unknown'].includes(d.profile.data_assessment.sufficiency) || typeof d.profile.data_assessment.basis !== 'string' || !d.profile.data_assessment.basis.trim())) throw new Error('Data assessment needs classification, sufficiency and an evidence basis.');
    const fields = capture.resources.filter(r => r.dataset_id === d.id && r.kind === 'column');
    const ids = new Set(fields.map(c => c.id));
    const ref = id => {
      if (id !== '*' && !ids.has(id)) throw new Error('Profile column not in captured dataset.');
      return { dataset_id: d.id, column_id: id };
    };
    const { authentication, scope } = datasetScope(d, ref);
    const from = timestamp(d.profile.from), to = timestamp(d.profile.to);
    if (Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > config.profile_days_limit * 86400000) throw new Error('Profile window exceeds configured bounds.');
    const where = [...scope, { expression: '? >= ?', parameters: [ref(d.profile.date_column), from] }, { expression: '? < ?', parameters: [ref(d.profile.date_column), to] }];
    const measure = (id, type) => ({ ...ref(id), aggregation: { type } });
    const options = { timezone_id: config.timezone ?? 'UTC', locale_id: config.languages[0] };
    const add = (purpose, local, dimensions, measures, labels, extra = []) => jobs.push({ dataset_id: d.id, purpose, authentication, scope: d.scope, data_assessment: d.profile.data_assessment ?? { classification: 'unknown', sufficiency: 'unknown', basis: 'Assess after the initial bounded profile.' }, date_role: d.profile.date_role ?? 'Unconfirmed cohort date role', query: { dimensions: dimensions.map(ref), measures, where: [...where, ...extra], limit: { by: dimensions.length ? config.profile_group_limit : 1, offset: 0 }, options: { rollup_data: true, ...options } }, labels, local });
    add('Cohort overview; not a KPI population', { op: 'overview', column_id: d.profile.date_column }, [], [measure('*', 'count'), measure(d.profile.date_column, 'min'), measure(d.profile.date_column, 'max')], ['rows', 'first cohort timestamp', 'last cohort timestamp']);
    if (!Array.isArray(d.profile.columns)) throw new Error('Select profile columns explicitly.');
    if (new Set(d.profile.columns.map(c => c.id)).size !== d.profile.columns.length) throw new Error('Duplicate profile columns.');
    for (const c of d.profile.columns) {
      ref(c.id);
      if (c.kind === 'numeric') {
        add(`Numeric completeness and range: ${c.id}`, { op: 'range', column_id: c.id }, [], [measure('*', 'count'), ...['count', 'min', 'max'].map(type => measure(c.id, type))], ['rows', 'non-null', 'minimum', 'maximum']);
        for (const [name, expression] of [['zero', '? = ?'], ['negative', '? < ?']]) add(`${name} rows: ${c.id}`, { op: name, column_id: c.id }, [], [measure('*', 'count')], ['rows'], [{ expression, parameters: [ref(c.id), 0] }]);
        if (c.median === true) add(`Nonnegative median; potentially expensive: ${c.id}`, { op: 'median', column_id: c.id }, [], [measure(c.id, 'median')], ['median'], [{ expression: '? >= ?', parameters: [ref(c.id), 0] }]);
      } else if (c.kind === 'category') {
        if (c.values_approved !== true) throw new Error('Category values may be sensitive; require values_approved=true.');
        add(`Limited category distribution: ${c.id}`, { op: 'category', column_id: c.id, limit: config.profile_group_limit }, [c.id], [measure('*', 'count')], ['category', 'rows']);
      } else if (c.kind === 'date') {
        add(`Date completeness and range: ${c.id}`, { op: 'range', column_id: c.id }, [], [measure('*', 'count'), ...['count', 'min', 'max'].map(type => measure(c.id, type))], ['rows', 'non-null', 'minimum', 'maximum']);
      } else throw new Error(`Unknown profile column kind "${c.kind}"; use numeric, category or date.`);
    }
    const columns = [...new Set([d.profile.date_column, ...d.profile.columns.map(c => c.id)])];
    const dimension = id => ({ ...ref(id), ...rowDimension(fields.find(f => f.id === id)?.type) });
    samples.push({ dataset_id: d.id, authentication, columns, query: { dimensions: columns.map(dimension), measures: [], where: scope, limit: { by: sampleRows, offset: 0 }, options: { rollup_data: false, ...options } } });
  }
  if (!jobs.length) throw new Error('No profiles enabled; configure selected datasets or skip profiling explicitly in the evidence record.');
  if (jobs.length > config.query_budget) throw new Error(`Query budget exceeded: ${jobs.length}/${config.query_budget}. Narrow the selected columns.`);
  return { schema_version: 1, host: capture.host, capture_sha256: hash(capture), config_sha256: hash(config), jobs, samples, limitations: [`A timed-out check falls back to up to ${sampleRows} unordered rows within the scope filters, without the date window; that sample is not representative of the dataset.`,'Aggregate cohort only; null cohort dates excluded.', 'Default connection may contain mock data; assess fitness before production claims.', 'Embed results reflect the supplied end-user context, including its filters and connection overrides; credentials are never included in the plan.', 'Small output does not bound source scans.', 'Distinct counts and medians can be expensive.', 'Start-date cohorts do not equal historical or complete current stock.'] };
}

const scalar = value => value && typeof value === 'object' ? value.id ?? Object.values(value.name ?? {})[0] ?? null : value;
const comparable = value => typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : Date.parse(value);
const extreme = (values, pick) => values.length ? values.reduce((a, b) => pick(comparable(b), comparable(a)) ? b : a) : null;

export function fromSample(job, sample) {
  const index = sample.columns.indexOf(job.local.column_id);
  if (index < 0) throw new Error(`Sample has no column ${job.local.column_id}.`);
  const values = sample.rows.map(row => scalar(row[index])), present = values.filter(v => v !== null && v !== undefined && v !== '');
  const numbers = present.map(Number).filter(Number.isFinite);
  switch (job.local.op) {
    case 'overview': return [[values.length, extreme(present, (a, b) => a < b), extreme(present, (a, b) => a > b)]];
    case 'range': return [[values.length, present.length, extreme(present, (a, b) => a < b), extreme(present, (a, b) => a > b)]];
    case 'zero': return [[numbers.filter(v => v === 0).length]];
    case 'negative': return [[numbers.filter(v => v < 0).length]];
    case 'median': {
      const sorted = numbers.filter(v => v >= 0).sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
      return [[sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null]];
    }
    case 'category': {
      const counts = new Map();
      for (const v of values) counts.set(v ?? null, (counts.get(v ?? null) ?? 0) + 1);
      return [...counts].sort((a, b) => b[1] - a[1]).slice(0, job.local.limit);
    }
    default: throw new Error(`No sample computation for ${job.local.op}.`);
  }
}
