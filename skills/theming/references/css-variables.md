# CSS Variables Reference

Quick map of which Luzmo surface uses which styling mechanism. For exact CSS variable names per surface, ALWAYS fetch the surface-specific doc — variable names change as components evolve.

> **Migration (0.1.0):** The deprecated `--luzmo-iq-*` prefix is removed. Use unified `--luzmo-*` variables on the container (same namespace as IQ Answer, embed, and ACK surfaces where documented).

## Surface → Mechanism

| Surface | Mechanism | Doc to Fetch |
|---|---|---|
| Dashboard embedding | Theme API / token `theme` JSON | `https://developer.luzmo.com/api/createTheme.md` |
| Flex chart runtime | Per-chart `theme` prop / runtime example | `https://developer.luzmo.com/flex/examples/apply-custom-theme.md` |
| IQ Chat component | `IQChatOptions` + `--luzmo-*` CSS variables | `https://developer.luzmo.com/guide/iq--chat-component-api--customization.md` |
| IQ Answer component | `--luzmo-*` CSS custom properties | `https://developer.luzmo.com/guide/iq--answer-component-api--css-variables.md` |
| ACK editor components | Lucero tokens + ACK globals | `references/lucero-tokens.md`, `https://developer.luzmo.com/guide/ack--patterns.md` |
| Authorization `css` field | Free-form CSS targeting Luzmo-rendered classes | `https://developer.luzmo.com/api/createAuthorization.md` |

## How to Use CSS Variables

For surfaces that expose CSS custom properties, override at the container level:

```css
.luzmo-themed-container {
  --luzmo-primary-color: #0F172A;
  --luzmo-font-family: 'Inter', sans-serif;
  /* fetch the per-component doc for the canonical variable list */
}
```

```html
<div class="luzmo-themed-container">
  <luzmo-iq-embed-answer ...></luzmo-iq-embed-answer>
</div>
```

## Lucero + ACK globals

ACK (Analytics Components Kit) and Luzmo Embed share the **Lucero** design token layer. Prefer token overrides over per-component hacks.

See `references/lucero-tokens.md` for a curated cheatsheet. Full catalogue: fetch the ACK theming guide above.

## IQ Chat — Customization Props

IQ Chat exposes both `IQChatOptions` (configuration object) and CSS variables. Use `IQChatOptions` for behavioral / visual config that has a documented property; use `--luzmo-*` CSS variables for typography and color tweaks beyond that.

```jsx
<LuzmoIQChatComponent
  authKey={authKey}
  authToken={authToken}
  options={{
    primaryColor: '#0F172A',
    font: 'Inter, sans-serif',
  }}
/>
```

## Authorization `css` (Token-Level CSS Injection)

Inject arbitrary CSS via the embed token. Useful for adjustments that apply to the embedded dashboard surface without modifying your host app's CSS.

```javascript
const auth = await client.create('authorization', {
  css: `
    .luzmo-item-title { font-weight: 600; letter-spacing: -0.01em; }
    .luzmo-tooltip { border-radius: 8px; }
  `,
});
```

CRITICAL: Sanitize tenant-supplied CSS before injecting — see the Security Checkpoint in SKILL.md.

## When to Use What

- **Brand colors that apply to all dashboards** → Theme API (`createTheme`) + reference by id in tokens.
- **Per-tenant colors** → inline `theme` JSON or `css` in `createAuthorization` (sanitize!).
- **IQ Chat / Answer look-and-feel** → `IQChatOptions` + `--luzmo-*` on the container.
- **ACK editor styling** → Lucero tokens (see `lucero-tokens.md`).
- **One-off pixel fixes** → token-level `css` injection.

**IMPORTANT:** Always fetch the surface-specific doc before quoting a specific variable name to the user.
