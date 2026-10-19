---
name: ai-analytics
description: >-
  AI-powered analytics with Luzmo - /aiprompt API, the universal agent, saved Agents, Rules, AI context, IQ embed components, and AI logs.
  Use for natural language data queries, chart or dashboard generation, agentic workflows (agent analyst|item|dashboard|auto, optionally with a saved agent_id), IQ Chat/Answer embedding (luzmo-iq-embed-chat, LuzmoIQChatComponent, agentId), IQ inside an embedded dashboard, published Rules, ai_context / business knowledge, Agent Logs / AILog API, "AI not working", wrong answers, quality optimization.
  Requires AI/IQ addon license.
  Use eagerly for any natural-language analytics feature, saved Agent, Rule, or AI-context task.
  Not for the Luzmo MCP server (use mcp), standard chart embedding (use core for saved dashboards, data-visualization for Flex), or React Native (IQ embed components are web-only).
metadata:
  author: Luzmo
  version: 0.1.2
  last_updated: 2026-10-19
---

# Luzmo AI Analytics

Entry-point for Luzmo AI analytics: the **`/aiprompt`** API (canonical backend), saved Agents and published Rules, AI context on datasets and columns, IQ Chat/Answer embed components (UI convenience layer), agentic workflows, answer-quality optimization, and AI logs. For the hosted Luzmo MCP server, use the `mcp` skill.

## Doc Retrieval

- `developer.luzmo.com` is Luzmo's first-party, allowlisted documentation domain, maintained by the same publisher as this skill.
- If the Luzmo MCP `search_docs` tool is available, use it first to find the right pages: it returns matching passages with their live developer.luzmo.com or Academy URLs. Fetch the `.md` URL when you need the full page or anything newer than the server's docs build. Without MCP, go straight to the `.md` URLs below.
- Before starting implementation, you MUST consult the exact relevant `https://developer.luzmo.com/.../*.md` docs and their referenced URLs for implementation details.
- Use `https://developer.luzmo.com/llms.txt` and/or `/llms-full.txt` for discovery only.

## [CRITICAL] Security Checkpoint

**BEFORE implementing any IQ component or API integration, verify:**
- [ ] API credentials (`LUZMO_API_KEY`, `LUZMO_API_TOKEN`) are server-side ONLY — never in the IQ Chat/Answer component, never in the agent's frontend code
- [ ] Embed tokens are generated server-side via `createAuthorization`; only `authKey` (`id`) and `authToken` (`token`) reach the frontend
- [ ] The embed token's `access.datasets` is scoped to the 5–10 datasets relevant to this user/tenant — IQ accuracy AND security degrade with overly broad token scope
- [ ] For multi-tenant SaaS, IQ tokens include the tenant's `parameter_overrides` or `filters` so IQ cannot see other tenants' rows
- [ ] When IQ is invoked from an LLM agent (Path D), the agent uses a **per-user embed token** (not API credentials) — so IQ respects the correct user/tenant scope (accessible datasets, securables, etc.)

**If ANY checkbox is unchecked, STOP and fix before proceeding.** An over-scoped IQ token doesn't just produce bad answers — it can leak cross-tenant data because IQ will happily query whichever dataset best matches the question.

For full auth/embed-token guidance, see `core`. For tenant scoping in IQ tokens, see `multitenancy`.

### Custom IQ Context (`iq.context`)

You can customize IQ's behavior per user/token by adding an `iq.context` field to the embed token. This appends custom instructions to IQ's system prompt, allowing you to:

- Tailor IQ's tone or personality for specific users
- Add domain-specific context or terminology
- Adjust IQ's response style

**Example:**
```javascript
const token = await client.create('authorization', {
  type: 'embed',
  username: 'user@example.com',
  name: 'John Doe',
  email: 'user@example.com',
  access: {
    datasets: relevantDatasetIds.map((id) => ({ id, rights: 'use' })),
  },
  iq: {
    context: "You are a sales analytics assistant. Always prioritize revenue metrics and use sales terminology. Be concise and actionable."
  }
})
```

