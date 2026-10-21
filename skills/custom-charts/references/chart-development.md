# Custom Chart Development Reference

Advanced reference for building a **brand-new chart component** when no built-in Luzmo chart type (and Flex) is sufficient. Specs live on developer.luzmo.com - this file is a map plus the gotchas agents get wrong.

## When to Use Custom Charts

**~95% of users never need this path.** Prefer Flex with built-in chart types first (`data-visualization`).

Build a custom chart only when:
- No existing chart type can render the visualization you need
- Flex slot/options configuration cannot achieve the required behavior
- You need a proprietary visualization that will be reused org-wide

A custom chart is authored once, packaged, uploaded, and **published for the whole organization**. After publishing it behaves like any other chart type in dashboards - no special embedding logic.

## Required Docs

Index: `https://developer.luzmo.com/guide/guides--custom-charts.md`. Read the matching sub-page:

| Topic | Doc |
|---|---|
| Builder install, project structure, `index.ts` | `https://developer.luzmo.com/guide/guides--custom-charts--get-started.md` |
| Slots, slot `position`, chart `options`, `translations` | `https://developer.luzmo.com/guide/guides--custom-charts--configure-the-manifest.md` |
| Data shape, `render`, `resize`, `buildQuery`, `exportData`, formatters, theme, `chart.css` | `https://developer.luzmo.com/guide/guides--custom-charts--implement-the-chart.md` |
| `setFilter`, `customEvent`, `queryLoaded` | `https://developer.luzmo.com/guide/guides--custom-charts--add-dashboard-interactions.md` |
| Validate, build, upload, publish | `https://developer.luzmo.com/guide/guides--custom-charts--build-and-publish.md` |
| Common issues, logs | `https://developer.luzmo.com/guide/guides--custom-charts--troubleshoot.md` |
| Builder repo and command-line upload | `https://github.com/luzmo-official/custom-chart-builder` (README) |

## Development Workflow

