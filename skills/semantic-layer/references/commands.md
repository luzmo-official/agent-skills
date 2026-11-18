# Commands

How to run each script. Read only the section you need. Field contracts live elsewhere: [proposal format](proposal-format.md), [AI rules and agents](rules-and-agents.md), [IQ evaluation](iq-evaluation.md), [publishing](publishing.md).

## Contents

- [Runtime](#runtime)
- [Network and credentials](#network-and-credentials)
- [Scope selection](#scope-selection)
- [Setup, discovery and capture](#setup-discovery-and-capture)
- [Baseline comparison](#baseline-comparison)
- [Usage patterns](#usage-patterns)
- [Aggregate profiling](#aggregate-profiling)
- [Targeted inspection](#targeted-inspection)
- [Proposal and review](#proposal-and-review)
- [Embed token checks](#embed-token-checks)
- [IQ question runs](#iq-question-runs)
- [Apply, backups and restore](#apply-backups-and-restore)
- [Public references](#public-references)

## Runtime

- Node.js 18 or newer. No dependencies, build or SDK.
- Works in PowerShell, macOS and Linux shells; quote paths that contain spaces. `<skill>` is the folder containing `SKILL.md`.
- File arguments (`--workspace`, `--approval`, `--backup`, `--checks`, `--properties`, `--previous`) are resolved against the current directory.
- The agent runs the commands and explains the results. The reviewer never needs a terminal or JSON.
- Ctrl+C (or SIGTERM) stops cleanly: apply, knowledge apply and restore finish the current write and roll back; an IQ run cancels the question in progress and saves the answers so far. A second Ctrl+C exits at once (exit code 130) without waiting for rollback; check the workspace artifacts before retrying.

Try the toolkit without credentials, using fictional data that must never be cited as customer evidence:

```text
node <skill>/scripts/demo.mjs --workspace <new-demo-folder>
node <skill>/scripts/review.mjs --workspace <new-demo-folder>
node <skill>/scripts/run-tests.mjs
```

`run-tests.mjs` runs every test in one process, so it works in sandboxes that block worker processes. The demo includes dataset metadata, a published AI rule with a newer draft, a proposed rule edit and a new agent.

## Network and credentials

- **Online:** discovery and capture, `knowledge.mjs --mode collect`, `embed-access.mjs`, `profile.mjs --execute`, `inspect.mjs` (except `--dry-run`), `iq.mjs --mode run`, `restore.mjs`, `apply.mjs` and `knowledge.mjs --mode apply`. They send HTTPS POST requests to `<LUZMO_API_HOST>/0.1.0/<resource>` and nowhere else.
- **Offline:** seeding, baseline comparison, usage analysis, query and IQ planning, review rendering and IQ comparison.
- A blocked host fails with "Could not reach …" or "No response … within 30 s" (IQ questions: `iq_timeout_seconds`) and changes nothing.
- Writes happen only with `--execute` plus an approval or a confirmed plan hash.

Credentials come only from the workspace `.env`; shell environment variables are ignored, so one workspace cannot use another customer's credentials. The agent never opens `.env`; a missing or placeholder value surfaces as a script error naming the setting.

| Variable | Use |
|---|---|
| `LUZMO_API_HOST` | The "API host URL" on the user's API Tokens page (`/settings/api-tokens` at the address they log in at). Covers EU, US and private deployments. Default `https://api.luzmo.com`. |
| `LUZMO_API_KEY`, `LUZMO_API_TOKEN` | All metadata, dashboard, AI rule and agent reads and writes. |
| `LUZMO_EMBED_KEY`, `LUZMO_EMBED_TOKEN` | Optional: IQ runs as an end user (`iq_authentication: "embed"`) and Embed profiling. A separate pair with `use` access to the datasets and the end user's filters, parameters and connection overrides already set. |
| `LUZMO_APP_HOST` | Optional, not secret: the address the user logs in at, for "Open in Luzmo" links when it cannot be derived from the API host (custom domains). |

Guards built into the client:

- HTTPS only; no credentials in URLs; redirects refused. Errors show the HTTP status and Luzmo's message with key and token redacted.
- Embed credentials can only run data queries (`data get`), read their own authorization and, in `iq.mjs --mode run`, ask IQ questions. Everything else is refused locally. API and Embed credentials never substitute for each other.
- Before its first request with a pair, every script requests `user` `id: "me"`. An unknown pair (wrong host, or a pasted fragment) gets no user, because Luzmo would otherwise answer as an anonymous visitor who can still see public datasets; the script stops there.
- HTTP 401 stops every script at once and names the refused pair. See [getting started](getting-started.md#when-luzmo-refuses-the-token).
- Metadata reads send `find.options.public: false`, so datasets and dashboards shared through public groups are never discovered, captured or counted.

## Scope selection

Focused metadata work: set `config.review_scope` before seeding.

```json
{"resource_ids":["<captured-dataset-column-or-formula-id>"],"rationale":"Translate the selected fields only."}
```

Only these resources get outcomes; the rest of the capture stays available as context, and the review shows how many were excluded. Without the setting, every captured resource needs an assessment. Changing scope after seeding means reseeding (or explicitly reconciling the proposal), never editing its originals.

AI rules and agents: set `config.knowledge_scope`; see [rules and agents](rules-and-agents.md#capture-and-review-existing-configuration).

## Setup, discovery and capture

```text
node <skill>/scripts/init.mjs --workspace luzmo-semantic-layer-review-artifacts
node <skill>/scripts/collect.mjs --workspace luzmo-semantic-layer-review-artifacts --discover
```

`init.mjs` creates the workspace with `config.json` and a `.env` for the user to fill in locally. `--discover` lists accessible datasets in `artifacts/discovery.json` (100 per page; `complete=false` when capped). If discovery finds none, the credentials work but that user can access no datasets (exit code 1). Select datasets in `config.json` (IDs here are fictional):

```json
{
  "schema_version": 1,
  "customer": "Fictional customer",
  "languages": ["en"],
  "datasets": [{ "id": "11111111-1111-4111-8111-111111111111" }],
  "discovery_max_pages": 20,
  "dashboard_limit": 100,
  "query_budget": 30,
  "profile_days_limit": 31,
  "profile_group_limit": 20,
  "sample_rows": 1000
}
```

When the dataset IDs are already known, skip discovery and capture directly:

```text
node <skill>/scripts/collect.mjs --workspace luzmo-semantic-layer-review-artifacts
```

Capture reads the selected datasets with columns, formulas (all locales and expressions) and dashboard IDs, then the accessible dashboard definitions, one at a time. It writes `capture.json`, a content-addressed copy under `artifacts/captures/`, and any partial failures under `issues`.

- Dashboards are kept under `capture.dashboards` as usage evidence only; their metadata is out of scope. Inline data is stripped, but the rest can still be confidential.
- The capture shows what these credentials can see, not every resource in the organization.
- Re-running capture creates a new baseline and invalidates proposals bound to the old one. Never edit originals in a proposal to get around that.
- Nothing retries automatically. Investigate a failure, fix the request or ask the user, then rerun.

## Baseline comparison

```text
node <skill>/scripts/baseline.mjs --workspace luzmo-semantic-layer-review-artifacts --previous <file> [--previous <file> ...]
```

Offline. Compares the current capture with earlier artifacts, oldest first, and writes `artifacts/baseline.json`. Accepted, recognized by shape: earlier captures, metadata proposals, an `update-preview.json` followed by its approval (an approval alone is refused) and `artifacts/applied/metadata-*.json`. Not knowledge proposals. Copy earlier artifacts aside before reseeding, because later steps overwrite `proposal.json` and `update-preview.json`.

Per resource (matched by ID) it records whether it is new, its coverage (`newly-discovered`, `newly-reviewed`, `previously-reviewed`; a `keep` with an empty or exclusion-only assessment does not count as reviewed), renames, expression and dependency changes (propagated to dependents), and the latest earlier proposal, approval and published values. It also lists resources no longer captured and carries forward follow-ups, questions and evaluation cases. Rerun it after every recapture; `review.mjs` refuses a baseline built for another capture. How to use the result: [baseline and evidence](baseline-and-evidence.md).

## Usage patterns

```text
node <skill>/scripts/usage.mjs --workspace luzmo-semantic-layer-review-artifacts
```

Offline. Writes `artifacts/usage-patterns.json`: every measure the captured charts compute, grouped by measure (column plus aggregation, saved formula or ad-hoc expression) and the chart's own filters, with the dimensions used and the charts.

- A chart shown in several screen views counts once. As in the chart builder, a count of any column, or any aggregation other than a distinct count of a non-numeric column, is a row count (`column_id: "*"`).
- Filter widgets, dashboard filters and viewer selections are not attributed to charts. Filter values are cut to 10 values of at most 100 characters; they can still be confidential.
- `business_labels`: chart labels with words beyond the column name and default wording ("Total", "Number of"; English only).
- `signals`: `business-label`, `filtered-measure`, `ad-hoc-expression`, `repeated`, `special-aggregation`, `period-comparison`. `candidate` is true when any signal other than `repeated` is present; a repeated plain sum needs no saved formula.
- Signals point to measures worth assessing. They prove neither a definition nor that a formula should exist ([formulas](formulas.md#recommend-formulas)). Rerun after every recapture.

## Aggregate profiling

Add a `scope` and `profile` to each dataset you want to profile (fictional IDs):

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "scope": {
    "mode": "filtered",
    "confirmed": true,
    "rationale": "User supplied this representative test ID after the target column was identified.",
    "filters": [{ "column_id": "22222222-2222-4222-8222-222222222222", "value": "approved-tenant" }]
  },
  "profile": {
    "enabled": true,
    "authentication": "api",
    "date_column": "33333333-3333-4333-8333-333333333333",
    "date_role": "Order creation cohort, not revenue recognition date",
    "from": "2026-10-01",
    "to": "2026-10-08",
    "columns": [
      { "id": "44444444-4444-4444-8444-444444444444", "kind": "numeric" },
      { "id": "66666666-6666-4666-8666-666666666666", "kind": "category", "values_approved": true }
    ]
  }
}
```

Scope modes:

| Mode | When | Settings |
|---|---|---|
| `filtered` | A tenant, account, customer or project column exists. Ask only for missing test IDs and a date range. | `confirmed: true`, an evidence-based rationale, equality `filters` (added to every query), `authentication: "api"`. |
| `default-connection` | No relevant target column. Never to bypass a known, unresolved shared-data filter. | `filters: []`, rationale, `authentication: "api"`. |
| `embed-context` | Last resort: API profiling is too slow without the end user's filters, or only the token's `account_overrides` reach the tenant's data. | `filters: []`, rationale naming which reason applies, `authentication: "embed"`. Column IDs still come from the API capture; Luzmo applies the token's filters and overrides. |

Columns:

- `kind`: `numeric` (optional `median: true`, over nonnegative values only), `category` or `date`. Uniqueness is not profiled.
- `values_approved: true` records your judgment that a category column holds codes or labels, not personal or free text. Ask only when that is genuinely unclear.
- Category output is capped; it is not a complete code list.

```text
node <skill>/scripts/profile.mjs --workspace luzmo-semantic-layer-review-artifacts
node <skill>/scripts/profile.mjs --workspace luzmo-semantic-layer-review-artifacts --execute --plan-sha256 <printed-hash>
```

The first command is offline and writes `profile-plan.json`. Check it yourself: each query should answer a concrete question with a narrow scope. Read-only profiling within the authorized scope needs no user approval; the hash only binds execution to the plan you checked.

The second command rechecks plan, capture and config, uses the recorded credentials per dataset (no fallback), runs the [Embed token check](#embed-token-checks) for Embed-profiled datasets, sends one aggregate query at a time and writes `profile-results.json`.

- Dates: date-only bounds are midnight UTC, start inclusive, end exclusive; RFC 3339 bounds are accepted. Do not ask for a timezone; an existing `timezone` config value is respected.
- Limits: `query_budget` 30 by default (max 100), `profile_group_limit` 20 (max 40), `profile_days_limit` 31 (raise it if the user wants a longer window). Limits bound output, not scan cost. There is no server-side query timeout; the 30-second client deadline does not cancel the server query.
- A timed-out aggregate falls back once per dataset to an unordered sample of up to `sample_rows` rows (max 1,000), with the scope filters but without the date window. Results are marked `source: "sample"` and the rows are saved privately as `artifacts/profile-sample-<dataset>.json`. Read [when a profile query fails](workflow.md#when-a-profile-query-fails) before using them.
- Any other failure stops the run, naming the query and Luzmo's message. Fix a clear syntax, column or access problem, or narrow the check if the cheaper query still answers the question; otherwise record the gap and continue. Never retry with broader credentials.

After the first run, record `profile.data_assessment`, for example `{"classification":"mock","sufficiency":"sufficient","basis":"Documented demo source; enough to interpret structure, not production completeness."}`. Classification: `real`, `mock` or `unknown`; sufficiency: `sufficient`, `insufficient` or `unknown`. Small row counts alone do not mean mock data. If the data is not good enough, ask for end-user credentials instead of profiling again.

## Targeted inspection

For a specific question the profiler does not answer, such as whether an order value repeats on each item row, run a small read-only check. No approval is needed; `--dry-run` prints the queries offline. Choose the check with [the question-to-query steps](workflow.md#write-the-query-that-answers-the-question).

```text
node <skill>/scripts/inspect.mjs --workspace luzmo-semantic-layer-review-artifacts --checks <checks.json> [--dry-run]
```

Fictional example (columns `2222…`, `3333…`, `4444…` are `order_id`, `item_id`, `order_value`; use IDs from the customer capture):

```json
{
  "checks": [{
    "id": "order-value-repeat",
    "question": "Does the order value repeat on each item row for order A?",
    "dataset_id": "11111111-1111-4111-8111-111111111111",
    "mode": "rows",
    "columns": ["22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"],
    "filters": [{ "column_id": "22222222-2222-4222-8222-222222222222", "op": "=", "value": "order-a" }],
    "order": [{ "column_id": "33333333-3333-4333-8333-333333333333", "direction": "asc" }],
    "limit": 20,
    "timezone": "UTC"
  }]
}
```

| Field | Rules |
|---|---|
| `mode: "rows"` | `columns` (≤ 8), optional `order` on those columns, `limit` 1–100 (default 20). |
| `mode: "aggregate"` | `aggregates`: `{column_id or "*", type}` with `count`, `min`, `max`, `sum`, `avg`, `distinct_count`; `*` only with `count`; `sum`/`avg` on numeric columns. Optional `group_by` of ≤ 2 columns, output capped at `profile_group_limit`. No `columns`, `order` or `limit`. |
| `filters` | `{column_id, op, value or values}` with `=`, `in` (1–10 values), `>=`, `>`, `<`, `<=`. Each check needs an `=` or `in` filter or a `date` window `{column_id, from, to}` within `profile_days_limit`. `distinct_count` needs an `=` filter. |
| `timezone` | IANA name; required when a date window or datetime column is used. Bounds are UTC instants; the timezone controls grouping and formatting. |

Unknown fields are refused, IDs must be unique and the number of checks is at most `query_budget`. The dataset's scope filters and credentials apply as in profiling. Checks run one at a time; a timeout is recorded (`timed_out: true`, with a hint to narrow it) and the run continues; any other error is recorded and stops the run. Results merge by check ID into private `artifacts/inspections.json` and are discarded when the capture changes. Cite a result as `query` evidence with its `scope` and check ID; quote only what the conclusion needs.

For a check outside this format, a temporary script in the workspace can reuse the read-only client:

```js
const { authentication, scope } = datasetScope(dataset, ref);
const api = await client(workspacePath, { credentialMode: authentication });
if (api.host !== capture.host) throw new Error('Workspace host differs from capture.');
const query = { ...boundedQuery, where: [...scope, ...extraFilters] };
const result = await api.request('data', { action: 'get', find: { queries: [query] } });
```

Import `client` from `scripts/common.mjs` and `datasetScope` from `scripts/profile-lib.mjs`. Never enable writes or override credentials. Check every dataset and column reference against the capture, keep the limits above, run requests one at a time, and save the question, the request without credentials, scope, time and result in a separate private file. See the [Data API guide](https://developer.luzmo.com/guide/guides--querying-data.md) for request syntax.

## Proposal and review

```text
node <skill>/scripts/review.mjs --workspace luzmo-semantic-layer-review-artifacts --seed
node <skill>/scripts/review.mjs --workspace luzmo-semantic-layer-review-artifacts
```

`--seed` writes `proposal.json` (it refuses to overwrite one). Fill it as described in [proposal format](proposal-format.md). The second command validates it and writes `review.md`, `review.html`, `update-preview.json` and `approval.template.json`; with `artifacts/baseline.json` it also writes `regression-check.json`. When the knowledge files exist, the page includes the AI rules and agents section ([rules and agents](rules-and-agents.md)); when `iq-runs/before.json` exists, it shows "How IQ answers today".

The page:

- Is self-contained and private: `assets/review.css` and `assets/review.js` are embedded, all customer text is escaped, nothing loads remotely, and the only script is pinned by a content-security-policy hash.
- Groups resources by dataset, shows word-level diffs, and keeps exact JSON in the separate artifacts.
- Has filters and "Print / save PDF". Printing includes what is currently shown, with details expanded; resources that need no update stay hidden unless the reviewer ticks "Also show reviewed …".
- Has no feedback forms. Reviewers reply in chat by item number or name; see [preparing the review](preparing-the-review.md).

## Embed token checks

```text
node <skill>/scripts/embed-access.mjs --workspace luzmo-semantic-layer-review-artifacts
node <skill>/scripts/embed-access.mjs --workspace luzmo-semantic-layer-review-artifacts --mode create [--properties <file>]
node <skill>/scripts/embed-access.mjs --workspace luzmo-semantic-layer-review-artifacts --mode create --execute --plan-sha256 <printed-hash>
```

**Automatic check.** Before `iq.mjs --mode run` (with Embed credentials), `profile.mjs --execute` and `inspect.mjs` use the Embed pair for anything else, they request one raw row from each dataset in scope (every selected dataset for IQ; otherwise the Embed-profiled or inspected datasets). They stop unless every dataset returns a row; IQ runs also accept access with zero rows. Statuses:

| Status | Meaning |
|---|---|
| `ok` | Access and at least one row. |
| `no-rows` | Access, but 0 rows after the token's filters, embed filters and connection overrides. |
| `no-access` | No `read` grant. |
| `read-only` | `read` without `use`; IQ and queries outside a dashboard need `use`. |
| `token-refused` | HTTP 401: expired, deleted or mistyped. |
| `timeout`, `error` | Neither access nor data is confirmed. |

**`check` (default).** Runs the row checks, reads the Embed token's own authorization (type, expiry, role, suborganization, access, filters, parameter overrides; the API never returns `account_overrides`) and, with the API pair, whether the API user is an organization owner and the embed filters on the selected datasets (visible to owners only). Writes:

- `artifacts/embed-access.json`: `ready`, a token summary, per dataset a status with hints, the API user's role, the embed filters and `suggested_properties`.
- `artifacts/embed-authorization-request.json`: a complete Authorization `create` body with placeholders for the owner's credentials and the end user's `username`, `name`, `email` and `suborganization`, `use` on every selected dataset, `role: "viewer"`, and one `parameter_overrides` entry per `metadata.<name>` parameter in those embed filters. Without an override, an embed filter applies its default value to every end user.

Exit code 1 when the token is not ready. Neither file holds credentials, but both can hold tenant values.

**`create`.** Reads the agent-written properties (`embed-authorization.json` in the workspace, or `--properties`). It refuses leftover `<placeholders>`, a missing `username`, `name` or `email`, `account_overrides`, a role other than `viewer`, a past `expiry`, and missing `use` grants on selected datasets (unless collections are granted). Without `--execute` it prints the properties and plan hash and sends nothing. With `--execute` and the hash of the properties the user confirmed, it checks that the API key belongs to an organization owner, creates one `embed` authorization, writes the new pair into `.env` (replacing the old one, printing neither) and runs `check`. Creating a token adds or updates that end user in the customer's organization. The client can only create `embed` authorizations.

References: [Embed Authorization token](https://developer.luzmo.com/guide/dashboard-embedding--generating-an-authorization-token.md), [Authorization API](https://developer.luzmo.com/api/createAuthorization.md), [embed filters](https://developer.luzmo.com/api/associateEmbedFilterGroup.md). When to use this: [embed credentials](embed-credentials.md).

## IQ question runs

```text
node <skill>/scripts/iq.mjs --workspace luzmo-semantic-layer-review-artifacts --mode plan
node <skill>/scripts/iq.mjs --workspace luzmo-semantic-layer-review-artifacts --mode run --label <before|after|…> --plan-sha256 <printed-hash>
node <skill>/scripts/iq.mjs --workspace luzmo-semantic-layer-review-artifacts --mode compare [--before before --after after]
```

Input is the agent-written `iq-questions.json`; its format and the assessment workflow are in [IQ evaluation](iq-evaluation.md).

- `plan`: offline, writes `artifacts/iq-plan.json`.
- `run`: refuses a changed question file, runs the [Embed token check](#embed-token-checks) when asking as an end user, and sends one `aiprompt create` per question, each in a new conversation, with `agent: "auto"` (or the question's `agent_id`), `task: "generate"`, `response_mode: "mixed"`, the question's language and `config.timezone` (default UTC). It then reads which datasets the answer used. Its client can only ask questions and read answers.
- `compare`: offline, validates both assessments and writes `artifacts/iq-comparison.html` and `.md`.

Config:

| Setting | Values |
|---|---|
| `iq_authentication` | Required, no default. `"embed"`: ask as one end user with the `LUZMO_EMBED_` pair. `"api"`: ask with the API pair and its data access. The user chooses ([IQ evaluation](iq-evaluation.md#choose-who-asks-the-questions)). |
| `iq_end_user` | Optional role description for the reports; no personal data. |
| `iq_question_budget` | Default 30, max 100. |
| `iq_timeout_seconds` | Whole seconds, 10–300, default 150. |

`run` reserves `artifacts/iq-runs/<label>.json` and an empty `<label>.assessment.json` before any network call, and saves after each answer. The run file records authentication, timezone, end-user label, a credential-bound authorization fingerprint, `complete`, an optional `stopped` reason and, per question, `status` (`answered`, `no-answer`, `timeout`, `error`), `answer_text`, `charts`, `referenced_resource_ids`, `used_dataset_ids`, `conversation_id` and `duration_ms`. Each question counts as IQ usage. Answers are private customer data.

## Apply, backups and restore

```text
node <skill>/scripts/apply.mjs --workspace luzmo-semantic-layer-review-artifacts --approval <approval-file>
node <skill>/scripts/apply.mjs --workspace luzmo-semantic-layer-review-artifacts --approval <approval-file> --execute
node <skill>/scripts/restore.mjs --workspace luzmo-semantic-layer-review-artifacts --backup <workspace>/artifacts/backups/metadata-<timestamp>.json [--ids <id,id>]
node <skill>/scripts/restore.mjs --workspace luzmo-semantic-layer-review-artifacts --backup <same> [--ids <same>] --execute --plan-sha256 <printed-hash>
```

What these do, when they refuse and how to recover: [publishing](publishing.md). AI rules and agents: [rules and agents](rules-and-agents.md#approve-and-apply).

## Public references

Use the Developer Docs for API contracts and Academy for formula behavior. The offline tests use synthetic responses only; confirm compatibility and answer quality on the customer's deployment.

- [Managing AI context](https://developer.luzmo.com/guide/guides--managing-ai-context.md)
- [Querying data](https://developer.luzmo.com/guide/guides--querying-data.md)
- [Multi-tenant data and connection overrides](https://developer.luzmo.com/guide/dashboard-embedding--handling-multi-tenant-data.md)
- [Dataset retrieval](https://developer.luzmo.com/api/searchDataset.md) and [formula retrieval](https://developer.luzmo.com/api/searchFormula.md)
- [AIPrompt API](https://developer.luzmo.com/api/createAIPrompt.md) and [Luzmo IQ in an agentic workflow](https://developer.luzmo.com/guide/guides--adding-luzmo-iq-to-agentic-workflow.md)
- [Academy: Aggregation formulas](https://academy.luzmo.com/article/52tm82oo)

Never ship a customer workspace with the skill. Before sharing the skill folder, check that it contains no `.env`, customer artifacts or generated reviews.
