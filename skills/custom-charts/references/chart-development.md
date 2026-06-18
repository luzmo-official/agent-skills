# Custom Chart Development Reference

Advanced reference for building a **brand-new chart component** when no built-in Luzmo chart type (and Flex) is sufficient.

## When to Use Custom Charts

**~95% of users never need this path.** Prefer Flex with built-in chart types first (`data-visualization`).

Build a custom chart only when:
- No existing chart type can render the visualization you need
- Flex slot/options configuration cannot achieve the required behavior
- You need a proprietary visualization that will be reused org-wide

A custom chart is authored once, packaged, uploaded, and **released for the whole organization**. After release it behaves like any other chart type — no special embedding logic.

## Required Docs

Consult these docs for current custom-chart behavior. Use them as guidance for implementation details only:

- Custom charts overview: `https://developer.luzmo.com/guide/guides--custom-charts.md`
- Quick start (prerequisites, installation): sub-pages under the overview
- Manifest configuration: required/optional data slot properties, slot options
- Chart implementation: `render`, `resize`, `buildQuery` (optional), data formatting
- Chart styling: dashboard/chart theme, `chart.css`
- Interactions: filter events (`setFilter`), custom events (`customEvent`), `queryLoaded`
- Building and packaging: production package, upload, validation

## Development Workflow

1. **Scaffold** a custom chart project (see quick-start docs for prerequisites and installation).
2. **Configure the manifest** — define data slots, slot options, and chart metadata.
3. **Implement core functions:**
   - `render(data, options)` — draw the visualization
   - `resize(width, height)` — handle container size changes
   - `buildQuery(slots)` (optional) — customize the data query sent to Luzmo
4. **Style** using the dashboard/chart theme or `chart.css`.
5. **Handle interactions** — filter events, custom events, query-loaded callbacks.
6. **Package and upload** to Luzmo; validate before production release.
7. **Release org-wide** — after release, the custom `type` is available in Flex, dashboards, and ACK like any built-in chart.

## Key Files

Typical project structure (consult docs for exact layout):
- Manifest file — slot definitions, options schema
- Chart implementation — render/resize/buildQuery
- `chart.css` — component-specific styling

## Rules

- Exhaust built-in chart types and Flex before starting a custom chart.
- Consult the manifest schema and slot property docs before inventing field shapes.
- All user-facing text in slots must be localized: `{ en: "Label" }`.
- Custom charts require explicit container dimensions when embedded via Flex (same as built-in Flex charts).
- Use embed tokens from the backend — never API credentials client-side.

## Using a Released Custom Chart

Once released org-wide, embed a custom chart like any built-in type:

**Via Flex (standalone chart):**
```html
<div style="height: 400px; width: 100%;">
  <luzmo-embed-viz-item
    type="your-custom-chart-type"
    auth-key="..."
    auth-token="..."
    style="height: 100%; width: 100%;"
  ></luzmo-embed-viz-item>
</div>
```

**Inside a dashboard:** use `core` dashboard embedding — the dashboard renders whatever chart types it contains, including custom charts, with no special handling.

## Troubleshooting

| Problem | Likely Cause | Solution |
|---|---|---|
| Custom chart not in chart picker | Not uploaded or not released org-wide | Complete upload and org release workflow |
| Chart renders but data is wrong | Incorrect `buildQuery` or slot mapping | Review manifest slots vs. render data shape |
| Chart invisible in embed | Missing container dimensions | Set height/width on container and Flex component |
| Validation fails on upload | Manifest schema errors | Consult manifest docs; fix slot/option definitions |

## Hand Off

- Build ad-hoc charts with built-in types → `data-visualization`
- Embed an existing saved dashboard (that may contain custom charts) → `core`
- Self-service chart building for end-users → `analytics-studio`
- Auth/embed tokens → `core`
