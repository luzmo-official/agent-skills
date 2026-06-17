---
name: analytics-studio
description: Build a self-service analytics environment inside your application. Two approaches — out-of-the-box Embedded Dashboard Editor (editMode) or custom Analytics Components Kit (ACK). Use for letting end-users create/edit dashboards, white-label studios, editMode, designer/owner token roles, and ACK configuration. Triggers on: "self-service analytics", "let users edit dashboards", "embedded studio", "analytics components kit", "ACK", "designer role", "dashboard editor". Critical pattern: ACK configures → your app stores state → separate renderer displays. Not for view-only embedding of saved dashboards (use core), building charts in code (use data-visualization), data connection (use data-integration), or AI queries (use ai-analytics).
metadata:
  author: Luzmo
  version: 0.1.0
  last_updated: 2026-05-21
---

# Luzmo Analytics Studio

Entry-point for building a **self-service analytics environment** inside embedded applications — where end-users can create, edit, or build their own dashboards and charts.

Two approaches:
- **Embedded Dashboard Editor** — out-of-the-box editor via `editMode` on the dashboard component (fastest path)
- **Analytics Components Kit (ACK)** — fully custom, component-by-component configuration UI (maximum control)

Also covers programmatic dashboard construction via API (Path C).

## 🚨 CRITICAL CONCEPTS 🚨

### Understanding ACK Architecture (Must Read First)

**The fundamental mental model:** ACK follows a ONE-WAY data flow pattern. Understanding this is essential before building ANY custom analytics UI.

### The Configure → Store → Render Pattern

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  ACK Components │ ---> │  Your Application │ ---> │ Luzmo Rendering │
│   (Configure)   │      │   (Store State)   │      │  (Display Chart)│
└─────────────────┘      └──────────────────┘      └─────────────────┘
     Emit events           Own the state            Receives state
```

**1. Configure (ACK Components)**
- User interacts with ACK components (drag fields, select options, configure filters)
- Components emit events with configuration changes
- ACK **does NOT store** this configuration

**2. Store (Your Application)**
- Your app listens to ACK events
- Your app is the **single source of truth** for state
- Store: `slotsContents`, `options`, `filters`
- This state lives in your app's state management (React state, Vuex, Redux, etc.)

**3. Render (Luzmo Embed Components)**
- Pass stored state into rendering components
- `<luzmo-embed-viz-item>` (single chart) or `<luzmo-item-grid>` (multi-chart)
- These components display the configured visualization

### ACK Configuration vs. Rendering

**Critical misunderstanding:** "ACK components will render the chart"

**Reality:** Individual ACK configuration components only produce configuration. Your app stores it. Exception: `<luzmo-item-grid>` provides built-in rendering for multi-chart layouts.

❌ **WRONG - This won't display anything:**
```javascript
// ACK components don't render - they just configure!
<luzmo-item-slot-drop-panel item-type="bar-chart" />
// Nothing visible on screen...
```

✅ **CORRECT - ACK configures, app stores, separate component renders:**

```jsx
// React example
// 1. ACK configures (emits events)
<luzmo-item-slot-drop-panel 
  item-type="bar-chart"
  onSlotChange={(e) => setSlotsContents(e.detail)} />

// 2. Your app stores state
const [slotsContents, setSlotsContents] = useState({...})

// 3. Separate rendering component displays
<luzmo-embed-viz-item 
  type="bar-chart" 
  slotsContents={slotsContents} />
```

### Security Checkpoint

**BEFORE implementing ACK:**
- [ ] Embed token generated server-side
- [ ] Token includes `role: "designer"` or `"owner"`
- [ ] Viewer tokens (`role: "viewer"`) CANNOT use ACK
- [ ] ACK components that fetch data (luzmo-data-field-panel, luzmo-item-slot-drop-panel with datasets) receive `authKey`/`authToken` (or `auth-key`/`auth-token` in HTML)

**If ANY checkbox is unchecked, STOP - viewer tokens cannot activate edit mode or drive ACK components, and ACK data-fetching components require embed tokens.**

For full auth/embed-token guidance, see `core`.

### Keep Types Synchronized

ACK `item-type` MUST match rendering component `type`:

❌ **WRONG - Types don't match:**
```javascript
<luzmo-item-slot-drop-panel item-type="bar-chart" />
<luzmo-embed-viz-item type="column-bar-chart" />  // Mismatch!
```

✅ **CORRECT - Types synchronized:**
```javascript
<luzmo-item-slot-drop-panel item-type="column-bar-chart" />
<luzmo-embed-viz-item type="column-bar-chart" />  // Match
```

### State Synchronization Rules

**Keep these in sync:**
- ACK component `item-type` ↔ Rendering component `type`
- When user switches chart type, update both

**Essential utilities:**
- **`loadDataFieldsForDatasets`** - Fetch component-ready dataset fields before rendering ACK data pickers
- **`switchItem`** - Remap existing slot configuration when user changes chart type

**Example flow:**
```javascript
import { switchItem, loadDataFieldsForDatasets } from '@luzmo/analytics-components-kit/utils';

