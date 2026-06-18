# Dashboard API Reference

Complete reference for programmatically creating and modifying dashboards via the Luzmo API.

## Reference Docs

```
https://developer.luzmo.com/api/createDashboard.md
https://developer.luzmo.com/api/searchDashboard.md
https://developer.luzmo.com/api/updateDashboard.md
https://developer.luzmo.com/guide/flex--component-api-reference--filters.md
```

For each chart type placed on the dashboard, consult:
`https://developer.luzmo.com/flex/charts/{chart-type}.md`

## Dashboard `contents` Structure

```json
{
  "version": "0.1.99",
  "syncScreenModes": true,
  "timezone": { "type": "fixed", "id": "UTC" },
  "parameters": [],
  "filters": {},
  "datasetLinks": { "<dataset-uuid>": [] },
  "views": []
}
```

| Field | Notes |
|---|---|
| `version` | Always `"0.1.99"` |
| `syncScreenModes` | When `true`, desktop changes sync to other screenmodes |
| `timezone` | `{ "type": "fixed", "id": "<tz>" }` or `{ "type": "user" }` |
| `datasetLinks` | Every dataset UUID referenced by items must appear here as `"<uuid>": []` |
| `filters` | Reserved; set to `{}` |

`contents` is **fully replaced** on update — always retrieve first, modify, then send back.

## Common Dashboard Manipulation Recipes

### Add a New Chart to Dashboard

```javascript
const response = await client.get('securable', {
  find: { where: { id: dashboardId } }
})

const newChart = {
  id: generateUniqueId(),
  type: 'bar-chart',
  position: { col: 0, row: 0, sizeX: 24, sizeY: 22 },
  slots: [...],
  options: {...}
}

// Find the desktop view (or whichever screenmode you want to modify)
const desktopView = response.data[0].contents.views.find(v => v.screenModus === 'desktop')
desktopView.items.push(newChart)

await client.update('securable', dashboardId, {
  contents: response.data[0].contents
})
```

### Remove a Chart from Dashboard

```javascript
const response = await client.get('securable', {
  find: { where: { id: dashboardId } }
})

const contents = response.data[0].contents
// Find the view containing the chart (usually desktop)
const desktopView = contents.views.find(v => v.screenModus === 'desktop')
desktopView.items = desktopView.items.filter(
  chart => chart.id !== chartIdToRemove
)

await client.update('securable', dashboardId, {
  contents
})
```

### Update a Specific Chart in Dashboard

```javascript
const response = await client.get('securable', {
  find: { where: { id: dashboardId } }
})

const contents = response.data[0].contents
// Find the view containing the chart (usually desktop)
const desktopView = contents.views.find(v => v.screenModus === 'desktop')
const chartIndex = desktopView.items.findIndex(
  chart => chart.id === chartId
)

if (chartIndex !== -1) {
  desktopView.items[chartIndex].options.title = { en: "New Title" }
}

await client.update('securable', dashboardId, {
  contents
})
```

### Add a Filter Item to a Dashboard

```javascript
const response = await client.get('securable', {
  find: { where: { id: dashboardId } }
})

const newFilter = {
  id: generateUniqueId(),
  type: 'date-filter',
  slots: [...],
  options: {...}
}

const contents = response.data[0].contents
const desktopView = contents.views.find(v => v.screenModus === 'desktop')
desktopView.items.push(newFilter)

await client.update('securable', dashboardId, {
  contents
})
```

## Views (Screenmodes)

Available values: `"desktop"`, `"tablet"`, `"mobile"`.

```json
{
  "screenModus": "desktop",
  "options": {
    "theme": { "id": "default" },
    "share": { "poweredBy": false, "showBackground": false },
    "showTitle": false,
    "columns": 48,
    "rowHeight": 16,
    "maxCols": 48,
    "minCols": 48
  },
  "items": [],
  "filterGroups": []
}
```

Grid: 48-column, `rowHeight: 16` px. Positions and sizes are in grid units.

## Items

```json
{
  "id": "<unique-uuid>",
  "type": "<chart-type>",
  "position": { "col": 0, "row": 0, "sizeX": 24, "sizeY": 22 },
  "slots": [],
  "options": {}
}
```

- Generate a fresh UUID for every item.
- `slots`/`options` follow the Flex chart spec; consult the chart-type doc first.

### Slot Content Fields

```json
{
  "column": "<column-uuid>",
  "set": "<dataset-uuid>",
  "label": { "en": "My label" },
  "type": "numeric|datetime|hierarchy",
  "level": null,
  "aggregationFunc": "sum"
}
```

- `level` is **required** for `datetime` (1=year…9=ms) and `hierarchy` columns.
- `aggregationFunc` for measures: `sum`, `count`, `average`, `min`, `max`.
- Use `columnId`/`datasetId` (camelCase) in filter parameters — `column_id`/`dataset_id` are deprecated.

## Global Filter Groups (`view.filterGroups`)

```json
{
  "id": "<uuid>",
  "origin": "global",
  "condition": "and",
  "datasetId": "<dataset-uuid>",
  "filters": [
    {
      "expression": "? = ?",
      "parameters": [
        { "columnId": "<column-uuid>", "datasetId": "<dataset-uuid>", "level": 1 },
        "Asia"
      ],
      "properties": { "id": "<uuid>", "type": "where", "origin": "global" }
    }
  ],
  "subGroups": []
}
```

## Filter Expressions

`"? = ?"` | `"? != ?"` | `"? in ?"` | `"? not in ?"` | `"? like ?"` | `"? not like ?"` |
`"? starts with ?"` | `"? ends with ?"` | `"? < ?"` | `"? >= ?"` | `"? between ?"` |
`"last_now"` | `"to_date"` | `"last_available"` | `"last_completed"` | `"next_now"` |
`"next_full"` | `"WTD"` | `"MTD"` | `"QTD"` | `"YTD"` | `"? is null"` | `"? is not null"`

Condition operators: `"and"` | `"or"`

## Parameters (Dynamic Filter Values)

```json
{
  "parameters": [
    {
      "parameter": "metadata.brand",
      "type": "array[hierarchy]",
      "value": ["Default Value"]
    }
  ]
}
```

Types: `"array[hierarchy]"`, `"array[numeric]"`, `"datetime"`. Note: string values use `"hierarchy"` — there is no `"array[string]"`.

## Chart Type Catalog

| Category | Types |
|---|---|
| Bar/Column | `bar-chart`, `column-chart` |
| Line/Area | `line-chart`, `area-chart` |
| Pie/Donut | `donut-chart` |
| Tables | `regular-table`, `pivot-table`, `heat-table` |
| Numbers | `evolution-number`, `conditional-number`, `circular-gauge`, `speedometer-chart`, `bullet-chart` |
| Filters | `date-filter`, `dropdown-filter`, `slicer-filter`, `slider-filter`, `search-filter` |
| Maps | `choropleth-map`, `marker-map`, `hexbin-map`, `symbol-map` |
| Other | `scatter-plot`, `treemap-chart`, `sankey-diagram`, `funnel-chart`, `text`, `image` |

Full schemas: `https://developer.luzmo.com/flex/charts/{chart-type}.md`
