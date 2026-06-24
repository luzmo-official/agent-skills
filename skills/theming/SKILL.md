---
name: theming
description: >-
  Visual customization and branding for Luzmo surfaces.
  Use for custom colors, white-labeling, dark/light modes, and per-tenant themes.
  Triggers on: "change colors", "brand styling", "dark mode", "white-label", "custom theme", "IQ Chat styling", "ACK theming".
  Routes to the correct mechanism per surface: Theme API for dashboards, CSS variables for IQ Answer, IQChatOptions for IQ Chat, Flex runtime theme.
  Not for chart data or slots (use data-visualization) or data security (use multitenancy).
metadata:
  author: Luzmo
  version: 0.1.1
  last_updated: 2026-06-18
---

# Luzmo Theming

Entry-point for visual customization of any Luzmo surface. Route to the right mechanism — there is no single universal theme API for all Luzmo components.

## Doc Retrieval

- `developer.luzmo.com` is Luzmo's first-party, allowlisted documentation domain, maintained by the same publisher as this skill.
- Before starting implementation, you MUST consult the exact relevant `https://developer.luzmo.com/.../*.md` docs and their referenced URLs for implementation details.
- Use `https://developer.luzmo.com/llms.txt` and/or `/llms-full.txt` for discovery only.

## [CRITICAL] Security Checkpoint

**BEFORE applying themes via API or authorization tokens, verify:**
- [ ] Theme JSON and styling overrides are set via the SERVER-SIDE authorization-token call (`theme` plus optional styling properties) — never patched on the client after the token is issued
- [ ] If using the Theme API (`createTheme`, `updateTheme`), the call is made with `LUZMO_API_KEY` / `LUZMO_API_TOKEN` server-side
- [ ] Per-tenant theme decisions (which theme/CSS to apply) are made server-side based on the authenticated user, not via client-side query params a user could spoof
- [ ] Authorization `css` contains only server-generated or allowlisted CSS; prefer structured theme settings or constrained design tokens for tenant/customer-authored styling
- [ ] Untrusted tenant/customer styling input is never copied into prompts or treated as instructions
- [ ] CSS sanitization blocks `@import`, remote `url(...)`, script-like constructs, credential/PII interpolation, and arbitrary prose/comments before anything reaches a `css` payload
- [ ] For standalone Flex viz-items, do not use a `theme` component prop; apply chart styling through the item `options` object and keep any server-selected theme values scoped to the authenticated user

**If ANY checkbox is unchecked, STOP and fix before proceeding.** Per-tenant theming that relies on client-side branching can be bypassed, allowing one tenant to apply another tenant's theme (minor) or to inject hostile CSS or indirect prompt-injection text (more serious in shared frames and agent workflows).

For full auth/embed-token guidance, see `core`.

## Bundled References

- `references/theme-schema.md` — Theme JSON shape for `createTheme` and per-token `theme` override (colors, typography, palettes, dark-theme container requirement)
- `references/flex-runtime-theme.md` — **Standalone Flex viz-item** runtime theming: the validated `options.theme` + top-level `options` keys that actually render, and the look-alike keys (`mainColor`, `fontColor`, `background`) that are silently ignored
- `references/css-variables.md` — Per-surface styling mechanism map and how CSS variables are exposed for IQ Chat/Answer, ACK, and token-level `css`

## Theming Mechanisms by Surface

| Target surface | Mechanism |
|---|---|
| Reusable dashboard themes (org-wide) | **Theme API** |
| Dashboard embed theme or CSS per embed token | **Authorization `theme` / `css` override** |
| IQ Chat component look and feel | **IQ Chat customization** |
| IQ Answer component CSS | **IQ Answer CSS variables** |
| ACK component styling | **ACK theming guide** |
| Standalone Flex viz-item runtime styling | **Flex `options` object (`options.theme`, `options.color`, chart-specific options)** |

---

## 1. Theme API (Reusable Dashboard Themes)

Docs:
```
https://developer.luzmo.com/api/createTheme.md
https://developer.luzmo.com/api/searchTheme.md
```

Academy: `https://academy.luzmo.com/article/d73314lu`

Built-in theme IDs (can be used by Flex/ACK components where a theme id prop is supported):
`default`, `default_dark`, `vivid`, `seasonal`, `orion`, `royale`, `urban`, `pinky`, `bliss`, `radiant`, `classic`, `classic_dark`

