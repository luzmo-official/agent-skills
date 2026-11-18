import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { same, writeJson } from './common.mjs';
import { seedProposal, buildPreview, renderReview } from './review-lib.mjs';
import { expressionFacts, plainAggregation } from './semantic-checks.mjs';
import { usagePatterns, businessLabels } from './usage-lib.mjs';
import { syntheticCapture } from './synthetic.mjs';
import { main as usageMain } from './usage.mjs';

// Fictional order lines: net_revenue, status and line_id from the synthetic capture, plus one saved formula.
const ds = syntheticCapture.selection[0], ref = id => `{${ds}:${id}}`;
const ids = { revenue: '44444444-4444-4444-8444-444444444444', line: '55555555-5555-4555-8555-555555555555', status: '66666666-6666-4666-8666-666666666666', refunds: '12121212-1212-4212-8212-121212121212' };
function capture() {
  const c = structuredClone(syntheticCapture);
  c.resources.push({ id: ids.refunds, name: { en: 'Refunded revenue' }, kind: 'formula', resource: 'formula', dataset_id: ds, description: { en: 'Net revenue of refunded lines.' }, ai_context: null, expression: `SUM(IF(${ref(ids.revenue)} < 0, ${ref(ids.revenue)}, 0))` });
  return c;
}
function proposalFor(c) {
  const p = seedProposal(c, ['en']);
  Object.assign(p, { verdict: 'ready', business_brief: 'Fictional order-line analysis.' });
  for (const r of p.resources) r.assessment = 'Reviewed against the fictional fixture.';
  return p;
}
const candidate = (overrides = {}) => ({
  title: 'Share of total revenue', classification: 'optional', status: 'not-approved', resource_ids: [], origin: 'suggested',
  reason: 'Shows how much each group contributes to the overall revenue.', intended_question: 'Which share of revenue does each status represent?',
  result_grain: 'One share per chart group', population: 'All order lines in the query filters', expression_candidate: `SUM(${ref(ids.revenue)}) / GROUPFULL(SUM(${ref(ids.revenue)}))`,
  dependencies: [ids.revenue], boundary_cases: ['Total revenue of zero', 'Refunds lowering the total'], validation_needed: 'Owner agrees that refunds count towards the total.',
  evidence: [{ summary: 'Revenue questions by status are central to the business.', type: 'research' }], ...overrides,
});
const warnings = (p, c) => buildPreview(p, c).warnings;

test('plain single aggregations are recognised; grouping modifiers are reported as expression facts', () => {
  for (const plain of [`SUM(${ref(ids.revenue)})`, ' avg( order_total ) ', 'COUNT(*)', 'COUNTR()', 'COUNTD(table0.customer_id)']) assert(plainAggregation(plain), plain);
  for (const logic of [`SUM(IF(${ref(ids.status)} = 'refunded', ${ref(ids.revenue)}, 0))`, `SUM(${ref(ids.revenue)}) / GROUPFULL(SUM(${ref(ids.revenue)}))`, `SUM(${ref(ids.revenue)} * 1.21)`, null]) assert(!plainAggregation(logic), String(logic));
  assert.deepEqual(expressionFacts(`AVG(GROUPINEX(SUM(${ref(ids.revenue)}), [${ref(ids.line)}], []))`).grouping, ['GROUPINEX']);
  assert.deepEqual(expressionFacts(`SUM(${ref(ids.revenue)}) / GROUPFULL(SUM(${ref(ids.revenue)}))`).grouping, ['GROUPFULL']);
  assert.deepEqual(expressionFacts(`SUM(${ref(ids.revenue)})`).grouping, []);
});

