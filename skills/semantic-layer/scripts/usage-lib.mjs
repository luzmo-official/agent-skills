import { hash, same, uuid } from './common.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0 ? value : undefined;
// Slot names that hold measures when the content carries no aggregation, as in the Luzmo chart query builder.
const MEASURE_SLOT = /measure|value|target|size|weight|open|close|high|low/i;
// cumulativesum is a display of a sum, not a different calculation.
const AGGREGATIONS_WITHOUT_LOGIC = new Set(['sum', 'cumulativesum', 'average', 'avg', 'min', 'max', 'count', 'distinctcount', 'median']);
// Words a default label adds to a source name ("Total revenue", "Number of orders"). English only; other languages surface as business labels.
const AGGREGATION_WORDS = new Set(['sum', 'total', 'totals', 'average', 'avg', 'mean', 'count', 'number', 'nr', 'of', 'the', 'distinct', 'unique', 'min', 'minimum', 'max', 'maximum', 'median', 'per', 'by', 'in']);
const words = value => String(value).replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
function localized(value) {
  const entries = object(value) ? Object.entries(value).filter(([, v]) => typeof v === 'string' && v.trim()) : typeof value === 'string' && value.trim() ? [['default', value]] : [];
  return entries.length ? Object.fromEntries(entries) : null;
}

function reference(content) {
  const dataset_id = text(content.datasetId) ?? text(content.dataset_id) ?? text(content.set);
  const formula = text(content.formulaId) ?? text(content.formula_id) ?? text(content.formula);
  if (formula) return uuid(formula) ? { formula_id: formula } : { expression: formula, dataset_id };
  const column_id = text(content.columnId) ?? text(content.column_id) ?? text(content.column);
  return column_id ? { dataset_id, column_id } : null;
}
const short = value => typeof value === 'string' ? value.slice(0, 100) : value;
// Every operand after the column counts (a between filter has two), and each filter keeps the and/or condition of its group.
function filters(value, found = [], condition = 'and') {
  if (Array.isArray(value)) value.forEach(v => filters(v, found, condition));
  else if (object(value)) {
    if (typeof value.expression === 'string' && Array.isArray(value.parameters)) {
      const ref = object(value.parameters[0]) ? reference(value.parameters[0]) : null;
      const values = value.parameters.slice(1).flatMap(operand => Array.isArray(operand) ? operand : operand === undefined ? [] : [operand]);
      if (ref) found.push({ ...ref, operator: value.expression, condition, values: values.slice(0, 10).map(short) });
    } else {
      const own = typeof value.condition === 'string' ? value.condition.toLowerCase() : condition;
      Object.values(value).forEach(v => filters(v, found, own));
    }
  }
  return found;
}
function charts(contents) {
  const found = new Map();
  const walk = value => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (object(value)) {
      if (typeof value.type === 'string' && Array.isArray(value.slots)) {
        const key = text(value.id) ?? `item-${found.size}`;
        if (!found.has(key)) found.set(key, { ...value, id: key });
        return;
      }
      Object.values(value).forEach(walk);
    }
  };
  walk(contents);
  return [...found.values()];
}

// Measures each chart computes, with the chart's own filters and grouping. Filter widgets and dashboard-level
// filters are not attributed to a chart, so a pattern is the chart's own definition, not what a viewer sees.
export function chartMeasures(dashboard) {
  const rows = [];
  for (const item of charts(dashboard.contents)) {
    if (item.type.endsWith('-filter')) continue;
    const measures = [], dimensions = [];
    for (const slot of item.slots) for (const raw of Array.isArray(slot?.content) ? slot.content : []) {
      if (!object(raw)) continue;
      const content = object(raw.drilldownColumn) ? raw.drilldownColumn : raw;
      const aggregation = text(content.aggregationFunc);
      let ref = reference(content);
      if (!ref) continue;
      // As in the chart query builder: a count, or any aggregation of a non-numeric column other than a distinct count, counts rows.
      if (ref.column_id && (aggregation === 'count' || aggregation && typeof content.type === 'string' && content.type !== 'numeric' && aggregation !== 'distinctcount')) ref = { dataset_id: ref.dataset_id, column_id: '*' };
      const label = localized(content.label) ?? localized(raw.label);
      if (aggregation || MEASURE_SLOT.test(slot.name ?? '')) measures.push({ ...ref, aggregation: aggregation ?? null, ...label && { label }, ...object(content.periodOverPeriod) && content.periodOverPeriod.type !== 'none' && { period_over_period: content.periodOverPeriod.type } });
      else dimensions.push(ref);
    }
    const own = filters(item.filters ?? []);
    for (const measure of measures) rows.push({ dashboard_id: dashboard.id, dashboard_name: dashboard.name ?? null, item_id: item.id, type: item.type, title: item.options?.title ?? null, measure, filters: own, dimensions });
  }
  return rows;
}

