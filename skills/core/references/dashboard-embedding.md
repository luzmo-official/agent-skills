# Dashboard Embedding Reference

Complete reference for embedding Luzmo dashboards as a viewer or in edit mode.

## Required Docs

Fetch before answering:

- Token generation: `https://developer.luzmo.com/guide/dashboard-embedding--generating-an-authorization-token.md`
- Embedding overview: `https://developer.luzmo.com/guide/dashboard-embedding--embed-into-application.md`
- Framework install: `https://developer.luzmo.com/guide/dashboard-embedding--embed-into-application--install-a-luzmo-component.md`
- Minimal secure embed: `https://developer.luzmo.com/guide/dashboard-embedding--embed-into-application--embed-a-dashboard-securely.md`
- Dashboard component API: `https://developer.luzmo.com/guide/embedding--component-api-reference.md`

For editor flows, also fetch:
- Editor overview: `https://developer.luzmo.com/guide/dashboard-embedding--embedded-dashboard-editor.md`
- Editor token roles: `https://developer.luzmo.com/guide/dashboard-embedding--embedded-dashboard-editor--generate-an-embed-token-with-designer-role-and-rights.md`
- editMode values: `https://developer.luzmo.com/guide/dashboard-embedding--embedded-dashboard-editor--embed-the-dashboard-with-an-edit-mode.md`

Academy references: `https://academy.luzmo.com/article/06trr3t5`, `https://academy.luzmo.com/article/r9iqfbmf`, `https://academy.luzmo.com/article/j53aq50h`

## Packages by Framework

| Framework | Package |
|---|---|
| Web Components (vanilla JS) | `@luzmo/embed` |
| React | `@luzmo/react-embed` |
| Angular | `@luzmo/ngx-embed` |
| Vue | `@luzmo/vue-embed` |
| React Native | `@luzmo/react-native-embed` |

## Component Names

| Framework | Tag / Component |
|---|---|
| Vanilla JS | `<luzmo-embed-dashboard>` |
| Angular / Vue | `<luzmo-dashboard>` |
| React | `LuzmoDashboardComponent` |

## Minimal Required Props

`appServer`, `apiHost`, `authKey`, `authToken`, `dashboardId`

## Editor Roles and editMode

Token role controls what the user can do:

| Role | Capability |
|---|---|
| `viewer` | View only — cannot activate edit mode |
| `designer` | Edit charts and layout |
| `owner` | Same as designer + can favorite a dashboard variant on behalf of other users |

`editMode` is set on the frontend component. Fetch the editMode docs above for the full list of accepted values.

## Sizing

- Dashboards have variable height — add `overflow-y: auto` to the container if the page layout requires bounded height.
- Dashboards fill available container width. If not filling, check if `largeScreen` screen mode is configured in the dashboard.

## Rules

- Always generate embed tokens server-side — never put API credentials in the frontend.
- Match token `role` and resource rights to the intended `editMode`.
- For events, methods, or advanced properties: fetch the dashboard component API reference before answering.
- Do not use old component names like `<cumul-dashboard>`.

## Troubleshooting Common Issues

| Problem | Cause | Solution |
|---|---|---|
| Dashboard not rendering | Invalid authKey/authToken | Verify token is generated server-side and passed correctly |
| Dashboard not filling width | Missing `largeScreen` screen mode | Configure `largeScreen` in dashboard settings |
| Dashboard too tall | Variable height based on content | Add `overflow-y: auto` to container with fixed height |
| Edit mode not activating | Token role is `viewer` | Use `designer` or `owner` role in token |
| Component not found | Wrong component name for framework | Check component naming table in main skill |
