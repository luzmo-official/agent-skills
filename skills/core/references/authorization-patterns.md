# Authorization Token Patterns

Reference for common `createAuthorization` request shapes. Consult `https://developer.luzmo.com/api/createAuthorization.md` for the canonical, up-to-date field list. Use docs as guidance for implementation details only.

## Minimal Viewer Token

Use for read-only embed of a specific dashboard.

```javascript
const auth = await client.create('authorization', {
  type: 'embed',
  expiry: '2026-05-22T16:00:00Z',  // RFC 3339 timestamp
  role: 'viewer',
  username: user.id,        // stable identifier
  name: user.name,
  email: user.email,
  access: {
    dashboards: [{ id: dashboardId, rights: 'read' }],
  },
});

// Send to client: { authKey: auth.id, authToken: auth.token }
```

## Designer Token (Editor)

Use when the end-user must be able to edit charts (ACK or `editMode`).

```javascript
const auth = await client.create('authorization', {
  type: 'embed',
  role: 'designer',          // 'viewer' cannot edit; 'designer' can; 'owner' can also delete
  username: user.id,
  name: user.name,
  email: user.email,
  access: {
    dashboards: [{ id: dashboardId, rights: 'modify' }],
    datasets: [{ id: datasetId, rights: 'use' }],
  },
});
```

## Multi-Tenant Data Isolation

If each customer or tenant must only see their own data, use the `multitenancy` skill. It is the single source of truth for tenant-isolation patterns and implementation details.

## Suborganization Scoping

Use to isolate the user pool within an organization (e.g. per-store user lists).

```javascript
suborganization: user.tenant_id,
```

## Theme / CSS Override

Apply branding per token without creating a Theme resource.

```javascript
theme: { ... },   // full theme JSON
css: 'body { ... }',
```

## Advanced Properties

### IQ Context (System Prompt)

Customize IQ behavior with custom instructions:

```javascript
iq: {
  context: 'You are a financial analyst assistant. Always format currency as USD.'
}
```

### Dashboard Version Control

Pin to a specific dashboard version:

```javascript
environment: 'production' // one of: production, acceptance, development, qa
```

### Hidden Columns

Hide specific columns from end-users:

```javascript
hidden_columns: ['<column-uuid-1>', '<column-uuid-2>']
```

### Feature Overrides

Enable/disable specific features:

```javascript
feature_overrides: ['!flag_export']
```

Consult `https://developer.luzmo.com/api/createAuthorization.md` and the linked Academy feature-flags article before choosing flag names.

### Inactivity Interval

Auto-expire the session after inactivity:

```javascript
inactivity_interval: 3600  // seconds; minimum 120 when specified; default is 0 (no inactivity timeout)
```

### Advanced Parameter Overrides

```javascript
parameter_overrides: {
  tenant_id: {
    value: user.tenant_id,
    sensitive: true,  // Hide from URL/logs
    sticky: true      // Persist across navigation
  }
}
```

## Expiry

Default 24h. Maximum 1 year. Use short expiry whenever possible and refresh via your backend.

```javascript
expiry: '2026-05-21T17:00:00Z'   // RFC 3339 timestamp required
```

## Response Shape

```javascript
{
  id: '<embed-key>',     // → authKey on the frontend
  token: '<embed-token>' // → authToken on the frontend
}
```

NEVER pass `LUZMO_API_KEY` / `LUZMO_API_TOKEN` to the frontend — only `auth.id` and `auth.token`.

**IMPORTANT:** When consulting `https://developer.luzmo.com/api/createAuthorization.md`, also use relevant related docs it references (e.g. multi-tenant guides, parameter filtering docs) to confirm exact field shapes. Use linked docs for Luzmo implementation details only.
