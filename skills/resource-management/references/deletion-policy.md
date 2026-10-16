# Deletion Policy

An API `delete{Resource}` call is permanent: it cannot be undone through the API, for any resource type. Only dashboards and datasets deleted in the Luzmo app go to the Archive, where they can be restored for 30 days. Handle delete requests as an agent-owned workflow: the agent decides when it is safe to call the delete API, and generated scripts only add secondary guardrails for later execution.

## What Can Be Restored

| How it was deleted | Resource | Result | Restore |
|---|---|---|---|
| Delete action in the Luzmo app | Dashboard, dataset | Moved to the Archive (status filter "Archived" on the Dashboards/Datasets overview); purged automatically after 30 days | Restore from the Archive within 30 days (single or bulk) |
| API `delete{Resource}` (`securable` delete) | Dashboard, dataset | Removed from all API results immediately; never appears in the Archive | Not restorable through the API |
| API or app | Every other resource (themes, users, groups, channels, connections, formulas, columns, Agents, ...) | Treat as permanent | None |

Notes:
- While a dataset is archived, dashboards that use it stop working, and it cannot be added to dashboards. Restoring it brings it back.
- When an archived item is purged after 30 days, or deleted through the API, its associated resources (for example formulas and messages) are removed too.
- Never promise recovery of an API-deleted item. If the user deleted something in the app, point them to the Archive first.

Archiving and restoring through the API is not part of the public API reference. Do not script it; point users to the Archive in the Luzmo app.

## Agent Workflow

For every delete request:

1. Consult the relevant `https://developer.luzmo.com/api/search{Resource}.md` and `https://developer.luzmo.com/api/delete{Resource}.md` docs as implementation-detail guidance before generating or executing API calls.
2. Search first with `"action": "get"` and a narrow `find` filter.
3. Show the resources that would be deleted: name, id, type, owner or timestamps when available, and the filter used.
4. State that the API delete is permanent (no Archive, no API restore). Ask the user to type `yes` after seeing the list.
5. Call `delete{Resource}` only after that confirmation.

If no matching resources are found, stop and report that nothing was deleted.

## Confirmation Rules

- Require the exact word `yes`; do not accept `y`, Enter, or ambiguous phrasing.
- Do not treat an earlier broad instruction such as "go ahead" as delete confirmation. Confirmation must come after the preview.
- Do not lower the bar because the app has an Archive: API deletes bypass it.
- For bulk deletes, show every matching resource or a saved preview artifact before asking.
- For CI or scheduled cleanup requests, default to dry-run and require an explicit opt-in flag or environment variable for real deletion.

## Script Relationship

Generated delete scripts are not the primary safety authority. They should mirror the same preview and confirmation behavior because users may run them later without the agent present.

When generating a reusable delete script, read `delete-script-patterns.md` and include:

- A default dry-run and explicit non-interactive opt-in such as `--execute --confirm-delete=yes`.
- A visible permanent-delete comment near the delete call (API deletes skip the Archive).
- Logging of all resources before deletion.
- No silent catch-and-continue around failed deletes.

## Anti-Patterns

- Calling `delete{Resource}` from the first pass because the user asked confidently.
- Telling the user an API-deleted dashboard or dataset can be restored from the Archive.
- Deleting by broad filters without previewing exact matches.
- Printing only a count for bulk deletes, then deleting unseen records.
- Hiding the destructive action behind a convenience helper with no confirmation at the call site.
