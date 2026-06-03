# Theme JSON Schema Reference

Reference for the theme JSON object used by both the Theme API (`createTheme`) and the per-token `theme` override on `createAuthorization`. Always fetch `https://developer.luzmo.com/api/createTheme.md` and any guides it references for the canonical, up-to-date schema.

## High-Level Shape

```jsonc
{
  // Colors
  "mainColor": "#0F172A",
  "secondaryColor": "#64748B",
  "axis": { "color": "#94A3B8" },
  "background": "#FFFFFF",
  "itemsBackground": "#FFFFFF",

  // Typography
  "font": "Inter, sans-serif",
  "titleFont": "Inter, sans-serif",

  // Item-level styling
  "itemSpecific": {
    "borderRadius": 8,
    "padding": 12
  },

  // Color palettes (for series)
  "colors": ["#0F172A", "#3B82F6", "#10B981", "#F59E0B", "#EF4444"],

  // Legends, tooltips, etc.
  "legend": { "position": "bottom" },
  "tooltip": { "background": "#0F172A", "color": "#FFFFFF" }
}
```

Field names and supported keys evolve — confirm against `createTheme.md` before generating production themes.

## Built-In Theme IDs

If a built-in theme suffices, reference it by id instead of creating a custom theme:

`default`, `default_dark`, `vivid`, `seasonal`, `orion`, `royale`, `urban`, `pinky`, `bliss`, `radiant`, `classic`, `classic_dark`

```javascript
const auth = await client.create('authorization', {
  theme: 'default_dark',   // built-in id
});
```

## Custom Theme via API

```javascript
const theme = await client.create('theme', {
  name: { en: 'Acme Brand' },
  properties: {
    mainColor: '#0F172A',
    font: 'Inter, sans-serif',
    colors: ['#0F172A', '#3B82F6', '#10B981'],
  },
});

// Reference the custom theme by id later:
await client.create('authorization', { theme: theme.id });
```

## Per-Tenant Theme (Without Creating a Theme Resource)

If theming is highly dynamic (e.g. each reseller picks their colors), pass the theme JSON directly in the authorization request:

```javascript
const auth = await client.create('authorization', {
  username: user.id,
  theme: {
    mainColor: tenant.primary_color,
    font: tenant.font_family,
    colors: tenant.palette,
  },
});
```

## CSS Override (Token-Level)

For pixel-level control beyond the theme JSON, use `css`:

```javascript
const auth = await client.create('authorization', {
  css: `
    .luzmo-item-title { font-weight: 600; }
    .luzmo-axis-label { font-size: 12px; }
  `,
});
```

CRITICAL: sanitize any tenant-supplied strings before injecting into `css` — see the Security Checkpoint in SKILL.md.

## Dark Theme Container Requirement

Theme JSON colors apply to chart content. The CONTAINER background of your embedding element is YOUR responsibility:

```html
<div style="background-color: #0F172A;">  <!-- match the theme background -->
  <luzmo-embed-dashboard theme="default_dark" ...></luzmo-embed-dashboard>
</div>
```

Without this, a dark theme leaves a white halo around the dashboard.

## Theming Surfaces That Are NOT Controlled by This Schema

- IQ Chat → uses `IQChatOptions` and its own CSS variables
- IQ Answer → uses CSS custom properties
- ACK editor components → uses ACK theming guide
- Flex runtime → uses Flex's runtime theme example

See SKILL.md for the per-surface mechanism table.

**IMPORTANT:** Always fetch `createTheme.md` and any guides it references before generating a theme — supported fields and validation rules evolve.
