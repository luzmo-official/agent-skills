# Formula interpretation

## Contents

- [Public references](#public-references)
- [Review the actual calculation](#review-the-actual-calculation)
- [Grouping and nested aggregation](#grouping-and-nested-aggregation)
- [Common review checks](#common-review-checks)
- [Recommend formulas](#recommend-formulas)

## Public references

Read the relevant public source before interpreting an unfamiliar operator:

| Question | Source |
| --- | --- |
| Aggregation, chart grouping and nested calculations | [Academy: Aggregation formulas](https://academy.luzmo.com/article/52tm82oo) — start here for grouping options, worked examples and current limitations. |
| Expression syntax and supported aggregators | [Developer Docs: Create Formula](https://developer.luzmo.com/api/createFormula.md). Use as a reference; formula creation is outside this metadata workflow. |
| Checking a candidate expression | [Developer Docs: Validate Formula](https://developer.luzmo.com/api/validateFormula.md). Validation checks expression acceptance, not whether it answers the business question. |
| Row-level transformations and operator help | [Academy: Using derived columns](https://academy.luzmo.com/article/bly4il0e). |

## Review the actual calculation

Trace the saved expression and its calculated-column dependencies. Identify the counted object, grouping, population, dates, units, missing-value handling and denominator. Compare that result with the intended business question. A misleading name can require a metadata correction without a formula repair.

Use public documentation for operator behavior and customer evidence for business meaning. If documentation does not resolve a material ambiguity, record it and use an authorized, bounded query or ask Luzmo support. Missing execution evidence alone does not establish a defect.

## Grouping and nested aggregation

The Developer Docs describe `GROUPINEX(aggregation, [included_columns], [excluded_columns])` as adding or removing grouping columns. Inspect the query's dimensions as well as the formula. Grouping changes must not be confused with changing the population filters.

Academy's nested-aggregation example calculates a total per store, then averages those store totals. The inner aggregation must have a finer grouping than the outer one. Check the article's current connector and nesting limitations before proposing a change.

For a fictional customer-order analysis, consider:

```text
SUM(IF(GROUPINEX(COUNTD(order_id), [customer_id], []) >= 3, 1, 0))
```

The names above are placeholders, not executable column references. Applying the documented grouping rules, the intended stages are:

1. Count distinct orders per customer within each query group.
2. Mark customers with at least three orders as 1, others as 0.
3. Sum the marks to count qualifying customers.

Customers with 2, 3 and 4 orders give a qualifying-customer count of 2. This is a worked interpretation, not a customer-data test. Do not assume the outer sum counts the original order rows.

When reporting by region, each region has its own customer groups. A customer represented in more than one region can contribute to more than one regional result. Check missing customer IDs and requested date filters separately.

## Common review checks

- Conditional counts: distinguish a matching-row count from a count of distinct business objects. Both non-null branches of `COUNT(IF(condition, 1, 0))` contribute; a zero is not a null.
- Rates: numerator and denominator must represent compatible populations. History entries divided by distinct events do not automatically measure an event share.
- Repeated attributes: define the entity population before summing an attribute repeated across transactions or history entries.
- Dates: distinguish start-date cohorts, completion-date cohorts and current-state calculations. Do not assume a saved formula imposes the requested reporting period.
- Boundaries: retain strict versus inclusive thresholds and meaningful zero or negative values. Do not invent runtime results for empty denominators.

Reading a public example or obtaining successful expression validation does not prove a customer's business result. Separate a demonstrated calculation error, an unresolved definition, missing source data and an optional execution check. Record the public source and the next action in the review's technical details.

## Recommend formulas

Recommend a saved formula only when it captures business logic that people would otherwise rebuild, or get wrong, in every chart and IQ question, or when it names a measure in the terms users ask with. Do not recommend a plain aggregation of one column (`SUM(amount)`, `AVG(duration)`, `COUNTD(customer_id)`) for its calculation: chart builders and IQ already build these without a formula, and `review.mjs` warns about them. The one exception is a [named measure](#named-measures) that gives such an aggregation the business name people use. Search the captured formulas and derived columns first: when one already computes the calculation, describe or repair it instead of adding another.

### Where candidates come from

Look for candidates in these sources and record the one you used as `evidence`:

| Source | What to look for | Evidence `type` |
| --- | --- | --- |
| Descriptions and AI context in every locale, and rule text | A calculation written as prose: "active customers have at least one order in the last 90 days", "margin is revenue minus cost, excluding shipping" | `source-metadata` |
| `artifacts/usage-patterns.json` ([commands](commands.md#usage-patterns)) | A `candidate` pattern: a measure with the chart's own filters, an ad-hoc expression, a special aggregation, a period comparison or a `business-label`, especially one repeated across charts | `dashboard` |
| Owner input and documented conventions | A KPI the owner names, or an agreed definition | `owner`, `convention` |
| The dataset itself | A share, rate, per-entity average or threshold count that its grain and fields make natural but nobody defines yet | `research`, `inference`, `profile` |

- `origin: "evidenced"`: the customer already defines or uses the calculation (first three rows). Cite at least one `source-metadata`, `convention`, `dashboard` or `owner` item.
- `origin: "suggested"`: your own recommendation for this data (last row). Give the business reason in `reason`.
- The review shows the two groups separately, so the reader can tell existing practice from an idea. Usage proves neither the definition nor its correctness: an evidenced candidate needs the owner's agreement just like a suggested one.

### Named measures

Dashboards are usually built for their end users, so chart labels often carry the words those users ask IQ with. `usage-patterns.json` lists labels with words beyond the source name and default aggregation wording as `business_labels`, with the `business-label` signal. The comparison is mechanical and English-centred, so judge every label yourself, and decide by what the term names:

- **Named measure (a new formula)** when the term names one specific aggregation, optionally with the filters it always comes with, that no captured resource computes: "Units sold" for the distinct count of `line_id`, "Open pipeline" for the sum of `amount` on open opportunities. A saved formula with that name, a description and AI context lets IQ match the wording, even when the expression is a plain aggregation. Recommend it when the term is a concept users plausibly ask about, recurs across charts or dashboards, and its meaning follows from the measure and filters the charts apply.
- **Alias (no formula)** when the term names something that already exists: the column's own values whatever the aggregation ("Turnover" for `net_revenue`, used with sums and averages alike), a translation of the column name, or an existing saved formula. Propose the term as a discovery alias in that resource's AI context, or in its description when people need it.
- **Neither** when the label is decoration or a chart title ("Revenue overview"), names a one-off view, or different charts use the same label for different calculations; raise an owner question for the last case.

Recording a named measure:

- `origin: "evidenced"`, with the charts as `dashboard` evidence.
- `proposed` with the `name`, `description` and `ai_context` it would get, in every agreed language, following the same contract as other metadata ([metadata-design.md](metadata-design.md)): the description states business meaning, unit and limits without mentioning dashboards or charts; the AI context holds selection cues and aliases.
- `review.mjs` checks these like captured metadata (Luzmo limits, budgets, phrase checks, no dashboard or chart mentions in name or description), warns when the name is already used by a resource or another candidate, and skips the plain-aggregation warning for such a candidate.
- Usage shows the term, not the definition. When the charts' filters or units leave the meaning open, ask the owner.

### Patterns worth recommending

Placeholders in the expressions are not executable column references.

| Pattern | Fits questions like | Shape | Check |
| --- | --- | --- | --- |
| Conditional aggregation with business logic | Revenue from refunded orders; hours billed on weekends | `SUM(IF(status = 'refunded', amount, 0))` | Use `NULL`, not 0, as the else branch inside `COUNT`/`COUNTD`; state which rows the condition keeps |
| Derived expression inside an aggregation | Margin; amount including tax; duration in hours | `SUM(revenue - cost)`, `AVG(DATE_DIFF('hour', started_at, ended_at))` | Missing inputs make the row null; decide whether those rows belong to the population |
| Rate with matching populations | Conversion rate; on-time share | `COUNTD(IF(converted = TRUE, lead_id, NULL)) / COUNTD(lead_id)` | Numerator and denominator count the same object; an empty denominator gives no result |
| Share of total | Each region's share of revenue | `SUM(amount) / GROUPFULL(SUM(amount))` | `GROUPFULL` aggregates over the whole dataset instead of the chart group; confirm with the Academy article how filters affect the total, and say which total the share is of |
| Per-entity aggregate, then summarise | Mean revenue per customer; mean items per order | `AVG(GROUPINEX(SUM(amount), [customer_id], []))` | The inner grouping must be finer than the chart's; repeated attributes need `MAX` per entity, not `SUM` |
| Count of entities meeting a threshold | Customers with three or more orders | `SUM(IF(GROUPINEX(COUNTD(order_id), [customer_id], []) >= 3, 1, 0))` | Strict versus inclusive boundary; see the worked example above |

Expression grammar:

- `IF` takes exactly three arguments; there is no `CASE` or `IN`.
- `COUNTR()` counts rows. Aggregations nest at most three deep.
- `GROUPED`, `GROUPFULL` and `GROUPINEX` wrap an aggregation. An inner `GROUPFULL` under a plain outer aggregation is rejected, and an inner grouping must use strictly more columns than its parent.

Validation: the scripts do not call [Validate Formula](https://developer.luzmo.com/api/validateFormula.md). When an authorized tool for it is available, check the candidate and record the outcome in `technical_details`; otherwise name expression validation in `validation_needed`. Acceptance does not show the formula answers the question.

### Recording a recommendation

- Record each recommendation as a `calculation_changes` entry with `classification: "optional"`, empty `resource_ids` until it exists, `origin`, `evidence`, `intended_question`, `result_grain`, `population`, `expression_candidate`, `dependencies` (captured column IDs), the `boundary_cases` that change its result, and `proposed` metadata when naming is part of it ([proposal-format.md](proposal-format.md#calculation-candidates)). Keep `reason` and `validation_needed` in plain business language; put the expression and validation outcome in `technical_details`.
- A few well-founded recommendations beat a long list. Skip a pattern when the data or the questions do not call for it.
- Never refer to a recommended formula from existing metadata or AI context; it does not exist until the owner builds it.
- Offer new formulas and expression repairs as separate opt-ins in the [publication choices](publishing.md#publication-choices), with a recommendation grounded in their evidence and readiness.
- Selecting one starts a concrete implementation plan; it does not create the formula or change an expression, and neither apply script does. Get specific approval of the prepared calculation operations before running them with suitable authorized API tooling.