The `iq.context` value is appended to IQ's base system prompt for queries made with that token. On a call it is combined with per-request `context` and, when invoking a saved Agent, that Agent's published Rules. Business knowledge on the data itself belongs in `ai_context`, not in this token field — see Path E and `references/saved-agents.md`.

## Core Principles

### License Requirements

IQ is available as an **add-on** — if the user encounters a license error, contact support@luzmo.com.

**[WARNING] React Native Limitation:** The IQ Chat and Answer components are **NOT supported** in React Native. Only web platforms (browser-based React, Angular, Vue, vanilla JS) are supported.

### Component Names (Common Mistake)

Use the correct component names with `-embed-` in them:

| Framework | Chat Component | Answer Component |
|---|---|---|
| Vanilla JS / Web Components | `luzmo-iq-embed-chat` | `luzmo-iq-embed-answer` |
| React | `LuzmoIQChatComponent` | `LuzmoIQAnswerComponent` |
| Angular | `NgxLuzmoIQChatComponent` / `<luzmo-iq-chat>` | `NgxLuzmoIQAnswerComponent` / `<luzmo-iq-answer>` |
| Vue | `<luzmo-iq-chat>` | `<luzmo-iq-answer>` |

**Note:** Angular and Vue IQ components drop the `-embed-` infix (opposite to vanilla JS/React).

[ERROR] **WRONG:** `luzmo-iq-chat`, `luzmo-iq-answer` (missing `-embed-`) for vanilla JS/React
[OK] **CORRECT:** `luzmo-iq-embed-chat`, `luzmo-iq-embed-answer` for vanilla JS/React
[OK] **CORRECT:** `luzmo-iq-chat`, `luzmo-iq-answer` for Angular/Vue

## Bundled References

For deeper guidance, read only when relevant:

- `references/saved-agents.md` — Saved Agents and Rules: `agent_id` vs `agent`, capabilities, dataset allowlist, publish-before-apply, theme
- `references/data-modeling-for-iq.md` — Quality optimization: token scope, names, subtypes, descriptions, `ai_context`, formulas, anti-patterns
- `references/agentic-integration.md` — IQ as a tool for LLM agents: backend brokering, tool schema, optional `agent_id`, multi-turn `conversation_id`, per-user/per-tenant security
- Hosted Luzmo MCP server (tools, auth, embed sessions, `agentId` URLs): use the `mcp` skill. `references/mcp-server.md` is only a pointer.

## IQ Quality Fundamentals

IQ answer quality depends heavily on how your data is modeled and named. For full guidance with examples, read `references/data-modeling-for-iq.md` via Path E.

**Quick impact reference:**

| Factor | Impact |
|---|---|
| Dataset/column naming | High — wrong names = wrong results |
| Token context scoping (≤10 datasets) | High — ambiguity = wrong dataset |
| Column descriptions | Medium — helps calculated fields |
| `ai_context` on datasets, columns, and formulas | High — definitions, caveats, and sign conventions IQ would otherwise guess |
| Column types/subtypes | Medium — affects formatting |
| Pre-built formulas | Medium — improves consistency |

## Choose the Right Path

| Goal | Path |
|---|---|
| Full embedded conversational chat UI | **Path A — Chat component** (wraps `/aiprompt`) |
| Render AI answers without a full chat UI | **Path B — Answer component** (wraps `/aiprompt`) |
| Server-side or agentic control (programmable) | **Path C — `/aiprompt` API** |
| Plug Luzmo AI into an LLM agent as a data tool | **Path D — Agentic workflow** (uses `/aiprompt`) |
| Improve AI answer quality | **Path E — Data modeling for AI** |
| Reuse one Agent (capabilities, datasets, Rules) across calls | **Path F — Saved Agent** |
| IQ panel inside an embedded dashboard, no code | **Path G — Dashboard IQ toggle** |
| Audit what users asked and what the AI answered | **Path H — AI logs** |
| Connect Claude/Cursor/ChatGPT or your own MCP server | Use the `mcp` skill |