const filterKey = f => JSON.stringify([f.formula_id ?? f.column_id ?? f.expression, f.operator, f.condition, f.values.map(v => JSON.stringify(v)).sort()]);
// A label that adds words beyond the source name and default aggregation wording: business terminology people may use in questions.
export function businessLabels(labels, sourceName) {
  const known = new Set(Object.values(sourceName ?? {}).flatMap(words));
  if (!known.size) return [];
  return [...new Set(labels.flatMap(l => Object.values(l)).filter(v => words(v).some(w => !AGGREGATION_WORDS.has(w) && !known.has(w) && !/^\d+$/.test(w))))];
}
export function usagePatterns(capture) {
  const dashboards = (Array.isArray(capture.dashboards) ? capture.dashboards : []).filter(object);
  const rows = dashboards.flatMap(chartMeasures), patterns = new Map(), names = new Map(capture.resources.map(r => [r.id, r.name]));
  for (const row of rows) {
    const { formula_id, column_id, expression, dataset_id, aggregation } = row.measure;
    const key = JSON.stringify([formula_id ?? column_id ?? expression, formula_id ? null : aggregation, row.filters.map(filterKey).sort()]);
    const pattern = patterns.get(key) ?? { key: hash(key).slice(0, 12), measure: { formula_id, column_id, expression, dataset_id, aggregation }, source_name: names.get(formula_id ?? (column_id === '*' ? dataset_id : column_id)) ?? null, labels: [], filters: row.filters, dimensions: [], charts: [] };
    if (row.measure.label && !pattern.labels.some(l => same(l, row.measure.label))) pattern.labels.push(row.measure.label);
    for (const d of row.dimensions) if (!pattern.dimensions.some(o => same(o, d))) pattern.dimensions.push(d);
    pattern.charts.push({ dashboard_id: row.dashboard_id, dashboard_name: row.dashboard_name, item_id: row.item_id, type: row.type, title: row.title, ...row.measure.period_over_period && { period_over_period: row.measure.period_over_period } });
    patterns.set(key, pattern);
  }
  const list = [...patterns.values()].map(p => { const business_labels = businessLabels(p.labels, p.source_name), s = signals(p, business_labels); return { ...p, business_labels, signals: s, candidate: s.some(k => k !== 'repeated') }; }).sort((a, b) => b.candidate - a.candidate || b.charts.length - a.charts.length);
  return {
    schema_version: 1, capture_sha256: hash(capture), dashboards: dashboards.length, measures: rows.length,
    note: 'Chart-level usage evidence only: what charts compute, not what a definition should be. Dashboard filter widgets and viewer filters are not included. Business labels name what chart authors call a measure; they are terminology candidates, not definitions. Filter values and labels may be confidential; keep them in the private workspace.',
    patterns: list,
  };
}
// Reasons a measure may deserve a saved formula; repetition alone does not, since a plain aggregation needs none. None of them establishes that it should exist.
function signals(p, labels) {
  const s = [];
  if (labels.length) s.push('business-label');
  if (p.filters.length) s.push('filtered-measure');
  if (p.measure.expression) s.push('ad-hoc-expression');
  if (new Set(p.charts.map(c => `${c.dashboard_id}:${c.item_id}`)).size > 1) s.push('repeated');
  if (p.measure.aggregation && !AGGREGATIONS_WITHOUT_LOGIC.has(p.measure.aggregation.toLowerCase())) s.push('special-aggregation');
  if (p.charts.some(c => c.period_over_period)) s.push('period-comparison');
  return s;
}
