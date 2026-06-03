---
name: data-visualization
description: Build charts in code with Luzmo Flex — ad-hoc, code-first visualizations with full slot/options control. Triggers on: "Flex chart", "build a chart", "chart not rendering", "0 height", "wrong component name", slot errors, slot configuration. Covers Flex sizing, framework-specific component names, unique contextId, localized strings. Use eagerly for building Flex charts in code. Not for custom chart development (use custom-charts), embedding saved dashboards/charts by id (use core), chart editors (use analytics-studio), data connection (use data-integration), AI queries (use ai-analytics), or visual theming (use theming).
metadata:
  author: Luzmo
  version: 0.1.0
  last_updated: 2026-05-21
---

# Luzmo Data Visualization

Entry-point for **building Flex charts in code** in your application — ad-hoc, code-first visualizations with full slot/options control.

To **embed an existing saved dashboard or chart by id**, use `core`. To **build a brand-new custom chart component** when no built-in type fits, use `custom-charts`.

## 🚨 CRITICAL SETUP RULES 🚨

Read these rules BEFORE implementing ANY visualization — they prevent 80% of rendering failures:

### Security Checkpoint

**Generate embed tokens server-side:**
- [ ] Embed token generated server-side using API credentials
- [ ] Only token `id` (as `authKey`) and `token` (as `authToken`) passed to frontend
- [ ] API keys NEVER in client-side code

**If ANY checkbox is unchecked, STOP and fix before proceeding.**

For full auth/embed-token guidance, see `core`.

### 1. Component Naming (Framework-Specific)

Using wrong names causes "component not found" errors:

| Framework | Flex Chart |
|---|---|
| Vanilla JS | `<luzmo-embed-viz-item>` |
| React | `LuzmoVizItemComponent` |
| Angular | `<luzmo-viz-item>` |
| Vue | `<luzmo-viz-item>` |

❌ **WRONG:**
```javascript
// Vanilla JS - missing "embed"
<luzmo-viz-item type="bar-chart" />
```

✅ **CORRECT:**
```javascript
// Vanilla JS - includes "embed"
<luzmo-embed-viz-item type="bar-chart" />
```

### 2. Flex Chart Sizing (CRITICAL - Most Common Failure)

Without explicit dimensions → **chart will be INVISIBLE (0 height)**

**Rule:** Set dimensions on BOTH container AND component

```
   ┌─────────────────────────────────────────┐
   │  Container div                          │  ◄── height: 400px;
   │  (your wrapper element)                 │      width:  100%;
   │                                         │
   │   ┌──────────────────────────────────┐  │
   │   │ <luzmo-embed-viz-item>           │  │  ◄── height: 100%;
   │   │   ↑                              │  │      width:  100%;
   │   │   Without BOTH dimensions set    │  │
   │   │   on the container AND the       │  │
   │   │   component, height collapses    │  │
   │   │   to 0 and the chart is invisible│  │
   │   └──────────────────────────────────┘  │
   │                                         │
   └─────────────────────────────────────────┘
```

❌ **WRONG - Renders nothing visible:**
```javascript
// Container has no height
<div>
  <luzmo-embed-viz-item type="bar-chart" />
</div>
// Result: 0px height, invisible chart
```

✅ **CORRECT - Set BOTH:**
```javascript
// Container with explicit size
<div style={{ height: '400px', width: '100%' }}>
  <luzmo-embed-viz-item 
    type="bar-chart"
    height="400px"
    width="100%"
  />
</div>
```

Example (wrong - chart will be invisible):
```html
<div>
  <luzmo-embed-viz-item type="bar-chart" ...></luzmo-embed-viz-item>
</div>
```

### Context ID (Unique Per Chart)

`contextId` must be **unique across all chart instances** on the page. Reusing the same `contextId` causes conflicts and unexpected behavior.

**Recommended pattern:**
```javascript
// Single chart
contextId="chart-1"

// Multiple charts - use a pattern
contextId={`chart-${dashboardId}-${itemId}`}
contextId={`${section}-${index}`}
```

### Localized Strings (REQUIRED)

All user-facing text properties **MUST** be localized objects, never plain strings:

**Properties that require localization:**
- `title`
- `label` (in slots)
- `description`
- Any other user-visible text

**Correct:**
```javascript
{
  label: { en: "Revenue" }
}
```

**Wrong:**
```javascript
{
  label: "Revenue"  // ❌ This will cause errors
}
```

### Chart Options: Title Gotcha

Avoid using the `title` option unless explicitly needed. If you do use it:

**Correct:**
```javascript
options: {
  title: { en: "My Chart Title" }
}
```

