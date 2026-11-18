import { hash, label } from './common.mjs';
import { datasetScope, timestamp } from './profile-lib.mjs';

// Small, bounded, read-only checks that answer one outstanding question each (a few rows for one entity, values around a threshold, an age against its timestamp).
export const INSPECT_LIMITS = { columns: 8, aggregates: 8, group_by: 2, rows: 100, in_values: 10 };
const OPERATORS = { '=': '? = ?', in: '? in ?', '>=': '? >= ?', '>': '? > ?', '<': '? < ?', '<=': '? <= ?' };
// Luzmo aggregation names; only count, min, max and median are exercised elsewhere in this toolkit.
const AGGREGATES = { count: 'count', min: 'min', max: 'max', sum: 'sum', avg: 'average', distinct_count: 'distinctcount' };
const KEYS = ['id', 'question', 'dataset_id', 'mode', 'columns', 'filters', 'date', 'order', 'limit', 'aggregates', 'group_by', 'timezone'];
const scalar = v => ['string', 'number', 'boolean'].includes(typeof v) && (typeof v !== 'number' || Number.isFinite(v));
const text = v => typeof v === 'string' && v.trim().length > 0;

export function buildInspection(config, capture, file) {
  for (const [key, maximum] of [['query_budget', 100], ['profile_days_limit', Infinity], ['profile_group_limit', 40]]) {
    if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > maximum) throw new Error(`Invalid ${key}; maximum ${maximum}.`);
  }
  if (!Array.isArray(file?.checks) || !file.checks.length) throw new Error('The checks file needs a nonempty "checks" array.');
  if (file.checks.length > config.query_budget) throw new Error(`Query budget exceeded: ${file.checks.length}/${config.query_budget}. Run fewer checks.`);
  if (new Set(file.checks.map(c => c?.id)).size !== file.checks.length) throw new Error('Check ids must be unique.');
  const checks = file.checks.map(check => {
    const where = `Check "${check?.id}"`, fail = message => { throw new Error(`${where}: ${message}`); };
    if (!check || typeof check !== 'object' || !text(check.id)) throw new Error('Every check needs an id.');
    for (const k of Object.keys(check)) if (!KEYS.includes(k)) fail(`unknown field "${k}".`);
    if (!text(check.question)) fail('state the specific outstanding question this check resolves.');
    const dataset = config.datasets.find(d => d.id === check.dataset_id);
    if (!dataset || !capture.selection.includes(check.dataset_id)) fail('dataset_id is not a selected, captured dataset.');
    if (!['rows', 'aggregate'].includes(check.mode)) fail('mode must be rows or aggregate.');
    const fields = new Map(capture.resources.filter(r => r.dataset_id === check.dataset_id && r.kind === 'column').map(r => [r.id, r]));
    const ref = id => {
      if (id !== '*' && !fields.has(id)) fail(`column ${id} is not in the captured dataset.`);
      return { dataset_id: check.dataset_id, column_id: id };
    };
    const name = id => id === '*' ? 'rows' : label(fields.get(id)?.name);
    const { authentication, scope: scopeWhere } = datasetScope(dataset, ref);
    const list = (key, max) => {
      const v = check[key] ?? [];
      if (!Array.isArray(v) || v.length > max) fail(`${key} must be an array of at most ${max}.`);
      return v;
    };
    const filters = list('filters', 20).map(f => {
      if (!f || !Object.hasOwn(OPERATORS, f.op)) fail(`filter op must be one of ${Object.keys(OPERATORS).join(', ')}.`);
      ref(f.column_id);
      if (f.op === 'in') {
        if (!Array.isArray(f.values) || !f.values.length || f.values.length > INSPECT_LIMITS.in_values || !f.values.every(scalar)) fail(`"in" needs 1-${INSPECT_LIMITS.in_values} scalar values.`);
        return { f, sql: { expression: OPERATORS.in, parameters: [ref(f.column_id), f.values] }, text: `${name(f.column_id)} in ${JSON.stringify(f.values)}` };
      }
      if (!scalar(f.value)) fail('filter value must be a string, number or boolean.');
      return { f, sql: { expression: OPERATORS[f.op], parameters: [ref(f.column_id), f.value] }, text: `${name(f.column_id)} ${f.op} ${JSON.stringify(f.value)}` };
    });
    let date = null;
    if (check.date !== undefined) {
      const d = check.date;
      if (!d || fields.get(d.column_id)?.type !== 'datetime') fail('date.column_id must be a captured datetime column.');
      const from = timestamp(d.from), to = timestamp(d.to);
      if (Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > config.profile_days_limit * 86400000) fail(`date window must be positive and at most ${config.profile_days_limit} days (profile_days_limit).`);
      date = { column_id: d.column_id, from, to };
    }
    if (!filters.some(x => ['=', 'in'].includes(x.f.op)) && !date) fail('add a selective filter (= or in) or a date window; a range comparison alone is not selective.');
    const columns = list('columns', INSPECT_LIMITS.columns), aggregates = list('aggregates', INSPECT_LIMITS.aggregates), groupBy = list('group_by', INSPECT_LIMITS.group_by), order = list('order', INSPECT_LIMITS.columns);
    columns.forEach(ref); groupBy.forEach(ref);
    const datetime = id => fields.get(id)?.type === 'datetime';
    const entity = filters.some(x => x.f.op === '=');
    let projected, limit, labels;
    if (check.mode === 'rows') {
      if (!columns.length || aggregates.length || groupBy.length) fail('rows mode needs columns and no aggregates or group_by.');
      limit = check.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > INSPECT_LIMITS.rows) fail(`limit must be an integer from 1 to ${INSPECT_LIMITS.rows}.`);
      for (const o of order) if (!columns.includes(o?.column_id) || !['asc', 'desc'].includes(o.direction)) fail('order entries need a projected column_id and direction asc or desc.');
      projected = columns; labels = columns.map(name);
    } else {
      if (!aggregates.length || columns.length || order.length || check.limit !== undefined) fail('aggregate mode needs aggregates and no columns, order or limit.');
      for (const a of aggregates) {
        if (!a || !Object.hasOwn(AGGREGATES, a.type)) fail(`aggregate type must be one of ${Object.keys(AGGREGATES).join(', ')}.`);
        ref(a.column_id);
        if (a.column_id === '*' && a.type !== 'count') fail('only count may use "*".');
        if (a.type === 'distinct_count' && !entity) fail('distinct_count is only allowed with an entity-equality (=) filter, because it can be expensive.');
        if (['sum', 'avg'].includes(a.type) && fields.get(a.column_id)?.type !== 'numeric') fail(`${a.type} needs a numeric column.`);
      }
      limit = groupBy.length ? config.profile_group_limit : 1;
      projected = [...groupBy, ...aggregates.filter(a => ['min', 'max'].includes(a.type)).map(a => a.column_id)];
      labels = [...groupBy.map(name), ...aggregates.map(a => `${a.type}(${name(a.column_id)})`)];
    }
    if (check.timezone !== undefined) { if (!text(check.timezone)) fail('timezone must be a time zone name.'); try { new Intl.DateTimeFormat('en', { timeZone: check.timezone }); } catch { fail('unknown timezone.'); } }
    if ((date || projected.some(datetime)) && !check.timezone) fail('timezone is required when a date window or a date column is used (for example UTC or Europe/Brussels).');
    const dimension = id => ({ ...ref(id), ...(datetime(id) ? { level: 9 } : fields.get(id)?.type === 'numeric' ? { discretization: { type: 'none' } } : {}) });
    const dims = check.mode === 'rows' ? columns : groupBy;
    const measure = a => ({ ...ref(a.column_id), aggregation: { type: AGGREGATES[a.type] } });
    const options = { rollup_data: check.mode === 'aggregate', timezone_id: check.timezone ?? config.timezone ?? 'UTC', locale_id: config.languages[0] };
    const dateWhere = date ? [{ expression: '? >= ?', parameters: [ref(date.column_id), date.from] }, { expression: '? < ?', parameters: [ref(date.column_id), date.to] }] : [];
    const query = { dimensions: dims.map(dimension), measures: check.mode === 'aggregate' ? aggregates.map(measure) : [], where: [...scopeWhere, ...filters.map(x => x.sql), ...dateWhere], ...order.length && { order: order.map(o => ({ ...ref(o.column_id), order: o.direction })) }, limit: { by: limit, offset: 0 }, options };
    const scopeText = `dataset ${label(capture.resources.find(r => r.id === check.dataset_id)?.name)} (${dataset.scope.mode}, ${authentication} credentials); scope filters: ${dataset.scope.filters.map(f => `${name(f.column_id)} = ${JSON.stringify(f.value)}`).join(', ') || 'none'}; filters: ${filters.map(x => x.text).join(' AND ') || 'none'}; date window: ${date ? `${name(date.column_id)} from ${date.from} (inclusive) to ${date.to} (exclusive)` : 'none'}; timezone: ${options.timezone_id}; ${check.mode} mode, limit ${limit}`;
    return { id: check.id, question: check.question.trim(), dataset_id: check.dataset_id, mode: check.mode, authentication, scope: scopeText, labels, query };
  });
  return { schema_version: 1, host: capture.host, capture_sha256: hash(capture), config_sha256: hash(config), checks, limitations: ['Read-only and bounded, but the checks are small samples chosen to answer one question; they do not describe the whole dataset.', 'Date bounds are UTC instants; the timezone option only affects how the Data API groups and formats dates.', 'Results can contain customer data; they stay in the private workspace.'] };
}
