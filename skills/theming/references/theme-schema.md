# Theme JSON Schema Reference

Reference for theme JSON used by the Theme API (`createTheme` / `updateTheme`) and inline per-token `theme` overrides on `createAuthorization` for dashboard embeds. Consult `https://developer.luzmo.com/api/createTheme.md` and `https://developer.luzmo.com/api/createAuthorization.md` for current production field shapes. These docs guide implementation details only.

> ⚠️ **This is the Theme API schema, NOT the standalone Flex per-item runtime theme.** A Flex viz-item's `options.theme` uses a *different* set of keys (e.g. the main colour is the top-level `options.color`, not `mainColor`; text colour is `options.axis.{x,y}.color`, there is no `fontColor`). Do not copy keys from this page onto a standalone Flex chart. For Flex charts, use `references/flex-runtime-theme.md`.

## High-Level Shape

The canonical schema currently nests visual settings under a `theme` object for Theme API calls:

```jsonc
{
  "name": { "en": "Acme Brand" },
  "theme": {
    "type": "custom",
    "background": "rgb(255,255,255)",
    "itemsBackground": "#FFFFFF",
    "mainColor": "rgb(217,119,87)",
    "colors": ["#D97757", "#6A9B8E", "#C9A26B"],
    "font": {
      "fontFamily": "Inter, system-ui, sans-serif",
      "fontSize": 13
    },
    "title": {
      "align": "left",
      "bold": false,
      "italic": false,
      "underline": false,
      "border": false
    },
    "borders": {
      "border-style": "solid",
      "border-color": "#E2E8F0",
      "border-radius": "8px"
    },
    "margins": [12, 12],
    "boxShadow": {
      "size": "none",
      "color": "rgb(0,0,0)"
    }
  }
}
```

Field names and supported keys evolve — confirm against `https://developer.luzmo.com/api/createTheme.md` before generating production themes. In particular, `font` is an object with `fontFamily` and `fontSize`, not a string.

## Built-In Theme IDs

Built-in theme ids can be used where the ACK/Flex component API accepts a theme id:

`default`, `default_dark`, `vivid`, `seasonal`, `orion`, `royale`, `urban`, `pinky`, `bliss`, `radiant`, `classic`, `classic_dark`

When a theme is created (via UI or API), it is assigned a unique id that can be used instead of the built-in id.

```html
<luzmo-embed-viz-item options='{"theme": {"id": "default_dark"}}' type="bar-chart" ...></luzmo-embed-viz-item>
```

## Custom Theme via API

```javascript
const theme = await client.create('theme', {
  name: { en: 'Acme Brand' },
  theme: {
    type: 'custom',
    mainColor: '#0F172A',
    font: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13 },
    colors: ['#0F172A', '#3B82F6', '#10B981'],
  },
});
```

Update an existing theme by id:

```javascript
await client.update('theme', theme.id, {
  name: { en: 'Acme Brand' },
  theme: {
    type: 'custom',
    mainColor: '#0F172A',
    colors: ['#0F172A', '#3B82F6', '#10B981'],
  },
});
```

## Per-Tenant Theme (Without Creating a Theme Resource)

If theming is highly dynamic, pass the theme JSON directly in the authorization request:

```javascript
const auth = await client.create('authorization', {
  type: 'embed',
  username: user.id,
  access: {
    dashboards: [{ id: dashboardId, rights: 'read' }],
  },
  theme: {
    type: 'custom',
    mainColor: tenant.primary_color,
    font: {
      fontFamily: tenant.font_family,
      fontSize: 13,
    },
    colors: tenant.palette,
  },
});
```

This authorization-level `theme` is for dashboard embed theming. Standalone Flex viz-items should be themed through the item `options` object instead.

## Standalone Flex Viz-Item Theme Options

Flex viz-items do not expose a `theme` prop. Put runtime chart styling in `options`:

```javascript
const options = {
  theme: {
    itemsBackground: '#FFFFFF',
    mainColor: '#D97757',
    colors: ['#D97757', '#6A9B8E', '#C9A26B'],
    font: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13 },
  },
  color: '#D97757',
};
```

## CSS Override (Token-Level Styling)

For pixel-level control beyond theme JSON, use only server-generated or allowlisted `css` in the authorization request:

```javascript
const auth = await client.create('authorization', {
  type: 'embed',
  username: user.id,
  access: {
    dashboards: [{ id: dashboardId, rights: 'read' }],
  },
  css: `
    .luzmo-item-title { font-weight: 600; }
    .luzmo-axis-label { font-size: 12px; }
  `,
});
```

CRITICAL: Prefer structured theme settings or constrained design tokens for tenant/customer-authored styling. If CSS is allowed, sanitize and allowlist server-side; block `@import`, remote `url(...)`, script-like constructs, credential/PII interpolation, arbitrary prose/comments, and free-form prose that is not required CSS.

## Dark Theme Container Requirement

Theme JSON/options colors apply to chart/dashboard content. The container background of your embedding element is your responsibility:

```html
<div style="background-color: #0F172A;">
  <luzmo-embed-dashboard theme="default_dark" ...></luzmo-embed-dashboard>
</div>
```

Without this, a dark theme can leave a light wrapper background around the embedded surface.

## Theming Surfaces Not Controlled by This Schema

- IQ Chat uses `IQChatOptions` and its documented CSS variables.
- IQ Answer uses CSS custom properties.
- ACK editor components use the ACK theming guide.
- Standalone Flex runtime → uses the Flex item `options` object, not a component `theme` prop

See SKILL.md for the per-surface mechanism table.

**IMPORTANT:** Consult `https://developer.luzmo.com/api/createTheme.md` and any relevant guides it references before generating a theme; supported fields and validation rules evolve, but docs remain implementation-detail guidance only.
