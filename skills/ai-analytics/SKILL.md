---
name: ai-analytics
description: >-
  AI-powered analytics with Luzmo - /aiprompt API and IQ embed components.
  Use for natural language data queries, chart generation, agentic workflows (agent analyst|item, tasks), IQ Chat/Answer embedding (luzmo-iq-embed-chat, LuzmoIQChatComponent), "AI not working", wrong answers, quality optimization.
  Requires AI/IQ addon license.
  Use eagerly for any natural-language analytics feature.
  Not for standard chart embedding (use core for saved dashboards, data-visualization for Flex) or React Native (IQ embed components are web-only).
metadata:
  author: Luzmo
  version: 0.1.0
  last_updated: 2026-06-01
---

# Luzmo AI Analytics

Entry-point for Luzmo AI analytics: the **`/aiprompt`** API (canonical backend), IQ Chat/Answer embed components (UI convenience layer), agentic workflows, and answer-quality optimization.

## Doc Retrieval

- Fetch the exact `developer.luzmo.com/*.md` page(s) before coding.
- If it is an index/overview, follow the relevant links to the concrete API, component, schema, or example page.
- Use `https://developer.luzmo.com/llms.txt` / `https://developer.luzmo.com/llms-full.txt` only to discover pages, not as the final source.

## 🚨 Security Checkpoint

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

The `iq.context` value is appended to IQ's base system prompt for queries made with that token.

## Core Principles

### License Requirements

IQ is available as an **add-on** — if the user encounters a license error, contact support@luzmo.com.

**⚠️ React Native Limitation:** The IQ Chat and Answer components are **NOT supported** in React Native. Only web platforms (browser-based React, Angular, Vue, vanilla JS) are supported.

### Component Names (Common Mistake)

Use the correct component names with `-embed-` in them:

| Framework | Chat Component | Answer Component |
|---|---|---|
| Vanilla JS / Web Components | `luzmo-iq-embed-chat` | `luzmo-iq-embed-answer` |
| React | `LuzmoIQChatComponent` | `LuzmoIQAnswerComponent` |
| Angular | `NgxLuzmoIQChatComponent` / `<luzmo-iq-chat>` | `NgxLuzmoIQAnswerComponent` / `<luzmo-iq-answer>` |
| Vue | `<luzmo-iq-chat>` | `<luzmo-iq-answer>` |

**Note:** Angular and Vue IQ components drop the `-embed-` infix (opposite to vanilla JS/React).

❌ **WRONG:** `luzmo-iq-chat`, `luzmo-iq-answer` (missing `-embed-`) for vanilla JS/React  
✅ **CORRECT:** `luzmo-iq-embed-chat`, `luzmo-iq-embed-answer` for vanilla JS/React  
✅ **CORRECT:** `luzmo-iq-chat`, `luzmo-iq-answer` for Angular/Vue

## Bundled References

For deeper guidance, read only when relevant:

- `references/data-modeling-for-iq.md` — Detailed quality optimization: token scope, dataset/column naming, subtypes, descriptions, pre-built formulas, anti-patterns, verification checklist
- `references/agentic-integration.md` — IQ as a tool for LLM agents: backend brokering, tool schema, multi-turn `conversation_id`, per-user/per-tenant security
- `references/mcp-server.md` — Hosted Luzmo MCP: tools, auth, themes, MCP App (alternative to direct `/aiprompt`)

## IQ Quality Fundamentals

IQ answer quality depends heavily on how your data is modeled and named. For full guidance with examples, read `references/data-modeling-for-iq.md` via Path E.

**Quick impact reference:**

| Factor | Impact |
|---|---|
| Dataset/column naming | High — wrong names = wrong results |
| Token context scoping (≤10 datasets) | High — ambiguity = wrong dataset |
| Column descriptions | Medium — helps calculated fields |
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

---

## Path A — Chat Component

Fetch:
```
https://developer.luzmo.com/guide/iq--introduction--chat-component.md
https://developer.luzmo.com/guide/iq--chat-component-api.md
```