test('new formula candidates record their origin; evidenced ones must cite customer definitions or usage', () => {
  const c = capture(), p = proposalFor(c);
  p.calculation_changes.push(candidate({ origin: undefined }));
  assert(warnings(p, c).some(w => w.includes('without an origin')));
  p.calculation_changes[0] = candidate({ origin: 'evidenced' });
  assert.throws(() => buildPreview(p, c), /evidenced but cites no source-metadata/);
  p.calculation_changes[0] = candidate({ origin: 'evidenced', evidence: [{ summary: 'The dataset description defines refund share as refunded revenue over total revenue.', type: 'source-metadata' }] });
  assert(!warnings(p, c).some(w => w.includes('Share of total revenue')));
  p.calculation_changes[0] = candidate({ classification: 'defect', resource_ids: [ids.refunds] });
  assert.throws(() => buildPreview(p, c), /only on a new optional formula without resource_ids/);
  p.calculation_changes[0] = candidate({ origin: 'guessed' });
  assert.throws(() => buildPreview(p, c), /origin must be evidenced or suggested/);
  p.calculation_changes[0] = candidate({ evidence: [{ summary: 'x', type: 'profile' }] });
  assert.throws(() => buildPreview(p, c), /Profile evidence needs scope/);
});

test('recommending a plain aggregation or an existing expression is flagged', () => {
  const c = capture(), p = proposalFor(c);
  p.calculation_changes.push(candidate({ title: 'Total revenue', expression_candidate: `SUM( ${ref(ids.revenue)} )` }));
  p.calculation_changes.push(candidate({ title: 'Refund total', expression_candidate: c.resources.find(r => r.id === ids.refunds).expression.replace(', 0', ',  0') }));
  const w = warnings(p, c);
  assert(w.some(x => x.includes('Total revenue') && x.includes('single aggregation')));
  assert(w.some(x => x.includes('Refund total') && x.includes(ids.refunds) && x.includes('repeats the expression')));
  assert(!w.some(x => x.includes('Refund total') && x.includes('single aggregation')));
});

test('origin counts appear only when used, so earlier previews keep their shape', () => {
  const c = capture(), p = proposalFor(c);
  p.calculation_changes.push(candidate({ origin: undefined, resource_ids: [ids.refunds] }));
  assert.equal(buildPreview(p, c).summary.readiness.calculations.optional_origins, undefined);
  p.calculation_changes.push(candidate({ title: 'Mean revenue per order', expression_candidate: `AVG(GROUPINEX(SUM(${ref(ids.revenue)}), [${ref(ids.line)}], []))`, origin: 'evidenced', evidence: [{ summary: 'Owner asked for revenue per order.', type: 'owner' }] }));
  p.calculation_changes.push(candidate());
  assert.deepEqual(buildPreview(p, c).summary.readiness.calculations.optional_origins, { evidenced: 1, suggested: 1 });
});

test('the review separates formulas backed by existing use from suggestions and escapes their evidence', () => {
  const c = capture(), p = proposalFor(c);
  p.calculation_changes.push(candidate({ title: 'Refund share', origin: 'evidenced', evidence: [{ summary: '<b>Rule text</b> defines refund share.', type: 'source-metadata', source: 'Answer style rule' }] }), candidate());
  const { html, markdown } = renderReview(p, buildPreview(p, c));
  const backed = html.indexOf('Backed by existing use · 1'), ours = html.indexOf('Our suggestions · 1');
  assert(backed > 0 && ours > backed);
  assert(html.includes('Formula recommendations · 2'));
  assert(html.includes('<h4>Where the customer defines or uses it</h4>') && html.includes('<h4>What it is based on</h4>'));
  assert(html.includes('&lt;b&gt;Rule text&lt;/b&gt;') && !html.includes('<b>Rule text</b>'));
  assert(!html.includes('Other calculation follow-ups'));
  assert(markdown.includes('1 backed by existing customer use, 1 suggested'));
});

