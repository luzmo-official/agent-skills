---
name: resource-management
description: Server-side Luzmo resource operations — CRUD, automation, and bulk API scripts. Use for listing, searching, creating, or deleting dashboards, datasets, themes, users, groups. Triggers on: "list all dashboards", "delete dataset", "bulk update", "automate", "script", "find resources". Critical: all deletes are irreversible and require explicit user confirmation before execution. Not for embedding saved dashboards/charts (use core), auth setup (use core), or data ingestion (use data-integration).
metadata:
  author: Luzmo
  version: 0.1.0
  last_updated: 2026-05-21
---

# Luzmo Resource Management

Entry-point for operational resource management with the Luzmo API: create, list/search, retrieve, update, associate/dissociate, and delete resources.

## 🚨 Security Checkpoint

**BEFORE generating ANY resource-management script, verify:**
- [ ] `LUZMO_API_KEY` and `LUZMO_API_TOKEN` are loaded from environment variables, NEVER hardcoded
- [ ] The script runs server-side (Node, Python, CI, cron) — NEVER inside a browser bundle
- [ ] No API credentials are logged, echoed, or committed to git
- [ ] For destructive actions (`delete*`, `dissociate*`), a confirmation prompt is wired in (see Deletion Safety Rule below)
- [ ] If using embed tokens instead of API credentials, the token's `access` and `role` permit the intended action (e.g. `viewer` cannot create/delete)

**If ANY checkbox is unchecked, STOP and fix before proceeding.** A leaked API key gives full read/write/delete access to your entire Luzmo organization across all dashboards, datasets, themes, and tenants.

For full auth/embed-token guidance, see `core`.

## Core API Rules (Non-Negotiable)

**POST-only Architecture:**
- Luzmo API uses **POST** for all operations
- Never use GET, PUT, PATCH, or DELETE HTTP methods
- Action specified in request body: `"action": "create"`, `"action": "get"`, etc.

**API Base URLs by Region:**
- EU: `https://api.luzmo.com/0.1.0`
- US: `https://api.us.luzmo.com/0.1.0`
- VPC: `https://{vpc}-api.luzmo.com/0.1.0` (or custom CNAME)

**Note:** Scripts may use host without `/0.1.0` path and pass `version: "0.1.0"` in the body - both patterns work.

**Security:**
- Keep API key/token **server-side only** — never in frontend code

**Rate Limits:**
- The Luzmo API has rate limits to prevent abuse. If you're running bulk operations, implement exponential backoff when you receive rate limit errors (HTTP 429). Start with a 1-second delay, doubling on each retry. See `references/script-examples.md` for retry patterns.

## Implementation Documentation

Fetch action-specific docs before generating scripts:

```
https://developer.luzmo.com/guide/api--overview.md
https://developer.luzmo.com/guide/api--actions.md
```

Then fetch exact resource docs:
- Pattern: `https://developer.luzmo.com/api/{action}{Resource}.md`
- Examples: `createDashboard`, `searchDashboard`, `updateDashboard`, `deleteDashboard`

## Action Map

| User intent | API action |
|---|---|
| create | `create{Resource}` |
| list / search / filter | Fetch `search{Resource}.md` docs, use `"action": "get"` with `"find"` wrapper in request body |
| retrieve one | Same as above, filtered by id |
| update | `update{Resource}` |
| associate / link | `associate{Resource}` |
| dissociate / unlink | `dissociate{Resource}` |
| delete / remove | `delete{Resource}` — **see deletion safety rule below** |

## ⚠ Deletion Safety Rule

**Deleting a resource is irreversible.** All deletions follow a mandatory two-step process that cannot be skipped, regardless of how casually the user phrases the request ("delete", "remove", "clean up", "drop", "wipe"):

1. **List/search first** — call the appropriate API with `"action": "get"` (documented in `search{Resource}.md` files) and display name, id, and any other identifying fields.
2. **Require explicit confirmation** — present the result and ask: *"This will permanently delete [resource name] (`<id>`). Type 'yes' to confirm or press Ctrl-C to cancel."*
3. **Only call `delete{Resource}` after the user explicitly confirms.**

When generating delete scripts:
- The delete call must be **behind a confirmation prompt** — never execute automatically.
- Include a prominent `# IRREVERSIBLE — confirm before proceeding` comment near the delete call.

**For detailed deletion workflow and examples:** See `references/deletion-safety.md`

## Bundled References

- `references/script-examples.md` — Comprehensive search/create/update/associate templates, pagination, retry/backoff, bulk patterns
- `references/deletion-safety.md` — The MANDATORY two-step search → show → confirm → delete workflow with Node and Python templates

## Script Templates

Use these as the base for all resource management scripts. For additional examples, see `references/script-examples.md`.

### JavaScript

