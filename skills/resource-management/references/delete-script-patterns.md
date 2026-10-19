# Delete Script Patterns

Use these patterns only when generating reusable scripts that may run outside the agent conversation. The agent still owns the live preview and confirmation workflow described in `deletion-policy.md`.

## Default Shape

Every generated delete script should:

1. Search for matching resources.
2. Print each match before deletion.
3. Default to dry-run.
4. Require an explicit non-interactive opt-in such as `--execute --confirm-delete=yes` or `LUZMO_CONFIRM_DELETE=yes`.
5. Mark the delete call as irreversible.
6. Stop on unexpected errors instead of swallowing them.

Consult `https://developer.luzmo.com/api/delete{Resource}.md` before writing the final delete body. The examples below show the guardrail structure; adapt the actual delete payload to the resource-specific docs.

## JavaScript Guard

```javascript
function shouldExecuteDelete({ execute, confirmDelete }) {
  return execute === true && confirmDelete === "yes";
}

function printDeletePlan(items) {
  if (items.length === 0) {
    console.log("No matching resources found.");
    return;
  }

  console.log(`\n${items.length} resources will be permanently deleted:`);
  for (const item of items) {
    console.log(`  - ${item.name?.en || item.name || "(no name)"} (${item.id})`);
  }
}

async function deleteMatches(resourceType, findPayload, options = {}) {
  const result = await luzmoPost(resourceType, { action: "get", find: findPayload });
  const items = result.data || [];
  printDeletePlan(items);

  if (items.length === 0) return;

  if (!shouldExecuteDelete(options)) {
    console.log('\nDry run only. Pass --execute --confirm-delete=yes to delete.');
    return;
  }

  for (const item of items) {
    // IRREVERSIBLE - runs only after explicit confirmation above.
    // Build this from the delete{Resource}.md docs; payloads vary by resource.
    await deleteResource(resourceType, item);
    console.log(`Deleted: ${item.id}`);
  }
}
```

Implement `deleteResource(resourceType, item)` with the resource-specific delete call form before using the final script. Use CLI argument parsing in the final script and pass `{ execute, confirmDelete }` into `deleteMatches`.

## Python Guard

```python
def should_execute_delete(execute: bool, confirm_delete: str | None) -> bool:
    return execute is True and confirm_delete == "yes"

def print_delete_plan(items: list[dict]) -> None:
    if not items:
        print("No matching resources found.")
        return

    print(f"\n{len(items)} resources will be permanently deleted:")
    for item in items:
        name = item.get("name", "(no name)")
        if isinstance(name, dict):
            name = name.get("en", "(no name)")
        print(f"  - {name} ({item['id']})")

def delete_matches(
    resource_type: str,
    find_payload: dict,
    execute: bool = False,
    confirm_delete: str | None = None,
) -> None:
    result = luzmo_post(resource_type, {"action": "get", "find": find_payload})
    items = result.get("data", [])
    print_delete_plan(items)

    if not items:
        return

    if not should_execute_delete(execute, confirm_delete):
        print('\nDry run only. Pass --execute --confirm-delete=yes to delete.')
        return

    for item in items:
        # IRREVERSIBLE - runs only after explicit confirmation above.
        # Build this from the delete{Resource}.md docs; payloads vary by resource.
        delete_resource(resource_type, item)
        print(f"Deleted: {item['id']}")
```

Implement `delete_resource(resource_type, item)` with the resource-specific delete call form before using the final script. Use `argparse` in the final script to expose `--execute` and `--confirm-delete`.

## Environment Guard

```javascript
const dryRun = process.env.LUZMO_DELETE_DRY_RUN !== "false";
const confirmed = process.env.LUZMO_CONFIRM_DELETE === "yes";

if (dryRun || !confirmed) {
  console.log("Dry run only. Set LUZMO_DELETE_DRY_RUN=false and LUZMO_CONFIRM_DELETE=yes to delete.");
  return;
}
```

Even in non-interactive mode, log the exact resources before deleting them.
