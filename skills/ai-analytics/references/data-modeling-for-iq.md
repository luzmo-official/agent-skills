# Data Modeling for IQ Quality

IQ accuracy depends almost entirely on how your data is modeled — names, types, descriptions, AI context, and token scope. This reference goes deeper than the SKILL.md fundamentals.

Guide: `https://developer.luzmo.com/guide/guides--managing-ai-context.md`. Consult it before writing `ai_context` payloads.

## Why Data Modeling Matters for IQ

IQ uses the dataset and column metadata you expose to it as the primary signal for choosing what to query. Unlike a human analyst, IQ has no implicit knowledge of your business — every business term must be encoded in metadata IQ can read.

If a column is called `amt` and lives in `tbl_x`, IQ has to guess what it represents. If the same column is called `Order Amount` in a dataset called `Customer Orders`, IQ has unambiguous context.

## The Four High-Impact Levers

### 1. Token Scope (Highest Impact)

The embed token's `access.datasets` controls which datasets IQ can see for that user.

**Rule of thumb:** Keep token scope to 5–10 RELEVANT datasets. More than that and IQ accuracy drops noticeably.

**Justification:** IQ must select a dataset for each question. The more datasets in scope, the more candidates IQ must rank, and the higher the chance of a wrong pick — especially if multiple datasets contain a column called "revenue" or "customer".

**Pattern:** Generate domain-specific tokens. A finance user gets a token scoped to finance datasets; a marketing user gets a token scoped to marketing datasets. Don't dump everything into one token.

```javascript
// Example: Finance user gets a token scoped to finance datasets
const auth = await client.create('authorization', {
  type: 'embed',
  username: user.id,
  access: {
    datasets: financeDatasetIds.map((id) => ({ id, rights: 'use' })),
  },
});
```

### 2. Dataset Names

Use business-friendly names. IQ matches questions to datasets by name similarity (among other signals).

| Bad | Better |
|---|---|
| `tbl_cust_data_v2` | `Customer Orders` |
| `staging_orders_raw` | `Orders` |
| `fact_sales_2024` | `Sales` |
| `dim_users` | `Users` |

### 3. Column Names

Same rule — business-friendly, unambiguous.

| Bad | Better |
|---|---|
| `amt` | `Order Amount` |
| `qty` | `Quantity` |
| `dt` | `Order Date` |
| `cust_id` | `Customer Id` |
| `mrr_eur` | `Monthly Recurring Revenue (EUR)` |

### 4. Column Types and Subtypes

IQ uses type/subtype to format answers correctly and to understand what aggregations make sense.

| Column | Type | Subtype |
|---|---|---|
| Revenue in EUR | `numeric` | `currency` |
| Order Date | `datetime` | — |
| Latitude/Longitude | `numeric` | `coordinates` |
| Session duration in seconds | `numeric` | `duration` |
| Customer Region | `hierarchy` | — |
| IP Address | `hierarchy` | `ip_address` |

Without `subtype: "currency"`, IQ formats `12300` as `12,300` instead of `€12,300`.

## Medium-Impact Levers

### 5. Column Descriptions

Add descriptions for any column where the name alone is ambiguous or business-specific.

```javascript
// In your dataset model
{
  name: 'MRR',
  description: 'Monthly Recurring Revenue — total active subscription revenue normalized to a monthly rate. Excludes one-time fees.',
}
```

When to add:
- Calculated fields where the formula matters
- Industry-specific terminology (HIPAA codes, financial instruments, etc.)
- Columns with similar names but different meanings (`Gross Revenue` vs `Net Revenue`)

Descriptions stay. They do not replace `ai_context`.

### 6. AI context (`ai_context`)

Put definitions, caveats, exclusions, and sign conventions in `ai_context` when a name or description is not enough. Example: revenue is net of refunds, or negative amounts are refunds.

IQ uses dataset, column, and formula AI context when answering and generating charts. Dashboard `ai_context` stores dashboard-level business context for AI-enabled workflows.

