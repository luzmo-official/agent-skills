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
  version: 0.1.0
  last_updated: 2026-05-21
---

# Luzmo Theming

Entry-point for visual customization of any Luzmo surface. Route to the right mechanism — there is no single universal theme API for all Luzmo components.

## 🚨 Security Checkpoint

**BEFORE applying themes via API or authorization tokens, verify:**
- [ ] Theme JSON or CSS is set via the SERVER-SIDE `createAuthorization` call (`theme`, `css` properties) — never patched on the client after the token is issued
- [ ] If using the Theme API (`createTheme`, `updateTheme`), the call is made with `LUZMO_API_KEY` / `LUZMO_API_TOKEN` server-side
- [ ] Per-tenant theme decisions (which theme/CSS to apply) are made server-side based on the authenticated user, not via client-side query params a user could spoof
- [ ] CSS overrides do NOT inject untrusted user input — sanitize any tenant-supplied strings before placing them in a `css` payload to avoid CSS injection

**If ANY checkbox is unchecked, STOP and fix before proceeding.** Per-tenant theming that relies on client-side branching can be bypassed, allowing one tenant to apply another tenant's theme (minor) or to inject hostile CSS (more serious in shared frames).

For full auth/embed-token guidance, see `core`.

## Bundled References

- `references/theme-schema.md` — Theme JSON shape for `createTheme` and per-token `theme` override (colors, typography, palettes, dark-theme container requirement)
- `references/css-variables.md` — Per-surface styling mechanism map and how CSS variables are exposed for IQ Chat/Answer, ACK, and token-level `css`

## Theming Mechanisms by Surface

| Target surface | Mechanism |
|---|---|
| Reusable dashboard themes (org-wide) | **Theme API** |
| Dynamic theme or CSS per embed token | **Authorization `theme` / `css` override** |
| IQ Chat component look and feel | **IQ Chat customization** |
| IQ Answer component CSS | **IQ Answer CSS variables** |
| ACK component styling | **ACK theming guide** |
| Flex chart runtime styling | **Flex theme example** |

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

Custom themes are JSON theme objects — fetch `https://developer.luzmo.com/api/createTheme.md` for the full schema before generating one. When created via API, they can also be specified as `theme_id` in Flex/ACK components (alternatively pass along the full theme JSON object to the components).

---

## 2. Runtime Theme / CSS Override (Per Embed Token)

Docs: `https://developer.luzmo.com/api/createAuthorization.md`

Academy: `https://academy.luzmo.com/article/hmvy5pwz`, `https://academy.luzmo.com/article/7zclnkrk`, `https://academy.luzmo.com/article/q3n82ib1`

- Add inline `theme` JSON or `css` to the `createAuthorization` request body to apply styling per token.
- Useful for white-labeling or per-tenant visual customization.
- Fetch `https://developer.luzmo.com/api/createAuthorization.md` for exact field shapes.

**Dark theme note:** When using a dark theme, set a dark background on the container element explicitly — chart content adapts to the theme but the container background does not. Two approaches:
1. CSS: `background-color: #1a1a2e` on the container element
2. Flex option: Set `itemsBackground: '#1a1a2e'` (or similar dark color) in chart options

---

## 3. IQ Chat Component Styling

Docs:
```
https://developer.luzmo.com/guide/iq--chat-component-api--customization.md
```

- Includes `IQChatOptions` configuration and CSS variables.
- Fetch the customization doc before describing any style props or variables.

---

## 4. IQ Answer Component CSS Variables

Docs:
```
https://developer.luzmo.com/guide/iq--answer-component-api--css-variables.md
```

- The Answer component exposes CSS custom properties for color, font, and spacing.
- Fetch the CSS variables doc before listing available variables.

---

## 5. ACK Component Styling

Docs:
```
https://developer.luzmo.com/guide/ack--patterns.md
```

- ACK components (from `@luzmo/analytics-components-kit`) have their own theming approach separate from the dashboard Theme API.
- Fetch the ACK theming guide before suggesting specific CSS variables or theme props.

---

## 6. Flex Runtime Chart Theming

Docs: `https://developer.luzmo.com/flex/examples/apply-custom-theme`

- Separate from the dashboard Theme API — applies at the individual chart component level
- Can also use the `itemsBackground` option on Flex charts to set background colors programmatically (useful for dark themes)

---

## Important Facts

- Dashboard Theme API settings do **not** automatically control IQ or ACK component styling — these are separate mechanisms.
- Runtime embed-token CSS overrides and Theme API resources are different things — do not conflate them.
- Dark themes require explicit container background color — not automatic.
- Always fetch component-specific docs before claiming CSS variable names or theming props.

## Common Mistakes

Each pitfall below includes a frequency marker, the symptom you'll see, why it fails, and the fix.

**❌ Forgetting container background for dark themes (⚠️ VERY COMMON):**
```html
<!-- Wrong - chart dark but container white -->
<div>
  <luzmo-embed-viz-item theme="default_dark" />
</div>
```
You'll see: chart content correctly dark, but a bright white halo around it from the wrapper.
**Why this fails:** Luzmo themes color chart CONTENT — they don't reach outside the component's box. The wrapper background is your CSS to set.
**✅ Set explicit dark background on container:**
```html
<!-- Correct - container matches theme -->
<div style="background-color: #1a1a2e;">
  <luzmo-embed-viz-item theme="default_dark" />
</div>
```

**❌ Expecting dashboard themes to apply to IQ/ACK:**
```javascript
// Wrong - Theme API themes don't control IQ components
const theme = await client.get('theme', {...});
// IQ components need their own CSS variables
```
**✅ Use component-specific theming:**
```javascript
// Correct - IQ components have separate styling mechanism
<luzmo-iq-embed-chat 
  customization={{ primaryColor: "#..." }}  // IQ-specific
/>
```

**❌ Confusing Theme API with token theme overrides:**
```javascript
// These are DIFFERENT mechanisms:
// 1. Theme API: Create reusable themes in your org
await client.create('theme', {...})

// 2. Token theme override: Apply inline theme JSON per embed
await client.create('authorization', { theme: {...} })
```

## Avoid

- Applying themes or CSS overrides client-side — all `theme`/`css` properties must be set in the server-side `createAuthorization` call.
- Injecting unsanitized tenant-supplied strings into `css` payloads (CSS injection risk).
- Describing IQ Chat CSS variables or ACK theme props without fetching the current customization documentation.
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
