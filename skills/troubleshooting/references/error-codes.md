# Error Code & Message Reference

Quick lookup for common Luzmo error messages and HTTP status codes, plus the most likely root cause and where to go next.

## HTTP Status Codes

| Status | Meaning | Common Causes | Next Step |
|---|---|---|---|
| 400 | Bad Request | Malformed body, wrong action, invalid field shapes | Read response body; check the resource doc |
| 401 | Unauthorized | Missing/invalid API key/token or embed token | See `core` and Workflow 2 in diagnostic-workflows.md |
| 403 | Forbidden | Role insufficient (e.g. viewer trying to edit), token expired, resource access not in token's `access`, or dataset not grantable by the API-token account | Check role, `access.securables`/`access.datasets`, and dataset ownership/sharing |
| 404 | Not Found | Wrong endpoint, wrong region base URL, resource id wrong, or wrong API version path | Verify base URL (EU/US/VPC) and resource id |
| 429 | Too Many Requests | Rate-limited | Implement exponential backoff (see `resource-management/references/script-examples.md`) |
| 5xx | Server Error | Transient Luzmo issue | Retry with backoff; if persistent contact support@luzmo.com |

## Error Messages

### `Action 'search' not found`
- **Cause:** `action: 'search'` is not a valid Luzmo action.
- **Fix:** Use `action: 'get'`. See `core/references/api-actions.md`.

### `Invalid title` / `Invalid label` / `Invalid localized string`
- **Cause:** Plain string used where Luzmo expects a localized object.
- **Fix:** Wrap in `{ en: 'value' }`. Do NOT nest: `{ title: { en: 'x' } }` is wrong, `{ en: 'x' }` is right.

### `Missing aggregationFunc`
- **Cause:** Numeric measure slot lacks `aggregationFunc`.
- **Fix:** Add one of `sum`, `average`, `count`, `distinctcount`, `min`, `max`, `median`, `stddev`, `cumulativesum`.

### `Missing level`
- **Cause:** Datetime or hierarchy slot lacks `level`.
- **Fix:** Add the appropriate level integer. Datetime: 1=year, 2=quarter, 3=month, 4=week, 5=day, 6=hour, 7=minute, 8=second, 9=millisecond.

### `Component not found` (in browser console)
- **Cause:** Web component not registered (package not imported), OR wrong tag name for the framework.
- **Fix:** Verify install of `@luzmo/embed` / framework-specific package, and use the correct tag for the framework (`<luzmo-embed-dashboard>` in vanilla, `<luzmo-dashboard>` in Angular/Vue, etc.).

### `License error` / `IQ license required` / `ACK license required`
- **Cause:** Add-on not enabled on the Luzmo organization.
- **Fix:** Contact support@luzmo.com to enable the add-on (IQ or ACK).

### `Only one EmbedFilterGroup allowed`
- **Cause:** Trying to create a second `EmbedFilterGroup` in the same organization.
- **Fix:** One group per org — combine all parameters into the existing group. See the `multitenancy` skill.

### `account_overrides not applied` (silent — no error but data unchanged)
- **Cause:** Property name wrong (`connectionOverrides`/`connection_overrides`/`accountOverrides`).
- **Fix:** Use `account_overrides` exactly. See the `multitenancy` skill.

### `Invalid host` / CORS error
- **Cause:** Wrong region/tenancy host (`apiHost` / `appServer`).
- **Fix:** Match the tenancy — EU `api.luzmo.com`, US `api.us.luzmo.com`, VPC `{vpc}-api.luzmo.com`.

### `You don't have access to the analytics dataset`
- **Cause:** The embed token includes the dataset id in `access.datasets`, but the API-token account that minted the embed token does not own the dataset and has not been granted sufficient access to it. IQ or backend `/data` calls can still work with the API key, while embed tokens can only delegate datasets that the token-issuing account can grant.
- **Fix:** Own the dataset with the token-issuing account, share/grant the dataset to that account with sufficient rights, or use an owned dataset. Then mint a fresh embed token.

### `Token expired` / `Embed token expired`
- **Cause:** Default token lifetime is 24h.
- **Fix:** Generate a fresh token via your backend; consider refresh logic in long-lived sessions.

### `Dashboard contents was replaced`
- **Cause:** `update` on a dashboard sends a complete `contents` JSON — partial patches replace the whole thing.
- **Fix:** Retrieve first, patch the JSON in-place, then send the FULL patched contents back. See `analytics-studio`.

### `Rows exceed 10,000`
- **Cause:** Single `createData` call exceeded 10k rows.
- **Fix:** Batch — use the bundled `scripts/push-data.{js,py}` from `data-integration`.

## When the Error Isn't Listed

1. Read the full response body — Luzmo APIs include detail messages.
2. Consult the resource's doc page (`https://developer.luzmo.com/api/{action}{Resource}.md`) as implementation-detail guidance.
3. Check `troubleshooting`'s diagnostic-workflows.md.
4. If still stuck, contact `support@luzmo.com` with a minimal reproduction (request body, response body, no live credentials).