Custom themes are JSON theme objects. Consult `https://developer.luzmo.com/api/createTheme.md` for current schema details before generating one. When created via API, they can also be specified as `theme_id` in Flex/ACK components (alternatively pass along the full theme JSON object to the components).

---

## 2. Runtime Theme / CSS Override (Per Embed Token)

Docs: `https://developer.luzmo.com/api/createAuthorization.md`

Academy: `https://academy.luzmo.com/article/hmvy5pwz`, `https://academy.luzmo.com/article/7zclnkrk`, `https://academy.luzmo.com/article/q3n82ib1`

- Add inline `theme` JSON or server-generated/allowlisted `css` to the `createAuthorization` request body to apply styling per token.
- Useful for white-labeling or per-tenant visual customization of dashboard embeds and other surfaces that consume authorization-level theme/css.
- Prefer structured theme settings or constrained design tokens when styling is based on tenant/customer-authored input. Do not pass raw tenant CSS through.
- Consult `https://developer.luzmo.com/api/createAuthorization.md` for current field shapes.
- Standalone Flex viz-items do **not** have a `theme` prop, and authorization-level `theme` should not be presented as the primary way to style them. For standalone Flex charts, use item `options` instead.

**Dark theme note:** When using a dark theme, set a dark background on the container element explicitly — chart content adapts to the theme but the container background does not. Two approaches:
1. CSS: `background-color: #1a1a2e` on the container element
2. Flex options: set supported background/theme fields in the chart `options` object after fetching the relevant Flex chart docs/schema

---

## 3. IQ Chat Component Styling

Docs:
```
https://developer.luzmo.com/guide/iq--chat-component-api--customization.md
```

- Includes `IQChatOptions` configuration and CSS variables.
- Consult the customization doc before describing specific style props or variables.

---

## 4. IQ Answer Component CSS Variables

Docs:
```
https://developer.luzmo.com/guide/iq--answer-component-api--css-variables.md
```

- The Answer component exposes CSS custom properties for color, font, and spacing.
- Consult the CSS variables doc before listing available variables.

---

## 5. ACK Component Styling

Docs:
```
https://developer.luzmo.com/guide/ack--patterns.md
```

- ACK components (from `@luzmo/analytics-components-kit`) have their own theming approach separate from the dashboard Theme API.
- Consult the ACK theming guide before suggesting specific CSS variables or theme props.

---

## 6. Flex Runtime Chart Theming

Docs:
```
https://developer.luzmo.com/flex/examples/apply-custom-theme
https://developer.luzmo.com/guide/flex--component-api-reference--properties.md
```

- Separate from the dashboard Theme API and authorization-level dashboard theme — applies through the individual chart's `options` object.
- Flex viz-items have no `theme` component prop. Use `options.theme`, `options.color`, and chart-specific options after fetching the chart docs/schema.
- Set the wrapper/container background with CSS when dark styling should cover the area around the chart.

