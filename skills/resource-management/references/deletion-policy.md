# Deletion Policy

Deletion of Luzmo resources is irreversible. Handle delete requests as an agent-owned workflow: the agent decides when it is safe to call the delete API, and generated scripts only add secondary guardrails for later execution.

## Agent Workflow

For every delete request:

1. Consult the relevant `https://developer.luzmo.com/api/search{Resource}.md` and `https://developer.luzmo.com/api/delete{Resource}.md` docs as implementation-detail guidance before generating or executing API calls.
2. Search first with `"action": "get"` and a narrow `find` filter.
3. Show the resources that would be deleted: name, id, type, owner or timestamps when available, and the filter used.
4. Ask the user to type `yes` after seeing the list.
5. Call `delete{Resource}` only after that confirmation.

If no matching resources are found, stop and report that nothing was deleted.

## Confirmation Rules

- Require the exact word `yes`; do not accept `y`, Enter, or ambiguous phrasing.
- Do not treat an earlier broad instruction such as "go ahead" as delete confirmation. Confirmation must come after the preview.
- For bulk deletes, show every matching resource or a saved preview artifact before asking.
- For CI or scheduled cleanup requests, default to dry-run and require an explicit opt-in flag or environment variable for real deletion.

## Script Relationship

Generated delete scripts are not the primary safety authority. They should mirror the same preview and confirmation behavior because users may run them later without the agent present.

When generating a reusable delete script, read `delete-script-patterns.md` and include:

- A default dry-run and explicit non-interactive opt-in such as `--execute --confirm-delete=yes`.
- A visible irreversible-delete comment near the delete call.
- Logging of all resources before deletion.
- No silent catch-and-continue around failed deletes.

## Anti-Patterns

- Calling `delete{Resource}` from the first pass because the user asked confidently.
- Deleting by broad filters without previewing exact matches.
- Printing only a count for bulk deletes, then deleting unseen records.
- Hiding the destructive action behind a convenience helper with no confirmation at the call site.
