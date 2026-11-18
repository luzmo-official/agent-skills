# Proposal format

The contract of `artifacts/proposal.json`, which the agent fills after `review.mjs --seed` and `review.mjs` validates. AI rules and agents use a separate file; see [rules and agents](rules-and-agents.md#knowledge-proposal).

## Contents

- [Fields to fill](#fields-to-fill)
- [Resource entries](#resource-entries)
- [Validation and warnings](#validation-and-warnings)
- [Calculation candidates](#calculation-candidates)
- [AI context field](#ai-context-field)

## Fields to fill

Seeding copies every in-scope resource with its exact original and an unchanged proposal. It writes no business definitions. Fill in:

| Field | Content |
|---|---|
| `review_language` | Language the user writes in (seeded as `en`). Write every reviewer-facing text in it ([preparing the review](preparing-the-review.md)). |
| `business_brief` | Business purpose, intended users, terminology and sources. |
| `verdict` | `ready`, `ready-with-corrections` or `not-ready`, for the metadata only. Only `ready` and `ready-with-corrections` can be applied. Assess calculations separately. |
| `findings` | Severity, resource IDs, exact before and proposed quotes, impact and suggested wording. Optional `category` and `basis` (`expression`, `observed`, `untested`, `owner-decision`). |
| `capture_limitations_acknowledged` | Why an incomplete capture is still usable, when it is incomplete. |
| `review_summary` (optional) | `{purpose, highlights, limitations}`: one short string and two short string arrays with customer facts and concrete changes, not review history. Shown as the page introduction. |
| `questions` | `{question, blocking, resource_ids}`. A blocking question stops revisions of those IDs; an empty ID list blocks all revisions. |
| `calculation_changes` | Calculation follow-ups; see [below](#calculation-candidates). Never applied by the scripts. |
| `evaluation_cases` | Test questions with expected resources, filters, unit, population and prohibited interpretations ([review and evaluation](review-and-evaluation.md)). Validated: captured `expected_resource_ids`, supported `language`, `status` (`not-run`, `pass`, `fail`, `partial`), and `observed` plus `executed_at` exactly when run. |
| `blockers` (optional) | `{capability, reason, resource_ids}`: what exactly is not ready. |
| `baseline_review` (optional) | `{key, classification, note}` for every key in `regression-check.json` ([baseline and evidence](baseline-and-evidence.md)). |
| `independent_review` (optional) | Who reviewed with fresh context, what they found and how it was resolved, or why no independent review was possible. |

## Resource entries

Per resource, fill `disposition`, `assessment`, `evidence`, `knowledge_migrations` and `proposed`. IDs, originals and expressions are immutable.

- `disposition`: `keep`, `revise` or `hold`, as defined in [SKILL.md](../SKILL.md#review-outcomes-and-evidence). A `hold` needs a question that covers the resource or its dataset.
- `assessment`: an individual assessment for every resource, including `keep`.
- `evidence`: objects with an optional `type`: `expression`, `source-metadata`, `convention`, `dashboard`, `profile`, `query`, `owner`, `research` or `inference`. `profile` and `query` evidence need a `scope`.
- `proposed`: the full description locale map (or `null`) and `ai_context` (string or `null`).
- `knowledge_migrations`: where removed or moved facts went (another field, resource or AI rule), or why they were dropped.
- `allow_clear: true`: required to clear populated text, together with an explanatory assessment and explicit approval of that resource.
- `dashboard_subject` (optional): only when dashboards themselves are the business subject of the data. It is the only way to let metadata name dashboards; never use it to justify usage references.

Only changed `revise` resources become updates. `keep` and `hold` are never written.

## Validation and warnings

`review.mjs` reports all violations of one kind together instead of letting the API reject them during apply.

Errors (fix before rendering):

- Removing an existing description locale.
- A changed resource without nonempty descriptions in the agreed languages, or without evidence.
- Luzmo limits: 4,000 characters per description locale, supported locale codes only, no leading or trailing whitespace.
- Working budgets on changed text: 300 characters per description locale (tooltip), and the AI context budgets in [writing metadata](writing-metadata.md#budgets-and-api-limits).
- Changed descriptions or AI context that mention dashboards or cite charts or reports as a source.
- A new empty or whitespace-only `ai_context`: use `null`.
- With `baseline.json`: an unclassified difference or a `regression` classification blocks every verdict except `not-ready`; an `unresolved` one blocks revising that resource. A `not-ready` verdict renders but cannot be applied.

Warnings (resolve in the semantic pass; English phrase matching only, so read other locales yourself):

- Provenance, maintenance or implementation narration, review history, naming repairs, legacy labels, verification claims.
- AI context that points to or ranks against another resource, states its scope only negatively, mostly repeats a description, contains formula syntax or generic warnings, or is added to a resource with an open `defect` or `unvalidated` follow-up.
- Context added to a simple identifier, name or geographic column, unless it is only `Aliases:`.
- Identical expressions without one `duplicate` calculation entry covering the group.
- Expression pitfalls such as `COUNT(IF(…, 1, 0))`, and dependencies outside the capture, unless a follow-up, question or finding names the resource.
- Changes backed only by dashboard or inference evidence; missing evaluation categories.
- A `keep` whose assessment reads as an exclusion ("not selected", "deferred"); more than ten keeps sharing one assessment.
- Retained customer text with dashboard references or maintenance narration; an unchanged context over budget.

The checks make problems visible; they do not prove that meaning was preserved. That stays the agent's responsibility.

`update-preview.json` summarizes readiness separately for metadata, calculations, answers and `resource_selection` (from executed cases with `selected_resource_ids`), counts dispositions per kind (revisions split into `translation_only`, `new_description`, `text_changed`, `context_only`, `translation_and_context`, `no_difference`), context presence before and after, and, with a baseline, coverage (newly discovered, newly reviewed, previously reviewed).

## Calculation candidates

```json
{
  "title": "Reusable median order value",
  "classification": "optional",
  "status": "not-approved",
  "resource_ids": [],
  "reason": "Avoid repeated construction of agreed eligibility.",
  "intended_question": "What is a typical eligible order value?",
  "result_grain": "One median per requested group",
  "population": "Owner-defined eligible orders, not order lines",
  "expression_candidate": null,
  "dependencies": [],
  "boundary_cases": ["No eligible orders", "Refunds", "Repeated order lines"],
  "validation_needed": "Confirm grain and eligibility before writing an expression.",
  "technical_details": "MEDIAN over order_total after grouping order lines by order_id."
}
```

- `classification`: `defect`, `unvalidated`, `optional`, `data-gap` or `duplicate`.
- `reason` and `validation_needed`: short business sentences: what is wrong or undecided, then the next step. Put expressions, IDs and execution evidence in `technical_details` (shown escaped in a collapsed section).
- Existing resources: list their IDs; repair an existing metric rather than proposing a duplicate. New candidates keep `resource_ids` empty; never invent live IDs.
- `duplicate`: lists every resource ID of one group of identical expressions; `validation_needed` names the owner decision (which to keep, where it is referenced), never an assumed winner or removal.
- New formulas (`optional`, empty `resource_ids`) may carry `origin`: `evidenced` (the customer already defines or uses it; needs at least one `source-metadata`, `convention`, `dashboard` or `owner` evidence item) or `suggested` (your recommendation). They may also carry `proposed: {name, description, ai_context}`, with name and description in every proposal language, checked like captured metadata, plus a warning when the name is already used.
- For new formulas `review.mjs` warns about a missing `origin`, a plain single-column aggregation (unless `evidenced` with a proposed name) and a repeat of a captured expression. See [formulas](formulas.md#recommend-formulas). The page lists them under "Formula recommendations", split into "Backed by existing use" and "Our suggestions".

## AI context field

- `ai_context` is optional guidance for IQ about its own resource: scope, query rules, interpretation guards and `Aliases:` ([metadata design](metadata-design.md)). Authorized metadata readers can see it.
- Use `null` deliberately when it adds nothing; explain the decision in `assessment`.
- Clearing populated context needs `allow_clear: true` and a `knowledge_migrations` entry.
- The preview counts contexts before, after and cleared across the whole review, including held resources. The Markdown checklist shows encoded lengths before and after.
