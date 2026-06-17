---
name: multitenancy
description: >-
  Multi-tenant data isolation - critical security skill for SaaS applications.
  Use whenever each user or customer must see only their own data.
  Triggers on: row-level security, tenant isolation, "users see each other's data", "data leak", per-customer filtering, designer/owner access with data isolation.
  Covers three isolation patterns with tradeoffs.
  Use eagerly - wrong isolation is a security breach, not a bug.
  Pair with core for token generation and data-integration for connection-level overrides.
metadata:
  author: Luzmo
  version: 0.1.0
  last_updated: 2026-05-21
---

# Luzmo Multitenancy

Entry-point for multi-tenant embedding and data isolation. Security-critical - use when embedded end-users must only see their own tenant's data.

## Core Principles (Non-Negotiable)

### Security Rule

**All multi-tenant filtering is configured SERVER-SIDE in the authorization token request — never in client-side code.**

For full auth/embed-token guidance, see `core`.

### Pattern Comparison

Understanding enforcement and operational tradeoffs is essential:

```
Isolation Pattern Comparison
─────────────────────────────────────────────────────────────────────────

Pattern 1: Parameterized EmbedFilterGroup      [SECURE, LESS VERBOSE]
 ├─ Filter definitions are configured on dataset associations
 ├─ Tokens pass tenant values through parameter_overrides
 └─ One parameter can drive filters across one or more datasets

Pattern 3: Connection Overrides                [STRONGEST]
 ├─ Physical/logical infra isolation
 ├─ Each tenant queries its own DB/schema
 └─ Override account credentials per token

Pattern 2: Token-Level filters                 [SECURE, MORE VERBOSE]
 ├─ Filters are specified directly in the token
 ├─ Must include a filter for every dataset that needs isolation
 └─ Must be extended whenever token access adds more datasets

Dashboard-Level Filters                        [INSECURE — DO NOT USE]
 ├─ Live in dashboard JSON
 ├─ Anyone with edit rights can remove
 └─ DO NOT use for tenant isolation
```

**Pattern 1 (Parameterized EmbedFilterGroup)** — **SECURE, LESS VERBOSE**
- Filter definitions are configured once on each dataset association
- Tokens only pass tenant-specific values through `parameter_overrides`
- One parameter can override a set of parameterized filters on one or more datasets
- **Use this when:** Multiple datasets need the same tenant parameter OR dataset access may expand over time

**Pattern 2 (Token-Level `filters`)** — **SECURE, MORE VERBOSE**
- Filters are specified directly in the embed token
- Security is equivalent when every accessible dataset that needs tenant isolation has a matching token filter
- Operational risk: forgetting to add filters when granting access to additional datasets
- **Use this when:** A small, explicit dataset set is scoped in the token and direct per-dataset filters are simpler than configuring parameterized filters

**Pattern 3 (Connection Overrides)** — **STRONGEST** (by infrastructure isolation)
- Complete data infrastructure separation per tenant
- Physical/logical isolation at the database level
- **Use this when:** Each tenant has a separate database/schema/connection

### Decision Tree

```
Do your tenants share the same database tables?
├─ YES: Will multiple datasets share the same tenant parameter?
│   ├─ YES: Prefer Pattern 1 (Parameterized EmbedFilterGroup)
│   └─ NO: Pattern 2 (Token filters) is fine when every accessible dataset is filtered
│
└─ NO: Each tenant has separate database/schema?
    └─ YES: Use Pattern 3 (Connection Overrides)
```

## Choose the Right Pattern

| Data model | Pattern |
|---|---|
| Row-level security for shared datasets with parameterized embed filters (multi-tenant data sources) | **Pattern 1 — Parameterized embed filters** |
| Row-level security via static token-level filters for specified datasets (multi-tenant data sources) | **Pattern 2 — Static token filters** |
| Each tenant has a separate database, schema, or connection (single-tenant data sources) | **Pattern 3 — Connection overrides (`account_overrides`)** |

---

## Pattern 1 — Parameterized EmbedFilterGroup (recommended for shared parameters)

This is the most maintainable pattern when one tenant parameter should apply to one or more dataset-level filters.

**Why this is usually preferred:**
- Filter definitions are configured on dataset associations, not repeated in every token
- One `parameter_overrides` value can drive filters across multiple datasets
- Adding another dataset means associating/configuring the parameterized filter for that dataset, not rebuilding every token filter list

Docs:
```
https://developer.luzmo.com/guide/dashboard-embedding--handling-multi-tenant-data--parameter-filtering.md
https://developer.luzmo.com/api/createEmbedFilterGroup.md
https://developer.luzmo.com/api/associateEmbedFilterGroup.md
https://developer.luzmo.com/api/createAuthorization.md
```

Steps:
1. [One-off setup] Create the single organization-level `EmbedFilterGroup`.
2. [One-off setup] Associate the filter group to each dataset (`associateEmbedFilterGroup`) and put the parameterized filter definitions on that association.
3. For each Embed Authorization token request (`createAuthorization`), pass `parameter_overrides` with the tenant-specific value.

