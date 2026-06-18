# Flex Chart Embedding Reference

Complete reference for embedding Luzmo Flex charts — code-first, slot-and-options based visualizations.

## Reference Docs

Consult these docs for current Flex chart behavior. Use them as guidance for implementation details only:

- Flex introduction: `https://developer.luzmo.com/guide/flex--introduction.md`
- Framework install: `https://developer.luzmo.com/guide/flex--introduction--installation-instructions.md`
- Basic usage: `https://developer.luzmo.com/guide/flex--introduction--basic-usage.md`
- Filters: `https://developer.luzmo.com/guide/flex--introduction--using-filters-in-flex.md`
- Flex component API: `https://developer.luzmo.com/guide/flex--component-api-reference.md`
- Chart catalog: `https://developer.luzmo.com/guide/flex--chart-docs.md`

For any specific chart type, consult the chart page and its referenced schema:

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

There is no `theme` prop on standalone Flex viz-items. Use the `options` object for chart-level styling (`options.theme`, `options.color`, and chart-specific styling fields), and set wrapper CSS for any background outside the component.

## Slot Content Fields

The chart-specific page/schema defines the exact slot container, slot names, required slots, and options. Do not invent slot names from memory.

| Field | Required? | Notes |
|---|---|---|
| `datasetId` | Yes | Dataset UUID |
| `type` | Yes for column-based slots | Column type: `hierarchy`, `numeric`, or `datetime` |
| `label` | Recommended | Localized object: `{ en: "Label" }` |
| `level` | For datetime/hierarchy | 1=year, 2=quarter, 3=month, 4=week, 5=day, 6=hour, 7=min, 8=sec, 9=ms |
| `columnId` | If not using a formula | Column UUID |
| `formulaId` | For formula measures | When specified, do not include `columnId`, `type`, or `aggregationFunc` |
| `aggregationFunc` | For aggregated measures | For numeric measures, use `sum`, `average`, `count`, `distinctcount`, `min`, `max`, `median`, `stddev`, `cumulativesum`, `histogram`, `rate`, `weightedaverage`. For datetime & hierarchy measures, use `count` or `distinctcount` |

## Slot Configuration Checklist

Before configuring any Flex chart:

- Consult the specific chart docs/schema.
- Confirm the chart's exact slot names and required slots.
- Include `datasetId` for every data-backed slot.
- Use `columnId` + `type` for column-backed slots.
- Use `formulaId` alone for formula measures.
- Localize user-facing labels: `{ en: "Revenue" }`.

Type-specific reminders:

- Numeric measure slots need an `aggregationFunc`.
- Numeric dimension slots may need `bins` depending on the chart/schema.
- Datetime and hierarchy dimension slots need `level`.
- `rate` and `weightedaverage` require an `aggregationWeight` field.
- `subtype` is recommended when the column has one, such as `currency`, `duration`, `coordinates`, `ip_address`, or `topography`.

## Rules

- Consult the specific chart page before writing `slots` or `options` for any chart type.
- Each `contextId` must be unique across all chart instances on the page.
- Flex charts require explicit `height` and `width` on both container and chart component.
- All user-facing text must be localized objects: `{ en: "..." }`.
- Use embed tokens from the backend; never API credentials client-side.
- For localhost CORS or reconnecting `/realtime` sockets, use `core/references/local-development-proxy.md`: set `apiHost` to the local app origin and keep `appServer` direct.
- Do not use outdated names like `LuzmoFlex`.

## Troubleshooting Common Issues

| Problem | Cause | Solution |
|---|---|---|
| Chart is invisible (0 height) | Missing dimensions | Set `height` and `width` on both the container and component |
| "Invalid label" error | Non-localized string | Change `label: "text"` to `label: { en: "text" }` |
| Charts showing wrong data | Duplicate `contextId` | Ensure each chart has unique `contextId` |
| Slot validation error | Missing chart-specific slot field such as `type`, `aggregationFunc`, or `level` | Consult the chart page/schema and compare the slot config |
| `theme` prop is ignored | Flex viz-items do not expose a `theme` prop | Put styling in `options` and set wrapper CSS for the container |
| Dark theme looks wrong | Missing container background | Set `background-color: #1a1a2e` on container |

## Chart Type Catalog (partial; consult full catalog from docs)

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