---

## Path A — Chat Component

Docs:
```
https://developer.luzmo.com/guide/iq--introduction--chat-component.md
https://developer.luzmo.com/guide/iq--chat-component-api.md
```

| Framework | Component |
|---|---|
| Web (vanilla JS) | `<luzmo-iq-embed-chat>` |
| React | `LuzmoIQChatComponent` |

Consult the component API doc before describing props, events, or customization options.

**Saved Agent in the chat:** set `agentId` to a saved Agent id (React/Vue prop, Angular input, web component property). The chat then runs the analyst agent with that Agent's datasets and published Rules. Needs `@luzmo/embed` / `@luzmo/react-embed` 7.3.0+, `@luzmo/ngx-embed` 9.4.0+, or `@luzmo/vue-embed` 6.3.0+. It is listed in the package changelogs, not yet in the component API reference. The Answer component has no `agentId`.

---

## Path B — Answer Component

Docs:
```
https://developer.luzmo.com/guide/iq--introduction--answer-component.md
https://developer.luzmo.com/guide/iq--answer-component-api.md
```

| Framework | Component |
|---|---|
| Web (vanilla JS) | `<luzmo-iq-embed-answer>` |
| React | `LuzmoIQAnswerComponent` |

The Answer component accepts `messages` following the `AIPrompt` structure. Consult the API doc for the exact shape.

---

## Path C — `/aiprompt` API (canonical)

> **IQ output is directly Flex-renderable (the "AI chart" bridge) — you don't need to fetch the API doc for the shape.** The `/aiprompt` response (`agent: 'analyst'`, `task: 'generate'`) returns:
> ```
> result.assistant_message.aiMessageAssets[]   // filter type === 'item'
>   .value → { type, slots, options, filters }  // a complete Flex viz-item spec
> ```
> Map each item asset's `value` straight onto a Flex viz-item — no reshaping:
> ```js
> // React: <LuzmoVizItemComponent type={a.value.type} slots={a.value.slots}
> //           options={a.value.options} filters={a.value.filters} authKey=… authToken=… />
> ```
> This is what turns an IQ answer into a live, embeddable chart. Theme the `options` per `theming` (Flex runtime theme). See `data-visualization` for the component.

**`/aiprompt` replaces the legacy IQ Backend API (IQMessage).** Consult the canonical spec before implementing:

```
https://developer.luzmo.com/api/createAIPrompt.md
```

Per-language examples: `https://developer.luzmo.com/api/createAIPrompt/call/{js|python|java|dotnet|curl|php}` (HTML call forms — no `.md` suffix).

### Request shape

```http
POST https://api.luzmo.com/0.1.0/aiprompt
Content-Type: application/json
Accept: text/event-stream   # required when stream: true
```

Consult `https://developer.luzmo.com/api/createAIPrompt.md` for the full body. Minimal teaching example:

```javascript
{
  action: 'create',
  version: '0.1.0',
  key: API_KEY,
  token: API_TOKEN,
  properties: {
    agent: 'item',              // 'analyst' | 'item' | 'dashboard' | 'auto' (universal)
    task: 'generate',           // varies per agent — see API doc
    // agent_id: '<saved-agent-uuid>',  // optional: adds a saved Agent's datasets and Rules — Path F
    conversation_id: '<uuid>',  // optional — multi-turn
    locale_id: 'en',
    timezone_id: 'UTC',
    text_format: 'plain',       // 'plain' | 'markdown'
    stream: false,
    response_mode: 'mixed',     // 'mixed' | 'text' | 'asset'
    generated_asset_locale_ids: ['fr'],
    input: [
      { type: 'text', text: 'Create a chart with sum of revenue' },
      { type: 'dataset', id: '<dataset-uuid>' }
      // also: { type: 'item', value: { ... } } for refine/describe flows
    ]
  }
}
```