**Setup example:**
```javascript
const group = await client.create('embedfiltergroup', {});

await client.associate(
  'embedfiltergroup',
  group.id,
  { role: 'Securables', id: datasetId },
  {
    filters: [
      {
        clause: 'where',
        origin: 'global',
        securable_id: datasetId,
        column_id: tenantColumnId,
        expression: '? in ?',
        value: {
          parameter: 'metadata.tenant_id',
          type: 'array[hierarchy]',
          value: [defaultTenantId],
        },
      },
    ],
  }
);
```

**Token example:**
```javascript
const auth = await client.create('authorization', {
  type: 'embed',
  role: 'designer',
  username: user.id,
  access: {
    datasets: [{ id: datasetId, rights: 'use' }],
  },
  parameter_overrides: {
    tenant_id: [user.tenant_id],
  },
});
```

**Critical limitation:** `EmbedFilterGroup` is limited to **one group per organization**. Each dataset needs to be associated with the same group with one or more (parameterized) filters.

**Key facts:**
- One `EmbedFilterGroup` per Luzmo organization (not per dataset)
- Can associate the same filter group to multiple datasets
- `parameter_overrides` can also clear a parameter: `{ "clear": true }` (useful to e.g. only apply a subset of the filters for specific users)
- Prefer this over dashboard-level filters; dashboard-level filters are editable and not an isolation boundary

---

## Pattern 2 — Token-Level `filters`

Use when you want the embed token itself to enforce query-level filters without a dataset-level filter group.

**Important operational note:** Token filters are equally secure when complete, but more verbose than Pattern 1. Specify a filter for every dataset in the token's `access.datasets` that needs tenant isolation, and extend the filter list whenever you grant access to more datasets.

Docs: `https://developer.luzmo.com/api/createAuthorization.md`

**Minimal example:**
```javascript
const token = await client.create('authorization', {
  type: 'embed',
  username: 'user@example.com',
  name: 'John Doe',
  email: 'user@example.com',
  access: {
    datasets: [{ id: '<dataset-id>', rights: 'use' }],
  },
  role: 'viewer',
  filters: [
    {
      clause: 'where',
      origin: 'global',
      securable_id: '<dataset-id>',
      column_id: '<tenant-column-id>',
      expression: '? = ?',
      value: 'tenant-123',
    }
  ]
})
```

Fetch the `createAuthorization` doc for the complete filter expression shape and available operators.

---

## Pattern 3 — Connection Overrides (`account_overrides`) for Single-Tenant Data Sources

Use when each tenant has their own database, schema, table, or plugin configuration — the data is not shared at the row level.

**Use cases:**
- Each customer has their own database instance
- Each tenant has a separate schema in the same database
- Each tenant uses a different SaaS plugin account
- Complete data infrastructure isolation per tenant

Docs:
```
https://developer.luzmo.com/guide/dashboard-embedding--handling-multi-tenant-data--connection-overrides.md
https://developer.luzmo.com/api/createAuthorization.md
```

**Important:** The property name is **`account_overrides`** (not `connectionOverrides` or `connection_overrides`).

Configuration differences:
- **Standard database connections**: Override host, database, schema, credentials
- **Plugin connections**: Override plugin-specific configuration (API keys, account IDs, etc.)

**Database connection example:**
```javascript
const auth = await client.create('authorization', {
  type: 'embed',
  username: user.id,
  access: {
    datasets: [{ id: datasetId, rights: 'use' }],
  },
  account_overrides: {
    '<base-connection-uuid>': {
      host: tenant.db_host,
      database: tenant.db_name,
      schema: tenant.db_schema,
    },
  },
});
```

**Plugin connection example:**
```javascript
account_overrides: {
  '<plugin-connection-uuid>': {
    properties: {
      instance_url: tenant.sf_instance,
      access_token: tenant.sf_token,
    },
  },
}
```

Always fetch both the connection overrides guide AND the specific plugin documentation before configuring overrides.

---

## Important Facts

- All multi-tenant logic lives in the server-side `createAuthorization` call.
- Parameterized filtering (Pattern 1) is the recommended approach when one tenant parameter should apply across one or more datasets.
- Dashboard-level filters are weak and insecure — an editor can remove them. Use dataset-level filtering instead (either parameterized embed filters or static token filters).
- `account_overrides` is the documented property name (not `connectionOverrides` or similar).
- Plugin-specific overrides: fetch the plugin docs too.

## Hand Off

**When to escalate to other skills:**

- WHEN the user needs full auth/embed-token setup or SDK choice → use `core`
- WHEN the user is ready to embed a dashboard/chart after isolation is configured → use `core` (saved dashboards) or `data-visualization` (Flex)
- WHEN the user is building a self-service editor with ACK → use `analytics-studio`
- WHEN each tenant has its own data source/database/schema → also use `data-integration` for connection setup
- WHEN per-tenant theming is needed alongside data isolation → use `theming`
- WHEN IQ tokens need per-tenant scoping → also use `ai-analytics`
- WHEN automating EmbedFilterGroup creation/association via scripts → use `resource-management`
- WHEN there's already a suspected tenant-data leak symptom → use `troubleshooting` FIRST to confirm, then return here for the fix