**Wrong:**
```javascript
options: {
  title: "My Chart Title"  // ❌ Not localized
}

// OR

options: {
  title: { title: { en: "My Chart Title" } }  // ❌ Nested, wrong structure
}
```

### Slot Configuration Requirements

Every Flex chart slot must follow these rules:

**Always required:**
- `datasetId` (UUID of the dataset)
- `label` (localized object: `{ en: "Label" }`)

**Column-based slots (dimensions and measures using columns):**
- `columnId` (UUID of the column)
- `type` (`hierarchy`, `numeric`, or `datetime`)

**Formula-based slots (measures using formulas):**
- `formulaId` (UUID of the formula) - when using this, do NOT include `columnId`, `type`, or `aggregationFunc`

**Type-specific requirements:**

| Column Type | Required Additional Field | Values |
|---|---|---|
| `numeric` (measure) | `aggregationFunc` | `sum`, `average`, `count`, `distinctcount`, `min`, `max`, `median`, `stddev`, `cumulativesum`, `histogram`, `rate`, `weightedaverage` |
| `numeric` (dimension) | `bins` | `{ enabled: true, number: 10 }` for binning, or `{ enabled: false }` to disable |
| `datetime` (dimension) | `level` | 1=year, 2=quarter, 3=month, 4=week, 5=day, 6=hour, 7=minute, 8=second, 9=millisecond |
| `hierarchy` (dimension) | `level` | 1=top level, 2=second level, etc. |

**Special aggregation functions requiring a secondary column:**

`rate` and `weightedaverage` require an additional `aggregationWeight` field that specifies the denominator or weight column:

```javascript
{
  datasetId: "...",
  columnId: "...",          // primary (numerator / value) column
  label: { en: "Revenue per Unit" },
  type: "numeric",
  aggregationFunc: "weightedaverage",  // or "rate"
  aggregationWeight: {
    datasetId: "...",       // dataset of weight/denominator column
    columnId: "..."         // weight or denominator column id
  }
}
```

**Optional but recommended:**
- `subtype` (if column has one): `coordinates`, `currency`, `duration`, `hierarchy_element_expression`, `ip_address`, `topography`

**Before configuring any chart:**
Always fetch the chart-specific documentation for available slots and options:
- URL pattern: `https://developer.luzmo.com/flex/charts/{chart-type}.md`
- Chart catalog: `https://developer.luzmo.com/guide/flex--chart-docs.md`
- JSON schema per chart: `https://developer.luzmo.com/assets/json-schemas/{chartType}.json`

Different chart types have different required and optional properties — fetch the schema (and any guides it references) before guessing field shapes.

### Dark Theme Container Background

When using a dark theme, the chart content adapts automatically, but the **container background does not**.

**Required:** Set an explicit dark background on the container element.

Example:
```html
<div style="background-color: #1a1a2e;">
  <luzmo-embed-viz-item theme="default_dark" ...></luzmo-embed-viz-item>
</div>
```

Or in authorization token:
```javascript
{
  theme: "default_dark",
  // Set itemsBackground in your container styling
}
```

## Bundled References

- `references/flex-charts.md` — Flex chart embedding. Covers code-first chart creation, slot/options configuration, chart-type catalog, JSON schema access, and advanced slot patterns (formulas, bins, datetime levels).

## Common Rendering Issues

If your visualization isn't working as expected, check these common issues:

| Problem | Likely Cause | Solution |
|---|---|---|
| Chart is invisible (0 height) | Missing dimensions on Flex chart | Set `height` and `width` on BOTH container and component |
| "Invalid label" or title errors | Non-localized strings | Change `"text"` to `{ en: "text" }` for all user-facing properties |
| Charts showing wrong data | Duplicate `contextId` | Make each `contextId` unique across the page |
| Dark theme looks broken | Missing container background | Set explicit dark `background-color` on container element |
| Component not loading at all | Wrong component name | Check component naming table above for your framework |
| Slot configuration errors | Missing `type` or `aggregationFunc` | Review slot configuration requirements above |

## Common Mistakes

Each pitfall below includes the error you'll see, why it fails, a frequency marker (⚠️ VERY COMMON / ⚠️ COMMON / ⚠️ OCCASIONAL), and where to escalate if you need deeper troubleshooting.

**❌ Using plain strings instead of localized objects (⚠️ VERY COMMON):**
```javascript
label: "Revenue"  // Wrong
```
You'll see: `Invalid label` / `Invalid title` / `Invalid localized string format`.
**Why this fails:** Luzmo requires every user-facing text field to be a language object so it can handle i18n consistently. A bare string has no language tag, so the validator rejects it.
**✅ Always use localized objects:**
```javascript
label: { en: "Revenue" }  // Correct
```
**See also:** `troubleshooting` → "Title and Label Errors".