### Agents and tasks

| `agent` | Typical use | Notes |
|---|---|---|
| `item` | Generate, suggest, or describe a single visualization item | `task`: `generate` \| `suggest` \| `describe` |
| `analyst` | IQ-backed natural-language Q&A (text and/or chart) | `task`: `generate` only; requires IQ addon |
| `dashboard` | Generate a multi-item dashboard, or edit one passed as `{ type: "dashboard" }` input | `task`: `generate` only; `response_mode`: `asset` \| `mixed` |
| `auto` | Universal agent: plans multi-step answers across `capabilities` (`data_analysis`, `chart_creation`, `dashboard_creation`) | `task`: `generate` only; omit `capabilities` for all the user may use; requires IQ addon |

`agent` picks which agent runs. `agent_id` is a saved Agent and can be added to any of these: it contributes its datasets and published Rules. With `agent_id` and no `agent` (or `agent: 'auto'`), the universal agent runs with the saved Agent's capabilities — see Path F.

Custom Charts registered in the organization are also used by these agents when they fit the request; to build one, use `custom-charts`.

Consult `https://developer.luzmo.com/api/createAIPrompt.md` for the full `agent` x `task` matrix, response schema, and streaming event payloads.

### `input` types

Exactly one `{ type: "text", text: "..." }` is required. Optional inputs (fetch API doc for shapes):

| `type` | Purpose |
|---|---|
| `text` | User prompt (required) |
| `dataset` | Pin dataset scope for this prompt |
| `item` | Pass existing item JSON for refine/describe flows |
| `dashboard` | For `dashboard`: edit or continue an existing dashboard. For `analyst`: the dashboard the user is viewing (charts, runtime filters, title) — not persisted as an asset |

### Streaming (SSE)

Set `stream: true` and `Accept: text/event-stream`. The API emits JSON events in order: `start` → `progress` (optional) → `text_start` / `text_delta` / `text_end` → `asset_start` / `asset_delta` / `asset_end` → `finish` (final result) — or `error` on failure. Ends with `data: [DONE]`.

Consult `https://developer.luzmo.com/api/createAIPrompt.md` for exact event payloads. Socket.IO clients on a connected socket receive the same events on the `aiprompt` channel.

### Persisted conversations and assets

`/aiprompt` auto-creates an **AIConversation** when `conversation_id` is omitted and persists user/assistant turns as **AIMessage** records. Generated charts and dashboards are stored as **AIMessageAsset** records with `type: "item"` or `type: "dashboard"`.

| Resource | When to use | Doc |
|---|---|---|
| `aiconversation` | Pre-create a titled thread, or manage conversation metadata | `https://developer.luzmo.com/api/createAIConversation.md` |
| `aimessage` | List/replay messages in a thread (`include: AIMessageAsset`) | `https://developer.luzmo.com/api/searchAIMessage.md` |
| `aimessageasset` | Fetch persisted item or dashboard JSON by asset id | `https://developer.luzmo.com/api/searchAIMessageAsset.md` |

Multi-turn: pass `conversation_id` from the previous `/aiprompt` response (or from `createAIConversation`) on the next call.

### Auth and scoping

- **Org API credentials:** use API `key` + `token` server-side only to mint scoped embed tokens; never expose them in browser code.
- **Per-user `/aiprompt`:** call with the user's embed token (`id`/`token`) that is scoped to `access.datasets` with tenant filters (see `multitenancy`) — same scoping rules as IQ embed components.
- **Streaming:** set `stream: true` and `Accept: text/event-stream` for SSE responses.

### Regions

Pin the host to your deployment: `https://api.luzmo.com`, `https://api.us.luzmo.com`, or `https://api.<vpc>.luzmo.com` — path stays `/0.1.0/aiprompt`.

---

## Path D — Agentic Workflow