// User selects new chart type
async function handleChartTypeChange(newType) {
  // 1. Update ACK item-type
  setAckItemType(newType)
  
  // 2. Remap existing slots for new chart type
  const next = await switchItem({
    oldItemType: currentType,
    newItemType: newType,
    slots: currentSlots,
    options: currentOptions
  })
  
  // 3. Update state
  setChartType(next.type)
  setSlots(next.slots)
  setOptions(next.options || {})
  
  // 4. Rendering component automatically updates via state
}
```

## License Requirements

**Important:** ACK requires the **"Analytics Components Kit" addon** in your Luzmo license.

**Common license errors:**
- "ACK addon not enabled" or similar - ACK requires a specific addon
- Contact support@luzmo.com if the addon needs to be activated
- Verify with your Luzmo account admin that ACK is part of your license

Without this addon, ACK components will not function.

## ACK vs Flex vs Dashboard Embedding

Choose the right approach for your use case:

| What You're Building | Use This |
|---|---|
| View-only dashboard | **Dashboard embedding** (`core` skill) |
| Quick out-of-the-box editor | **Embedded Dashboard Editor** with `editMode` |
| Fully custom configuration UI | **ACK** (this skill) |
| Code-first single chart | **Flex** (`data-visualization` skill) |
| White-label analytics studio | **ACK** (this skill) |

**Decision guide:**
- Need editor features fast? → Use `editMode` on dashboard component
- Want complete UI control? → Use ACK
- Building a SaaS analytics studio? → Use ACK
- Just displaying data? → Use standard embedding or Flex

## Choose the Right Path

| Goal | Path |
|---|---|
| Give end-users a full out-of-the-box editor quickly | **Path A — Embedded Dashboard Editor** |
| Build a branded, component-by-component configuration UI | **Path B — Analytics Components Kit (ACK)** |
| Programmatically create or modify dashboards via API | **Path C — Dashboard API** |

Read only the reference file for the chosen path.

- Path A + B: `references/embedded-editor.md`
- Path C: `references/dashboard-api.md`

## ACK Component Overview

When building with ACK (Path B), these are the key components available:

| User need | Component | Doc |
|---|---|---|
| Browse/drag dataset fields | `luzmo-data-field-panel` | `ack--components--data-fields.md` |
| Assign fields (drag) | `luzmo-item-slot-drop-panel` | `ack--components--data-slots.md` |
| Assign fields (dropdown) | `luzmo-item-slot-picker-panel` | `ack--components--data-picker.md` |
| Chart appearance options | `luzmo-item-option-panel` | `ack--components--item-options.md` |
| Add/edit filters | `luzmo-filters` | `ack--components--filters--luzmo-filters.md` |
| Render one chart | `luzmo-embed-viz-item` | `ack--components--chart-rendering--luzmo-embed-viz-item.md` |
| Multi-chart grid (renders) | `luzmo-item-grid` | `ack--components--chart-rendering--luzmo-item-grid.md` |

Full component documentation: `references/embedded-editor.md`

## Key Facts (all paths)

- ACK requires the **"Analytics Components Kit" addon** in the Luzmo license. License errors → contact support@luzmo.com.
- Individual ACK configuration components **do NOT render** charts — you must use a separate rendering component (`<luzmo-embed-viz-item>` or `<luzmo-item-grid>`). Exception: `<luzmo-item-grid>` is an ACK component that provides built-in rendering for multi-chart layouts.
- **Your application owns the state** — ACK emits events, your app stores `slotsContents`, `options`, `filters`.
- Keep ACK `item-type` and rendering component `type` synchronized.
- Dashboard `contents` is **always fully replaced** on update — retrieve first, then patch, then send.
- All user-facing text fields (`title`, `label`, etc.) must be localized objects: `{ "en": "..." }`.
- **CORS — same-domain requirement:** For web component dashboards in embed mode, Flex charts, and IQ widgets, `appServer` and `apiHost` must be on the **same domain** as the parent application, not just the correct Luzmo region URL. If same-domain hosting is not possible, the user can contact `support@luzmo.com` to arrange a CNAME (e.g. `analytics.example.com` → Luzmo app server, `analytics-api.example.com` → Luzmo API). EU and US also use different base URLs that cannot be mixed.

## Common Mistakes

Each pitfall below includes a frequency marker, the symptom you'll see, why it fails, and the fix.

**❌ Treating ACK as a renderer (⚠️ VERY COMMON — the #1 ACK failure):**
```html
<!-- Wrong - no chart will appear -->
<luzmo-item-slot-drop-panel item-type="bar-chart" />
```
You'll see: ACK UI renders, user can drop fields, no chart ever appears, no error in console.
**Why this fails:** ACK components produce configuration STATE — they do not render charts. The configured state must be captured by your app and passed into a separate Embed rendering component.
**✅ Always pair ACK with rendering component:**
```html
<!-- Correct - ACK configures, Flex renders -->
<luzmo-item-slot-drop-panel item-type="bar-chart" />
<luzmo-embed-viz-item type="bar-chart" :slots="slots" />
```

**❌ Letting ACK manage state:**
```javascript
// Wrong - assuming ACK stores the configuration
<luzmo-item-slot-drop-panel />
// Later: where is my slot configuration?
```
**✅ Your app owns and stores the state:**

```vue
<!-- Vue example -->
<!-- Correct - capture and store in your app -->
<script>
const slots = ref([])
</script>

