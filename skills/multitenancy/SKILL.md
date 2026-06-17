---
name: multitenancy
description: >-
  Multi-tenant data isolation - critical security skill for SaaS applications.
  Use whenever each user or customer must see only their own data.
  Triggers on: row-level security, tenant isolation, "users see each other's data", "data leak", per-customer filtering, designer/owner access with data isolation.
  Covers three isolation patterns with tradeoffs.
  Use eagerly - wrong isolation is a security breach, not a bug.
  Pair with foundation for token generation and data-integration for connection-level overrides.
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

### Pattern Security Levels

Understanding the security implications of each pattern is essential:

```
Security Level Comparison
─────────────────────────────────────────────────────────────────────────

Pattern 1: Dataset-Level EmbedFilterGroup     [STRONGEST]
 ├─ Enforced at the dataset itself
 ├─ Editors (designer/owner) CANNOT bypass
 └─ One group per Luzmo org

Pattern 3: Connection Overrides                [STRONGEST]
 ├─ Physical/logical infra isolation
 ├─ Each tenant queries its own DB/schema
 └─ Override account credentials per token

Pattern 2: Token-Level filters                 [WEAKER]
 ├─ Enforced at query time via the token
 ├─ Editors CAN potentially bypass
 └─ Only safe for strictly viewer-role users

Dashboard-Level Filters                        [INSECURE — DO NOT USE]
 ├─ Live in dashboard JSON
 ├─ Anyone with edit rights can remove
 └─ DO NOT use for tenant isolation
```

**Pattern 1 (Dataset-Level EmbedFilterGroup)** — **STRONGEST**
- Filter is enforced at the dataset level, part of the data model itself
- Users with `designer` or `owner` roles **CANNOT bypass** it
- Applies to all queries against the dataset, regardless of where it's used
- **Use this when:** Users have editor access OR security is paramount

**Pattern 2 (Token-Level `filters`)** — **WEAKER**
- Filter is enforced at query time via the embed token
- Editors with designer/owner roles CAN potentially bypass these filters
- Only appropriate for view-only scenarios
- **Use this when:** All users are strictly view-only (`viewer` role)

**Pattern 3 (Connection Overrides)** — **STRONGEST** (by infrastructure isolation)
- Complete data infrastructure separation per tenant
- Physical/logical isolation at the database level
- **Use this when:** Each tenant has a separate database/schema/connection

### Decision Tree

```
Do your tenants share the same database tables?
├─ YES: Do users have editor access (designer/owner roles)?
│   ├─ YES: Use Pattern 1 (Dataset-Level EmbedFilterGroup) - STRONGEST
│   └─ NO: Can use Pattern 2 (Token filters) - but Pattern 1 is still safer
│
└─ NO: Each tenant has separate database/schema?
    └─ YES: Use Pattern 3 (Connection Overrides)
```

## Choose the Right Pattern

| Data model | Pattern | Detailed reference |
|---|---|---|
| All tenants share the same tables, filtered by a column | **Pattern 1 — Parameter filtering (STRONGEST)** | `references/pattern1-dataset-level.md` |
| Token-level filter enforcement without a dataset-level filter group | **Pattern 2 — Token filters (WEAKER)** | `references/pattern2-token-filters.md` |
| Each tenant has a separate database, schema, or connection | **Pattern 3 — Connection overrides (`account_overrides`) (STRONGEST via infra)** | `references/pattern3-connection-overrides.md` |

Read only the reference file for the chosen pattern.

---

## Pattern 1 — Dataset-Level Parameter Filtering (RECOMMENDED for shared datasets)

This is the **strongest protection**: the filter is enforced at the dataset level, so even users with editor access cannot remove it.

**Why this is strongest:**
- Filter is part of the dataset itself, not just the dashboard
- Users with `designer` or `owner` role cannot bypass it
- Applies to all queries against the dataset, regardless of where it's used

Docs:
```
https://developer.luzmo.com/guide/dashboard-embedding--handling-multi-tenant-data--parameter-filtering.md
https://developer.luzmo.com/api/createEmbedFilterGroup.md
https://developer.luzmo.com/api/associateEmbedFilterGroup.md
https://developer.luzmo.com/api/createAuthorization.md
```

Steps:
1. Create an `EmbedFilterGroup` that defines the filter expression with a parameter placeholder.
2. Associate the filter group to the dataset (`associateEmbedFilterGroup`).
3. When generating the embed token (`createAuthorization`), pass `parameter_overrides` with the tenant-specific value.

**Critical limitation:** `EmbedFilterGroup` is limited to **one group per organization**. Plan your filter structure carefully.

**Key facts:**
- One `EmbedFilterGroup` per Luzmo organization (not per dataset)
- Can associate the same filter group to multiple datasets
- `parameter_overrides` can also clear a parameter: `{ "clear": true }`
- Prefer this over dashboard-level filters for any editor scenario

---

## Pattern 2 — Token-Level `filters`

Use when you want the embed token itself to enforce query-level filters without a dataset-level filter group.

**⚠️ Security note:** This pattern is weaker than Pattern 1. Users with `designer` or `owner` roles may be able to bypass token-level filters. Only use this for strictly view-only scenarios.

Docs: `https://developer.luzmo.com/api/createAuthorization.md`

**Minimal example:**
```javascript
const token = await client.create('authorization', {
  type: 'embed',
  username: 'user@example.com',
  name: 'John Doe',
  email: 'user@example.com',
  access: { datasets: ['<dataset-id>'] },
  role: 'viewer',  // Important - only safe for viewer role
  filters: [
    {
      condition: 'and',
      rules: [
        {
          expression: '? = ?',
          parameters: [
            { columnId: '<tenant-column-id>', datasetId: '<dataset-id>' },
            'tenant-123'
          ]
        }
      ]
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

Always fetch both the connection overrides guide AND the specific plugin documentation before configuring overrides.

---

## Important Facts

- All multi-tenant logic lives in the server-side `createAuthorization` call.
- Dataset-level filtering (Pattern 1) is the recommended approach when users must not be able to bypass the filter.
- Dashboard-level filters are weaker — an editor can remove them. Use dataset-level instead.
- `account_overrides` is the documented property name (not `connectionOverrides` or similar).
- Plugin-specific overrides: fetch the plugin docs too.

## Hand Off

**When to escalate to other skills:**

- WHEN the user needs full auth/embed-token setup or SDK choice → use `core`
- WHEN the user is ready to embed a dashboard/chart after isolation is configured → use `core` (saved dashboards) or `data-visualization` (Flex)
- WHEN the user is building a self-service editor with ACK (editors can bypass weak filters!) → use `analytics-studio`
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
**✅ Use dataset-level EmbedFilterGroup instead:**
```javascript
// Correct - enforced at dataset level, cannot be bypassed
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

**❌ Forgetting that Pattern 2 is weaker than Pattern 1:**
```javascript
// Pattern 2 (token filters) - editors CAN bypass this
token.filters = [{ expression: "tenant_id = '123'" }]
```
**✅ Understand security implications:**
```javascript
// Pattern 1 (dataset-level) - editors CANNOT bypass
// Use Pattern 1 when users have designer/owner roles
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