Use when an LLM agent needs to answer analytics questions by calling Luzmo data programmatically.

1. Register a tool that POSTs to `/aiprompt` with the user's scoped embed token — `agent: "analyst"` for one-shot Q&A, or `agent_id` alone when a saved Agent should run. Or use the **hosted MCP server** (simpler; see below).
2. Parse the response (text, item asset, dashboard asset, or mixed per `response_mode`); use `conversation_id` for follow-ups.
3. **Hosted MCP** (Cursor, Claude, LangChain, OpenAI Agents SDK): `https://api.<region>.luzmo.com/0.1.0/mcp` with the user's embed key-token. Use the `mcp` skill for tools, embed defaults, `agentId`, and white-labeling.

Docs: `https://developer.luzmo.com/guide/guides--adding-luzmo-iq-to-agentic-workflow.md` — prefer `https://developer.luzmo.com/api/createAIPrompt.md` for request shapes.

See also `references/agentic-integration.md`.

---

## Path E — IQ Quality Optimization

Read `references/data-modeling-for-iq.md` — it is the comprehensive quality reference. The checklist, examples, and modeling issues table all live there.

Docs: `https://academy.luzmo.com/article/e6ght1rk` and `https://developer.luzmo.com/guide/guides--managing-ai-context.md`

**Applying the fixes:**

| Fix | If Luzmo MCP tools are available | Otherwise |
|---|---|---|
| Review current names, descriptions, `ai_context` | `search_datasets` (with columns) | `"action": "get"` on `securable` / `column` with `ai_context` in `attributes` |
| Write names, descriptions, `ai_context` for many datasets and columns | `update_dataset_metadata` | `updateDataset` / `updateColumn` / `updateFormula`, or the dataset page in the Luzmo app |
| Add a pre-built metric | `generate_formula` drafts it (does not save), `create_formula` saves it | `createFormula`, or the formula editor in the app |
| Change or remove a metric | `update_formula`, `delete_formula` | `updateFormula` / `deleteFormula` |

- Read the current AI context before overwriting it, and show the user what changes. `update_dataset_metadata` is destructive and keeps no copy.
- Confirm before `update_formula` or `delete_formula`: every chart that uses the metric changes or breaks.
- The tool descriptions hold the parameters. For connecting and tool availability, use the `mcp` skill.

---

## Path F — Saved Agent

Read `references/saved-agents.md` before creating, linking, or invoking a saved Agent.

A saved Agent is `properties.agent_id`. Create and configure it with the org API key (Designer or Owner); invoke it with the user's embed token.

| Request | What runs |
|---|---|
| `agent_id` only, or with `agent: 'auto'` | Universal agent with the saved Agent's capabilities (all, if it has none). Per-request `capabilities` replace them. `user_message.agent` is `auto` |
| `agent_id` + `agent: 'analyst'` (or `item`, `dashboard`) | That agent with its usual `task` and `response_mode` rules. The saved Agent's capabilities are not used |

Both add the Agent's datasets and published Rules. Associated datasets are an allowlist: a request that only names datasets outside it, or passes an item that reads one (also through a formula), returns `403`. Linked Rules apply only after a version is published. `theme_id` is not applied to returned assets — render with `theming`.

Docs:
```
https://developer.luzmo.com/guide/guides--creating-and-using-agents-through-the-api.md
https://developer.luzmo.com/guide/guides--creating-and-managing-rules-through-the-api.md
```

---

## Path G — Dashboard IQ Toggle

To add Luzmo IQ to an embedded dashboard without code, a designer enables it in the dashboard settings in Luzmo Studio. The embedded dashboard then shows a button that opens a dashboard-aware IQ panel: it respects active dashboard filters, can answer about specific charts, and inherits the dashboard theme and language. The panel is configured and previewed in Studio.

- The embed token rules still apply: scope `access.datasets` and tenant filters exactly as for the dashboard (Security Checkpoint, `multitenancy`).
- Use Path A instead when the chat must live outside the dashboard or run a saved Agent.

