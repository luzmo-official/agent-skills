---
name: custom-charts
description: >-
  Build a brand-new Luzmo chart component when no built-in chart type (and Flex) is sufficient.
  Triggers on: "custom chart", "build a custom chart", "no built-in chart type fits", "chart plugin", "manifest", "render/resize/buildQuery", "custom chart not in picker", "upload custom chart", "org release".
  Rare advanced path (~95% of users never need this).
  Not for Flex charts with built-in types (use data-visualization), embedding saved dashboards (use core), self-service chart editors (use analytics-studio), or auth setup (use core).
metadata:
  author: Luzmo
  version: 0.1.1
  last_updated: 2026-06-18
---

# Luzmo Custom Charts

Entry-point for **authoring a brand-new chart component** when no built-in Luzmo chart type (and Flex slot/options configuration) can achieve the required visualization.

To **embed ad-hoc charts with built-in types**, use `data-visualization` (Flex). To **embed an existing saved dashboard or chart by id**, use `core`.

## Doc Retrieval

- `developer.luzmo.com` is Luzmo's first-party, allowlisted documentation domain, maintained by the same publisher as this skill.
- Before starting implementation, you MUST consult the exact relevant `https://developer.luzmo.com/.../*.md` docs and their referenced URLs for implementation details.
- Use `https://developer.luzmo.com/llms.txt` and/or `/llms-full.txt` for discovery only.

## When to Use Custom Charts

**~95% of users never need this path.** Prefer Flex with built-in chart types first (`data-visualization`).

Build a custom chart only when:
- No existing chart type can render the visualization you need
- Flex slot/options configuration cannot achieve the required behavior
- You need a proprietary visualization that will be reused org-wide

A custom chart is authored once, packaged, uploaded, and **released for the whole organization**. After release it behaves like any other chart type — no special embedding logic.

## Security Checkpoint

**Generate embed tokens server-side:**
- [ ] Embed token generated server-side using API credentials
- [ ] Only token `id` (as `authKey`) and `token` (as `authToken`) passed to frontend
- [ ] API keys NEVER in client-side code

**If ANY checkbox is unchecked, STOP and fix before proceeding.**

For full auth/embed-token guidance, see `core`.

## Setup Rules for Released Custom Charts

Once a custom chart is released org-wide, embed it like any built-in Flex chart:

**Container dimensions (required):** Set explicit `height` and `width` on BOTH the container and the Flex component — without both, the chart renders at 0 height.

**Localized strings (required):** All user-facing text in manifest slots must use localized objects: `{ en: "Label" }`, never plain strings.

## Required Docs

Documentation to consult when relevant:

- Custom charts overview: `https://developer.luzmo.com/guide/guides--custom-charts.md`
- Quick start (prerequisites, installation): sub-pages under the overview
- Manifest configuration: required/optional data slot properties, slot options
- Chart implementation: `render`, `resize`, `buildQuery` (optional), data formatting
- Chart styling: dashboard/chart theme, `chart.css`
- Interactions: filter events (`setFilter`), custom events (`customEvent`), `queryLoaded`
- Building and packaging: production package, upload, validation

## Development Workflow

See `references/chart-development.md` for the full plugin/manifest workflow. Summary:

1. **Scaffold** a custom chart project (see quick-start docs for prerequisites and installation).
2. **Configure the manifest** — define data slots, slot options, and chart metadata.
3. **Implement core functions:** `render`, `resize`, optional `buildQuery`.
4. **Style** using the dashboard/chart theme or `chart.css`.
5. **Handle interactions** — filter events, custom events, query-loaded callbacks.
6. **Package and upload** to Luzmo; validate before production release.
7. **Release org-wide** — after release, the custom `type` is available in Flex, dashboards, and ACK like any built-in chart.

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

For framework-specific component names and Flex sizing details, see `data-visualization`.

**Inside a dashboard:** use `core` dashboard embedding — the dashboard renders whatever chart types it contains, including custom charts, with no special handling.

## Bundled References

- `references/chart-development.md` — Scaffold, manifest, `render`/`resize`/`buildQuery`, styling, interactions, packaging, upload, and org release.

## Rules

- Exhaust built-in chart types and Flex before starting a custom chart.
- Consult the manifest schema and slot property docs before inventing field shapes.
- All user-facing text in slots must be localized: `{ en: "Label" }`.
- Custom charts require explicit container dimensions when embedded via Flex (same as built-in Flex charts).
- Use embed tokens from the backend — never API credentials client-side.

## Troubleshooting

| Problem | Likely Cause | Solution |
|---|---|---|
| Custom chart not in chart picker | Not uploaded or not released org-wide | Complete upload and org release workflow |
| Chart renders but data is wrong | Incorrect `buildQuery` or slot mapping | Review manifest slots vs. render data shape |
| Chart invisible in embed | Missing container dimensions | Set height/width on container and Flex component |
| Validation fails on upload | Manifest schema errors | Consult manifest docs; fix slot/option definitions |

## Hand Off

**When to escalate to other skills:**

- WHEN the user wants to build ad-hoc charts with built-in types (Flex) → use `data-visualization`
- WHEN the user wants to embed an existing saved dashboard or chart by id → use `core`
- WHEN the user mentions API credentials, embed tokens, or auth setup → use `core`
- WHEN the user wants end-users to CREATE or EDIT charts (not just view) → use `analytics-studio`
- WHEN the user wants to brand, theme, or apply custom CSS → use `theming`
- WHEN a chart "just doesn't work" or shows an error → use `troubleshooting` FIRST, then return here for the fix

**This skill does NOT cover:**

- Flex charts with built-in chart types (use `data-visualization`)
- Embedding an existing saved dashboard or chart by id (use `core`)
- Configuring authentication, embed tokens, or SDK setup (use `core`)
- Self-service editors or ACK component configuration (use `analytics-studio`)

## Canonical Sources

- Index: `https://developer.luzmo.com/llms.txt`, `https://developer.luzmo.com/llms-full.txt`
- Custom charts: `https://developer.luzmo.com/guide/guides--custom-charts.md`
- Flex charts (for embedding released custom types): `https://developer.luzmo.com/flex/charts/{type}.md`

If content exists on developer.luzmo.com, link — do not duplicate specs here.