| Framework | Component |
|---|---|
| Web (vanilla JS) | `<luzmo-iq-embed-chat>` |
| React | `LuzmoIQChatComponent` |

Always fetch the component API doc before describing props, events, or customization options.

---

## Path B — Answer Component

Fetch:
```
https://developer.luzmo.com/guide/iq--introduction--answer-component.md
https://developer.luzmo.com/guide/iq--answer-component-api.md
```

| Framework | Component |
|---|---|
| Web (vanilla JS) | `<luzmo-iq-embed-answer>` |
| React | `LuzmoIQAnswerComponent` |

The Answer component accepts `messages` following the `AIPrompt` structure. Fetch the API doc for the exact shape.

---

## Path C — `/aiprompt` API (canonical)

**`/aiprompt` replaces the legacy IQ Backend API (IQMessage).** Fetch the canonical spec before implementing:

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

Fetch `https://developer.luzmo.com/api/createAIPrompt.md` for the full body. Minimal teaching example:

```javascript
{
  action: 'create',
  version: '0.1.0',
  key: API_KEY,
  token: API_TOKEN,
  properties: {
    agent: 'item',              // 'analyst' | 'item'
    task: 'generate',           // varies per agent — see API doc
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

Always fetch `https://developer.luzmo.com/api/createAIPrompt.md` for the full `agent` × `task` matrix, response schema, and streaming event payloads.

### `input` types

Exactly one `{ type: "text", text: "..." }` is required. Optional inputs (fetch API doc for shapes):

| `type` | Purpose |
|---|---|
| `text` | User prompt (required) |
| `dataset` | Pin dataset scope for this prompt |
| `item` | Pass existing item JSON for refine/describe flows |

### Streaming (SSE)

Set `stream: true` and `Accept: text/event-stream`. The API emits JSON events in order: `start` → `progress` (optional) → `text_start` / `text_delta` / `text_end` → `asset_start` / `asset_delta` / `asset_end` → `finish` (final result) — or `error` on failure. Ends with `data: [DONE]`.

Fetch `https://developer.luzmo.com/api/createAIPrompt.md` for exact event payloads. Socket.IO clients on a connected socket receive the same events on the `aiprompt` channel.

### Persisted conversations and assets

`/aiprompt` auto-creates an **AIConversation** when `conversation_id` is omitted and persists user/assistant turns as **AIMessage** records. Generated charts are stored as **AIMessageAsset** records with `type: "item"`.

| Resource | When to use | Doc |
|---|---|---|
| `aiconversation` | Pre-create a titled thread, or manage conversation metadata | `createAIConversation.md` |
| `aimessage` | List/replay messages in a thread (`include: AIMessageAsset`) | `searchAIMessage.md` |
| `aimessageasset` | Fetch persisted item asset JSON by asset id | `searchAIMessageAsset.md` |
| `aiconversation` | Pre-create a titled thread, or manage conversation metadata | `https://developer.luzmo.com/api/createAIConversation.md` |
| `aimessage` | List/replay messages in a thread (`include: AIMessageAsset`) | `https://developer.luzmo.com/api/searchAIMessage.md` |
| `aimessageasset` | Fetch persisted item/dashboard JSON by asset id | `https://developer.luzmo.com/api/searchAIMessageAsset.md` |

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

1. Register a tool that POSTs to `/aiprompt` (`agent: "analyst"`) with the user's scoped embed token — or use the **hosted MCP server** (simpler; see below).
2. Parse the response (text, item asset, or mixed per `response_mode`); use `conversation_id` for follow-ups.
3. **Hosted MCP** (Cursor, Claude, LangChain, OpenAI Agents SDK): `https://api.<region>.luzmo.com/0.1.0/mcp` — default tools: `search_datasets`, `answer_question`, `create_chart`. See `references/mcp-server.md` and `https://developer.luzmo.com/guide/mcp--introduction.md`.

Fetch: `https://developer.luzmo.com/guide/guides--adding-luzmo-iq-to-agentic-workflow.md` — prefer `https://developer.luzmo.com/api/createAIPrompt.md` for request shapes.