Docs: `https://academy.luzmo.com/article/fyeoiaei` (section "Using Luzmo IQ").

---

## Path H — AI Logs

Every AI interaction (IQ, chart and dashboard generation, AI formulas, summaries) is logged per turn, from the app, embedded components, the API, and the MCP server. Owners review them on **Settings -> Agent Logs**; the read-only `ailog` resource exposes them through the API.

- Actions: search, detail (one turn with the context used), conversation (all turns of a `conversation_id`).
- Only organization owners and admins can read them; the plan must include AI logs; retention is 30 days.
- Filter by `source` (`luzmo_app`, `embedded`, `api`, `mcp`), `suborganization_id`, `agent`, `success`, `out_of_scope`, and more. Only documented filters and attributes are accepted.
- Use them to find questions IQ refused or answered wrongly, then fix names, `ai_context`, or Rules (Path E, Path F).

Docs: `https://developer.luzmo.com/api/searchAILog.md`, `https://developer.luzmo.com/api/detailAILog.md`, `https://developer.luzmo.com/api/conversationAILog.md`, `https://academy.luzmo.com/article/de4sctwc`.

---

## Common IQ Issues

Troubleshoot these frequent problems. [WARNING] Most of them are data-modeling issues, not IQ bugs — see `references/data-modeling-for-iq.md`.

