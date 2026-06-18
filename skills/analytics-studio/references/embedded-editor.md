# Embedded Dashboard Editor & ACK Reference

## Path A — Embedded Dashboard Editor

An out-of-the-box editor embedded as a single component. End-users get Luzmo's native edit UI inside your application.

### Reference Docs

```
https://developer.luzmo.com/guide/dashboard-embedding--embedded-dashboard-editor.md
https://developer.luzmo.com/guide/dashboard-embedding--embedded-dashboard-editor--generate-an-embed-token-with-designer-role-and-rights.md
https://developer.luzmo.com/guide/dashboard-embedding--embedded-dashboard-editor--embed-the-dashboard-with-an-edit-mode.md
https://developer.luzmo.com/guide/dashboard-embedding--embedded-dashboard-editor--capture-events-to-enhance-interactivity.md
```

### Token Roles

| Role | Capability |
|---|---|
| `viewer` | View only — cannot activate edit mode |
| `designer` | Edit charts and layout |
| `owner` | Same as designer + can favorite a dashboard variant on behalf of other users |

Use `designer` for most cases. Use `owner` only when the favoriting capability is explicitly needed.

### editMode

Set `editMode` on the frontend component to activate the editor UI. Consult the editMode docs above for the full list of accepted values and their effect.

### Events

Listen to dashboard events to react to edits in your application. Consult the capture-events doc above.

---

## Path B — Analytics Components Kit (ACK)

A suite of modular web components for building a fully custom chart configuration UI. Your application controls layout, branding, and which controls are exposed.

### Installation

Install ACK first:

```bash
npm install @luzmo/analytics-components-kit
```

For standalone Flex chart rendering, also install the rendering package for your framework. You do not need a separate embed package when using ACK's `luzmo-item-grid` / `LuzmoItemGrid` for multi-chart grid rendering.

```bash
npm install @luzmo/embed           # Web components (vanilla JS)
npm install @luzmo/react-embed     # React
npm install @luzmo/ngx-embed       # Angular
npm install @luzmo/vue-embed       # Vue
```

### Framework Support

**ACK Configuration Components:**
- **Web Components (vanilla JS)**: Native support — use `<luzmo-*>` tags directly
- **React**: Official wrappers available via `@luzmo/analytics-components-kit/react` — use ACK wrapper names such as `<LuzmoDataFieldPanel>` and `<LuzmoItemSlotDropPanel>`
- **Vue & Angular**: No official wrappers yet — use web components directly with framework's web component integration

**Rendering Components** (for displaying configured charts):
- All frameworks fully supported: React, Angular, Vue, Web Components
- Standalone Flex chart rendering comes from the framework embed package: `@luzmo/embed`, `@luzmo/react-embed`, `@luzmo/ngx-embed`, or `@luzmo/vue-embed`.
- Multi-chart grid rendering uses ACK's `luzmo-item-grid` / `LuzmoItemGrid`, imported from `@luzmo/analytics-components-kit` (or a subpath) / `@luzmo/analytics-components-kit/react`.

**Example usage patterns:**

| Framework | ACK Config Components | Rendering Components |
|-----------|----------------------|---------------------|
| Vanilla JS | `<luzmo-data-field-panel>` | `<luzmo-embed-viz-item>` |
| React | `<LuzmoDataFieldPanel>` | `<LuzmoVizItemComponent>` for a single Flex chart; `<LuzmoItemGrid>` for ACK grid rendering |
| Angular | `<luzmo-data-field-panel>` (web component) | `<luzmo-viz-item>` from `@luzmo/ngx-embed`; `<luzmo-item-grid>` from ACK |
| Vue | `<luzmo-data-field-panel>` (web component) | `<luzmo-viz-item>` from `@luzmo/vue-embed`; `<luzmo-item-grid>` from ACK |

### Core Docs

ACK conceptual documentation:
```
https://developer.luzmo.com/guide/ack--overview.md
https://developer.luzmo.com/guide/ack--patterns.md
https://developer.luzmo.com/guide/ack--item-definitions.md
https://developer.luzmo.com/guide/ack--utilities.md
```

Component API references:
```
https://developer.luzmo.com/guide/ack--components--data-fields.md
https://developer.luzmo.com/guide/ack--components--data-slots.md
https://developer.luzmo.com/guide/ack--components--data-picker--luzmo-item-slot-picker.md
https://developer.luzmo.com/guide/ack--components--data-picker--luzmo-item-slot-picker-panel.md
https://developer.luzmo.com/guide/ack--components--item-options.md
https://developer.luzmo.com/guide/ack--components--filters--luzmo-filters.md
https://developer.luzmo.com/guide/ack--components--chart-rendering--luzmo-embed-viz-item.md
https://developer.luzmo.com/guide/ack--components--chart-rendering--luzmo-item-grid.md
```

Step-by-step dashboard studio guide:
```
https://developer.luzmo.com/guide/guides--building-a-dashboard-studio.md
https://developer.luzmo.com/guide/guides--building-a-dashboard-studio--installation.md
https://developer.luzmo.com/guide/guides--building-a-dashboard-studio--visualizing-dashboard-items.md
https://developer.luzmo.com/guide/guides--building-a-dashboard-studio--chart-data.md
https://developer.luzmo.com/guide/guides--building-a-dashboard-studio--item-options.md
https://developer.luzmo.com/guide/guides--building-a-dashboard-studio--persisting-a-chart-configuration.md
https://developer.luzmo.com/guide/guides--building-a-dashboard-studio--theming.md
```

