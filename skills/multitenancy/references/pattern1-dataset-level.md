# Pattern 1 — Dataset-Level `EmbedFilterGroup` (STRONGEST)

Filter enforced at the dataset itself. Editors with `designer`/`owner` roles CANNOT bypass it. Use when users have editor access OR security is paramount.

## Docs (fetch these and any guides they reference)

- `https://developer.luzmo.com/guide/dashboard-embedding--handling-multi-tenant-data--parameter-filtering.md`
- `https://developer.luzmo.com/api/createEmbedFilterGroup.md`
- `https://developer.luzmo.com/api/associateEmbedFilterGroup.md`
- `https://developer.luzmo.com/api/createAuthorization.md`

## Constraint

**One `EmbedFilterGroup` per Luzmo organization.** Plan accordingly — combine all tenant-isolation parameters into one group, do not create multiple groups.

## Steps

### Step 1 — Create the filter group

```javascript
await client.create('embedfiltergroup', {
  expression: 'tenant_id = ?',
  parameters: [{ name: 'tenant_id' }],
});
```

For multiple parameters in one group:

```javascript
await client.create('embedfiltergroup', {
  expression: 'tenant_id = ? AND region = ?',
  parameters: [
    { name: 'tenant_id' },
    { name: 'region' },
  ],
});
```

### Step 2 — Associate the group to each dataset

```javascript
await client.associate('embedfiltergroup', {
  id: filterGroupId,
  resource: { model: 'Dataset', id: datasetId },
});
```

Repeat for every dataset that needs to be filtered.

### Step 3 — Pass `parameter_overrides` in the embed token

```javascript
const auth = await client.create('authorization', {
  type: 'embed',
  role: 'designer',     // even designers CANNOT bypass Pattern 1
  username: user.id,
  parameter_overrides: {
    tenant_id: user.tenant_id,
    region: user.region,
  },
});
```

## Clearing a parameter

If a tenant should see ALL rows (e.g. super-admin), clear instead of value:

```javascript
parameter_overrides: { tenant_id: { clear: true } }
```

Use sparingly — verify this is what the user actually intends, because it disables the filter for that token.

## Verification

After setup, sanity-check from a viewer + a designer token of the same tenant: both should ONLY see that tenant's rows. Then verify with a designer token of a DIFFERENT tenant — they must see ONLY their rows, even if they try to remove dashboard-level filters.

## When to NOT use Pattern 1

- All users are strictly view-only AND the org already maxed out its single EmbedFilterGroup → Pattern 2 may be acceptable
- Each tenant has its own physical database/schema → use Pattern 3

**IMPORTANT:** Fetch the docs listed above and any guides they reference before generating production code — field shapes evolve.
