# Flex Runtime Theme — keys that actually render

Theming a **standalone Flex viz-item** happens entirely through the chart's `options` object — there is **no `theme` component prop**. This page lists the keys that are actually honored at runtime, because they are easy to guess wrong: the `createTheme` Theme-API schema (see `theme-schema.md`) uses *different* names, and several plausible keys (`mainColor`, `fontColor`, `background`) are silently ignored on a per-item Flex chart.

The honored keys below are taken from the chart options JSON Schemas in `@luzmo/dashboard-contents-types` (e.g. `bar-chart-options.schema.json`) and hold for the common chart types — `bar-chart`, `column-chart`, `line-chart`, `scatter-plot`, etc. (`donut-chart` has every key except `axis`, since it has no axes). A few chart types differ: `pyramid-chart`, for example, is the one type that *does* expose `theme.mainColor` / `theme.background`. **Always fetch the specific chart's options schema before adding less-common keys** — these tables cover ~41 of 44 chart types, not a guarantee for every type.

## Two buckets: `options.theme` vs top-level `options`

Styling is split between a `theme` sub-object and a few top-level option keys. **You need both** — the most common mistake is putting everything in `theme` and getting default-coloured bars.

### `options.theme` (the theme sub-object)

| Key | Type | Controls |
|---|---|---|
| `type` | `'custom'` | Required to apply a custom theme |
| `colors` | `string[]` | **Multi-series** palette (series 1..n) |
| `itemsBackground` | string | **Chart canvas background** |
| `font` | `{ fontFamily, fontSize }` | Font family + base size (NO colour here) |
| `title` | `{ align, bold, italic, underline, fontSize, lineHeight, border }` | Title style (NO colour) |
| `legend` | `{ type, fontSize, lineHeight }` | Legend marker + text size (NO colour) |
| `tooltip` | `{ background, fontSize, opacity }` | Tooltip box (NO text-colour key) |
| `borders` | `{ border-color, border-radius, border-style, border-top-width, … }` | Item border/corner radius |
| `boxShadow` | `{ color, size }` | Item shadow |
| `axis` | `{ fontSize }` | Axis **font sizing** only (axis colour is top-level, see below) |
| `id` | string | Reference a built-in/created theme by id instead of inline keys |

### Top-level `options` (siblings of `theme`)

| Key | Type | Controls |
|---|---|---|
| `color` | string | **The main (single-series) colour** — bars/line of a one-measure chart. This is the real "main colour"; `theme` has no `mainColor`. |
| `axis` | `{ x: { color }, y: { color } }` | **Axis colour** (line/ticks; e.g. `#000000`). Label-text contrast is *also* auto-derived from `theme.itemsBackground`, so set a matching `itemsBackground` to keep labels readable on a dark/light canvas. |
| `grid` | `{ x: { enabled, color }, y: { enabled, color } }` | Gridlines |

## Keys people guess that DO NOT work per-item

| Wrong key | Why | Use instead |
|---|---|---|
| `theme.mainColor` | not in most charts' theme schema (≈41 of 44 types) → ignored; the single-series colour is top-level **`options.color`**. A few types (e.g. `pyramid-chart`) *do* accept `theme.mainColor` — check that chart's schema | top-level **`options.color`** |
| `theme.fontColor` / global text colour | no such key | axis colour → **`options.axis.x.color` / `.y.color`**; overall label-text contrast follows **`theme.itemsBackground`** (dark canvas → light text automatically) |
| `theme.background` | not the key | **`theme.itemsBackground`** |
| `theme.tooltip.color` | tooltip has no text-colour key | (only `tooltip.background` / `fontSize` / `opacity`) |
| `theme.titleFont` / `secondaryColor` | these are **`createTheme`** (Theme API) keys, not Flex runtime | use the keys in the tables above |

> Symptom of using a wrong key: the chart renders but **stays its default colour** (e.g. bars not in brand colour because only `theme.mainColor`/`theme.colors` were set on a single-series chart), or **axis labels are unreadable** on a dark canvas because `theme.itemsBackground` wasn't set (label contrast derives from it) and a non-existent `fontColor` was used instead of `axis.{x,y}.color`.

