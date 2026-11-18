# Baseline and evidence

## Contents

- [Establish the baseline](#establish-the-baseline)
- [Compare by identifier](#compare-by-identifier)
- [Evidence model](#evidence-model)
- [Profiles describe their scope only](#profiles-describe-their-scope-only)

## Establish the baseline

Every resource has four states. Keep them apart in reasoning, proposals and the review:

| State | Source | What it establishes |
| --- | --- | --- |
| Captured | `capture.json`, `captures/<hash>.json` | What was live when captured. Source metadata is customer knowledge, not proof of correctness |
| Proposed | An earlier `proposal.json` | A draft judgment: evidence to re-evaluate, never truth to copy |
| Approved | `update-preview.json` plus its human approval | Which exact changes a human authorized for that version |
| Published | `artifacts/applied/metadata-*.json`, or live metadata matching a prior target | What was actually written and read back |

Before drafting:

1. Look for earlier work in the workspace (proposals, previews, approvals, applied records, earlier captures) and any the user supplies. Ask for an earlier review only when it evidently exists but its files are missing.
2. Run, passing sources oldest first:

   ```text
   node <skill>/scripts/baseline.mjs --workspace luzmo-semantic-layer-review-artifacts --previous <oldest> --previous <newer> ...
   ```

- Per resource, the newest proposal, approval and published record count as "latest".
- An older proposal only contributes follow-ups, questions and evaluation cases for resources that no newer proposal covered; it may have been superseded.
- Without `--previous`, `baseline.json` records that no baseline was compared and the review says so. Never imply continuity with work that was not compared.

## Compare by identifier

The script matches resources by ID only and reports names separately. A renamed resource is the same resource; two resources with the same name are not. Per resource it records:

- `status`: `shared` with the baseline, or `new`. Review new resources from first principles; there is nothing to preserve.
- `coverage`: `newly-discovered` (in no earlier capture or proposal inventory), `newly-reviewed` (inventoried earlier but never assessed: no `revise` or `hold`, and no `keep` with an assessment) or `previously-reviewed`.
  - Report the first two separately. A resource that was always inventoried but enters review now is not a discovery; a large "additional" count usually means a wider review, not a changed catalogue.
  - Quote counts from `baseline.json`, not from comparing proposal sizes.
- `state`: `published`, `live-matches-previous-proposal`, `proposed-not-published`, `live-changed-since-proposal` or `unchanged-since-baseline`. A never-published draft is not previous metadata: withdrawing it is not clearing customer context.
- `expression_changed`, dependency additions and removals, and `upstream_expression_changed` (a dependency's expression changed). When set, attribute a semantic difference to the calculation change first, then decide whether the wording must follow. A changed expression can invalidate a previously correct definition.
- `removed` (no longer captured): check whether the resource left the selection, was deleted or became inaccessible before dropping its follow-ups.

Treat each earlier proposal as a hypothesis with its own evidence. Keep what still holds, correct what the current expression or stronger evidence contradicts, and record the reason in `assessment`. `review.mjs` then lists every difference for the [semantic regression review](review-and-evaluation.md#semantic-regression-review).

## Evidence model

Give each evidence object a `type`, so the review shows what kind of support a claim has. Plain-text evidence stays valid; typed evidence makes weak support visible.

| `type` | Establishes | Does not establish |
| --- | --- | --- |
| `expression` | What the calculation computes: grain, filters, branches, guards, dependencies | Business intent, or whether the result is the right answer |
| `source-metadata` | What the customer wrote before | That it is correct; expressions can contradict it |
| `convention` | A documented customer definition or policy, from any source the customer maintains, such as a data catalog, wiki or ticket (cite it) | That the expression implements it |
| `dashboard` | How a measure is used, grouped, filtered and labeled | Business validity; dashboards reuse wrong measures too |
| `profile` | Facts about the profiled population (requires `scope`) | Contracts for other tenants, periods or the full dataset |
| `query` | What a targeted check returned for its entities, filters, window and timezone (requires `scope`; cite the `inspections.json` check id) | Behaviour for other entities, a formula or a business contract |
| `owner` | A confirmed business decision (name the source and date) | Expression behaviour |
| `research` | Public business context, vocabulary and audience | Dataset facts |
| `inference` | A reasoned assumption, stated as such | Anything on its own; keep it out of public certainty |

Weak support:

- The review flags a change backed only by `dashboard` or `inference` evidence.
- Cite dashboards in `evidence`, never in the description or AI context.
- When usage is the only support for a meaning, raise an owner question and hold the resource instead of publishing observed usage as the definition.
- For a calculated resource, the strongest definition combines `expression` evidence with a `convention` or `owner` source for intent.

Matching claims to evidence:

- Each material claim needs evidence for that resource and relationship.
- Similar names, identifier formats, shared values or common filters do not make definitions equivalent across datasets. A transfer needs an explicit source mapping, a shared documented contract or owner confirmation.
- A field used to scope records establishes that association only. Ownership, responsibility and management need their own support.
- Prefer the narrower supported wording when it suffices; hold only the definition or use that stays unresolved.

Earlier evidence:

- It stays usable while its resource identity, expression, source mapping and business convention still apply. Check those before asking for more investigation; age alone does not invalidate it.
- Keep its original scope and date. Record a material change or conflict instead of silently promoting, discarding or replacing it.

Collecting more:

- Collect data only to resolve a material uncertainty: a definition, eligibility rule, unit or date role that changes an answer. Never profile to decorate evidence.
- Within authorized read-only access, resolve it yourself with a small targeted check before asking the owner. How to scope, write and interpret checks, including empty results, failures and timeouts: [workflow.md](workflow.md#4-investigate-only-uncertainties-that-matter).
- A broad profile or unordered sample can miss rare values. Not observing something does not make the original claim invented.
- Owner-reported findings stay `owner` evidence with the scope the owner gave; never label them as queries you ran.

Findings carry a `basis` that says how far the support goes: `expression` (behaviour the expression establishes), `observed` (seen in scoped data), `untested` (a plausible risk nobody has checked) or `owner-decision` (needs a business decision). Never upgrade one into another in wording: an observed pattern is not expression-established behaviour, and an untested risk is not a defect.

## Profiles describe their scope only

Record a profile's actual filters, tenant scope, date window, timezone and population in the evidence `scope`, for example `"tenant filter X, order date 2026-07-01..2026-09-30 UTC, 4,210 rows"`. The general rules on samples and scoped results are in [workflow.md](workflow.md#4-investigate-only-uncertainties-that-matter). Specific to profiles:

- A sample maximum, missingness rate or observed category list is not a universal rule. "Always empty in this scope" is an observation, not a definition; when it limits a metric, put it in next steps.
- Sample-fallback results describe the sample, not the cohort.
- A claim about a relationship between fields (one is set whenever the other is, one row per order, a status implies a timestamp) needs a joint check, such as a bounded grouped count over both fields. Two fields each 40% empty need not be empty on the same rows.
- A range or distribution cannot establish a formula. Values consistent with "end minus start" do not show the field is computed that way.
- A few inspected entities support statements about those entities. Use them to choose wording or a question; generalize only with an expression, convention or owner confirmation.
- Similarly named fields in different datasets are different resources; establish each one's meaning in its own dataset.
- A successful profile is not a validated calculation, and neither proves AI answer quality. Report what each check established, not how many queries or columns were profiled.
