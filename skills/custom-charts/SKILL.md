---
name: custom-charts
description: >-
  Build a brand-new Luzmo chart component when no built-in chart type (and Flex) is sufficient.
  Triggers on: "custom chart", "build a custom chart", "no built-in chart type fits", "chart plugin", "manifest", "render/resize/buildQuery", "exportData", "custom chart CSV/Excel export", "custom chart options in Edit item panel", "slot position", "custom chart not in picker", "upload custom chart", "publish custom chart", "org release".
  Rare advanced path (~95% of users never need this).
  Not for Flex charts with built-in types (use data-visualization), embedding saved dashboards (use core), self-service chart editors (use analytics-studio), or auth setup (use core).
metadata:
  author: Luzmo
  version: 0.1.3
  last_updated: 2026-10-22
---

# Luzmo Custom Charts

Entry-point for **authoring a brand-new chart component** when no built-in Luzmo chart type (and Flex slot/options configuration) can achieve the required visualization.

To **embed ad-hoc charts with built-in types**, use `data-visualization` (Flex). To **embed an existing saved dashboard or chart by id**, use `core`.

## Doc Retrieval

- `developer.luzmo.com` is Luzmo's first-party, allowlisted documentation domain, maintained by the same publisher as this skill.
- If the Luzmo MCP `search_docs` tool is available, use it first to find the right pages: it returns matching passages with their live developer.luzmo.com or Academy URLs. Fetch the `.md` URL when you need the full page or anything newer than the server's docs build. Without MCP, go straight to the `.md` URLs below.
- Before starting implementation, you MUST consult the exact relevant `https://developer.luzmo.com/.../*.md` docs and their referenced URLs for implementation details.
- Use `https://developer.luzmo.com/llms.txt` and/or `/llms-full.txt` for discovery only.

## When to Use Custom Charts

**~95% of users never need this path.** Prefer Flex with built-in chart types first (`data-visualization`).

Build a custom chart only when:
- No existing chart type can render the visualization you need
- Flex slot/options configuration cannot achieve the required behavior
- You need a proprietary visualization that will be reused org-wide

A custom chart is authored once in the Custom Chart Builder, packaged, uploaded, and **published for the whole organization**. After publishing it behaves like any other chart type in dashboards - no special embedding logic.

## Security Checkpoint