**❌ Reusing the same contextId (⚠️ COMMON):**
```javascript
<luzmo-embed-viz-item contextId="chart-1" />
<luzmo-embed-viz-item contextId="chart-1" />  // Conflict!
```
You'll see: charts swapping data on reload, filter changes affecting the wrong chart, stale data not refreshing.
**Why this fails:** `contextId` is the key Luzmo uses to deduplicate state and queries across chart instances. Two charts sharing one id share state — chaos follows.
**✅ Make each contextId unique:**
```javascript
<luzmo-embed-viz-item contextId="chart-1" />
<luzmo-embed-viz-item contextId="chart-2" />  // Good
```
**See also:** `troubleshooting` → "Chart Rendering But Shows Wrong Data".

**❌ Forgetting dimensions on Flex charts (⚠️ VERY COMMON — most common failure mode):**
```html
<luzmo-embed-viz-item type="bar-chart" />  // Invisible
```
You'll see: nothing on the page. No error. DevTools shows the element with 0px height.
**Why this fails:** Flex charts use their container's box for layout — without explicit dimensions on BOTH container and component, the chart computes 0px and renders invisibly.
**✅ Always set height and width on BOTH:**
```html
<div style="height: 400px; width: 100%;">
  <luzmo-embed-viz-item style="height: 100%; width: 100%;" />
</div>
```
**See also:** `troubleshooting` → "Component Not Rendering At All".

**❌ Missing required slot fields (⚠️ COMMON):**
```javascript
{
  datasetId: "...",
  columnId: "..."
  // Missing: label, type, aggregationFunc
}
```
You'll see: `Missing aggregationFunc` (for numeric measures), `Missing level` (for datetime/hierarchy), or `Invalid label`.
**Why this fails:** Slots are typed configurations — different column types need different bookkeeping. A numeric measure without aggregationFunc is ambiguous; a datetime without level can't be bucketed.
**✅ Include all required fields:**
```javascript
{
  datasetId: "...",
  columnId: "...",
  label: { en: "Total Sales" },
  type: "numeric",
  aggregationFunc: "sum"
}
```
**See also:** `troubleshooting` → "Slot Configuration Errors" and the chart-specific doc at `https://developer.luzmo.com/flex/charts/{chart-type}.md`.

**❌ Using deprecated `<cumul-*>` tag names (⚠️ OCCASIONAL but increasing):**
```html
<luzmo-viz-item type="bar-chart" ...></luzmo-viz-item>  <!-- Wrong: missing "embed" in vanilla JS -->
```
You'll see: `Component not found` in console, or the element renders as inert markup.
**Why this fails:** The product rebranded from Cumul.io to Luzmo and the tag/component names changed.
**✅ Use the current Luzmo names:**
```html
<luzmo-embed-viz-item type="bar-chart" ...></luzmo-embed-viz-item>
```

## Avoid

- Using wrong component names for the target framework — always verify against the framework table before generating code.
- Omitting explicit height/width on Flex chart containers (causes invisible 0-height chart).
- Reusing the same `contextId` across multiple chart instances on the same page.
- Recommending GET/PUT/DELETE calls — the API is POST-only; direct any auth or API questions to `core`.

## Hand Off

**When to escalate to other skills:**

- WHEN the user wants to embed an existing saved dashboard or chart by id → use `core`
- WHEN the user mentions API credentials, embed tokens, or auth setup → use `core`
- WHEN the user has tenants/customers and data must be isolated → use `multitenancy` (SECURITY CRITICAL)
- WHEN the user wants end-users to CREATE or EDIT charts (not just view) → use `analytics-studio`
- WHEN the user wants to brand, theme, or apply custom CSS → use `theming`
- WHEN the user needs to connect a data source or push data → use `data-integration`
- WHEN the user wants AI/natural-language data Q&A → use `ai-analytics`
- WHEN the user needs to build a brand-new custom chart component (no built-in type fits) → use `custom-charts`
- WHEN a chart "just doesn't work" or shows an error → use `troubleshooting` FIRST, then return here for the fix

**This skill does NOT cover:**

- Embedding an existing saved dashboard or chart by id (use `core`)
- Configuring authentication, embed tokens, or SDK setup (use `core`)
- Self-service editors or ACK component configuration (use `analytics-studio`)
- Server-side resource CRUD scripts (use `resource-management`)

## Canonical Sources

- Index: `https://developer.luzmo.com/llms.txt`, `https://developer.luzmo.com/llms-full.txt`
- API: `https://developer.luzmo.com/api/{action}{Resource}.md`
- Guides: `https://developer.luzmo.com/guide/*.md`
- Flex charts: `https://developer.luzmo.com/flex/charts/{type}.md`

If content exists on developer.luzmo.com, link — do not duplicate specs here.