const filter = (column, values) => ({ expression: '? in ?', parameters: [{ column_id: column, dataset_id: ds }, values] });
const chart = (id, type, slots, filters = []) => ({ id, type, slots, filters: [{ condition: 'and', filters }], options: { title: { en: `Chart ${id}` } } });
const measure = (column, aggregationFunc) => ({ name: 'measure', content: [{ columnId: column, datasetId: ds, aggregationFunc, type: 'numeric' }] });
const category = { name: 'x-axis', content: [{ columnId: ids.status, datasetId: ds, type: 'hierarchy' }] };
function dashboards() {
  const refunded = chart('c1', 'bar-chart', [category, measure(ids.revenue, 'sum')], [filter(ids.status, ['refunded', 'x'.repeat(150)])]);
  return [
    { id: '77777777-7777-4777-8777-777777777777', name: { en: 'Sales' }, contents: { views: [{ screenModus: 'desktop', items: [refunded, chart('c2', 'line-chart', [measure(ids.revenue, 'sum')]), chart('f1', 'slicer-filter', [category])] }, { screenModus: 'mobile', items: [refunded] }] } },
    { id: '78787878-7878-4878-8878-787878787878', name: { en: 'Refunds' }, contents: { views: [{ items: [chart('c3', 'evolution-number', [{ name: 'measure', content: [{ formulaId: ids.refunds }] }], []), chart('c4', 'column-chart', [measure(ids.revenue, 'sum')], [filter(ids.status, ['refunded', 'x'.repeat(150)])]), chart('c5', 'column-chart', [measure(ids.revenue, 'sum')])] }] } },
  ];
}

test('usage patterns group chart measures with their own filters and flag only those worth a formula', () => {
  const c = capture();
  c.dashboards = dashboards();
  const report = usagePatterns(c);
  assert.equal(report.measures, 5, 'the same chart in two views counts once and filter widgets are skipped');
  const filtered = report.patterns.find(p => p.filters.length);
  assert.equal(filtered.charts.length, 2);
  assert.deepEqual(filtered.signals, ['filtered-measure', 'repeated']);
  assert.equal(filtered.candidate, true);
  assert.equal(filtered.filters[0].values[1].length, 100);
  assert.deepEqual(filtered.dimensions, [{ dataset_id: ds, column_id: ids.status }]);
  const plain = report.patterns.find(p => !p.filters.length && p.measure.column_id === ids.revenue);
  assert.equal(plain.charts.length, 2);
  assert.deepEqual(plain.signals, ['repeated']);
  assert.equal(plain.candidate, false, 'a repeated plain sum needs no saved formula');
  assert.equal(report.patterns.find(p => p.measure.formula_id === ids.refunds).candidate, false);
  assert.equal(report.patterns[0], filtered);
});

test('usage CLI derives patterns offline from the existing capture', async () => {
  const path = await mkdtemp(join(tmpdir(), 'luzmo-usage-test-'));
  await writeJson(join(path, 'config.json'), { schema_version: 1, languages: ['en'], datasets: [{ id: ds }] });
  const c = capture();
  c.dashboards = dashboards();
  await mkdir(join(path, 'artifacts'));
  await writeJson(join(path, 'artifacts/capture.json'), c);
  await usageMain({ workspace: path });
  const report = JSON.parse(await readFile(join(path, 'artifacts/usage-patterns.json'), 'utf8'));
  assert.equal(report.patterns.filter(p => p.candidate).length, 1);
  assert.match(report.note, /not what a definition should be/);
});

test('chart labels that add business terms beyond the source name become terminology candidates', () => {
  assert.deepEqual(businessLabels([{ en: 'Total net revenue' }, { en: 'Sum of netRevenue' }, { en: 'Booked sales' }, { nl: 'Omzet' }], { en: 'net_revenue' }), ['Booked sales', 'Omzet']);
  assert.deepEqual(businessLabels([{ en: 'Booked sales' }], null), [], 'no comparison without a captured source name');
  const c = capture();
  const named = { name: 'measure', content: [{ columnId: ids.revenue, datasetId: ds, aggregationFunc: 'sum', type: 'numeric', label: { en: 'Booked sales', nl: 'Geboekte verkoop' } }] };
  const plainLabel = { name: 'measure', content: [{ columnId: ids.revenue, datasetId: ds, aggregationFunc: 'sum', type: 'numeric', label: { en: 'Total net revenue' } }] };
  c.dashboards = [{ id: '77777777-7777-4777-8777-777777777777', name: { en: 'Sales' }, contents: { views: [{ items: [chart('a', 'bar-chart', [category, named]), chart('b', 'line-chart', [plainLabel])] }] } }];
  const [pattern] = usagePatterns(c).patterns;
  assert.deepEqual(pattern.signals, ['business-label', 'repeated']);
  assert.equal(pattern.candidate, true);
  assert.deepEqual(pattern.business_labels, ['Booked sales', 'Geboekte verkoop']);
  assert.equal(pattern.labels.length, 2);
  assert.deepEqual(pattern.source_name, { en: 'net_revenue' });
});

