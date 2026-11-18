# IQ question sets and comparison

IQ evaluation is optional unless requested. It tests behaviour; it neither replaces metadata evidence nor requires publication.

## Build the question set

- Draw on representative user questions, relevant chart use and evidenced gaps. Label questions suggested by research as such.
- Include normal, boundary and failure cases where they matter: date roles, exclusions, denominators, language and no-data responses.
- Propose the set yourself; do not make the user invent it.

Write `iq-questions.json`:

```json
{"schema_version":1,"questions":[
  {"id":"net-sales","question":"What was net revenue last month, including refunds?","language":"en","source":"research","rationale":"Fictional core sales question.","expected":"Net revenue including negative refund lines, using order date."}
]}
```

| Field | Rule |
| --- | --- |
| `id`, `question`, `rationale` | Required |
| `language` | Required; one of `config.languages` |
| `source` | Required; `user`, `research`, `dashboard` or `gap` |
| `expected`, `expected_resource_ids` | Optional; from evidence, never from the generated answer |
| `dataset_ids` | Optional; attaches datasets. Omit it to test discovery |
| `agent_id` | Optional; asks through a saved agent, with the published versions of its linked AI rules |

Budget: `iq_question_budget`, default 30, maximum 100.

## Choose who asks the questions

- Reuse a caller context the user already specified. Otherwise ask whether the test represents one end user (`iq_authentication: "embed"`) or API-credential access (`"api"`).
- Prefer the end-user context to test end-user behaviour. An API credential sees the data it is permitted, which may span tenants but is not automatically every tenant.
- An optional non-secret `iq_end_user` label can be recorded; a label alone does not prove equivalent access.
- Credentials go only in the workspace `.env`. Never fall back from one credential pair to the other.
- Check supplied or refreshed Embed credentials with [embed credentials](embed-credentials.md). Accessible datasets with zero rows are allowed for IQ runs, so no-data behaviour can be tested; denied or unconfirmed access blocks the run.
- Creating a new Embed token needs its own approved plan and may update the end user's identity in Luzmo.

## Run the questions before drafting

When a baseline is useful, agree the question set and caller first, explaining that prompts count as IQ usage and create conversations. Then:

```text
node <skill>/scripts/iq.mjs --workspace luzmo-semantic-layer-review-artifacts --mode plan
node <skill>/scripts/iq.mjs --workspace luzmo-semantic-layer-review-artifacts --mode run --label before --plan-sha256 <printed-hash>
```

- Questions run one at a time, each in a new conversation, with its language and `config.timezone` (default UTC).
- Timeout: `iq_timeout_seconds`, default 150, maximum 300. A timed-out question may still have created a conversation: do not retry automatically.
- Ordinary failures are recorded. Authentication and IQ access refusals stop the run.
- The runner reserves the run and assessment files before any network call and checkpoints each completed question. It refuses an existing label or orphan assessment before sending prompts.
- A hard kill can lose the in-flight answer; completed checkpoints survive. After investigating a partial run, use a new label.

## Assess the answers

Read the saved text and chart configurations against the expected meaning, expressions and scoped evidence. `results` keeps chart assets (without inline data blobs), referenced resource IDs and returned used-dataset IDs (null if unavailable). A text-only answer may not expose field IDs; label inferred choices as inference.

Fill the generated `<label>.assessment.json`:

```json
{"schema_version":1,"run_sha256":"<prefilled>","assessments":[
  {"id":"net-sales","verdict":"partial","note":"Includes refunds but filters by shipping date."}
]}
```

- Verdicts are `pass`, `partial` or `fail`, each with a reason.
- Record `selected_resource_ids` only when the answer exposes them.
- Judge grain, date roles, filters, units, exclusions, chart queries and explanations, not plausible wording.
- Missing or unassessed results never count as improvements.
- Missing data, calculation defects and IQ limitations may need separate fixes. IQ output cannot establish business definitions.

## Run again after publication and compare

When in scope, run the unchanged plan with label `after`, assess it, then:

```text
node <skill>/scripts/iq.mjs --workspace luzmo-semantic-layer-review-artifacts --mode compare
```

The script refuses to compare unless these match:

- Questions, host, authentication mode, timezone and end-user label.
- The credential-bound authorization fingerprint: the authenticated principal, readable authorization settings and an opaque credential digest. No secrets or authorization values are written to the report.
- Changed or refreshed credentials need a new baseline, even when access is believed equivalent. Older runs without fingerprints are refused.

The reviewer still has to check what the API cannot prove, and the report qualifies the comparison accordingly:

- Equivalent effective data access, tenant filters, parameters, connection overrides and source data.
- Relative-date questions: freeze calendar dates, or account for questions that crossed a reporting boundary.
- This is not a causal experiment. A single run shows tendencies, not measured accuracy; repeat small or surprising differences under new labels when justified.

After comparing:

- Partial runs compare safely; missing questions stay unassessed.
- Surface `iq-comparison.html` and `.md` privately, investigate regressions, and propose any correction or restore for approval.
- Update the proposal's `evaluation_cases` only with observations from executed runs; planned cases stay `not-run`.
