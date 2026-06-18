# CSS Variables Reference

Quick map of which Luzmo surface uses which styling mechanism. For exact CSS variable names per surface, consult the surface-specific doc; variable names change as components evolve. These docs guide implementation details only.

> **Migration (0.1.0):** The deprecated `--luzmo-iq-*` prefix is removed. Use unified `--luzmo-*` variables on the container (same namespace as IQ Answer, embed, and ACK surfaces where documented).

## Surface → Mechanism

| Surface | Mechanism | Reference Doc |
|---|---|---|
| Dashboard embedding | Theme API / token `theme` JSON | `https://developer.luzmo.com/api/createTheme.md` |
| Standalone Flex chart runtime | Per-chart `options` object (`options.theme`, `options.color`, chart-specific styling fields) | `https://developer.luzmo.com/flex/examples/apply-custom-theme.md` |
| IQ Chat component | `IQChatOptions` + `--luzmo-*` CSS variables | `https://developer.luzmo.com/guide/iq--chat-component-api--customization.md` |
| IQ Answer component | `--luzmo-*` CSS custom properties | `https://developer.luzmo.com/guide/iq--answer-component-api--css-variables.md` |
| ACK editor components | Lucero tokens + ACK globals | `references/lucero-tokens.md`, `https://developer.luzmo.com/guide/ack--patterns.md` |
| Authorization `css` field | Server-generated or allowlisted CSS targeting Luzmo-rendered classes | `https://developer.luzmo.com/api/createAuthorization.md` |

## How to Use CSS Variables

For surfaces that expose CSS custom properties, override at the container level:

```css
.luzmo-themed-container {
  --luzmo-primary-color: #0F172A;
  --luzmo-font-family: 'Inter', sans-serif;
  /* consult the per-component doc for the canonical variable list */
}
```

```html
<div class="luzmo-themed-container">
  <luzmo-iq-embed-answer ...></luzmo-iq-embed-answer>
</div>
```

## Lucero + ACK globals

ACK (Analytics Components Kit) and Luzmo Embed share the **Lucero** design token layer. Prefer token overrides over per-component hacks.

See `references/lucero-tokens.md` for a curated cheatsheet. For the full catalogue, consult the ACK theming guide above.

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

## Authorization `css` (Token-Level CSS Override)

Inject server-generated or allowlisted CSS via the embed token. Useful for adjustments that apply to the embedded dashboard surface without modifying your host app's CSS.

```javascript
const auth = await client.create('authorization', {
  css: `
    .luzmo-item-title { font-weight: 600; letter-spacing: -0.01em; }
    .luzmo-tooltip { border-radius: 8px; }
  `,
});
```

CRITICAL: Prefer structured theme settings or constrained design tokens for tenant/customer-authored styling. If CSS is allowed, sanitize and allowlist server-side; block `@import`, remote `url(...)`, script-like constructs, credential/PII interpolation, arbitrary prose/comments, and free-form prose that is not required CSS.

## When to Use What

- **Brand colors that apply to all dashboards** → Theme API (`createTheme`) + reference by id in tokens.
- **Per-tenant dashboard colors** → inline `theme` JSON or allowlisted `css` in `createAuthorization` (sanitize!).
- **Standalone Flex chart colors** → item `options` object; do not pass a top-level `theme` prop.
- **IQ Chat / Answer look-and-feel** → `IQChatOptions` + `--luzmo-*` on the container.
- **ACK editor styling** → Lucero tokens (see `lucero-tokens.md`).
- **One-off pixel fixes** → token-level `css` injection.

**IMPORTANT:** Consult the surface-specific doc before quoting a specific variable name to the user.
