# Flex Chart Embedding Reference

Complete reference for embedding Luzmo Flex charts — code-first, slot-and-options based visualizations.

## Required Docs

Fetch before answering:

- Flex introduction: `https://developer.luzmo.com/guide/flex--introduction.md`
- Framework install: `https://developer.luzmo.com/guide/flex--introduction--installation-instructions.md`
- Basic usage: `https://developer.luzmo.com/guide/flex--introduction--basic-usage.md`
- Filters: `https://developer.luzmo.com/guide/flex--introduction--using-filters-in-flex.md`
- Flex component API: `https://developer.luzmo.com/guide/flex--component-api-reference.md`
- Chart catalog: `https://developer.luzmo.com/guide/flex--chart-docs.md`

For any specific chart type, fetch the chart page and its referenced documentation before answering:
- URL pattern: `https://developer.luzmo.com/flex/charts/{chart-type}.md`
- Examples: `bar-chart`, `line-chart`, `donut-chart`, `regular-table`, `date-filter`, `dropdown-filter`

## Packages and Component Names

| Framework | Package | Component / Tag |
|---|---|---|
| Web (vanilla JS) | `@luzmo/embed` | `<luzmo-embed-viz-item ...></luzmo-embed-viz-item>` |
| React | `@luzmo/react-embed` | `<LuzmoVizItemComponent ... />` |
| Angular | `@luzmo/ngx-embed` | `<luzmo-viz-item ...></luzmo-viz-item>` |
| Vue | `@luzmo/vue-embed` | `<luzmo-viz-item ...></luzmo-viz-item>` |

## Common Props

`appServer`, `apiHost`, `authKey`, `authToken`, `type`, `slots`, `options`, `contextId`

## Slot Content Fields

| Field | Required? | Notes |
|---|---|---|
| `datasetId` | Yes | Dataset UUID |
| `type` | Yes | Type of the column |
| `label` | Recommended | Localized object: `{ en: "Label" }` |
| `level` | For datetime/hierarchy | 1=year, 2=quarter, 3=month, 4=week, 5=day, 6=hour, 7=min, 8=sec, 9=ms |
| `columnId` | No | Column UUID - required if not using a formula |
| `formulaId` | No | Formula UUID, use for measures only. When specified, do not include `columnId`, `type`, nor `aggregationFunc` |
| `aggregationFunc` | No | Use for measures only (if not using a formula), one of: `sum`, `average`, `count`, `distinctcount`, `min`, `max`, `median`, `stddev`, `cumulativesum`, `histogram`, `rate`, `weightedaverage` |

## Slot Configuration Checklist

Before configuring any Flex chart, ensure each slot has:

**Required fields:**
- ✅ `datasetId` - UUID of the dataset
- ✅ `label` - Localized object: `{ en: "Label Text" }`

**Optional fields:**
- `columnId` - Column UUID - required if not using a formula
- `type` - One of: `hierarchy`, `numeric`, `datetime` - required if not using a formula
- `formulaId` - Formula UUID, use for measures only. When specified, do not include `columnId`, `type`, nor `aggregationFunc`
- `aggregationFunc` - Use for measures only, when not using a formula. One of the following values: `sum`, `average`, `count`, `distinctcount`, `min`, `max`, `median`, `stddev`, `cumulativesum`, `histogram`, `rate`, `weightedaverage`

**Type-specific requirements:**

For `numeric` when used in a measure slot:
- ✅ `aggregationFunc` - Required: `sum`, `average`, `count`, `distinctcount`, `min`, `max`, `median`, `stddev`, `cumulativesum`, `histogram`, `rate`, `weightedaverage`

For `numeric` when used in a dimension slot:
- ✅ `bins` - Required: `{ enabled: true, number: 10 }` for binning with size 10, `{ enabled: false }` to disable binning

For `datetime` (time dimensions):
- ✅ `level` - Required: 1=year, 2=quarter, 3=month, 4=week, 5=day, 6=hour, 7=minute, 8=second, 9=millisecond

For `hierarchy` (categorical dimensions):
- ✅ `level` - Required for drill-down: 1=top level, 2=second level, etc.

**Optional but recommended:**
- `subtype` - If column has one: `coordinates`, `currency`, `duration`, `hierarchy_element_expression`, `ip_address`, `topography`

## Rules

- Fetch the specific chart pages before writing `slots` or `options` for any chart type — do not invent fields.
- Each `contextId` must be unique across all chart instances on the page.
- Flex charts require explicit `height` and `width` on both container and chart component.
- All user-facing text must be localized objects: `{ en: "..." }`.
- Use embed tokens from the backend — never API credentials client-side.
- Do not use outdated names like `LuzmoFlex`.

## Troubleshooting Common Issues

| Problem | Cause | Solution |
|---|---|---|
| Chart is invisible (0 height) | Missing dimensions | Set `height` and `width` on BOTH the container and the component |
| "Invalid label" error | Non-localized string | Change `label: "text"` to `label: { en: "text" }` |
| Charts showing wrong data | Duplicate `contextId` | Ensure each chart has unique `contextId` |
| Slot validation error | Missing `type` or `aggregationFunc` | Review slot configuration checklist above |
| Dark theme looks wrong | Missing container background | Set `background-color: #1a1a2e` on container |

## Chart Type Catalog (partial — fetch full catalog from docs)

| Category | Types |
|---|---|
| Bar/Column | `bar-chart`, `column-chart` |
| Line/Area | `line-chart`, `area-chart` |
| Pie/Donut | `donut-chart` |
| Tables | `regular-table`, `pivot-table`, `heat-table` |
| Numbers | `evolution-number`, `conditional-number`, `circular-gauge`, `speedometer-chart`, `bullet-chart` |
| Filters | `date-filter`, `dropdown-filter`, `slicer-filter`, `slider-filter`, `search-filter` |
| Maps | `choropleth-map`, `marker-map`, `hexbin-map`, `symbol-map` |
| Other | `scatter-plot`, `treemap-chart`, `sankey-diagram`, `funnel-chart`, `text`, `image` |

Full schemas: `https://developer.luzmo.com/flex/charts/{chart-type}.md`