<template>
  <luzmo-item-slot-drop-panel 
    @slot-change="(e) => slots = e.detail.slots"
  />
</template>
```

**❌ Mismatched item-type and rendering type:**
```html
<!-- Wrong - ACK configured as bar, but rendering line -->
<luzmo-item-slot-drop-panel item-type="bar-chart" />
<luzmo-embed-viz-item type="line-chart" :slots="slots" />
```
**✅ Keep types synchronized:**
```html
<!-- Correct - both use same chart type -->
<luzmo-item-slot-drop-panel item-type="bar-chart" />
<luzmo-embed-viz-item type="bar-chart" :slots="slots" />
```

**❌ CORS errors because `appServer`/`apiHost` are not on the same domain as the app:**

You'll see: dashboard or chart fails to load, browser console shows CORS errors even though region URLs look correct.
**Why this fails:** Web component dashboards in embed mode, Flex charts, and IQ widgets require `appServer` and `apiHost` to be on the same domain as the parent application — not just the correct Luzmo region URL (e.g. `app.luzmo.com` will cause CORS if the parent is on `app.example.com`).
**✅ Solutions:**
1. Host your app and configure `appServer`/`apiHost` to point to the correct same-domain URLs.
2. If that's not possible, contact `support@luzmo.com` to set up a CNAME — they can map a subdomain you own (e.g. `analytics.example.com`) to the Luzmo app server, and `analytics-api.example.com` to the Luzmo API. EU and US have different base URLs; never mix them.

**❌ Using viewer token for Embedded Dashboard Editor (EDE) (⚠️ COMMON):**
```javascript
// Wrong - viewer cannot use EDE
const token = await client.create('authorization', {
  type: 'embed',
  role: 'viewer', // cannot use EDE
})
```
You'll see: 403 Forbidden when the dashboard component tries to load the editor UI (EDE) when the token has role: 'viewer'. This is not enforced for custom editor experiences built with ACK components.
**Why this fails:** EDE requires the editing-capable roles `designer` or `owner`. Viewer is intentionally restricted to read-only.
**✅ Use designer or owner role:**
```javascript
// Correct - designer can use EDE
const token = await client.create('authorization', {
  type: 'embed',
  role: 'designer', // can use EDE
})
```

## Bundled References

For deeper, focused guidance on specific paths:

- `references/embedded-editor.md` — Path A (Embedded Dashboard Editor with `editMode`) and Path B (Analytics Components Kit). Includes ACK installation, component API references, state management patterns, and the configure→store→render workflow.
- `references/dashboard-api.md` — Path C (Dashboard API for programmatic dashboard creation/modification). Covers dashboard `contents` structure, view/screenmode configuration, and CRUD recipes for charts and filters.

## Avoid

- Using ACK components for view-only embedding — ACK is for editors; use `core` for read-only dashboard display.
- Generating viewer tokens for ACK workflows — ACK requires designer or owner role.
- Storing chart state inside ACK instead of in the host application (ACK emits events; your app owns state).
- Inventing ACK event or prop names without fetching the current component API documentation.

## Hand Off

**When to escalate to other skills:**

- WHEN the user only wants to VIEW a dashboard (no editing) → use `core`
- WHEN the user asks about embed tokens, roles, or auth setup → use `core`
- WHEN the editor is exposed to multiple tenants → use `multitenancy` (SECURITY CRITICAL — tenant filters must be enforced server-side)
- WHEN the user wants to brand/style the editor or charts → use `theming`
- WHEN the user needs to ingest or model data first → use `data-integration`
- WHEN the user wants AI/natural-language data Q&A inside the studio → use `ai-analytics`
- WHEN the user writes server-side scripts for dashboard CRUD (search, delete, associate) → use `resource-management`
- WHEN ACK doesn't render or editor behavior is broken → use `troubleshooting` FIRST

**This skill does NOT cover:**

- View-only dashboard embedding (use `core`)
- Auth/embed-token generation details (use `core`)
- Data source connection or dataset creation (use `data-integration`)

## Canonical Sources

- Index: `https://developer.luzmo.com/llms.txt`, `https://developer.luzmo.com/llms-full.txt`
- API: `https://developer.luzmo.com/api/{action}{Resource}.md`
- Guides: `https://developer.luzmo.com/guide/*.md`
- Flex charts: `https://developer.luzmo.com/flex/charts/{type}.md`

If content exists on developer.luzmo.com, link — do not duplicate specs here.