See also `references/agentic-integration.md`.

---

## Path E — IQ Quality Optimization

Read `references/data-modeling-for-iq.md` — it is the comprehensive quality reference. The checklist, examples, and modeling issues table all live there.

Fetch: `https://academy.luzmo.com/article/e6ght1rk`

---

## Common IQ Issues

Troubleshoot these frequent problems. ⚠️ Most of them are data-modeling issues, not IQ bugs — see `references/data-modeling-for-iq.md`.

| Problem | Frequency | Likely Cause | Solution |
|---|---|---|---|
| IQ returns wrong dataset | ⚠️ VERY COMMON | Token has access to too many datasets — IQ can't disambiguate | Narrow token `access.datasets` to 5–10 relevant datasets |
| IQ doesn't understand column | ⚠️ VERY COMMON | Generic or technical column name | Rename to business-friendly name ("amt" → "Order Amount") |
| IQ formats currency wrong | ⚠️ COMMON | Missing subtype | Set `subtype: "currency"` on column |
| IQ can't find a metric | ⚠️ COMMON | No pre-built formula exists | Create aggregation formula with descriptive name |
| IQ misinterprets calculated field | ⚠️ COMMON | No description | Add column description explaining calculation |
| Component license error | ⚠️ OCCASIONAL | IQ addon not enabled | Contact support@luzmo.com to enable IQ addon |
| React Native components not working | ⚠️ OCCASIONAL | Platform not supported | IQ components only work in web browsers (not React Native) |

For each row above, see also `troubleshooting` → "IQ (Natural Language) Issues" and `references/data-modeling-for-iq.md` for the underlying modeling fix.

## Avoid

- Granting token access to all organization datasets by default — always scope to 5–10 relevant datasets.
- Recommending IQ for React Native apps (IQ components are web-only).
- Duplicating quality-optimization instructions inline — all quality guidance lives in `references/data-modeling-for-iq.md` (Path E).
- Claiming IQ is available without verifying the IQ addon is enabled.

## Hand Off

**When to escalate to other skills:**

- WHEN the user needs full auth/embed-token setup → use `core`
- WHEN the user wants to embed a dashboard or Flex chart alongside IQ → use `core` (saved dashboards) or `data-visualization` (Flex)
- WHEN IQ answer quality is poor due to dataset/column naming or missing formulas → use `data-integration` (modeling fixes there directly improve IQ accuracy)
- WHEN the user wants to style/brand IQ Chat or IQ Answer components → use `theming`
- WHEN IQ is exposed to multiple tenants and the token must scope datasets per tenant → use `multitenancy` (SECURITY CRITICAL)
- WHEN the user is building a self-service editor and wants IQ inside it → use `analytics-studio`
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
| Generated charts | `aimessageasset` (`type: "item"`) |
| Prompt text | `{ type: "text", text: "..." }` in `input` array |
| Dataset scope | `{ type: "dataset", id: "..." }` in `input` + token `access.datasets` |

Fetch `https://developer.luzmo.com/api/createAIPrompt.md` — do not implement against deprecated IQ Backend shapes.

## Canonical Sources

- Index: `https://developer.luzmo.com/llms.txt`, `https://developer.luzmo.com/llms-full.txt`
- `/aiprompt`: `https://developer.luzmo.com/api/createAIPrompt.md`
- AI resources: `https://developer.luzmo.com/api/createAIConversation.md`, `https://developer.luzmo.com/api/searchAIMessage.md`, `https://developer.luzmo.com/api/searchAIMessageAsset.md` (CamelCase filenames)
- MCP: `https://developer.luzmo.com/guide/mcp--introduction.md`
- IQ Chat/Answer: `https://developer.luzmo.com/guide/iq--chat-component-api.md`, `https://developer.luzmo.com/guide/iq--answer-component-api.md`
- Call forms (HTML): `https://developer.luzmo.com/api/{action}{Resource}/call/{lang}`
- Guides: `https://developer.luzmo.com/guide/*.md`
