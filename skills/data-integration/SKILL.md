---
name: data-integration
description: >-
  Getting data into Luzmo from any source.
  Use whenever connecting a database, pushing files, or modeling data.
  Triggers on: "connect data source", "upload CSV", "import data", "sync from database", "push data via API", "data not loading", createDataprovider.
  Provides ready-to-use scripts.
  Covers data modeling, Warp acceleration, and custom connectors.
  Use eagerly for any data-source or schema question.
  Essential before charts can display anything.
  Not for chart rendering (use data-visualization) or per-tenant access control (use multitenancy).
metadata:
  author: Luzmo
  version: 0.1.0
  last_updated: 2026-06-01
---

# Luzmo Data Integration

Entry-point for all data-side work: connecting sources, pushing data, modeling schemas, and extending Luzmo with plugins or custom charts.

## Doc Retrieval

- Fetch the exact `developer.luzmo.com/*.md` page(s) before coding.
- If it is an index/overview/provider page, follow the relevant links to the concrete API, provider, plugin, schema, or example page.
- Use `https://developer.luzmo.com/llms.txt` / `https://developer.luzmo.com/llms-full.txt` only to discover pages, not as the final source.

## [CRITICAL] Security Checkpoint

**BEFORE writing any data-integration code, verify:**
- [ ] API credentials (`LUZMO_API_KEY`, `LUZMO_API_TOKEN`) live server-side ONLY (env vars, secrets manager)
- [ ] Database/source credentials (DB passwords, plugin tokens, SaaS keys) are stored server-side, NEVER hardcoded in scripts that ship to a browser
- [ ] Push-data scripts (`createData`) and connect-datasource scripts run on a backend, not in client code
- [ ] If end-users will trigger data pushes via embed tokens, the token's `securable` access is scoped to only the datasets they may write to

**If ANY checkbox is unchecked, STOP and fix before proceeding.** Leaked DB credentials are as severe as leaked API keys — they expose all of the underlying source, not just Luzmo.

For full auth/embed-token guidance, see `core`.

## Quick Decision Tree

```
What data do you need to integrate?
├─ External database or SaaS platform (e.g., PostgreSQL, MySQL, Snowflake, Salesforce)
│   └─ Use "Connect a Data Source" → scripts/connect-datasource.js
│
├─ CSV, Excel, or JSON files / arrays
│   └─ Use "Push Data" → scripts/push-data.js
│
├─ Data is already loaded, need to configure columns or add calculations
│   └─ See "Data Modeling" → references/data-modeling.md
│
├─ Data source not supported natively
│   └─ Build "Plugin Connector" → references/connection-types.md
│
└─ Need custom chart type
    └─ Build "Custom Chart" → references/connection-types.md
```

## Choose the Right Path

| Goal | Path |
|---|---|
| Connect a database / SaaS / native source | **Connect a data source** (below) |
| Push data via API (CSV, XLSX, array) | **Push data** (below) |
| Model columns, formulas, Warp | See `references/data-modeling.md` |
| Plugin connector for unsupported source | See `references/connection-types.md` |
| Custom chart type | See `references/connection-types.md` (custom charts section) |

---

## Connect a Data Source

The standard flow for connecting an external database or SaaS source involves:
1. Resolving an **account** (connection credentials) — either reuse an existing one or create a new one.
2. **`getDataprovider`** — list available tables/views in the connection.
3. **`createDataprovider`** — register selected tables as Luzmo datasets.

**Always run the ready-made script rather than writing this from scratch:**

```bash
# Run from the skills/data-integration directory, or use full relative paths:
node skills/data-integration/scripts/connect-datasource.js --help
```

### Deciding whether to create or reuse an account

Before creating a new account, check whether a suitable one already exists. Reusing is faster and avoids duplicate credentials.

**List all existing accounts (optionally filter by provider):**

```bash
node skills/data-integration/scripts/connect-datasource.js --list-accounts
node skills/data-integration/scripts/connect-datasource.js --list-accounts --provider postgresql
node skills/data-integration/scripts/connect-datasource.js --list-accounts --provider snowflake
```

The output shows each account's `id`, `provider`, `name`, `host`, and `scope`. Use this to let the user (or agent) pick the right account.

**If the user's prompt names a specific data source, provider, or host**, check the list first and match against it. If a match is found, use `--account-id`; if none fits, proceed with creation.

**Note on API terminology:** The script uses `--list-accounts` but under the hood calls the Luzmo API with `"action": "get"` (not `"action": "search"`). Documentation URLs like `https://developer.luzmo.com/api/searchAccount.md` describe the "get" action.

**Reuse an existing account:**

```bash
node skills/data-integration/scripts/connect-datasource.js --account-id <uuid> [--provider <p>] [--tables t1,t2]
```

`--provider` is optional when reusing — the script infers it from the account. Specify it explicitly only if the inferred value needs to be overridden.

**Create a new account (all connection flags required):**

```bash
node skills/data-integration/scripts/connect-datasource.js \
  --provider postgresql --host db.example.com \
  --port 5432 --database mydb --user readonly --password secret \
  --tables orders,customers
```

