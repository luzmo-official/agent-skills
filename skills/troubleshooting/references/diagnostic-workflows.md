# Diagnostic Workflows

Decision trees for each major symptom category. Use this file when the SKILL.md tables aren't enough and you need to walk through a structured diagnosis.

## Workflow 1 — "Chart / Dashboard Won't Render"

```
1. Is the component element present in the DOM?
   ├─ NO → component name or import wrong
   │       → Check framework-specific component name (luzmo-embed-* vs luzmo-* in vanilla vs Angular/Vue)
   │       → Verify package is installed
   │       → Verify import / registration
   │
   └─ YES → element is there but invisible
       2. Is it a Flex chart or a Dashboard?
          ├─ Flex chart → most likely SIZING
          │  → Set explicit height/width on BOTH container AND component
          │  → Use DevTools to inspect computed height (likely 0px)
          │
          └─ Dashboard → most likely AUTH or DASHBOARD ID
             → Console: any 401/403?  → see Workflow 2
             → Network: createAuthorization succeeded?
             → dashboardId matches the dashboard in Luzmo?
```

## Workflow 2 — "401 / 403 from API or Embed"

```
1. Where does the error occur?
   ├─ Backend → API credentials issue
   │  → Verify LUZMO_API_KEY/LUZMO_API_TOKEN actually loaded at runtime
   │  → Not swapped (key vs token)
   │  → Region matches: api.luzmo.com (EU) vs api.us.luzmo.com (US) vs VPC host
   │  → Credentials not expired/rotated
   │
   └─ Frontend (chart/dashboard) → embed token issue
       2. Is the token being generated?
          ├─ NO → Backend createAuthorization is failing — see Workflow 2 branch above
          └─ YES
              3. Is the token reaching the frontend correctly?
                 → authKey = token.id  (NOT token.token)
                 → authToken = token.token  (NOT token.id)
                 → Token hasn't expired (default 24h)
              4. Does the token's `access` include this resource?
                 → e.g. securables list contains this dashboardId
              5. For dataset 403s, can the API-token account grant this dataset?
                 → If the dataset id is in `access.datasets` but the embed still says
                   "no access to the analytics dataset", verify the dataset is owned by
                   or shared to the account that minted the embed token.
              6. Does the token's `role` permit the action?
                 → viewer cannot edit; cannot use ACK
                 → designer/owner needed for editor scenarios
```

## Workflow 3 — "Wrong Data Showing"

```
1. Multiple charts swapping data?
   → Duplicate contextId. Make each unique.

2. Multi-tenant: user seeing other tenant's data?  (SECURITY INCIDENT)
   → Determine which pattern is in use:
     - Dashboard-level filters? → BYPASSABLE by editors — switch to Pattern 1
     - Token-level filters (Pattern 2)? → verify `filters` cover every queried dataset that needs tenant isolation in the Embed Authorization request
     - Dataset-level EmbedFilterGroup (Pattern 1)? → Verify parameterized filters on the queried dataset(s) and the specified `parameter_overrides` in the Embed Authorization request
       is set in the embed token AND the filter group is associated to all relevant datasets
     - Connection overrides (Pattern 3)? → Verify that the connection ID(s) of the queried dataset(s) are targeted by the specified `account_overrides` in the Embed Authorization request (and that the specified credentials are correct)
   → IMMEDIATELY rotate any tokens that may have leaked data (use deleteAuthorization to rotate or escalate to support@luzmo.com), then fix the pattern.
   → Escalate to `multitenancy` skill for full pattern guidance.

3. Filters not updating after a UI change?
   → contextId may be cached. Vary it or call the component's refresh API.
```

## Workflow 4 — "Title / Label / Slot Errors"

```
1. Error message includes "Invalid title" / "Invalid label" / "Invalid localized string"
   → Almost always a plain string where a localized object is required:
     title: "X" → title: { en: "X" }
   → Avoid nesting: title: { title: { en: "X" } } is also wrong.

2. Error message includes "Missing aggregationFunc"
   → Numeric measure slot missing aggregationFunc — add sum/average/etc.

3. Error message includes "Missing level"
   → datetime or hierarchy slot missing level — add 1 (year) / 3 (month) / etc.

4. Slot configured but chart still empty
   → Check chart-specific doc: required slots may be missing (e.g. donut needs 1 measure + 1 dimension).
```

## Workflow 5 — "ACK Doesn't Render"

```
1. ACK component(s) visible on the page?
   ├─ NO → package not installed / not registered
   │      → npm install @luzmo/analytics-components-kit
   │      → Check license: ACK addon enabled?
   │
   └─ YES → ACK is configuring, but no chart visible
       2. Is there a separate rendering component on the page?
          → ACK does NOT render charts. Add <luzmo-embed-viz-item> OR <luzmo-item-grid>.
       3. Is the rendering component fed from the captured slotsContents/options state?
          → Your app must subscribe to ACK events and store the state.
       4. Does the rendering type match the ACK item-type?
          → ACK item-type="bar-chart" requires Embed type="bar-chart" — exact match.
```

## Workflow 6 — "IQ Returns Wrong Answers"

```
1. Token scope — how many datasets are in token.access.datasets?
   → > 10 → narrow to 5–10 relevant datasets to reduce ambiguity.

2. Column names — are they business-friendly?
   → "amt"/"col1"/"tbl_x" hurt IQ accuracy — rename to "Order Amount", etc.

3. Currency / duration / coordinates — is subtype set?
   → Set subtype: "currency" etc. so IQ formats correctly.

4. Pre-built formulas exist for common metrics (AOV, CLV, churn)?
   → Add aggregation formulas with descriptive names.

5. License enabled?
   → IQ is an add-on. License errors → contact support@luzmo.com.

6. React Native?
   → IQ components are NOT supported in React Native.
```

When a workflow points outside this skill, escalate to the relevant skill per the SKILL.md Hand Off section.
