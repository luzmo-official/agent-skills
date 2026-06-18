# Resource Management Script Examples

Patterns for common CRUD workflows. Adapt to the specific resource by consulting `https://developer.luzmo.com/api/{action}{Resource}.md` for exact field shapes. Use docs as guidance for implementation details only.

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

Consult the resource-specific `.md` spec **and** the call form for the user's language before generating production scripts when possible.

## Base API Clients

Use these as the base for resource management scripts. They keep credentials server-side, use the POST-only API shape, and leave resource-specific `action` payloads to the generated workflow.

### JavaScript

```javascript
// Server-side only - never expose API credentials in the frontend.
const API_BASE = process.env.LUZMO_API_HOST || "https://api.luzmo.com";
const API_KEY = process.env.LUZMO_API_KEY;
const API_TOKEN = process.env.LUZMO_API_TOKEN;

async function luzmoPost(resource, body) {
  const res = await fetch(`${API_BASE}/${resource}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: API_KEY, token: API_TOKEN, version: "0.1.0", ...body }),
  });
  if (!res.ok) {
    const err = new Error(`Luzmo API error ${res.status}: ${await res.text()}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}
```

### Python

```python
import os

import requests

API_BASE = os.getenv("LUZMO_API_HOST", "https://api.luzmo.com")
API_KEY = os.environ["LUZMO_API_KEY"]
API_TOKEN = os.environ["LUZMO_API_TOKEN"]

def luzmo_post(resource: str, body: dict) -> dict:
    resp = requests.post(
        f"{API_BASE}/{resource}",
        json={"key": API_KEY, "token": API_TOKEN, "version": "0.1.0", **body},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()
```

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

Python equivalent pattern: same `limit`/`offset` loop — consult https://developer.luzmo.com/api/searchDashboard/call/python for the inner `get` call.

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

All deletion scripts MUST go through the search -> preview -> explicit confirmation flow defined in `references/deletion-policy.md`. For generated scripts, use the guard patterns in `references/delete-script-patterns.md`. Do not embed delete calls without a confirmation prompt.

Consult delete call forms when implementing: `https://developer.luzmo.com/api/delete{Resource}/call/{lang}`

**IMPORTANT:** Field shapes vary across resources (e.g. `dashboard` vs `securable` endpoints, `find` shape variations). Consult both the `.md` spec and the call form before generating production code.