### How ACK Works (One-Way Data Flow)

1. **Configure** — ACK components emit events as users select fields, adjust options, or set filters.
2. **Store** — Your application captures those events and owns the state: `slotsContents`, `options`, `filters`.
3. **Render** — Pass stored state into `luzmo-embed-viz-item` (single chart) or `luzmo-item-grid` (multi-chart).

Individual ACK configuration components do not render charts; they only produce configuration. Use the Flex embed component for a single-chart preview, or ACK's `luzmo-item-grid` / `LuzmoItemGrid` for multi-chart grid rendering.

### Component Map (fetch only what's needed)

| User need | Component(s) | Doc |
|---|---|---|
| Browse / drag dataset fields | `luzmo-data-field-panel` | `https://developer.luzmo.com/guide/ack--components--data-fields.md` |
| Assign fields to axes (drag) | `luzmo-item-slot-drop-panel` | `https://developer.luzmo.com/guide/ack--components--data-slots.md` |
| Assign fields to axes (dropdown) | `luzmo-item-slot-picker-panel` | `https://developer.luzmo.com/guide/ack--components--data-picker--luzmo-item-slot-picker-panel.md` |
| Adjust chart appearance | `luzmo-item-option-panel` | `https://developer.luzmo.com/guide/ack--components--item-options.md` |
| Add/edit filters | `luzmo-filters` | `https://developer.luzmo.com/guide/ack--components--filters--luzmo-filters.md` |
| Render one chart | `luzmo-embed-viz-item` | `https://developer.luzmo.com/guide/ack--components--chart-rendering--luzmo-embed-viz-item.md` |
| Multi-chart grid with layout | `luzmo-item-grid` | `https://developer.luzmo.com/guide/ack--components--chart-rendering--luzmo-item-grid.md` |

All component doc URLs: `https://developer.luzmo.com/guide/{doc-slug}.md`

### Auth on ACK Components

ACK components that fetch Luzmo data require an embed token (`role: "designer"`):

```html
<luzmo-data-field-panel
  auth-key="<embed-id>"
  auth-token="<embed-token>"
  api-url="https://api.luzmo.com"
></luzmo-data-field-panel>

<luzmo-embed-viz-item
  auth-key="<embed-id>"
  auth-token="<embed-token>"
  app-server="https://app.luzmo.com"
  api-host="https://api.luzmo.com"
></luzmo-embed-viz-item>
```

### ACK State Rules

- Your app is the **single source of truth** for `slotsContents`, `options`, and `filters`.
- Keep `item-type` on ACK components in sync with the `type` on the rendering component.
- Use `loadDataFieldsForDatasets` from `@luzmo/analytics-components-kit/utils` to fetch component-ready fields.
- Use `switchItem` from `@luzmo/analytics-components-kit/utils` to remap slots when the user changes chart type.
- Persist configuration: `https://developer.luzmo.com/guide/guides--building-a-dashboard-studio--persisting-a-chart-configuration.md`

### Package Dependencies & Imports

**For React projects:**
```javascript
// ACK components (React wrappers)
import {
  LuzmoDataFieldPanel,
  LuzmoItemSlotDropPanel,
  LuzmoItemSlotPickerPanel,
  LuzmoEditFilters,
  LuzmoItemGrid,
  LuzmoItemOptionPanel
} from '@luzmo/analytics-components-kit/react';

// Standalone Flex chart renderer (React wrapper)
import { LuzmoVizItemComponent } from '@luzmo/react-embed';

// Utilities
import { loadDataFieldsForDatasets, switchItem } from '@luzmo/analytics-components-kit/utils';
```

**For Vue/Angular projects:**
```javascript
// ACK components used as web components; import only what you need, or import the package root.
import '@luzmo/analytics-components-kit/data-field-panel';
import '@luzmo/analytics-components-kit/item-slot-drop-panel';
import '@luzmo/analytics-components-kit/item-slot-picker-panel';
import '@luzmo/analytics-components-kit/filters';
import '@luzmo/analytics-components-kit/item-option-panel';
import '@luzmo/analytics-components-kit/item-grid';

// Utilities
import { loadDataFieldsForDatasets, switchItem } from '@luzmo/analytics-components-kit/utils';

// Flex rendering component:
// Angular: import types/components from '@luzmo/ngx-embed' and render <luzmo-viz-item>.
// Vue: install/use '@luzmo/vue-embed' and render <luzmo-viz-item>.

// Register web components in your framework's component registration
// Vue: Configure vue.config.js to ignore custom elements
// Angular: Add CUSTOM_ELEMENTS_SCHEMA to module
```

**For vanilla JS projects:**
```javascript
// Import and register web components
import '@luzmo/analytics-components-kit';
import '@luzmo/embed';

// Utilities
import { loadDataFieldsForDatasets, switchItem } from '@luzmo/analytics-components-kit/utils';
```

### Important Notes

- **ACK License Required**: Analytics Components Kit requires the "Analytics Components Kit" addon in your Luzmo license. Contact support@luzmo.com if you encounter license errors.
- **TypeScript Support**: All packages include TypeScript definitions.
- **Web Component Polyfills**: May be needed for older browsers. See framework-specific installation docs.
- **Event Handling**: ACK components emit native CustomEvents. React wrappers provide React-friendly event props.
- **State Management**: ACK works with any state management solution (Redux, Vuex, Pinia, React Context, etc.) — you control where state lives.
