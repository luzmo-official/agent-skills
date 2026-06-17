# Lucero + ACK Global Variables (cheatsheet)

ACK (`@luzmo/analytics-components-kit`) and Luzmo Embed components inherit **Lucero** design tokens as CSS custom properties. Override globals on a wrapper to theme the whole studio surface consistently.

## When to use Lucero tokens vs per-component CSS

| Approach | Use when |
|---|---|
| Lucero / ACK globals | Theming an ACK-based dashboard studio or multiple ACK widgets at once |
| `--luzmo-*` on a container | IQ Answer, single embed surfaces, incremental tweaks |
| Theme API (`createTheme`) | Dashboard/Flex chart content colors across many dashboards |

## Common token families

Fetch the full list from `https://developer.luzmo.com/guide/ack--patterns.md` before quoting names in production code. Typical families:

| Family | Purpose |
|---|---|
| Color (primary, surface, border) | Brand palette, backgrounds, dividers |
| Typography (font-family, size, weight) | Text hierarchy in ACK panels |
| Spacing | Padding/gaps in slot editors and field panels |
| Radius / shadow | Cards, panels, dropdowns |

## Example wrapper

```css
.luzmo-ack-studio {
  /* illustrative — verify names against the ACK theming guide */
  --luzmo-color-primary: #2563eb;
  --luzmo-color-surface: #ffffff;
  --luzmo-font-family: 'Inter', system-ui, sans-serif;
  --luzmo-radius-md: 8px;
}
```

```html
<div class="luzmo-ack-studio">
  <!-- luzmo-data-field-panel, luzmo-item-slot-drop-panel, etc. -->
</div>
```

## Package

```bash
npm install @luzmo/analytics-components-kit
```

ACK overview: `https://developer.luzmo.com/guide/ack--overview.md`