```javascript
// Server-side only — never expose API credentials in the frontend.
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

// Example: search then delete with confirmation
async function deleteWithConfirmation(resourceType, findPayload) {
  // Step 1: search
  const results = await luzmoPost(resourceType, { action: "get", find: findPayload });
  const items = results.data || [];
  if (items.length === 0) { console.log("No matching resources found."); return; }

  console.log("Resources that will be PERMANENTLY deleted:");
  items.forEach(r => console.log(`  ${r.name || "(no name)"} — ${r.id}`));

  // Step 2: confirmation (Node.js readline)
  const readline = require("readline").createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => readline.question('\nType "yes" to confirm deletion: ', resolve));
  readline.close();

  if (answer.trim().toLowerCase() !== "yes") { console.log("Cancelled."); return; }

  // IRREVERSIBLE — only runs after explicit user confirmation above
  for (const item of items) {
    await luzmoPost(resourceType, { action: "delete", find: { id: item.id } });
    console.log(`Deleted: ${item.id}`);
  }
}
```

### Python

```python
import os, requests

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

def delete_with_confirmation(resource_type: str, find_payload: dict):
    # Step 1: search
    results = luzmo_post(resource_type, {"action": "get", "find": find_payload})
    items = results.get("data", [])
    if not items:
        print("No matching resources found.")
        return

    print("Resources that will be PERMANENTLY deleted:")
    for r in items:
        print(f"  {r.get('name', '(no name)')} — {r['id']}")

    # Step 2: confirmation
    answer = input('\nType "yes" to confirm deletion: ')
    if answer.strip().lower() != "yes":
        print("Cancelled.")
        return

    # IRREVERSIBLE — only runs after explicit user confirmation above
    for item in items:
        luzmo_post(resource_type, {"action": "delete", "find": {"id": item["id"]}})
        print(f"Deleted: {item['id']}")
```

## Association Flows

Fetch: `https://developer.luzmo.com/api/associate{Resource}.md` and `https://developer.luzmo.com/api/dissociate{Resource}.md`

Common examples:
- `associateDashboard` / `dissociateDashboard`
- `associateDataset` / `dissociateDataset`

## Avoid

- Using REST-style HTTP verbs (GET, PUT, DELETE) — the Luzmo API is POST-only with `action` in the body.
- Executing delete operations without first showing the user what will be deleted and receiving explicit confirmation.
- Fabricating action names — always resolve `https://developer.luzmo.com/api/{action}{Resource}.md` before generating code.
- Placing API key/token in client-side code or scripts that could be committed to source control.

## Hand Off

**When to escalate to other skills:**

- WHEN the user needs full auth/embed-token setup or POST/action explanation → use `core`
- WHEN the user wants to connect a data source or push data (vs CRUD an existing dataset) → use `data-integration`
- WHEN scripts must enforce multi-tenant isolation (EmbedFilterGroup, parameter_overrides) → use `multitenancy` (SECURITY CRITICAL)
- WHEN editing dashboard `contents` JSON (slots, items) programmatically → use `analytics-studio`
- WHEN automating theme creation/updates → use `theming`
- WHEN a script returns 401/403/404/400 errors → use `troubleshooting` FIRST

**This skill does NOT cover:**

- Frontend embedding of saved dashboards (use `core`); Flex charts (use `data-visualization`)
- Auth/embed-token generation patterns (use `core`)
- Data ingestion or dataset modeling (use `data-integration`)

## Common Mistakes

Each pitfall below includes a frequency marker, the symptom you'll see, why it fails, and where to escalate.

**❌ Using REST-style HTTP verbs for Luzmo API calls (⚠️ VERY COMMON):** You'll see `404`/`405` or empty responses. The Luzmo API is POST-only with `action` in the body. See `core/references/api-actions.md`.

**❌ Mixing fields from different resource docs (⚠️ COMMON):** You'll see `400 Bad Request` or unexpected validation failures. Fetch the exact `{action}{Resource}.md` doc per call — don't assume `createDashboard` accepts the same fields as `createDataset`.

**❌ Claiming an action exists without linking its markdown doc (⚠️ OCCASIONAL — agent-generated code only):** Pattern of fabricating action names. Always link the canonical doc at `https://developer.luzmo.com/api/{action}{Resource}.md` before generating code that uses it.

**❌ Exposing API key/token in client-side code (⚠️ COMMON — SECURITY CRITICAL):** Leaked credentials = full org compromise. Resource-management scripts must run server-side. See `core` for the security checkpoint.

**❌ Calling `delete{Resource}` without first showing the user what will be deleted (⚠️ COMMON — IRREVERSIBLE):** No symptom — data just disappears. Every delete script MUST use the two-step search → show → confirm → delete flow defined in `references/deletion-safety.md`. NEVER skip even when the user phrases it casually.

## Canonical Sources

- Index: `https://developer.luzmo.com/llms.txt`, `https://developer.luzmo.com/llms-full.txt`
- API: `https://developer.luzmo.com/api/{action}{Resource}.md`
- Guides: `https://developer.luzmo.com/guide/*.md`
- Flex charts: `https://developer.luzmo.com/flex/charts/{type}.md`

If content exists on developer.luzmo.com, link — do not duplicate specs here.
