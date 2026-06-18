# Data Modeling Reference

Column types, derived columns, aggregation formulas, hierarchy levels, and Warp acceleration.

## Reference Docs

```
https://developer.luzmo.com/api/createColumn.md
https://developer.luzmo.com/api/validateColumn.md
https://developer.luzmo.com/api/createFormula.md
https://developer.luzmo.com/api/validateFormula.md
https://developer.luzmo.com/api/createHierarchy-Level.md
https://developer.luzmo.com/api/createAcceleration.md
```

Academy references:
- Derived column operators: `https://academy.luzmo.com/article/hgn4uhmv`
- Derived columns: `https://academy.luzmo.com/article/bly4il0e`
- Aggregation formulas: `https://academy.luzmo.com/article/52tm82oo`
- IQ modeling quality: `https://academy.luzmo.com/article/e6ght1rk`

## Column Types and Subtypes

Choose the correct `type` and `subtype` for every column:

- `numeric` — numbers, currency, duration, percentage
- `datetime` — dates and datetimes (use correct subtype: date vs datetime)
- `hierarchy` — text/categorical data, geographic hierarchies
- `spatial` — coordinates, topography
- array variants — for multi-value columns

Use correct subtypes (currency, duration, date, datetime, coordinates) to unlock proper formatting, aggregation, and IQ understanding.

## Derived Columns (Record-Level Transformations)

Use derived columns for expressions computed per row.

1. Validate expression: `validateColumn` (do this first — saves time)
2. Create: `createColumn` with the expression
3. Associate the column to the dataset

Academy operators article lists all supported syntax.

## Aggregation Formulas (Aggregated Metrics)

Use formulas for metrics that depend on groupings and filters (e.g., profit margin, growth rate).

1. Validate expression: `validateFormula`
2. Create: `createFormula`
3. Associate to the dataset

Formulas are different from derived columns — they operate across grouped/filtered rows, not per row.

## Hierarchy Levels

Use when a hierarchy column needs an explicit tree structure with named levels.

- Hierarchy levels are separate resources (`createHierarchy-Level`)
- Must be associated to the hierarchy column after creation

## Warp (Data Acceleration)

Use Warp when datasets exceed ~1M rows or query performance is slow. Warp syncs data into Luzmo's optimized analytics warehouse.

Docs: `https://developer.luzmo.com/api/createAcceleration.md`

Key config options:

| Option | Values |
|---|---|
| `load_type` | `full`, `delta`, `full-delta` |
| `data_storage_strategy` | `insert`, `insert-update`, `insert-update-delete` |

Delta sync requirements:
- `created_at_column_id` — always required for delta
- `updated_at_column_id` + `primary_key_column_ids` — required for `insert-update` and `insert-update-delete`
- `deleted_at_column_id` — additionally required for `insert-update-delete`

`full-delta` = delta syncs with a periodic full sync for hard-delete reconciliation.

## IQ-Relevant Modeling Tips

- Use clear, descriptive dataset and column names — IQ uses them for data selection.
- Set correct column types and subtypes, especially for dates, currencies, and durations.
- Add common business metrics as explicit formulas where possible.
- Add column descriptions to help IQ understand business logic.