const named = (overrides = {}) => candidate({
  title: 'Units sold', origin: 'evidenced', expression_candidate: `COUNTD(${ref(ids.line)})`,
  reason: 'Users call the number of order lines units sold; a saved formula with that name lets IQ match their wording.',
  evidence: [{ summary: 'Several charts label the distinct count of order lines as units sold.', type: 'dashboard' }],
  proposed: { name: { en: 'Units sold' }, description: { en: 'Number of order lines sold. Each line counts once, whatever its quantity.' }, ai_context: 'Aliases: units, items sold' },
  ...overrides,
});

test('a plain aggregation is acceptable when it gives an evidenced business name; its metadata follows the metadata contract', () => {
  const c = capture(), p = proposalFor(c), meta = proposed => named({ proposed: { name: { en: 'Units sold' }, description: { en: 'Number of order lines sold.' }, ...proposed } });
  p.calculation_changes.push(named());
  assert(!warnings(p, c).some(w => w.includes('Units sold')));
  p.calculation_changes[0] = named({ origin: 'suggested' });
  assert(warnings(p, c).some(w => w.includes('Units sold') && w.includes('single aggregation')), 'a suggested plain aggregation is still flagged');
  p.calculation_changes[0] = meta({ description: { en: 'Number of order lines, as shown on the sales dashboard.' } });
  assert.throws(() => buildPreview(p, c), error => error.report?.problems?.some(x => x.includes('Units sold') && x.includes('description.en') && x.includes('dashboards')));
  p.calculation_changes[0] = meta({ name: { en: 'Sales dashboard units' } });
  assert.throws(() => buildPreview(p, c), error => error.report?.problems?.some(x => x.includes('name.en') && x.includes('dashboards')));
  p.calculation_changes[0] = meta({ description: { en: 'x'.repeat(301) } });
  assert.throws(() => buildPreview(p, c), error => error.report?.problems?.some(x => x.includes('tooltip budget')));
  p.calculation_changes[0] = meta({ name: { fr: 'Unités vendues' } });
  assert.throws(() => buildPreview(p, c), /proposed name is missing target locale en/);
  p.calculation_changes[0] = meta({ description: null });
  assert.throws(() => buildPreview(p, c), /needs both a name and a description/);
  p.calculation_changes[0] = meta({ name: { en: 'line_id' } });
  assert(warnings(p, c).some(w => w.includes('already used by') && w.includes(ids.line)));
  p.calculation_changes[0] = meta({});
  p.calculation_changes.push({ ...meta({}), title: 'Sold units' });
  assert(warnings(p, c).some(w => w.includes('Calculation candidate “Units sold” proposed name is already used by candidate “Sold units”')));
  p.calculation_changes = [meta({ ai_context: 'Use with caution.' })];
  assert(warnings(p, c).some(w => w.includes('Units sold') && w.includes('generic warning')));
  p.calculation_changes[0] = meta({ formula: 'SUM(1)' });
  assert.throws(() => buildPreview(p, c), /proposed supports name, description and ai_context only/);
  p.calculation_changes[0] = named({ classification: 'unvalidated', origin: undefined, resource_ids: [ids.refunds] });
  assert.throws(() => buildPreview(p, c), /only on a new optional formula/);
});

test('follow-ups on existing resources are not treated as recommendations', () => {
  const c = capture(), p = proposalFor(c), refunds = c.resources.find(r => r.id === ids.refunds);
  for (const classification of ['unvalidated', 'duplicate', 'defect', 'optional']) p.calculation_changes.push(candidate({ title: `Check ${classification}`, classification, origin: undefined, resource_ids: [ids.refunds], expression_candidate: classification === 'defect' ? `SUM(${ref(ids.revenue)})` : refunds.expression }));
  assert(!warnings(p, c).some(w => w.includes('Calculation candidate “Check')));
  p.calculation_changes.push(candidate({ resource_ids: [ids.refunds] }));
  assert.throws(() => buildPreview(p, c), /only on a new optional formula without resource_ids/);
});

