# Deletion Safety Workflow

Deletion of Luzmo resources is IRREVERSIBLE. No "trash" or "soft delete" exists by default. This workflow is MANDATORY for every delete script you generate — even when the user phrases the request casually ("clean up", "drop", "wipe", "remove all the old stuff").

## The Two-Step Pattern

```
┌──────────┐   ┌──────────┐   ┌───────────┐   ┌──────────┐
│  Search  │ → │   Show   │ → │  Confirm  │ → │  Delete  │
└──────────┘   └──────────┘   └───────────┘   └──────────┘
   action:        list to       prompt for       action:
   "get"          stdout       "yes" exactly     "delete"
```

The agent NEVER skips Show → Confirm. Even if the user says "just delete them all", the script must still print what will be deleted and require explicit confirmation.

## Node.js Template

```javascript
async function deleteWithConfirmation(resourceType, findPayload) {
  // 1. Search
  const result = await luzmoPost(resourceType, { action: 'get', find: findPayload });
  const items = result.data || [];

  if (items.length === 0) {
    console.log('No matching resources found.');
    return;
  }

  // 2. Show
  console.log(`\n${items.length} resources will be PERMANENTLY DELETED:`);
  items.forEach(r => console.log(`  - ${r.name?.en || r.name || '(no name)'} (${r.id})`));

  // 3. Confirm
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise(resolve =>
    readline.question('\nType "yes" to confirm: ', resolve)
  );
  readline.close();

  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    return;
  }

  // 4. Delete — IRREVERSIBLE, runs only after explicit user confirmation above
  for (const item of items) {
    await luzmoPost(resourceType, { action: 'delete', find: { where: { id: item.id } } });
    console.log(`Deleted: ${item.id}`);
  }
}
```

## Python Template

```python
def delete_with_confirmation(resource_type, find_payload):
    # 1. Search
    result = luzmo_post(resource_type, {"action": "get", "find": find_payload})
    items = result.get("data", [])

    if not items:
        print("No matching resources found.")
        return

    # 2. Show
    print(f"\n{len(items)} resources will be PERMANENTLY DELETED:")
    for r in items:
        name = r.get("name", "(no name)")
        if isinstance(name, dict):
            name = name.get("en", "(no name)")
        print(f"  - {name} ({r['id']})")

    # 3. Confirm
    answer = input('\nType "yes" to confirm: ')
    if answer.strip().lower() != "yes":
        print("Cancelled.")
        return

    # 4. Delete — IRREVERSIBLE, runs only after explicit user confirmation above
    for item in items:
        luzmo_post(resource_type, {"action": "delete", "find": {"where": {"id": item["id"]}}})
        print(f"Deleted: {item['id']}")
```

## Required Code Comments

Mark the destructive call clearly:

```javascript
// IRREVERSIBLE — only runs after explicit user confirmation above
await luzmoPost(resourceType, { action: 'delete', find: { where: { id: item.id } } });
```

## CI / Non-Interactive Environments

For CI or scripts that can't prompt, require a `--yes` or `LUZMO_CONFIRM_DELETE=yes` env var AND a hard-coded preview step:

```javascript
if (process.env.LUZMO_CONFIRM_DELETE !== 'yes') {
  console.log('Set LUZMO_CONFIRM_DELETE=yes to actually delete. Aborting.');
  return;
}
```

Even in CI, the script should LOG the resources that would be deleted before deleting them, so the run is auditable.

## Anti-Patterns (Do NOT Do)

- Skipping the search/show step "because the user already knows what they want"
- Accepting `y`/`Y`/Enter as confirmation — REQUIRE the exact string `"yes"`
- Wrapping the delete in a `try/catch` that swallows failures silently
- Deleting many resources in a single `action: 'delete'` payload without first listing each