| Resource | Endpoint | Field |
|---|---|---|
| Dashboard (`type: "dashboard"`) | `/0.1.0/securable` | `ai_context` |
| Dataset (`type: "dataset"`) | `/0.1.0/securable` | `ai_context` |
| Column | `/0.1.0/column` | `ai_context` |
| Formula | `/0.1.0/formula` | `ai_context` |

- Plain text, nullable, shared across languages. It is not a localized `{ en: "..." }` object like `name` or `description`.
- Set `ai_context` to `null` to clear it.
- Retrieve it by listing `ai_context` in `attributes`. It is not part of text search — do not use `find.search.keyphrase` to search inside it.
- The API stores the full value. IQ may shorten long dataset, column, and formula context when building a prompt.
- Write it for the assistant, not for end-user display. Keep it short and factual. Do not put secrets in it; anyone who can read the resource metadata can read `ai_context`.
- `ai_context` is knowledge on the data. A saved Agent's published Rules are separate instructions — see `references/saved-agents.md`.

### 7. Pre-Built Aggregation Formulas

Create formulas for metrics users frequently ask about. Name them in natural language so IQ can match against the user's phrasing.

| Formula Name | Definition |
|---|---|
| `Average Order Value` | `SUM(Order Amount) / COUNT(DISTINCT Order Id)` |
| `Customer Lifetime Value` | `SUM(Order Amount) / COUNT(DISTINCT Customer Id)` |
| `Conversion Rate` | `COUNT(DISTINCT Converted Sessions) / COUNT(DISTINCT Sessions)` |
| `Net Revenue` | `SUM(Order Amount) - SUM(Refunds)` |

These pre-built formulas give IQ a deterministic answer when the user asks "what's our AOV" instead of forcing IQ to invent the calculation each time.

## Verification Checklist

After applying these levers, verify with realistic questions:

- [ ] "What's our revenue this month?" returns the right dataset and formats as currency
- [ ] "Show me orders by region" picks the right region column (hierarchy)
- [ ] "Top 5 customers by MRR" uses the MRR formula and formats as currency
- [ ] Asking the SAME question across multiple users in different token scopes returns the right datasets per user

## Anti-Patterns

- **Dumping all datasets into one giant token** — kills accuracy.
- **Renaming columns in dashboards instead of the dataset** — IQ reads dataset metadata, not dashboard overrides.
- **Skipping subtype because "the dashboard formats it anyway"** — IQ uses subtype for both formatting AND query understanding.
- **Vague descriptions like "this column has revenue data"** — be specific about units, scope, exclusions.
- **Hiding a business rule only in `description`** — put the definition or caveat in `ai_context` as well. Names and descriptions stay.

## Common Modeling Issues That Hurt IQ

| Issue | Impact | Fix |
|---|---|---|
| Column named "amt" | IQ doesn't know what it measures | Rename to "Order Amount" or "Invoice Amount" |
| 50 datasets in token context | IQ picks wrong dataset | Scope token to 5-10 relevant datasets |
| No currency subtype | IQ formats as plain number | Set `subtype: "currency"` |
| Missing column descriptions | IQ misunderstands calculated field | Add description explaining the calculation |
| Business rule only in someone's head | IQ treats refunds as revenue, or misses a caveat | Set `ai_context` on the dataset, column, or formula |
| Generic metric names | Users don't discover metrics | Use business terms: "Customer Lifetime Value" |

## Troubleshooting IQ Quality

### IQ returns wrong answers or picks wrong dataset

1. Check token scope - limit `access.datasets` to 5-10 relevant datasets max
2. Review dataset and column names - use business-friendly names, not technical codes
3. Add column descriptions for calculated fields and business-specific terms
4. Add `ai_context` for definitions, caveats, and sign conventions that the name does not carry
5. Set correct column subtypes (currency, duration) for formatting
6. Create common formulas users ask about (Average Order Value, etc.)

### IQ doesn't understand columns

- Add descriptions to ambiguous columns
- Add `ai_context` when the business meaning is not obvious from the name
- Use clear column names (not abbreviations)
- Set proper column types (datetime with format, numeric with subtype)

### License errors

- Verify IQ addon is enabled for your Luzmo organization
- Contact support@luzmo.com to activate the IQ addon
