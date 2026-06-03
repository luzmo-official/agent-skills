# Authorization Token Patterns

Reference for common `createAuthorization` request shapes. Fetch `https://developer.luzmo.com/api/createAuthorization.md` for the canonical, up-to-date field list — and any guides it references.

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
    dashboards: [{ id: dashboardId, rights: ['read'] }],
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
    dashboards: [{ id: dashboardId, rights: ['use', 'modify'] }],
    datasets: [{ id: datasetId, rights: ['use'] }],
  },
});
```

## Multi-Tenant Token (Pattern 1: parameter_overrides)

Use with a dataset-level `EmbedFilterGroup`. See `multitenancy` for the full pattern.

```javascript
const auth = await client.create('authorization', {
  type: 'embed',
  role: 'viewer',
  username: user.id,
  parameter_overrides: {
    tenant_id: user.tenant_id,
    region: user.region,
  },
});
```

## Multi-Tenant Token (Pattern 2: token filters)

Weaker — editors can bypass. See `multitenancy`.

```javascript
filters: [
  { expression: '? = ?', parameters: [{ column_id: '...' }, user.tenant_id] }
]
```

## Multi-Tenant Token (Pattern 3: account_overrides)

For per-tenant connection swaps. See `multitenancy`.

```javascript
account_overrides: [
  { account_id: '<account-uuid>', properties: { database: user.tenant_db } },
]
```

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
environment: '<environment-uuid>'  // Dashboard version/environment
```

### Hidden Columns

Hide specific columns from end-users:

```javascript
hidden_columns: ['<column-uuid-1>', '<column-uuid-2>']
```

### Feature Overrides

Enable/disable specific features:

```javascript
feature_overrides: {
  export: false,
  share: false
}
```

### Inactivity Interval

Auto-expire the session after inactivity:

```javascript
inactivity_interval: '1h'  // RFC 3339 duration
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

**IMPORTANT:** When fetching `createAuthorization.md`, also fetch any related docs it references (e.g. multi-tenant guides, parameter filtering docs) to confirm exact field shapes.