### Step 1 — `createAccount`: Set up the connection

Fetch: `https://developer.luzmo.com/api/createAccount.md`

Examples (per provider/language): `https://developer.luzmo.com/api/createAccount/examples/{slug}/{js|python|java|dotnet|curl|php}` — e.g. [create-a-plugin-connection/python](https://developer.luzmo.com/api/createAccount/examples/create-a-plugin-connection/python). Call forms: `https://developer.luzmo.com/api/createAccount/call/{lang}`.

An Account stores the connection credentials (host, port, username, password/token, database name). The exact `properties` shape varies by `provider` — always check the doc.

To search/list existing accounts programmatically: `https://developer.luzmo.com/api/searchAccount.md`

Use `action: "get"` with a `find` object. Filter by `provider`, `name`, `host`, or `id`. Example:

```json
{ "action": "get", "find": { "where": { "provider": "postgresql" }, "attributes": ["id", "name", "host", "scope"] } }
```

### Step 2 — `getDataprovider`: List available tables and views

Fetch: `https://developer.luzmo.com/api/getDataprovider.md`

Requires the Account `id` and the `provider` name. Returns all tables/views available in the connection.

### Step 3 — `createDataprovider`: Register selected tables as Luzmo datasets

Fetch: `https://developer.luzmo.com/api/createDataprovider.md`

Call once per table/view to import. Returns a `dataset_id` for each. Do **not** use `createDataset` for database connections — use `createDataprovider`.

---

## Push Data

Use `createData` to push rows directly into Luzmo (no external database needed).

**Limit: 10,000 rows per API call.** Use the ready-made script to handle batching automatically:

```bash
node skills/data-integration/scripts/push-data.js --help
```

**Script usage:**

```bash
# Push a CSV file (creates dataset if --dataset-id omitted)
node skills/data-integration/scripts/push-data.js --file data.csv --format csv --mode replace

# Push into an existing dataset, append rows
node skills/data-integration/scripts/push-data.js --dataset-id "<uuid>" --file data.xlsx --format xlsx --mode append

# Replace rows in an existing dataset (destructive; requires confirmation)
node skills/data-integration/scripts/push-data.js --dataset-id "<uuid>" --file data.json --format json --mode replace --confirm-replace yes
```

Fetch: `https://developer.luzmo.com/api/createData.md` — call forms: `https://developer.luzmo.com/api/createData/call/{lang}`.

Key facts:
- `createData` can create a new dataset automatically (omit `securable_id` and use `type: "create"`).
- Existing datasets use `securable_id` plus `type: "append"` or `type: "replace"`.
- `--mode` only matters when `--dataset-id` is provided; new datasets always use `type: "create"` for the first batch.
- Column names belong in `options.header`; do not include the header row in `data`.
- `createData` also works with embed tokens (token context is applied).

---

## Query Data

Fetch: `https://developer.luzmo.com/api/getData.md` — call forms: `https://developer.luzmo.com/api/getData/call/{lang}`.

Guide: `https://developer.luzmo.com/guide/guides--querying-data.md`

Query shape uses `queries` with `dimensions`, `measures`, `where`, `having`, `order`, `limit`.

---

## Data Modeling

For column types, subtypes, derived columns, aggregation formulas, hierarchy levels, and Warp acceleration → read `references/data-modeling.md`.

---

## Plugin Connectors and Custom Charts

For Plugin API connectors (unsupported data sources) and custom chart types → read `references/connection-types.md`.

---

## Bundled References

For deeper guidance on specific data integration topics:

- `references/data-modeling.md` — Column types, subtypes, derived columns, aggregation formulas, hierarchy levels, Warp acceleration, and IQ quality optimization through proper data naming and structure.
- `references/connection-types.md` — Building plugin connectors for unsupported data sources and custom chart types.
- `scripts/connect-datasource.js` — Ready-made script for connecting databases and SaaS platforms with automatic account management and table listing.
- `scripts/push-data.js` — Ready-made script for pushing CSV/XLSX/JSON data with automatic batching and dataset creation.

## Important Facts

- `createDataset` docs advise: use `createData` for data-push datasets and `createDataprovider` for database/plugin connections. Do not default to `createDataset`.
- `searchDataset` supports `include` for related resources: `Column`, `Account`, `Acceleration`, and linked dashboards.
- For ad-hoc row-level data exports, query `/data` with `client.get('data', { queries: [...] })`; use `options.rollup_data: false`, `order`, and `limit`/`offset` to batch rows, then write CSV/XLSX in the app. Fetch `https://developer.luzmo.com/api/getData.md` first.
- For dashboard/chart/Flex exports, use the `/export` service (`createExport`) instead: sync file response, async email, or scheduled email. Fetch `https://developer.luzmo.com/api/createExport.md`.
- Fewer, wider tables in data-push datasets generally perform better than many narrow linked tables.

## Common Mistakes

Each pitfall below includes a frequency marker, the symptom you'll see, why it fails, and the fix.

**[ERROR] Using createDataset directly instead of appropriate method ([WARNING] COMMON):**
```javascript
// Wrong - bypasses proper data integration flow
await client.create('dataset', { name: "My Data", ... })
```
**[OK] Use createData for data-push or createDataprovider for connections:**
```javascript
// Correct for data-push
await client.create('data', {
  type: 'create',
  data: rows,
  options: { update_metadata: true, header: columnNames, name: { en: 'My Data' } }
})

// Correct for database connections
await client.create('dataprovider', { account_id: "...", ... })
```

**[ERROR] Creating new accounts without checking for existing ones:**
```bash
# Wrong - creates duplicate connections
node skills/data-integration/scripts/connect-datasource.js --provider postgresql --host db.example.com ...
```
**[OK] List and reuse existing accounts:**
```bash
# Correct - check first
node skills/data-integration/scripts/connect-datasource.js --list-accounts --provider postgresql
# Then reuse if exists:
node skills/data-integration/scripts/connect-datasource.js --account-id <uuid> --tables orders
```

**[ERROR] Exceeding 10,000 row limit in single createData call ([WARNING] VERY COMMON for bulk loads):**
```javascript
// Wrong - will fail with large datasets
await client.create('data', { type: 'append', securable_id: datasetId, data: hugeArray })  // 50,000 rows
```
You'll see: `Rows exceed 10,000` error, or partial loads.
**Why this fails:** Luzmo caps `createData` at 10k rows per call to keep the ingest path bounded. Bulk loads must be batched.
**[OK] Use scripts that handle batching automatically:**
```bash
# Correct - scripts handle batching
node skills/data-integration/scripts/push-data.js --file large-file.csv  # Any size
```

**[ERROR] Expecting `/export` or another export task to page arbitrary rows:**
```javascript
// Wrong - dashboard/chart export service, not a row pagination API
await client.create('export', { securable_id, chart_id, type: 'csv' })
```
**[OK] Page row-level data through `/data`, then write the file yourself:**
```javascript
const page = await client.get('data', {
  queries: [{
    dimensions: [{ dataset_id, column_id }],
    where: [],
    order: [{ dataset_id, column_id, order: 'asc' }],
    limit: { by: 10000, offset: 0 },
    options: { rollup_data: false, locale_id: 'en', timezone_id: 'Etc/UTC' }
  }]
})
// Repeat with offset += 10000 until page.data is empty; stream rows to CSV/XLSX.
```

## SQL views (connector-supported warehouses)

For connectors that support it (typical warehouse/database connectors — **not** flat-file or simple SaaS push targets), you can expose data via a **SQL view** instead of pushing rows into Luzmo's OLAP store.

### When to prefer a view

| Approach | Prefer when |
|---|---|
| SQL view | Data stays in your warehouse; you need live queries, joins, or RLS at the source |
| Push (`createData`) | No warehouse connector, prototypes, or small/static datasets |

### Flow

1. Confirm the connector supports view creation — fetch connector docs on `developer.luzmo.com`.
2. Create the view in the source system (or via Luzmo's dataprovider/view APIs where documented).
3. Register the view-backed dataset in Luzmo and associate it to dashboards.

Fetch before implementing:

- `https://developer.luzmo.com/api/createDataprovider.md`
- `https://developer.luzmo.com/api/getDataprovider.md`

For single-tenant setups where each tenant has its own schema/database, views often pair with **connection overrides** — see `multitenancy` skill for more details.

## Avoid

- Running connect-datasource or push-data scripts in browser/client-side code — all data scripts must run server-side.
- Hardcoding database passwords or SaaS credentials in script files.
- Pushing more than 10,000 rows in a single `createData` call (API limit; batch instead).
- Building a custom integration without first checking whether a native connector already exists.

## Hand Off

**When to escalate to other skills:**

- WHEN the user mentions API credentials, SDK setup, or POST/action architecture → use `core`
- WHEN data is loaded and the user is ready to display it → use `data-visualization`
- WHEN each tenant has its own database/schema → use `multitenancy` (SECURITY CRITICAL)
- WHEN the user wants self-service chart editing on top of these datasets → use `analytics-studio`
- WHEN the user wants AI/natural-language data Q&A — data modeling fixes here directly improve IQ accuracy → use `ai-analytics`
- WHEN the user writes scripts to bulk-manage datasets/accounts (search, delete, associate) → use `resource-management`
- WHEN data isn't showing up or upload errors occur → use `troubleshooting` FIRST

**This skill does NOT cover:**

- Embedding the resulting datasets in dashboards/charts (use `core` for saved dashboards, `data-visualization` for Flex)
- Auth/embed-token generation (use `core`)
- Tenant filtering on shared datasets (use `multitenancy` for Patterns 1 and 2)

## Canonical Sources

- Index: `https://developer.luzmo.com/llms.txt`, `https://developer.luzmo.com/llms-full.txt`
- API: `https://developer.luzmo.com/api/{action}{Resource}.md`
- Guides: `https://developer.luzmo.com/guide/*.md`
- Flex charts: `https://developer.luzmo.com/flex/charts/{type}.md`

If content exists on developer.luzmo.com, link — do not duplicate specs here.
