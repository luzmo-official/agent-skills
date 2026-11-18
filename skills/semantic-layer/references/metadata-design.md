# Metadata design

Semantic decisions while drafting. Field formats and budgets: [writing metadata](writing-metadata.md). Calculation mechanics: [formulas](formulas.md). Examples are fictional and assume only their stated conditions.

## Contents

- [Public meaning and internal interpretation](#public-meaning-and-internal-interpretation)
- [No source references, provenance or maintenance narration](#no-source-references-provenance-or-maintenance-narration)
- [Validate existing definitions, then preserve](#validate-existing-definitions-then-preserve)
- [Enrich selectively](#enrich-selectively)
- [Preserve and improve](#preserve-and-improve)
- [AI context: self-contained guidance for IQ](#ai-context-self-contained-guidance-for-iq)
- [Define measures precisely](#define-measures-precisely)
- [Recorded events and assumed outcomes](#recorded-events-and-assumed-outcomes)
- [Duplicate and related calculations](#duplicate-and-related-calculations)
- [Context format and budgets](#context-format-and-budgets)

## Public meaning and internal interpretation

- **Descriptions** explain a resource to its human audience: meaning, unit, eligibility and material interpretation limits. They must stand on their own.
- **AI context** guides IQ with additional selection cues, complete query rules, interpretation guards and discovery aliases.
- Metadata permissions still apply to context: it is not confidential by definition and is no secret store. Never put credentials, personal records or instructions that override security or disclosure behaviour in it.

| Scope | Description | Additional IQ guidance |
|---|---|---|
| Dataset | Purpose, business row grain, coverage and boundaries | Supported analytical scope; how to count entities when rows repeat |
| Column | Field ownership and meaning, units, useful codes, date role, missing/negative-value meaning | Resource-specific filters, grouping, aggregation, substitutions to avoid, aliases |
| Formula | Result type, grain, population/denominator, eligibility, unit and material limits | Questions it fits; slicing/filtering rules needed to preserve meaning |
| Shared AI rule | Shared vocabulary or response preferences, applied only through linked agents ([rules-and-agents.md](rules-and-agents.md)) | Never a substitute for individual field definitions |

Put each fact at its lowest owning scope. A dataset-wide instruction such as "always use one date", "exclude cancelled rows" or "treat negatives as errors" can break legitimate questions; state the conditional rule on the measure it governs.

## No source references, provenance or maintenance narration

Published metadata states supported meaning directly. Evidence sources, review history, verification status, dashboard-use references, implementation walkthroughs, duplicate inventories, legacy labels and naming repairs belong in review artifacts. When dashboards are the business subject of product-usage data, describing them is fine; citing their usage as a definition is not.

Removing narration must keep the substance and reassess the assertion:

- "Includes waiting time; charts use it as the main KPI": keep the interpretation limit, remove the usage claim.
- "Dashboards count distinct orders": removing "dashboards" does not establish the counting rule. Check the expression, a documented convention or the owner.
- "Time to finish, with the same caveats as Total time": state the actual caveat completely on this resource.
- "Despite its name, a mean per line": describe "Mean net revenue per order line" and record the rename separately.

Where rejected public prose goes:

- A reader-relevant fact stays public.
- An IQ query rule may move to context. Do not move prose into context automatically.
- Reviewer-only narration is removed.
- Useful customer terms survive separately as short aliases when discovery needs them.

## Validate existing definitions, then preserve

For each in-scope calculated resource, reconcile five things: the intended question, every description locale, the expression and relevant dependencies, documented conventions, and scoped usage or query evidence. Existing text is customer knowledge, not proof. Expressions establish computational behaviour, not the owner's intended business policy.

| Problem | Record it as |
|---|---|
| Wording contradicts a correct expression | Metadata correction; revise to supported current behaviour |
| Expression demonstrably fails its intended question | Calculation `defect`; state its current behaviour and material limitation |
| Plausible concern still unproven | Calculation `unvalidated`, with the check or decision required |
| Definition depends on an owner decision | Owner question; hold the affected wording |
| Source data cannot support the requested measure | Calculation `data-gap` and next action |
| Identical expressions | One `duplicate` follow-up with all IDs |
| Useful new saved calculation | `optional`, marked `evidenced` or `suggested` |

Never silently repair an expression or describe behaviour it does not implement. Missing live execution alone is not a defect; read the documented grouping behaviour before judging nested aggregation.

## Enrich selectively

- Name the gap before revising: missing definition, incorrect meaning, unit, code meaning, translation, query rule or discovery alias. With no gap, keep the text and say why it suffices.
- Completion counts and character usage are not quality measures.
- Simple identifiers, names and geographic dimensions usually need a short description and null context. A bounded repetition check can still matter when entity grain, distinct counting or repeated attributes change a measure. Never infer global uniqueness or aggregation semantics from a field name or a few rows.
- A missing translation is a language gap, not permission to change meaning.
- Drafting from supplied text needs no live audit, but raise a visible contradiction instead of polishing a known error.

## Preserve and improve

- Compare revised clauses for lost actions, exclusions, populations, thresholds, date roles, missing-value handling and aliases.
- Preserve documented availability and completeness limits. Scoped missingness in a sample is a different claim.
- A fact may stay, move to its owning resource with a `knowledge_migrations` record, or be corrected or removed for a stated evidential reason.
- Keep every existing locale key, even one holding text in the wrong language; correct it deliberately instead of deleting it.
- Keep exact useful status labels beside translations. "Order placed", "payment received", "message sent" and "message read" are different events.
- Use explicit count, share, frequency, mean or median wording, and units.
- A concrete limitation helps a reader: "Without a completion time, task duration cannot be calculated." "Not verified", "unit unspecified" or "validate before use" reports review status, not meaning: put the open issue in a question or follow-up. Never turn uncertainty into confident wording.

## AI context: self-contained guidance for IQ

Admit a clause only when it:

1. Helps IQ select, query or interpret this resource correctly, or preserves a necessary documented selection convention.
2. Adds something beyond the descriptions in every locale; a translation is still repetition.
3. Does not hide the only statement of a reader-relevant definition, unit, eligibility rule or limit.
4. Is supported by an expression, documented convention or owner, not by usage or preference alone.
5. Is specific enough to act on. Generic cautions, reliability claims and formula syntax that IQ already receives add noise.

Query rules:

- Keep required companion-column conditions together: filters and values, grain, date role and missing-value handling where needed. Never send IQ to another context to assemble the rule.
- Naming a companion field used for filtering or grouping is legitimate query guidance, not a redirect.
- Describe adjacent resources by their own positive scope: "Fits delays before work begins" versus "Fits elapsed time from task start to completion".
- For a defective or unvalidated metric, use null or only guidance the current expression supports, keep material limits public, and never invent a use case.

A direct selection pointer ("use X instead") is exceptional. It needs all of:

- A documented or owner-confirmed convention, with explicit question scope and business distinction.
- An accessible captured target that supports that use.
- No onward or backward pointer chain.
- A material ambiguity that the current resource's own scope cannot explain.

Usage, a familiar name or reviewer preference is not enough, and legitimate uses of the current field stay. Example: an owner-confirmed cross-region reporting policy can direct regional classifications to `reporting_category` for cross-region comparisons. Without that policy, describe each classification's own scope.

Aliases:

- A few alternate-language or customer terms for this resource, prefixed `Aliases:`. Not related concepts, causes, translated definitions or review history.
- Discovery may use names and context rather than descriptions, and not every deployment exposes both at every step, so test retrieval separately from downstream reasoning.

Before choosing null context:

- Compare captured context and relevant earlier proposals. Clearing published text differs from withdrawing an unpublished draft addition.
- Account for each useful fact and where it survives; record moves or justified removals.
- Check the remaining scope, query rules, guards and useful discovery terms.
- If nothing additional remains, use null rather than blank text or invented advice.

Clearing populated captured context requires `allow_clear: true` and a substantive `knowledge_migrations` entry ([proposal-format.md](proposal-format.md#ai-context-field)). That structural check does not prove preservation. Phrase warnings can misread legitimate query rules and miss paraphrased redirects; resolve them semantically in every language.

## Define measures precisely

Preserve every distinction the expression makes:

- Rows versus distinct entities, events or attempts. History and line tables repeat entities. `COUNT(IF(...,1,0))` counts the non-null zero branches too.
- Count, proportion, frequency, mean and median. A frequency can exceed one; it is not a share.
- Numerator and denominator populations, grains and time cohorts. A row numerator over a distinct-entity denominator changes meaning.
- Eligibility: required dates, positive thresholds, statuses and exclusions.
- Zero, missing, negative and undefined values. Replacement such as COALESCE can turn absence into zero.
- Strict versus inclusive thresholds, with exact values and units.
- Elapsed duration versus calendar deadline; working versus calendar time, rounding and reference time. Refresh-relative age differs from query-time age.
- Actual versus planned dates, first versus latest updates, recorded status versus outcome.
- Current stock versus start- or completion-date cohorts or historical stock. NOW-relative age does not reconstruct history.

For a zero denominator, explain the business situation ("no eligible orders") without guessing runtime null or error behaviour. Grouping and nested operators: [formulas](formulas.md).

## Recorded events and assumed outcomes

A record establishes only the recorded event:

- Shipped does not prove received; sent does not prove read.
- No completion timestamp does not prove never completed.
- Multiple attempts do not prove every earlier attempt failed.
- Customers with activity are not all registered customers.

Before calling summed task durations "total working time", inspect overlaps, window-crossing tasks and missing end times. A percentage may need entities with no activity in its denominator. State supported behaviour and record source or calculation gaps separately.

## Duplicate and related calculations

- Whitespace-normalized expression identity is a maintenance signal, not a canonical designation.
- Give each duplicate a complete standalone definition.
- Record one `duplicate` follow-up with all IDs and the owner decision or reference checks needed. Newer names or wider usage grant no deletion authority.
- A cleanup preference stays in the follow-up, never in a context redirect.
- Shared inputs or similar names do not make measures duplicates. Waiting-to-start and start-to-completion durations answer different questions: establish the difference from expressions or supported definitions, and describe each positively.

## Context format and budgets

Lead with useful scope, then query rules and guards, then short aliases. Keep only details that change selection, querying or interpretation. Budgets are ceilings, never targets; exact limits are in [writing metadata](writing-metadata.md#budgets-and-api-limits). Never truncate silently.

Example for a fictional order-line dataset, assuming EUR excluding tax, negative refund lines and a completed-order status:

| Resource | Description | Context |
|---|---|---|
| Dataset | Order lines, one row per order item, covering sales and refunds. | To count orders, count distinct order_id. Aliases: line items. |
| Revenue | Net line revenue in EUR, excluding tax. Negative values represent refunds. | For net-sales questions, keep refund lines; do not filter to positive amounts. |
| Delivery lead time | Days from order placement to delivery of the line. Lines not yet delivered have no lead time. | Do not substitute promised_delivery_date for a missing delivered_at. |
| Identifier | Order-line identifier. | null unless a supported query rule or discovery alias is needed |

These illustrate writing decisions, not customer business rules. Establish actual entities, units, statuses, populations and filters from evidence.
