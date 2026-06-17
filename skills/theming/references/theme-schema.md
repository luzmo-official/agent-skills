# Theme JSON Schema Reference

Reference for theme JSON used by the Theme API (`createTheme` / `updateTheme`) and inline per-token `theme` overrides on `createAuthorization`. Always fetch `https://developer.luzmo.com/api/createTheme.md` and `https://developer.luzmo.com/api/createAuthorization.md` before generating production theme JSON.

## High-Level Shape

The canonical schema currently nests visual settings under a `theme` object for Theme API calls:

```jsonc
{
  "name": { "en": "Acme Brand" },
  "theme": {
    "type": "custom",
    "background": "#FFFFFF",
    "itemsBackground": "#FFFFFF",
    "mainColor": "#0F172A",
    "colors": ["#0F172A", "#3B82F6", "#10B981"],
    "font": {
      "fontFamily": "Inter",
      "fontSize": 14
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
    "boxShadow": {
      "size": "none",
      "color": "rgb(0,0,0)"
    }
  }
}
```

Field names and supported keys evolve. Confirm against `createTheme.md` before generating production themes.

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
    font: {
      fontFamily: 'Inter',
      fontSize: 14,
    },
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
      fontSize: 14,
    },
    colors: tenant.palette,
  },
});
```

## CSS Override (Token-Level)

For pixel-level control beyond theme JSON, use `css` in the authorization request:

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

CRITICAL: sanitize any tenant-supplied strings before injecting into `css`; see the Security Checkpoint in `SKILL.md`.

## Dark Theme Container Requirement

Theme JSON colors apply to chart/dashboard content. The container background of your embedding element is your responsibility:

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
- Flex runtime theming uses the Flex runtime theme example and component-level props/options.

See SKILL.md for the per-surface mechanism table.

**IMPORTANT:** Always fetch `createTheme.md` and any guides it references before generating a theme — supported fields and validation rules evolve.