**Generate embed tokens server-side:**
- [ ] Embed token generated server-side using API credentials
- [ ] Only token `id` (as `authKey`) and `token` (as `authToken`) passed to frontend
- [ ] API keys NEVER in client-side code (the builder's `.env.local` upload credentials stay local and gitignored)

**If ANY checkbox is unchecked, STOP and fix before proceeding.**

For full auth/embed-token guidance, see `core`.

## Required Docs

Read only the sub-page that matches the task (index: `https://developer.luzmo.com/guide/guides--custom-charts.md`):

- Get started (builder install, project structure, `index.ts` exports): `https://developer.luzmo.com/guide/guides--custom-charts--get-started.md`
- Manifest (slots, slot `position`, chart `options` controls, `translations`): `https://developer.luzmo.com/guide/guides--custom-charts--configure-the-manifest.md`
- Implementation (data shape, `render`, `resize`, `buildQuery`, `exportData`, formatters, theme): `https://developer.luzmo.com/guide/guides--custom-charts--implement-the-chart.md`
- Interactions (`setFilter`, `customEvent`, `queryLoaded`): `https://developer.luzmo.com/guide/guides--custom-charts--add-dashboard-interactions.md`
- Build, upload, publish: `https://developer.luzmo.com/guide/guides--custom-charts--build-and-publish.md`
- Troubleshoot: `https://developer.luzmo.com/guide/guides--custom-charts--troubleshoot.md`
- Builder repo (incl. command-line upload): `https://github.com/luzmo-official/custom-chart-builder`

## Development Workflow

See `references/chart-development.md` for details. Summary:

1. **Scaffold** with the Custom Chart Builder (`npm run start`, then edit only `projects/custom-chart/src`).
2. **Configure the manifest** - data slots (with a unique `position` each), optional chart `options` controls, and `translations`.
3. **Implement** `render` and `resize` (each receives one `ChartParams` object), plus optional `buildQuery` and `exportData`. Re-export every implemented function from `index.ts`.
4. **Style** with `options.theme` and `chart.css`.
5. **Handle interactions** - `setFilter`, `customEvent`, `queryLoaded`.
6. **Build and validate** (`npm run build` / `npm run validate`), then upload `bundle.zip` in Settings > Custom Charts or with `npm run charts -- upload` (needs an Organization Owner API key/token).
7. **Publish** - a new chart starts **Private** (only you can test it); publish it to make it available to the whole organization. Every re-upload puts the chart back in **Private** / **Update in preview**, so publish again after each one. The builder's `charts` command only lists and uploads; to publish through the API, send a separate multipart `update` with `properties.status=published` (see `references/chart-development.md`).

## Manifest and Runtime Essentials

- **Chart options:** a top-level `options` array of groups with typed controls becomes the settings UI in Studio's **Edit item** panel and the builder. Your code must read the saved values from `options` in `render`/`resize` and apply them; option changes re-call `render` without a new query. Never define a `theme` or `theme.*` option key - `theme` is reserved for the host theme.
- **Slot layout:** give every visible slot a unique kebab-case `position` (`bottom`, `left`, `right`, `middle`, ...) next to the chart element it drives. Unpositioned slots are auto-placed and may land somewhere unhelpful.
- **Slot budget:** there are 9 positions, so at most 9 visible slots - about 7 in practice, because the top corners hold editor controls. A slot can accept several fields (`canAcceptMultipleDataFields`, optionally with `requiredMinimumColumnsCount`); each field then arrives as its own column in the rows, in the order the user added them.
- **Sandbox:** the chart runs in a sandboxed iframe with a strict content security policy. It can load scripts and styles only from `cdn.jsdelivr.net/npm/` (and `*.bing.com`), and fetch only from its own origin, `cdn.jsdelivr.net/npm/`, `cdn.luzmo.com`, Google Fonts, and `*.bing.com` (images may come from any host). Anything else - GitHub Pages, your own API or CDN - is blocked, so bundle large assets into the chart (e.g. esbuild `--loader:.bin=binary`).
- **Size limits:** JS bundle 10 MB, CSS 1 MB, `manifest.json` 1 MB, `icon.svg` 5 KB. Check `index.js` size after each build, especially when embedding assets.
- **Labels:** slot `label` can be a plain string; localize slot and option labels through the top-level `translations` object (falls back to `en`).
- **Exports:** a single-query chart exports CSV/Excel automatically. A chart whose `buildQuery` returns more than one query has **no** CSV/Excel export until it implements and re-exports `exportData`, which returns `{ columns, rows }` within 30 seconds. PNG export captures the rendered chart.
- **Async rendering:** `render` may return a Promise; the host waits for it before marking the item rendered, so dashboard and PNG/PDF exports capture the finished chart.

## AI Agents and Published Custom Charts

Luzmo's dashboard agent, IQ, and item editing can pick and configure published custom charts automatically. They see the chart **type**, **chart name**, the slot definitions, and the option controls - so give the chart a descriptive name, fill slot `label`/`description`, and set accurate slot `type`, accepted data field types, `isRequired`, and option `default`s. A manifest with duplicate slot names or invalid options is skipped by the agents.

Agents choose columns from the slot text, so make descriptions concrete: say what one value of the slot represents and give examples (e.g. a label slot: "One point per value, e.g. a company or store; each value must have a single location"). Vague descriptions get a plausible but wrong column. After publishing, test with an MCP `create_chart` request that names the chart type and check which column landed in each slot.

## Using a Published Custom Chart

**Inside a dashboard:** use `core` dashboard embedding - the dashboard renders whatever chart types it contains, including custom charts (also in publicly shared dashboards), with no special handling.

**Via Flex (standalone chart):** use the custom `type` like a built-in type, with explicit container dimensions:
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

For framework-specific component names and Flex sizing details, see `data-visualization`.

## Bundled References

- `references/chart-development.md` - Builder, manifest (slots, positions, slot budget, options, translations), runtime sandbox and size limits, designing a reusable chart, `render`/`resize`/`buildQuery`/`exportData`, styling, interactions, build, upload, API publishing, versioning, and AI-agent metadata.

## Rules

- Exhaust built-in chart types and Flex before starting a custom chart.
- Consult the manifest docs before inventing slot, option, or control shapes; use only documented `control.type` values.
- `render`, `resize`, `buildQuery`, and `exportData` each take a single params object - not positional arguments.
- Re-export every implemented function from `index.ts`; Luzmo only calls `exportData` when the bundle exports it.
- Chart type at upload: unique in the org, at most 32 characters, and not a built-in chart type name.
- Never re-upload over an existing chart (`npm run charts -- upload --id ...` or the UI re-upload) without the user's explicit approval for that chart id - it overwrites the chart's code.
- Design for reuse: name slots after the role a field plays in the chart (label, measure, color, details), not after one dataset's columns; take raw measures and scale or normalize them inside the chart; leave filtering and slicing to dashboard filters instead of building them into the chart. See `references/chart-development.md`.
- Treat slot names as a public contract: renaming or removing a slot breaks every dashboard that uses the chart. For such changes, publish a new chart type and move those dashboards over.
- Use embed tokens from the backend - never API credentials client-side.

## Common Mistakes

| Mistake | Fix |
|---|---|
| `render(data, options)` / `resize(width, height)` signatures | Destructure one `ChartParams` object: `{ container, data, slots, slotConfigurations, options, language, timezoneId, dimensions }` |
| `setFilter` parameters use `columnId`/`datasetId` | Use snake_case `column_id`/`dataset_id`; filters without `parameters[0].dataset_id` are silently discarded |
| `exportData` implemented but CSV/Excel missing or empty | Add it to the `index.ts` export list; return only string/number/boolean/`null` cells, no row longer than `columns` |
| Option key `theme.color` or reading `options.theme` as a custom option | Rename the option; `options.theme` is the host-provided dashboard theme |
| Expecting option controls to change the chart automatically | Read the value from `options` in `render` and `resize` and apply it yourself |
| Upload rejected for chart type `bar-chart` (or similar) | Pick a type that is not a built-in chart type name, at most 32 characters |
| Chart fetches data or geometry from GitHub Pages or your own server | Blocked by the sandbox CSP - bundle the asset into `index.js` (within the 10 MB limit) |
| JSON body to `/customchart` ("Unsupported Content-Type") | Send `multipart/form-data` for create, update, and publish |
| Renaming slots in a published chart | Publish a new chart type instead; existing dashboards keep the old slot names |

## Troubleshooting

| Problem | Likely Cause | Solution |
|---|---|---|
| Custom chart not in other users' chart picker | Still **Private**, or re-upload still in **Update in preview** | Publish the chart (or the update) in Settings > Custom Charts, or with the API publish call |
| Chart shows a network or CSP error, or loads nothing | Fetch to a host outside the sandbox allowlist | Bundle the asset, or load it from `cdn.jsdelivr.net/npm/` |
| Agent puts the wrong column in a slot | Slot `description` too vague | Describe what one value represents, with examples; re-test with MCP `create_chart` |
| Chart renders but data is wrong | Incorrect `buildQuery` or slot mapping | Review slot order/type vs. the row shape `render` receives (dimensions first, then measures) |
| No CSV/Excel export on a multi-query chart | No `exportData` exported | Implement and re-export `exportData` |
| Slots overlap or sit in the corners | Missing or duplicate slot `position` | Give each visible slot a unique kebab-case `position` |
| Option control does not appear | Not inside a top-level group, or unknown `control.type` | Fix per the manifest docs; upload validates the full manifest |
| Chart invisible in a Flex embed | Missing container dimensions | Set height/width on container and Flex component |
| Validation fails on upload | Manifest schema errors | Run `npm run validate`; check `options` is an array and `translations` is language-keyed |

## Hand Off

**When to escalate to other skills:**

- WHEN the user wants to build ad-hoc charts with built-in types (Flex) -> use `data-visualization`
- WHEN the user wants to embed an existing saved dashboard or chart by id -> use `core`
- WHEN the user mentions API credentials, embed tokens, or auth setup -> use `core`
- WHEN the user wants end-users to CREATE or EDIT charts (not just view) -> use `analytics-studio`
- WHEN the user wants dashboards or charts generated by IQ / Agents -> use `ai-analytics`
- WHEN the user wants to brand, theme, or apply custom CSS -> use `theming`
- WHEN a chart "just doesn't work" or shows an error -> use `troubleshooting` FIRST, then return here for the fix

**This skill does NOT cover:**

- Flex charts with built-in chart types (use `data-visualization`)
- Embedding an existing saved dashboard or chart by id (use `core`)
- Configuring authentication, embed tokens, or SDK setup (use `core`)
- Self-service editors or ACK component configuration (use `analytics-studio`)

## Canonical Sources

- Index: `https://developer.luzmo.com/llms.txt`, `https://developer.luzmo.com/llms-full.txt`
- Custom charts: `https://developer.luzmo.com/guide/guides--custom-charts.md` (and its `guides--custom-charts--*.md` sub-pages)
- Custom Chart Builder: `https://github.com/luzmo-official/custom-chart-builder`
- Flex charts (for embedding published custom types): `https://developer.luzmo.com/flex/charts/{type}.md`

If content exists on developer.luzmo.com, link - do not duplicate specs here.