1. **Scaffold:** clone `luzmo-official/custom-chart-builder`, `npm install`, `npm run start` (http://localhost:4200, log in with a Luzmo account). Edit only `projects/custom-chart/src` (`manifest.json`, `chart.ts`, `chart.css`, `icon.svg`, `index.ts`); never `projects/builder`.
2. **Configure the manifest** (see below).
3. **Implement** in `chart.ts`. Every function receives **one params object**, not positional arguments:
   - `render(params)` - draw the chart. `params` = `{ container, data, slots, slotConfigurations, options, timezoneId, language, dimensions }`. May return a Promise; the host awaits it before marking the item rendered (dashboard and PNG/PDF exports wait for it).
   - `resize(params)` - same payload with new `dimensions`.
   - `buildQuery({ slots, slotConfigurations })` (optional) - always returns an **array** of queries; `data[i]` matches query `i`. Slots feeding independent queries need `canAcceptDataIndependentOf`.
   - `exportData(params)` (optional) - see Exports.
4. **Re-export** what you implemented from `index.ts`, e.g. `export { render, resize, buildQuery, exportData } from './chart';`. The builder's default `index.ts` does not export `exportData` - add it, or Luzmo never calls it.
5. **Style** with `options.theme` (`ThemeConfig`) and `chart.css`; format values with `formatter` / `getValueForFormatter` from `@luzmo/analytics-components-kit/utils` (pass `timezoneId` for datetimes).
6. **Interactions:** `window.parent.postMessage({ type: 'setFilter', filters }, '*')`, `customEvent`, and `queryLoaded` (runtime query changes such as sorting or pagination only).
7. **Build and upload** (see Upload and Publish).

## Manifest

- **Slots:** unique `name`; `type` (`categorical` -> dimensions, `numeric` -> measures); rows reach `render` as dimensions first, then measures, in manifest slot order. `label` may be a plain string; put localized labels in top-level `translations.<lang>.slots.<name>.label`.
- **Slot positions:** set a unique kebab-case `position` on every visible slot (`bottom` for category/x-axis, `left` for value axis, `middle` for a KPI/donut measure, `right` for legend/color). Avoid `top-left`/`top-right` (editor controls sit there). Unpositioned slots are auto-placed around the chart; explicit positions are always kept. Studio rotates `left`/`right` slot buttons automatically; setting `rotate: true` on them stays harmless.
- **Chart options:** top-level `options` array. Top-level entries must be `{ "key", "type": "group", "children": [...] }`; each control is `{ "key": "dotted.path", "control": { "type": ..., "default": ... } }`. Only documented `control.type` values work (`picker`, `radio-button-group`, `action-button-group`, `switch`, `slider`, `number-field`, `text-field`, `multi-language-field`, `color-picker`, `color-palette-picker`, `color-range`, `position-picker`, `positions-number-field`). Values arrive nested in `options` (`layout.mode` -> `options.layout.mode`); saved values override defaults.
- **Reserved:** never use `theme` or `theme.*` as an option key - Luzmo rejects it; `options.theme` is the host dashboard theme.
- **Behavior:** editors change options in Studio's **Edit item** panel; Luzmo re-calls `render` with the existing data (no new query). Applying the value is your code's job.
- **Position values differ by context:** slot `position` is kebab-case (`top-left`); the `position-picker` control uses camelCase (`topLeft`).

## Exports

- PNG export captures the rendered chart. CSV/Excel: `exportType` is `csv`, `csv-raw`, `xlsx`, or `xlsx-raw`.
- Single-query chart without `exportData`: Luzmo exports the query result using the slot columns.
- Multi-query chart (`buildQuery` returns >1 query): **no CSV/Excel actions** until `exportData` is exported.
- Once exported, `exportData` supplies the file for every data export type. It receives the `render` params plus `exportType` and `requestId`, may be `async`, must finish within 30 seconds, and returns `{ columns: string[], rows: (string | number | boolean | null)[][] }`. Return numbers as numbers (Luzmo does not apply slot formats to custom exports); use `null` for empty cells.
- Export-specific data: `exportData` also receives `params.query(queryOrQueries)`. Pass one query or an ordered array and `await` the rows (an array gives one row set per query); the host applies dashboard filters and authorization and does not re-render the chart. It only works while that export is running. Use it when the export needs a different query than the chart shows (for example all rows instead of the current page); otherwise use `params.data`. Never fetch Luzmo data directly from chart code. (Newer than the public guide - re-check the implementation doc.)

## Upload and Publish

- `npm run validate` checks slots; `npm run build` validates and writes `custom-chart-build-output/bundle.zip` (`index.js`, `index.css`, `manifest.json`, `icon.svg`). Upload validates the complete manifest including `options` and `translations`.
- **UI:** Settings > Custom Charts - upload `bundle.zip` with a **Chart type** (unique key) and **Chart name**.
- **Command line (builder repo):** set `LUZMO_API_KEY` / `LUZMO_API_TOKEN` (and `LUZMO_API_URL` for US: `https://api.us.luzmo.com`) in the gitignored `.env.local`, then `npm run charts -- list` or `npm run charts -- upload --type my-chart --name "My chart"`. Agents: use `npm run --silent charts -- <command> --json`; after a timeout, `list` before retrying.
- **Credentials:** creating, updating, or deleting custom charts requires an API key/token of an **Organization Owner** (and the custom chart feature on the organization). Other keys can list charts but uploads fail with a permission error.
- **Overwrites need approval:** `npm run charts -- upload --id <chart-id>` (or a UI re-upload) replaces that chart's code. Never run it without the user's explicit approval for that chart id.
- **Chart type rules:** at most 32 characters and not a built-in chart type name (uploads with a reserved type are rejected).
- **Lifecycle:** a new chart is **Private** (only the uploader can add and test it) until published to the organization. A re-upload enters **Update in preview**; other users keep the published version until you publish the update.

## AI Agents and Custom Charts

Published custom charts are offered to Luzmo's dashboard agent, IQ, and item editing, which pick and configure them when they fit the request. The agents see the chart type, chart name, slot definitions (`label`, `description`, `type`, accepted field types, `isRequired`, ...) and option controls. To be picked correctly:
- Use a descriptive **Chart name** at upload, not just a slug.
- Give every slot a clear `label` and `description` and accurate type/required constraints.
- Give every option control a sensible `default`.
- Keep slot names unique and options valid - charts with an invalid configuration are skipped.

## Rules

- Exhaust built-in chart types and Flex before starting a custom chart.
- Consult the manifest docs before inventing slot, option, or control shapes.
- `setFilter` parameters use snake_case `column_id` / `dataset_id` (slot content uses camelCase `columnId` / `datasetId` - do not copy it over). Filters without `parameters[0].dataset_id` are discarded silently.
- Custom charts require explicit container dimensions when embedded via Flex (same as built-in Flex charts).
- Use embed tokens from the backend - never API credentials client-side.

## Using a Published Custom Chart

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

**Inside a dashboard:** use `core` dashboard embedding - the dashboard renders whatever chart types it contains, including custom charts, with no special handling.

## Troubleshooting

| Problem | Likely Cause | Solution |
|---|---|---|
| Not in other users' chart picker | Chart still Private, or update still in preview | Publish it in Settings > Custom Charts |
| Chart renders but data is wrong | Incorrect `buildQuery` or slot mapping | Compare slot order/type with the row shape `render` receives |
| CSV/Excel downloads nothing | `exportData` not in `index.ts`, timeout, or invalid cells | Re-export it; return within 30 s; cells are string/number/boolean/`null` |
| No CSV/Excel action at all | Multi-query chart without `exportData` | Implement and re-export `exportData` |
| Option control missing | Not in a top-level group, missing `key`/`control`, unknown `control.type` | Fix per manifest docs |
| Option changes do nothing | Chart code ignores `options` | Read and apply the value in `render` and `resize` |
| PNG/dashboard export misses content | `render` returns before async drawing finishes | Return a Promise from `render` that resolves when painting is done |
| Chart invisible in embed | Missing container dimensions | Set height/width on container and Flex component |
| Upload validation fails | Manifest schema errors, reserved type name, `theme` option key | Run `npm run validate`; fix per the error message |

## Hand Off

- Build ad-hoc charts with built-in types -> `data-visualization`
- Embed an existing saved dashboard (that may contain custom charts) -> `core`
- Self-service chart building for end-users -> `analytics-studio`
- AI-generated dashboards/charts (IQ, Agents) -> `ai-analytics`
- Auth/embed tokens -> `core`
