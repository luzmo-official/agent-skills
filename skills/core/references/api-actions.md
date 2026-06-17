# Luzmo API Actions Reference

The Luzmo API uses POST-only with an `action` field in the body — never REST verbs (GET/PUT/PATCH/DELETE). This file shows the shape of each action with examples.

## Valid Actions

| Action | Purpose | Notes |
|---|---|---|
| `create` | Create a new resource | Returns the created object with `id` |
| `get` | Search/retrieve resources | Replaces "search" — `action: "search"` does NOT exist |
| `update` | Modify an existing resource | Most resources are partially updatable via `find` + properties |
| `delete` | Remove a resource | IRREVERSIBLE — always show & confirm first |
| `associate` | Link two resources (e.g. securable → collection) | |
| `dissociate` | Unlink two resources | |

## Common Shape

```javascript
{
  key: API_KEY,
  token: API_TOKEN,
  version: '0.1.0',
  action: 'get',
  // resource-specific params below
}
```

When using the SDK, the `key`/`token`/`version` are injected automatically and you call methods directly:

```javascript
await client.get('securable', { find: { where: { id: '...' } } });
```

## `create`

```javascript
await client.create('securable', {
  type: 'dashboard',
  name: { en: 'My Dashboard' },
});
```

## `get` (replaces "search")

```javascript
await client.get('securable', {
  find: {
    where: { type: 'dashboard' },
    attributes: ['id', 'name', 'created_at'],
    limit: 50,
    offset: 0,
  },
});
```

### Including associated models

```javascript
await client.get('dataset', {
  find: { where: { id: '...' } },
  include: [
    { model: 'Column' },
    { model: 'Account' },
  ],
});
```

Response property naming — included models are returned as lowercase plural:

| Included Model | Response Property |
|---|---|
| `Column` | `columns` |
| `Securable` | `securables` |
| `User` | `users` |
| `Account` | `accounts` |

## `update`

```javascript
await client.update('securable', dashboardId, {
  name: { en: 'New name' },
});
```

For resources with a `contents` JSON (dashboards), `contents` is fully REPLACED on update — retrieve current contents, patch, then send. See `analytics-studio` for the retrieve-patch-send cycle.

## `delete`

```javascript
await client.delete('securable', dashboardId);
```

ALWAYS show what will be deleted and require explicit confirmation before calling. See `resource-management` for the mandatory two-step deletion safety pattern.

## `associate` / `dissociate`

```javascript
await client.associate(
  'securable',
  dashboardId,
  { role: 'Collections', id: collectionId }
);
```

Collection inheritance is the usual embed-access pattern (scales more naturally with the number of datasets/dashboards); fetch `createAuthorization.md` when deciding whether tokens should use collection access or direct `datasets` / `dashboards` entries.

Each resource has its own associate/dissociate docs — fetch `https://developer.luzmo.com/api/associate{Resource}.md`.

## When in Doubt

Fetch the action+resource-specific doc:
- Pattern: `https://developer.luzmo.com/api/{action}{Resource}.md`
- Examples: `createAuthorization.md`, `searchDataset.md` (despite the URL name, action is still `get`), `updateDashboard.md`, `deleteDataprovider.md`

**IMPORTANT:** Always read the resources those docs reference inline — the canonical field shape often lives in a linked guide rather than the action doc itself.
