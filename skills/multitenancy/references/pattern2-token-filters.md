# Pattern 2 — Token-Level `filters` (WEAKER)

Filter applied at query time via the embed token. Editors with `designer`/`owner` roles CAN potentially bypass these. Use ONLY when all users are strictly `viewer` AND you have a reason not to use Pattern 1.

## Docs

- `https://developer.luzmo.com/api/createAuthorization.md`

## Shape

```javascript
const auth = await client.create('authorization', {
  type: 'embed',
  role: 'viewer',            // MUST be viewer for Pattern 2 to be safe
  username: user.id,
  filters: [
    {
      clause: 'where',
      origin: 'product',
      securable_id: dashboardId,
      column_id: '<tenant-column-uuid>',
      expression: '? = ?',
      value: user.tenant_id,
    },
  ],
});
```

Fetch the doc above for the exact filter-expression grammar; it supports comparison operators, IN, NOT IN, etc.

## Security Warning

If any user could ever have `designer` or `owner` role on this token, Pattern 2 is INSUFFICIENT — editors can remove or modify the filter at the dashboard level. Use Pattern 1 (`EmbedFilterGroup`) instead.

## When Pattern 2 is acceptable

- Users are strictly `viewer` for the lifetime of the integration
- You already have the single EmbedFilterGroup used for another purpose and can't combine
- You need a quick filter that depends on token-time data and cannot be parameterized through EmbedFilterGroup

For everything else, prefer Pattern 1.

**IMPORTANT:** Fetch `createAuthorization.md` and any guides it references before generating code.
