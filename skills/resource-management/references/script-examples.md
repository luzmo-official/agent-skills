# Resource Management Script Examples

Patterns for common CRUD workflows. Adapt to the specific resource — fetch `https://developer.luzmo.com/api/{action}{Resource}.md` for exact field shapes.

## Per-language API examples (canonical)

For single-call snippets, use the developer docs instead of copying code here:

| Pattern | Call form (pick language) | Example walkthrough |
|---|---|---|
| Create resource | `/api/create{Resource}/call/{js\|python\|java\|dotnet\|curl\|php}` | `/api/create{Resource}/examples/{slug}/{lang}` |
| Search / get | `/api/search{Resource}/call/{lang}` | same |
| Update | `/api/update{Resource}/call/{lang}` | same |
| Associate | `/api/associate{Resource}/call/{lang}` | same |

Examples (HTML, no `.md` suffix):
- List dashboards: https://developer.luzmo.com/api/searchDashboard/call/js
- Create theme: https://developer.luzmo.com/api/createTheme/call/python
- Plugin connection: https://developer.luzmo.com/api/createAccount/examples/create-a-plugin-connection/js

Always fetch the resource-specific `.md` spec **and** the call form for the user's language before generating production scripts.

## Pagination (orchestration — not on call forms)

The API supports `limit` and `offset` in `find`. Use a loop for large result sets:

```javascript
async function getAllDashboards() {
  const limit = 100;
  let offset = 0;
  let allDashboards = [];
  let hasMore = true;

  while (hasMore) {
    const result = await luzmoPost('securable', {
      action: 'get',
      find: {
        where: { type: 'dashboard' },
        limit,
        offset,
      },
    });

    const dashboards = result.data || [];
    allDashboards = allDashboards.concat(dashboards);
    hasMore = dashboards.length === limit;
    offset += limit;
  }

  return allDashboards;
}
```

Python equivalent pattern: same `limit`/`offset` loop — fetch https://developer.luzmo.com/api/searchDashboard/call/python for the inner `get` call.

## Retry / error handling (orchestration)

```javascript
async function luzmoPostWithRetry(resource, body, { maxRetries = 3, baseDelayMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await luzmoPost(resource, body);
    } catch (e) {
      lastErr = e;
      const status = e.status || 0;
      // Retry on 5xx / 429; not on 4xx that indicate client error
      if (status < 500 && status !== 429) throw e;
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
```

## CRITICAL — Deletion

All deletion scripts MUST go through the two-step search → confirm → delete flow defined in `references/deletion-safety.md`. Do not embed `action: 'delete'` calls without a confirmation prompt.

Fetch delete call forms when implementing: `https://developer.luzmo.com/api/delete{Resource}/call/{lang}`

**IMPORTANT:** Field shapes vary across resources (e.g. `dashboard` vs `securable` endpoints, `find` shape variations). Fetch both the `.md` spec and the call form before generating production code.