| Problem | Frequency | Likely Cause | Solution |
|---|---|---|---|
| IQ returns wrong dataset | [WARNING] VERY COMMON | Token has access to too many datasets — IQ can't disambiguate | Narrow token `access.datasets` to 5–10 relevant datasets |
| IQ doesn't understand column | [WARNING] VERY COMMON | Generic or technical column name | Rename to business-friendly name ("amt" → "Order Amount") |
| IQ formats currency wrong | [WARNING] COMMON | Missing subtype | Set `subtype: "currency"` on column |
| IQ can't find a metric | [WARNING] COMMON | No pre-built formula exists | Create aggregation formula with descriptive name |
| IQ misinterprets calculated field | [WARNING] COMMON | No description or `ai_context` | Add a description and `ai_context` for definitions, caveats, and sign conventions |
| Linked Rule never affects answers | [WARNING] COMMON | Rule is still a draft, or the new version was saved but not published | Publish the version. See `references/saved-agents.md` |
| `agent_id` returns 404 | [WARNING] OCCASIONAL | Unknown, deleted, or other-organization Agent | Use an Agent id from the same organization |
| `agent_id` request returns 403 | [WARNING] OCCASIONAL | Every requested dataset (or an input item's formula dataset) is outside the Agent's datasets | Associate the dataset with the Agent, or drop the dataset input |
| Saved Agent ignores its capabilities | [WARNING] OCCASIONAL | Request also sets `agent` (for example `analyst`) | Omit `agent` or send `agent: 'auto'` to use the Agent's capabilities |
| Agent theme ignored on charts | [WARNING] OCCASIONAL | AIPrompt does not apply `theme_id` | Fetch the theme and apply it when rendering (`theming`) |
| Prompt datasets ignored | [WARNING] OCCASIONAL | Dataset is outside the Agent allowlist or the user's token | Associate the dataset with the Agent and grant the embed token `use` |
| Component license error | [WARNING] OCCASIONAL | IQ addon not enabled | Contact support@luzmo.com to enable IQ addon |
| React Native components not working | [WARNING] OCCASIONAL | Platform not supported | IQ components only work in web browsers (not React Native) |

For each row above, see also `troubleshooting` → "IQ (Natural Language) Issues" and `references/data-modeling-for-iq.md` for the underlying modeling fix.

## Avoid

- Granting token access to all organization datasets by default — always scope to 5–10 relevant datasets.
- Recommending IQ for React Native apps (IQ components are web-only).
- Duplicating quality-optimization instructions inline — all quality guidance lives in `references/data-modeling-for-iq.md` (Path E).
- Claiming IQ is available without verifying the IQ addon is enabled.
- Expecting a saved Agent's capabilities to apply when `agent` is set — they only steer the universal agent (`agent` omitted or `auto`).
- Treating a linked Rule as live before a version is published.
- Expecting AIPrompt to apply the Agent's `theme_id` to returned assets.

## Hand Off

**When to escalate to other skills:**

- WHEN the user needs full auth/embed-token setup → use `core`
- WHEN the user wants to embed a dashboard or Flex chart alongside IQ → use `core` (saved dashboards) or `data-visualization` (Flex)
- WHEN IQ answer quality is poor due to dataset/column naming or missing formulas → use `data-integration` (modeling fixes there directly improve IQ accuracy)
- WHEN the user wants to style/brand IQ Chat, IQ Answer, or assets from a saved Agent → use `theming` (`theme_id` is not applied by AIPrompt)
- WHEN IQ is exposed to multiple tenants and the token must scope datasets per tenant → use `multitenancy` (SECURITY CRITICAL)
- WHEN the user is building a self-service editor and wants IQ inside it → use `analytics-studio`
- WHEN the user connects an AI client or their own MCP server to Luzmo, or pins an Agent with `?agentId=` → use `mcp`
- WHEN no built-in chart type fits and the AI should use a new one → use `custom-charts`
- WHEN IQ returns wrong answers, license errors, or component-loading issues → use `troubleshooting` FIRST

**This skill does NOT cover:**

- Standard (non-AI) chart or dashboard embedding (use `core` for saved dashboards, `data-visualization` for Flex)
- Auth/embed-token generation details (use `core`)
- React Native (not supported by IQ components — web only)

## Migrating from the IQ Backend API

The legacy **IQMessage** / IQ Backend API is replaced by **`POST /0.1.0/aiprompt`** with `action: "create"`.

| Legacy | `/aiprompt` |
|---|---|
| IQMessage resource | `properties.agent` + `properties.task` + `properties.input` |
| IQConversation | `conversation_id` on `/aiprompt`; persisted as `aiconversation` |
| Message history | `searchAIMessage` (include `AIMessageAsset` for charts) |
| Generated charts or dashboards | `aimessageasset` (`type: "item"` or `"dashboard"`) |
| Prompt text | `{ type: "text", text: "..." }` in `input` array |
| Dataset scope | `{ type: "dataset", id: "..." }` in `input` + token `access.datasets` |

Consult `https://developer.luzmo.com/api/createAIPrompt.md` — do not implement against deprecated IQ Backend shapes.

## Canonical Sources

- Index: `https://developer.luzmo.com/llms.txt`, `https://developer.luzmo.com/llms-full.txt`
- `/aiprompt`: `https://developer.luzmo.com/api/createAIPrompt.md`
- AI resources: `https://developer.luzmo.com/api/createAIConversation.md`, `https://developer.luzmo.com/api/searchAIMessage.md`, `https://developer.luzmo.com/api/searchAIMessageAsset.md` (CamelCase filenames)
- Saved Agents: `https://developer.luzmo.com/guide/guides--creating-and-using-agents-through-the-api.md`
- Rules: `https://developer.luzmo.com/guide/guides--creating-and-managing-rules-through-the-api.md`
- AI context: `https://developer.luzmo.com/guide/guides--managing-ai-context.md`
- MCP: `mcp` skill; `https://developer.luzmo.com/guide/mcp--introduction.md`
- AI logs: `https://developer.luzmo.com/api/searchAILog.md`
- IQ Chat/Answer: `https://developer.luzmo.com/guide/iq--chat-component-api.md`, `https://developer.luzmo.com/guide/iq--answer-component-api.md`
- Call forms (HTML): `https://developer.luzmo.com/api/{action}{Resource}/call/{lang}`
- Guides: `https://developer.luzmo.com/guide/*.md`
