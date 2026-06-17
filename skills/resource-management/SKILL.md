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

## Deletion Safety Rule

Deleting a resource is irreversible. Treat delete requests as an agent-owned approval workflow, not something delegated to generated script code.

For any delete request, even casually phrased requests such as "clean up", "drop", or "remove old stuff":

1. Search/list first with the relevant `"action": "get"` call and show name, id, and other identifying fields.
2. **Require explicit confirmation:** Ask for explicit user confirmation after showing the exact resources. Require the word `yes`.
3. Do NOT execute `delete{Resource}` until the user explicitly confirms.

When generating delete scripts, include script-level guardrails because the script may run later outside the agent conversation. Use dry-run defaults and explicit non-interactive opt-in flags or environment variables, and clearly mark the irreversible call.

Read `references/deletion-policy.md` before handling delete requests. Read `references/delete-script-patterns.md` when generating a reusable delete script.

## Bundled References

- `references/script-examples.md` — Comprehensive search/create/update/associate templates, pagination, retry/backoff, bulk patterns
- `references/deletion-policy.md` — Agent-owned preview, confirmation, and execution workflow for irreversible deletes
- `references/delete-script-patterns.md` — Script-level dry-run and confirmation guardrails for generated delete scripts

## Script Templates

Use `references/script-examples.md` for reusable JavaScript and Python API client templates. For deletion scripts, combine those base clients with the guardrails in `references/delete-script-patterns.md`.

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

**❌ Calling `delete{Resource}` without first showing the user what will be deleted (⚠️ COMMON — IRREVERSIBLE):** No symptom — data just disappears. The agent must own the search -> show -> confirm -> delete workflow defined in `references/deletion-policy.md`. Generated scripts need their own guardrails from `references/delete-script-patterns.md` because they may be run later outside the agent.

## Canonical Sources

- Index: `https://developer.luzmo.com/llms.txt`, `https://developer.luzmo.com/llms-full.txt`
- API: `https://developer.luzmo.com/api/{action}{Resource}.md`
- Guides: `https://developer.luzmo.com/guide/*.md`
- Flex charts: `https://developer.luzmo.com/flex/charts/{type}.md`

If content exists on developer.luzmo.com, link — do not duplicate specs here.