test('the review shows a recommended formula with its proposed name, description and AI context', () => {
  const c = capture(), p = proposalFor(c);
  p.calculation_changes.push(named({ proposed: { name: { en: '<i>Units</i> sold' }, description: { en: 'Number of order lines sold.' }, ai_context: null } }));
  const { html } = renderReview(p, buildPreview(p, c));
  assert(html.includes('<h4>Proposed name and description</h4>') && html.includes('&lt;i&gt;Units&lt;/i&gt; sold') && !html.includes('<i>Units</i>'));
  assert(html.includes('<h4>Proposed AI context</h4><p class="definition">Not set.</p>'));
});

test('usage patterns keep different filters apart and count rows the way charts do', () => {
  const c = capture(), group = (condition, filters) => [{ condition, filters }];
  const between = (lo, hi) => ({ expression: '? between ?', parameters: [{ column_id: ids.revenue, dataset_id: ds }, lo, hi] });
  const recent = quantity => ({ expression: '? last_now ?', parameters: [{ column_id: '33333333-3333-4333-8333-333333333333', dataset_id: ds }, { unit: 'day', quantity }] });
  const items = [
    { ...chart('a', 'bar-chart', [measure(ids.revenue, 'sum')]), filters: group('and', [between(10, 20)]) },
    { ...chart('b', 'bar-chart', [measure(ids.revenue, 'sum')]), filters: group('and', [between(10, 99)]) },
    { ...chart('c', 'bar-chart', [measure(ids.revenue, 'sum')]), filters: group('and', [recent(7)]) },
    { ...chart('d', 'bar-chart', [measure(ids.revenue, 'sum')]), filters: group('and', [recent(365)]) },
    { ...chart('e', 'bar-chart', [measure(ids.revenue, 'sum')]), filters: group('or', [filter(ids.status, ['a']), filter(ids.status, ['b'])]) },
    { ...chart('f', 'bar-chart', [measure(ids.revenue, 'sum')]), filters: group('and', [filter(ids.status, ['a']), filter(ids.status, ['b'])]) },
    chart('g', 'bar-chart', [{ name: 'measure', content: [{ columnId: ids.line, datasetId: ds, aggregationFunc: 'count', type: 'hierarchy', label: {}, }] }]),
    chart('h', 'bar-chart', [{ name: 'measure', content: [{ columnId: ids.status, datasetId: ds, aggregationFunc: 'count', type: 'hierarchy' }] }]),
    chart('i', 'line-chart', [{ name: 'measure', content: [{ columnId: ids.revenue, datasetId: ds, aggregationFunc: 'cumulativesum', type: 'numeric', label: { en: 'Net revenue 2026' } }] }]),
  ];
  c.dashboards = [{ id: '77777777-7777-4777-8777-777777777777', name: { en: 'Sales' }, contents: { views: [{ items }] } }, null];
  const report = usagePatterns(c), filtered = report.patterns.filter(p => p.filters.length);
  assert.equal(report.dashboards, 1);
  assert.equal(filtered.length, 6, 'between bounds, relative periods and and/or groups each make their own pattern');
  assert(filtered.some(p => same(p.filters[0].values, [10, 99])));
  assert(filtered.some(p => p.filters.every(f => f.condition === 'or')));
  const rows = report.patterns.find(p => p.measure.column_id === '*');
  assert.equal(rows.charts.length, 2, 'a count of any column counts rows');
  assert.deepEqual(rows.source_name, c.resources[0].name);
  const cumulative = report.patterns.find(p => p.measure.aggregation === 'cumulativesum');
  assert.deepEqual(cumulative.signals, [], 'a running total and a year in the label are not formula signals');
  assert.deepEqual(usagePatterns({ ...c, dashboards: undefined }).patterns, []);
});