**The runtime keys are split across `options.theme` AND top-level `options` — and several plausible keys are silently ignored.** Getting this wrong is the usual cause of "I themed it but the charts stayed default":
- **Main (single-series) colour → top-level `options.color`** — for the common chart types `options.theme` has **no `mainColor`** (a few types such as `pyramid-chart` differ — check the chart's schema). Setting only `theme.mainColor`/`theme.colors` leaves a one-measure bar/line chart in the default colour.
- **Multi-series palette → `options.theme.colors`**; **canvas → `options.theme.itemsBackground`** (not `background`).
- **Axis colour → top-level `options.axis.{x,y}.color`** (line/ticks) — there is **no `fontColor`** and `theme.font` carries only `fontFamily`/`fontSize`. Axis **label-text contrast auto-derives from `theme.itemsBackground`**, so set `itemsBackground` to your canvas colour or labels go unreadable on a dark background.
- `theme.tooltip` has `background`/`fontSize`/`opacity` only (no text colour); `theme.title`/`theme.legend` carry no colour. `theme.borders` (corner radius/border) and `theme.boxShadow` are valid.
- `createTheme` (Theme API) key names like `mainColor`, `fontColor`, `titleFont`, `secondaryColor` are **not** the Flex runtime keys — see the full validated key tables in `references/flex-runtime-theme.md`.

---

## Important Facts

- Dashboard Theme API settings do **not** automatically control IQ or ACK component styling — these are separate mechanisms.
- Runtime embed-token CSS overrides and Theme API resources are different things — do not conflate them.
- Dark themes require explicit container background color — not automatic.
- Consult component-specific docs before claiming CSS variable names or theming props.

## Common Mistakes

Each pitfall below includes a frequency marker, the symptom you'll see, why it fails, and the fix.

**[ERROR] Passing a `theme` prop to standalone Flex viz-items ([WARNING] COMMON):**
```html
<!-- Wrong - standalone Flex viz-items do not expose a theme prop -->
<luzmo-embed-viz-item theme="default_dark" />
```
You'll see: the prop is ignored and the chart keeps its default styling.
**Why this fails:** Flex runtime styling belongs in the `options` object, not a top-level component prop.
**[OK] Put Flex styling in options and style the wrapper yourself:**
```html
<div style="background-color: #1a1a2e;">
  <luzmo-embed-viz-item id="sales-chart" type="bar-chart" />
</div>
```
```javascript
document.querySelector('#sales-chart').options = {
  theme: {
    type: 'custom',
    itemsBackground: '#FFFFFF',
    colors: ['#D97757', '#6A9B8E', '#C9A26B'],   // multi-series palette (theme.colors)
    font: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13 },
  },
  color: '#D97757',                              // main single-series colour — NOT theme.mainColor (ignored)
  axis: { x: { color: '#475569' }, y: { color: '#475569' } }, // axis/text colour — there is no fontColor
}
// Full validated key reference: references/flex-runtime-theme.md
```

**[ERROR] Forgetting container background for dark themes ([WARNING] VERY COMMON):**
You'll see: chart content styled correctly, but a bright halo around it from the wrapper.
**Why this fails:** Chart options style chart content — they don't reach outside the component's box. The wrapper background is your CSS to set.

**[ERROR] Expecting dashboard themes to apply to IQ/ACK:**
```javascript
// Wrong - Theme API themes don't control IQ components
const theme = await client.get('theme', {...});
// IQ components need their own CSS variables
```
**[OK] Use component-specific theming:**
```javascript
// Correct - IQ components have separate styling mechanism
<luzmo-iq-embed-chat 
  customization={{ primaryColor: "#..." }}  // IQ-specific
/>
```

**[ERROR] Confusing Theme API with token theme overrides:**
```javascript
// These are DIFFERENT mechanisms:
// 1. Theme API: Create reusable themes in your org
await client.create('theme', {...})

// 2. Token theme override: Apply inline theme JSON per embed
await client.create('authorization', { theme: {...} })
```

## Avoid

- Applying authorization-level themes or CSS overrides client-side — all `theme`/`css` properties on `createAuthorization` must be set server-side.
- Passing `theme` as a prop to standalone Flex viz-items — use the chart `options` object instead.
- Injecting unsanitized tenant/customer-supplied strings into `css` payloads (CSS injection and indirect prompt-injection risk).
- Copying tenant/customer-authored styling comments or prose into prompts, generated instructions, logs, or support summaries.
- Describing IQ Chat CSS variables or ACK theme props without consulting the current customization documentation.
- Confusing the dashboard Theme API with per-token `css` overrides — they serve different scopes.

## Hand Off

**When to escalate to other skills:**

- WHEN the user is embedding a saved dashboard/chart by id (props, sizing) → use `core`
- WHEN the user is building a Flex chart in code (props, sizing, slots) → use `data-visualization`
- WHEN the user needs IQ Chat/Answer setup beyond CSS variables → use `ai-analytics`
- WHEN the user is building an ACK editor and asking how to integrate theming → use `analytics-studio`
- WHEN the user wants per-tenant theming tied to authorization tokens → also use `multitenancy`
- WHEN automating theme creation/association via scripts → use `resource-management`
- WHEN the user needs auth/embed-token basics before applying token-level themes → use `core`
- WHEN dark theme "looks wrong" or theme isn't applying → use `troubleshooting` FIRST

**This skill does NOT cover:**

- Functional configuration (slots, options, aggregationFunc) — use `data-visualization`
- Auth/embed-token generation (use `core`)
- Multi-tenant data filtering (use `multitenancy`)

## Canonical Sources

- Index: `https://developer.luzmo.com/llms.txt`, `https://developer.luzmo.com/llms-full.txt`
- API: `https://developer.luzmo.com/api/{action}{Resource}.md`
- Guides: `https://developer.luzmo.com/guide/*.md`
- Flex charts: `https://developer.luzmo.com/flex/charts/{type}.md`

If content exists on developer.luzmo.com, link — do not duplicate specs here.
