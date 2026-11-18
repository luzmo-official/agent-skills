# Review and evaluation

Checks to run after drafting `proposal.json`, before surfacing the review. Outcomes and review scope: [SKILL.md](../SKILL.md#review-outcomes-and-evidence). Field contract: [proposal-format.md](proposal-format.md#fields-to-fill).

## Contents

- [Resource-by-resource review](#resource-by-resource-review)
- [Semantic regression review](#semantic-regression-review)
- [Findings and owner questions](#findings-and-owner-questions)
- [Representative evaluation cases](#representative-evaluation-cases)
- [Readiness reporting](#readiness-reporting)
- [AI rules and saved agents](#ai-rules-and-saved-agents)
- [Publication choices](#publication-choices)

## Resource-by-resource review

Do this for every in-scope dataset, column and formula. Dashboards are usage evidence only.

1. **Read everything.** Read every current and proposed description locale plus the AI context. Compare exact meaning, not length or keyword coverage.
2. **Account for each clause:** preserved, moved, corrected or lost. Check labels, actions, status mappings, units, exclusions, eligibility, populations, missing values, date roles, synonyms, operational guidance and availability or completeness limitations. Removing a warning is a correction only when evidence resolves its substance.
3. **Reconcile with source metadata and the expression** ([reconciliation and measure checklist](metadata-design.md#validate-existing-definitions-then-preserve)). Label each claim as calculation fact, documented convention, observed result or assumption. Note dependencies missing or outside the scope.
4. **Read the description as its audience**, usually non-technical: can they tell what it means and when to use it without implementation knowledge? Check plain wording, sentence length and jargon; keep specialist detail only when that audience needs it. Separately, check whether IQ can select it across varied phrasings in each requested language.
5. **Apply the [context admission test](metadata-design.md#ai-context-self-contained-guidance-for-iq)** to each context clause.
   - A definition, unit, eligibility rule or reader-relevant limitation never lives only in context.
   - For a null context, account for prior knowledge, where it went and lost discovery terms. Distinguish captured context from earlier draft additions.
   - Use `null` when nothing useful survives. Never invent a use case for a defective or unvalidated metric.
6. **Check completeness:** the scope fits, encoding budgets pass, original locales survive and every in-scope resource has an explicit outcome.
7. **Check proportionality:** each revision fixes a named gap (see over-enrichment below).
8. **Check the assessment against the actual diff.** "Unchanged", "translation-only" or "context-only" must describe what was edited; explain source-language or context edits made alongside a translation separately.

Also:

- Apply every semantic check to every locale and the shared context, including paraphrases. Phrase detectors cover few languages; their silence never exempts a locale.
- Prefer deterministic identity, locale and change comparisons over growing lists of language-specific phrases. Structural validation does not replace semantic review.
- A `keep` assessment states why the current metadata suffices. "Not selected", "out of scope for this batch" or a sentence copied across many resources is a skipped assessment, neither `keep` nor `hold`: assess the resource or record the narrower scope.
- `review.mjs` warns about holds that read that way, holds with no owner question, and a hold share above 20%.
- A calculation candidate can stay held while a cautionary metadata correction on the same resource is `revise` and approved.

## Semantic regression review

Run after drafting, before presenting. Look for what the draft lost or broke, not for confirmation.

**Mechanical candidates.** With `baseline.json`, `review.mjs` lists candidates in `regression-check.json` and the review: changed expressions or dependencies, renames, released holds, source wording the baseline had corrected, vanished boundary terms or numbers, removed context (draft withdrawal or clearing), rewrites, and vanished follow-ups, blocking questions or evaluation cases. Read both versions and the expression for each. A missing term is a signal; a present term does not prove preservation.

**Search for these yourself**, with or without a baseline:

- **Reintroduced errors:** source-definition errors; contradictions between description, context, expression and evaluation cases.
- **Changed boundaries:** altered exclusions, denominators, eligibility, populations, missing-value handling or limits. Compare clauses as carefully as operators; similar wording can change meaning without losing a keyword or number.
- **Conflated concepts:** rows and entities, share and frequency, recorded event and assumed outcome, current and historical stock.
- **Scope shifts:** guidance moved to a broader scope where it loses its exceptions, or to a resource IQ will not select.
- **Unsupported certainty:** a sample, dashboard, inference, range or matching counts stated as a formula, identity or contract; meaning transferred between resources without an explicit mapping; association described as ownership ([investigation rules](workflow.md#4-investigate-only-uncertainties-that-matter)).
- **Provenance and narration, in any language and either field:** dashboard or chart usage, "according to", "inferred from", review history, "Calculated column:", expression walkthroughs, "same calculation as", "duplicate of", "same caveats as", legacy labels, naming repairs. Do not just delete the phrase: restate any substantive limitation directly and reassess whether the rest is established; if only usage supports it, hold and ask the owner.
- **Redundant context:** repeats or translates the description, reproduces formula syntax or adds a generic warning.
- **Pointers instead of scope:** a preference or pointer chain (named or not) replacing this resource's own scope. Apply the [selection-convention test](metadata-design.md#ai-context-self-contained-guidance-for-iq) to any direct pointer; complete query conditions stay on the answering resource.
- **Misplaced content:** reader-relevant limitations moved into context; query mechanics (filter values, field names, aggregation steps) moved into the description; limitations replaced by confident wording ("reliable", "validated", "the correct measure").
- **Lost vocabulary:** each customer term dropped from a description is kept public, kept as a short alias, or deliberately dropped. Aliases are terms users type, not moved sentences.
- **Over-enrichment:** adequate text polished, a translation gap treated as a meaning gap, context added to fill the field (identifier, name or geographic columns need a real query rule or alias), or a definition (owner entity, grain, unit, code meaning, date role, summability) inferred from a name.
- **Removed limitations:** availability or completeness limits dropped without evidence they no longer apply. Keep documented source limits and scoped observations apart, each at its own scope.
- **Misstated changes:** a rewrite labelled as a translation, a changed locale called unchanged.
- **Duplicates:** one `duplicate` follow-up per group of identical expressions; no metadata calls one canonical or removable without owner or convention support, or points between them. Different measures (waiting time versus task duration) are not duplicates; each states its own scope without naming the other.
- **Vanished calculation issues:** unresolved issues missing from `calculation_changes`, questions and next steps.

**Record each candidate** in `baseline_review` as `{ "key", "classification", "note" }`. Unclassified candidates block a publishable verdict.

- `improvement`; `equivalent` (same meaning, reworded); `justified` (meaning changed for a stated reason, such as a corrected definition or changed expression).
- `regression`: fix it. While one is recorded, the only allowed verdict is `not-ready`.
- `unresolved` (conflicting evidence): hold the affected resources.

Mechanical checks cover structure and deterministic relationships (identity, locales, budgets, dependencies, expression pitfalls, evaluation consistency); semantic review covers meaning.

**Independent review**, where the host supports one (a subagent or second reviewer with fresh context): give it the capture, `proposal.json`, `baseline.json` and the rendered review, not your drafting conclusions; ask it for regressions, contradictions and unsupported claims; resolve material findings before finalizing. Summarize in `independent_review` who or what reviewed, when, the findings and how each was resolved, or that none was available.

## Findings and owner questions

Prioritize by impact:

| Severity | Examples |
| --- | --- |
| Critical | Unscoped access, invented definitions, misleading metrics, confidential material exposed publicly |
| High | Grain, denominator or date errors; lost eligibility or action distinctions; expression contradictions; unsupported claims that materially change selection or interpretation; unresolved meaning hidden behind confident wording |
| Medium | Missing useful synonyms, ambiguous selection, overly broad rules, incomplete units or code dictionaries, writing-contract violations that impair a public definition or useful IQ guidance |
| Low | Verbosity, repetition, provenance, verification or maintenance narration, awkward translations, while meaning and use stay clear. Escalate if it causes a material misunderstanding |

Judge each finding:

- Separate meaning errors, unsupported assertions, untested risks and writing-contract issues.
- A phrase warning is a review candidate, not a demonstrated defect or automatic blocker.
- Keep a faithful operational warning; assess the unresolved analytical use separately, never by swapping in confident wording.
- Hold a metadata edit only when its proposed definition cannot be supported; limit any analytical restriction to the affected use.
- Scoped data with no affected rows limits demonstrated impact; it does not settle the business convention. Nor does an aggregate sample that failed to verify a convention discard it.

Each finding gives the resource ID, exact before and proposed quotes, why it matters, suggested wording, whether metadata alone fixes it, a `category` (`metadata-correction`, `calculation-defect`, `needs-validation`, `unresolved-definition`, `data-limitation`, `regression`) and a `basis` (`expression`, `observed`, `untested`, `owner-decision`; see the [evidence model](baseline-and-evidence.md#evidence-model)). Ask the owner only questions that affect a defensible definition or requested use.

Calculations:

- Before flagging a nested calculation, read the operator docs and Academy examples ([formulas.md](formulas.md#grouping-and-nested-aggregation)). `GROUPINEX` can add entity grouping before an outer aggregation; the outer aggregation need not count base rows.
- Missing live execution evidence alone is not a defect, nor a reason to hold an otherwise supported calculation.
- Each follow-up opens with what is wrong or needs a decision, then a concrete next step. Distinguish proven errors, definitions to agree, missing source data, optional checks and duplicate groups.
- Keep formula recommendations apart from follow-ups, split into customer-evidenced and your own suggestions ([formulas.md](formulas.md#recommend-formulas)). Each evidenced one cites where the customer defines or uses it; no suggestion is a plain aggregation or repeats an existing resource.
- Expressions and field IDs go in `technical_details` (shown collapsed); `reason` and `validation_needed` stay in business language.

## Representative evaluation cases

Record evaluation cases in the proposal; optional fields make expectations checkable:

```json
{
  "question": "How many completed orders were there last month, and what share were refunded?",
  "language": "en",
  "category": "normal",
  "origin": "new",
  "expected_resource_ids": ["<dataset-id>", "<completed-orders-id>", "<order-date-id>"],
  "expected_filters": ["order_date in last calendar month", "status = completed"],
  "expected_unit": "orders; share as a percentage",
  "expected_population": "Distinct completed orders, not order lines",
  "expected_interpretation": "Count distinct completed orders by order date; refund share uses the same population as denominator.",
  "must_not": ["Count order lines", "Filter on shipping date"],
  "status": "not-run",
  "observed": ""
}
```

- **Planned:** `status: "not-run"`, empty `observed`, no `executed_at`. Never counts as executed.
- **Executed:** `pass`, `fail` or `partial`, with `executed_at` and `observed` (selected resources, aggregation, filters, scope, date boundaries, units, explanation, evidence for the verdict).
- **Selection:** record `selected_resource_ids` when the interface shows them, and report it apart from the answer verdict: a right answer can come from the wrong resource.
- **Carried forward:** mark cases from an earlier iteration `origin: "carried-forward"`; keep important ones and justify a dropped one in `baseline_review`.
- **Coverage:** one meaningful case per `category`, not many near-identical prompts. The review warns about a missing core category; record why one does not apply.

| `category` | Tests |
| --- | --- |
| `normal` | Real customer questions and vocabulary, in every requested language |
| `empty-population` | No eligible rows, missing values, empty denominator: a clear statement, not a guessed value |
| `boundary` | Exact thresholds, strict versus inclusive, zero and negative values |
| `duplicate-history` | Several items per order or updates per task: count entities, not rows; first versus latest update |
| `date-role` | Actual versus planned, start versus completion, duration versus elapsed age |
| `current-vs-historical` | Current stock versus a past date; start- versus completion-date cohorts |
| `multilingual-discovery` | Alternate-language terms absent from names, especially after shortening or removing context; test retrieval apart from reasoning, including a lexical-only path when exposed |
| `recorded-vs-actual` | Sent versus read; shipped versus delivered; customers with orders versus all registered customers |
| `public-definition` | "What does this mean?" answered without hidden AI context |
| `unanswerable` | The expected answer is the limitation |
| `regression` | A question an earlier iteration got wrong, or whose AI context or public limitation changed |

Compare before and after only when both actually ran with equivalent scope: the same `iq-questions.json` before drafting and after publication ([iq-evaluation.md](iq-evaluation.md)). Never fabricate a baseline or numerical improvement.

## Readiness reporting

Report coverage first, from the preview summary and `baseline.json`:

- **Inventory:** each in-scope resource's outcome, counted per kind as keep, revise and hold, with exclusions separate. Split revisions into translation-only, text and context-only changes.
- **Iteration** (with a baseline): newly discovered resources apart from existing ones newly reviewed.
- **Investigation:** what was profiled or queried, with scope, and what each check established or left open. Counts describe effort, not correctness.

Then each readiness level separately (the review shows them from `preview.summary.readiness`):

| Level | What it says |
| --- | --- |
| Metadata readiness | `verdict`, update and hold counts: is the proposed text fit to publish? |
| Calculation readiness | `calculation_changes` by class (defect, unvalidated, data gap, optional). Publishing metadata resolves none of them |
| IQ resource selection | For executed cases with `selected_resource_ids`, whether IQ picked the expected resources. Metadata validation says nothing about this; until checked, say "not tested" |
| Demonstrated answer quality | Cases planned, executed and passed. A valid preview, profile or apply proves nothing about AI answers; until cases run, say "not tested" |

In the final report, keep apart: behaviour established by expressions, findings observed in scoped data, untested risks, and owner decisions.

Localize blockers in `blockers` as `{ "capability", "reason", "resource_ids" }`, e.g. an on-time completion rate with no completed tasks in the period. One blocked capability never marks unrelated resources, or the whole review, not ready.

## AI rules and saved agents

Review every captured AI rule and saved agent before creating alternatives:

- **AI rules:** compare the published version, draft and proposed text, and every linked agent affected.
- **Agents:** compare audience, capabilities, dataset scope, AI rule links and theme.
- Check for conflicts, duplication and lost conventions. Show the comparisons in the same HTML review, with separate executable previews and approval scopes.

Flow and non-atomic activation effects: [rules-and-agents.md](rules-and-agents.md).

## Publication choices

Verdict, handoff, publication choices and approval are in [publishing.md](publishing.md#publication-choices).