**This skill does NOT cover:**

- General auth or API setup (use `core`)
- Single-tenant or public dashboards (no isolation needed)
- Dataset modeling unrelated to filtering (use `data-integration`)

## Common Mistakes

Each pitfall below includes a frequency marker, the symptom you'll see, why it fails, and the secure alternative. ⚠️ Wrong patterns here cause real data breaches.

**❌ Using dashboard-level filters for tenant isolation (⚠️ VERY COMMON — SECURITY CRITICAL):**
```javascript
// Wrong - editors can remove dashboard filters
dashboard.filters = [{ expression: "tenant_id = '123'" }]
```
You'll see: users with `designer`/`owner` roles successfully removing or modifying the filter and viewing other tenants' rows. No error appears.
**Why this fails:** Dashboard-level filters live in the dashboard JSON. Anyone with edit permission on the dashboard can change them. This is a data-breach-in-waiting whenever editor roles are exposed.
**✅ Use server-side token/query enforcement instead:**
```javascript
// Correct - Pattern 1 centralizes the tenant filter definition
await client.create('embedfiltergroup', {
  expression: 'tenant_id = ?',
  parameters: [{ name: 'tenant_id' }]
})

// In authorization:
parameter_overrides: { tenant_id: '123' }
```

**❌ Using wrong property name for connection overrides (⚠️ COMMON — silent failure):**
```javascript
// Wrong - property names
connectionOverrides: {...}
connection_overrides: {...}
```
You'll see: NO error. The token is issued, queries run, and they hit the BASE account's database — meaning every tenant sees the same (often the default) data. Detected only when a tenant complains about wrong data.
**Why this fails:** Luzmo ignores unknown properties on `createAuthorization`. The misspelling silently does nothing.
**✅ Use exact property name:**
```javascript
// Correct
account_overrides: {...}
```

**❌ Implementing tenant filtering in client-side code:**
```javascript
// Wrong - client-side filtering is not secure
const userTenantId = getCurrentUser().tenantId
<luzmo-embed-dashboard filters={[{tenant_id: userTenantId}]} />
```
**✅ Enforce tenant filtering server-side in token:**
```javascript
// Correct - server-side token generation
const token = await client.create('authorization', {
  parameter_overrides: { tenant_id: user.tenantId }
})
// Send token.id and token.token to client
```

**❌ Creating multiple EmbedFilterGroups:**
```javascript
// Wrong - only one EmbedFilterGroup per organization
await client.create('embedfiltergroup', { expression: 'tenant_id = {{tid}}' })
await client.create('embedfiltergroup', { expression: 'region = {{r}}' })  // Will fail
```
**✅ Use a single EmbedFilterGroup with multiple parameters:**
```javascript
// Correct - one group, multiple parameters
await client.create('embedfiltergroup', {
  expression: 'tenant_id = {{tenant_id}} AND region = {{region}}'
})

// Override both in token:
parameter_overrides: {
  tenant_id: '123',
  region: 'EU'
}
```

**❌ Forgetting to extend Pattern 2 filters when dataset access expands:**
```javascript
// Wrong - token grants two datasets but filters only one
access: { datasets: [{ id: ordersDatasetId, rights: 'use' }, { id: invoicesDatasetId, rights: 'use' }] },
filters: [{
  clause: 'where',
  origin: 'global',
  securable_id: ordersDatasetId,
  column_id: ordersTenantColumnId,
  expression: '? = ?',
  value: 'tenant-123',
}]
```
**✅ Keep Pattern 2 filters complete:**
```javascript
// Correct - every tenant-scoped dataset in access has a matching token filter
filters: [
  {
    clause: 'where',
    origin: 'global',
    securable_id: ordersDatasetId,
    column_id: ordersTenantColumnId,
    expression: '? = ?',
    value: 'tenant-123',
  },
  {
    clause: 'where',
    origin: 'global',
    securable_id: invoicesDatasetId,
    column_id: invoicesTenantColumnId,
    expression: '? = ?',
    value: 'tenant-123',
  },
]
```

## Avoid

- Presenting undocumented multi-tenant approaches as product guarantees.
- Suggesting dashboard-level filters as the primary isolation mechanism.
- Using client-side logic to enforce tenant isolation.
- Inventing `EmbedFilterGroup` or `account_overrides` payloads without fetching the exact API docs.
- Using property names other than `account_overrides` for connection overrides.
- Creating multiple `EmbedFilterGroup` resources (only one per organization is allowed).

## Canonical Sources

- Index: `https://developer.luzmo.com/llms.txt`, `https://developer.luzmo.com/llms-full.txt`
- API: `https://developer.luzmo.com/api/{action}{Resource}.md`
- Guides: `https://developer.luzmo.com/guide/*.md`
- Flex charts: `https://developer.luzmo.com/flex/charts/{type}.md`

If content exists on developer.luzmo.com, link — do not duplicate specs here.