## Validated example (one reusable brand object → every chart)

```javascript
// One brand object, applied to EVERY viz-item's options.
const BRAND = {
  // theme sub-object
  theme: {
    type: 'custom',
    colors: ['#1DB954', '#1ED760', '#1AA34A', '#FFFFFF', '#B3B3B3'], // multi-series palette
    itemsBackground: '#181818',                                       // chart canvas
    font: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13 },
    title: { align: 'left', bold: true },
    legend: { type: 'circle' },
    tooltip: { background: '#000000' },
    borders: { 'border-radius': '12px', 'border-style': 'none' },
  },
  // top-level option keys
  color: '#1DB954',                                                   // single-series main colour
  axis: { x: { color: '#FFFFFF' }, y: { color: '#FFFFFF' } },         // readable axis text on dark canvas
  grid: { x: { enabled: false }, y: { enabled: true, color: 'rgba(255,255,255,0.12)' } },
};

// Merge brand styling OVER the IQ-/code-generated options without clobbering the
// chart's own structural options (sort, ranking, limit, title text, timezoneId, …):
function applyBrand(options = {}) {
  const merged = { ...options, color: BRAND.color };
  merged.theme = { ...(options.theme || {}), ...BRAND.theme };
  for (const k of ['axis', 'grid']) merged[k] = { ...(options[k] || {}), ...BRAND[k] };
  return merged;
}

// React: <LuzmoVizItemComponent options={applyBrand(item.options)} ... />
// Vanilla: el.options = applyBrand(item.options)
```

## Beyond colours — appearance & chrome options

Colours are only part of "native". These are **top-level `options` keys** (siblings of `color`/`axis`/`grid`, NOT inside `theme`) and are the most-missed branding levers. Many are **chart-type-specific** — fetch the chart's options schema (e.g. `bar-chart-options.schema.json`) for the exact set per type.

| Top-level key | Controls |
|---|---|
| `loader` | The loading spinner/box: `spinnerColor`, `spinnerBackground`, `background`, `fontColor`, `mode` (`'light'`/`'dark'`), `msg`, and **`showBranded: false`** to drop the "powered by Luzmo" label (white-label). The default spinner is **not** brand-coloured unless you set this — a very common "why is the loader still purple/default" gap. |
| `display` | `{ title, legend, modeOption }` booleans — show/hide chart chrome for a clean embed |
| `bars` | (bar/column) `{ roundedCorners: <px>, label }` — rounded bar corners + value labels |
| `legend` | `{ position, size, type }` — legend placement / size / marker |
| `axislabels` | `{ x: { enabled, position }, y: {…} }` — show/hide & position axis labels |
| `interactivity` | `{ customTooltip, select, exportTypes, customEvents, urlConfig }` — fully custom (HTML) tooltips, selection, export menu |
| `guidelines` | `{ lines: [...], style: { type, width } }` — reference lines |
| `manualAxesRange` | fix axis min / max |
| `categories` | `{ colored }` — colour bars by category |
| `mode` | (bar/column) `'grouped'` \| `'stacked'` \| `'100%'` |

> The two most-missed "make it look fully native" levers are **`loader`** (esp. `loader.showBranded: false` + `loader.spinnerColor`) and **`bars.roundedCorners`**. Type-specific keys differ — a line-chart has line width / markers / area; a donut has inner radius / labels — so fetch that chart's schema before adding them.

## How to confirm it actually rendered

Brand keys are applied per-chart, so verify on the chart itself, not just the page:
- the **bars/lines** are in brand colour (if not → you set `theme.mainColor` instead of top-level `color`),
- the **axis labels** are readable against the canvas (if not → set `theme.itemsBackground` to your canvas colour so label text auto-contrasts, and set `options.axis.{x,y}.color` for the axis line/ticks),
- the **canvas** is the brand background (`theme.itemsBackground`).

Fetch the specific chart's options schema (`https://developer.luzmo.com` chart pages, or the `@luzmo/dashboard-contents-types` `*-options.schema.json`) before adding less-common keys — a few options are chart-type specific.
