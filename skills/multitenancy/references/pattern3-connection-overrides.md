# Pattern 3 — Connection Overrides (`account_overrides`)

For when each tenant has their own database, schema, table, or plugin configuration — data is NOT shared at the row level.

## Use Cases

- Each customer has their own database instance
- Each tenant has a separate schema in the same database
- Each tenant uses a different SaaS plugin account (e.g. their own Salesforce org)
- Complete data infrastructure isolation per tenant

## Docs

- `https://developer.luzmo.com/guide/dashboard-embedding--handling-multi-tenant-data--connection-overrides.md`
- `https://developer.luzmo.com/api/createAuthorization.md`

Always fetch the relevant plugin-specific docs too if you're overriding a plugin connection.

## Property Name (CRITICAL)

The property is **`account_overrides`** — NOT `connectionOverrides`, NOT `connection_overrides`. The wrong name silently does nothing.

## Database Connection Override

```javascript
const auth = await client.create('authorization', {
  type: 'embed',
  username: user.id,
  account_overrides: [
    {
      account_id: '<base-account-uuid>',
      properties: {
        host: tenant.db_host,
        database: tenant.db_name,
        schema: tenant.db_schema,
        // user/password if per-tenant credentials
      },
    },
  ],
});
```

Only override the properties that change per tenant — the base account supplies defaults for the rest.

## Plugin Connection Override

Plugin connections override plugin-specific configuration (API keys, account IDs, OAuth tokens) — the field shape depends on the plugin. Fetch the plugin doc to confirm.

```javascript
account_overrides: [
  {
    account_id: '<plugin-account-uuid>',
    properties: {
      // plugin-specific keys, e.g. Salesforce:
      instance_url: tenant.sf_instance,
      access_token: tenant.sf_token,
    },
  },
]
```

## Combining Patterns

You can combine Pattern 3 with Pattern 1 — for example, when each tenant has their own schema AND further filtering inside that schema. Stack `account_overrides` and `parameter_overrides` in the same `createAuthorization` request.

## Verification

After setup, generate a token for tenant A and confirm queries hit tenant A's database. Generate a token for tenant B and confirm queries hit tenant B's database. Verify by checking the underlying database query logs if possible.

**IMPORTANT:** Fetch the docs listed above and any plugin-specific docs they reference before generating production code.
