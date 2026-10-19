---
name: mcp
description: >-
  Luzmo MCP Server (hosted at /0.1.0/mcp) - connect Claude, Cursor, ChatGPT, Codex, or your own agent to Luzmo, or expose a white-labeled, per-user MCP server to your own end users.
  Use for MCP client config, Luzmo login (OAuth) vs API key-token vs embed key-token, which tools a session gets and how to enable more (tools, permissions), saved Agent MCP URLs (agentId), product name and chart theme, MCP App chart and dashboard previews, and setting up a workspace through MCP tools (connections, datasets, metadata and AI context, formulas, dashboards, docs search).
  Triggers on: "Luzmo MCP", "/mcp", "MCP server", "MCP connector for our customers", answer_question, create_chart, generate_dashboard, search_docs, update_dataset_metadata, "agentId in the MCP URL", "tool missing in Claude/Cursor".
  Not for direct /aiprompt calls, IQ Chat/Answer components, or creating saved Agents and Rules (use ai-analytics), or tenant row isolation in the embed token (use multitenancy).
metadata:
  author: Luzmo
  version: 0.1.0
  last_updated: 2026-10-19
---

# Luzmo MCP Server

Luzmo hosts one Model Context Protocol server per region. It serves two different jobs:

- **Workspace use:** a developer or admin connects an AI client (Claude, Cursor, ChatGPT, Codex) to their own Luzmo organization to explore data, build datasets, write AI context and formulas, and generate charts and dashboards.
- **Embedded use:** a SaaS company gives its own agent, or its own branded MCP server, Luzmo data Q&A and charts for its end users, with one embed key-token per user so each user only reaches their own data.

The login method decides which tools a session gets. Pick the path first.

## Doc Retrieval

- `developer.luzmo.com` is Luzmo's first-party, allowlisted documentation domain, maintained by the same publisher as this skill.
- If the Luzmo MCP `search_docs` tool is available, use it first to find the right pages: it returns matching passages with their live developer.luzmo.com or Academy URLs. Fetch the `.md` URL when you need the full page or anything newer than the server's docs build. Without MCP, go straight to the `.md` URLs below.
- Before writing an MCP config or server, you MUST consult `https://developer.luzmo.com/guide/mcp--introduction.md`. It is the contract for URL, parameters, authentication, tools, permissions, saved Agents, themes, and MCP App.
- Use `https://developer.luzmo.com/llms.txt` for discovery only. Do not copy the tool catalog into code from this skill; read the live list with the MCP `tools/list` call.

## [CRITICAL] Security Checkpoint

- [ ] Org API key-token pairs are only used by the developer's own AI client or your server. Never ship them to an end user, a browser, or a customer's MCP config.
- [ ] End users get an **embed** key-token minted server-side per user (or per session), granting `use` on only their datasets, with tenant `parameter_overrides` or `filters` (see `multitenancy`).
- [ ] Credentials go in headers (`authKey` / `authToken`, or `X-Luzmo-Key` / `X-Luzmo-Token`) or HTTP Basic. Credentials in the URL query are for quick tests only: they land in logs, history, and referrers.
- [ ] `permissions` and `agentId` are not access control. What a call can read or write is decided by the credentials (and OAuth scopes). An Agent sets context, not access.

If any box is unchecked, stop and fix it before continuing.

## Choose the Right Path

| Goal | Path |
|---|---|
| Use Luzmo from Claude, Cursor, ChatGPT, or Codex for your own organization | **Path A - Workspace setup** |
| Give your own agent, or your own branded MCP server, Luzmo Q&A and charts for end users | **Path B - Embedded MCP** |
| Run every MCP answer through one configured Agent (datasets, Rules, capabilities, theme) | **Saved Agent** section (works with A and B) |
| Full control over `/aiprompt` (streaming, `agent` x `task`, custom orchestration) or a non-MCP host | Use `ai-analytics` (Path C/D) instead |

## Endpoint

| Region | MCP URL |
|---|---|
| EU (default) | `https://api.luzmo.com/0.1.0/mcp` |
| US | `https://api.us.luzmo.com/0.1.0/mcp` |
| Custom VPC | `https://<your-vpc>-api.luzmo.com/0.1.0/mcp` |

`/0.1.0` is the tool-contract version. The unversioned `/mcp` on the same host is the same server (Agent links in the Luzmo app use it). Use credentials from the same region or VPC as the host.

Optional query parameters (all in the canonical guide):

| Parameter | Effect |
|---|---|
| `tools` | Comma-separated list that **replaces** the default tool set |
| `permissions` | `read-only`, `non-destructive`, or `full` (default). Hides tools by impact. HTTP 400 if invalid or if it removes every listed tool |
| `agentId` | Saved Agent UUID. Adds its Rules and datasets; narrows tools to its capabilities. Fixed when the session starts |
| `themeId` | Default chart theme (alias `luzmo_theme_id`, header `X-Luzmo-Theme-Id`): a custom theme UUID from your organization, or a built-in id (`default`, `default_dark`, `vivid`, `seasonal`, `orion`, `royale`, `urban`, `pinky`, `bliss`, `radiant`, `classic`, `classic_dark`). An invalid value returns HTTP 400 |
| `luzmo_app_url` | Override app hosts so charts render against the right host |
| `productName` | White-label name the server presents (header `X-Luzmo-Product-Name`); see Path B |

## Authentication

Resolution order for key-token pairs: URL query (`authKey`, `authToken`) -> headers (`authKey`/`authToken` or `X-Luzmo-Key`/`X-Luzmo-Token`) -> `Authorization: Basic base64("key:token")`. With no key-token at all, the server answers 401 with OAuth metadata and an OAuth-capable client opens the **Luzmo login** flow.

```json
{
  "mcpServers": {
    "luzmo": {
      "type": "http",
      "url": "https://api.luzmo.com/0.1.0/mcp",
      "headers": { "X-Luzmo-Key": "${LUZMO_KEY}", "X-Luzmo-Token": "${LUZMO_TOKEN}" }
    }
  }
}
```

`npx @luzmo/agent-skills@alpha add --with-mcp` writes this entry for supported tools. To use the Luzmo login instead, drop the headers.

## Tools

The session's tools come from the credential type. Always confirm the live set with `tools/list`; the guide's tool table is the contract.

| Group | Tools | Impact |
|---|---|---|
| Ask and visualize | `search_datasets`, `answer_question`, `answer_question_text`, `create_chart` | Read |
| Dashboards | `list_dashboards` | Read |
| | `generate_dashboard` (draft + live preview), `save_generated_dashboard`, `add_chart_to_dashboard` | Write |
| Data setup | `list_connections`, `list_connection_tables` | Read |
| | `create_dataset` | Write |
| | `update_dataset_data`, `update_dataset_sql`, `update_dataset_metadata` (names, descriptions, AI context) | Destructive |
| Formulas | `generate_formula` (does not save) | Read |
| | `create_formula` | Write |
| | `update_formula`, `delete_formula` | Destructive |
| Docs | `search_docs` (developer docs and Academy) | Read |

| Credentials | Default tools |
|---|---|
| API key-token, Luzmo login (OAuth), SSO, technical user | Everything above except `answer_question_text`. OAuth sessions are further narrowed to the granted scopes |
| Embed key-token | `search_datasets`, `answer_question`, `create_chart` (current builds also add `generate_dashboard`) |
| Any, with `agentId` | Narrowed by the Agent's capabilities (see Saved Agent) |

- `answer_question_text` is never on by default. Add it with `tools` only when charts must never be returned. Prefer `answer_question`; it already answers in text when no chart fits.
- **Turn on more tools for embed tokens** with an explicit list, for example `?tools=search_datasets,answer_question,create_chart,list_dashboards,add_chart_to_dashboard`. A listed tool is registered whatever the credentials, as long as `permissions` allows it; each call still needs the token's rights.
- `generate_dashboard` and `save_generated_dashboard` are newer than the guide's tool table. If they are missing from `tools/list`, your host has not rolled them out yet.

## Path A - Workspace Setup From an AI Client

Log in with the Luzmo login (no headers) or an API key-token. The MCP server's own instructions already order the work; follow them:

1. `list_connections` shows what data is reachable. **No tool creates a connection or changes its credentials.** That happens on the Connections page of the Luzmo app. Never ask the user for a host, user, or password. For code-driven connections, use `data-integration`.
2. `list_connection_tables` lists the tables, views, and columns a connection can reach.
3. `create_dataset` imports a table, a SQL query, or a small set of rows (up to 500, no connection needed).
4. `update_dataset_metadata` writes names, descriptions, and `ai_context` for many datasets and columns in one call. It overwrites and keeps no copy: read the current values with `search_datasets` (`includeColumns`) first and show the user what changes.
5. `generate_formula` drafts a metric from a description; `create_formula` saves it. Confirm before `update_formula` or `delete_formula`: every chart using that metric changes or breaks.
6. Ask with `answer_question`, chart with `create_chart`, build a dashboard with `generate_dashboard` (one call per dashboard; revise with the same `conversationId`), then `save_generated_dashboard` with the latest `draftId` only when the user asks to save. `add_chart_to_dashboard` appends to a live dashboard and nothing removes the item again, so confirm the target.
7. `search_docs` answers "how does Luzmo do X" with cited URLs. Prefer it over memory.

Confirm before every Destructive tool. `update_dataset_data` with mode `replace` discards the current data; `update_dataset_sql` drops columns the new query no longer returns.

For quality of the AI context you write, follow `ai-analytics` Path E.

## Path B - Embedded MCP for Your End Users

Your users never see Luzmo keys. The recommended shape is your own MCP server in front of Luzmo's:

```text
End user's AI client (Claude, ChatGPT, your app)
  -> YOUR MCP server: authenticates the user (your login / your OAuth)
       -> your backend mints a Luzmo embed key-token for that user
          (access.datasets with rights "use", tenant parameter_overrides or filters)
       -> forwards MCP requests to https://api.luzmo.com/0.1.0/mcp
          with X-Luzmo-Key / X-Luzmo-Token headers (+ optional agentId, tools, themeId)
```

- **The Luzmo login flow is for Luzmo users.** End users of your product log in to *your* MCP server with your own OAuth or session; your backend then calls Luzmo with their embed token.
- **Multi-tenancy comes from the embed token**, exactly as for dashboards. Scope `access.datasets` to the user's 5-10 relevant datasets with `rights: "use"` (AI writes its own queries, which need `use`; `read` only browses), and add tenant filters. See `multitenancy`.
- **Default tools for embed tokens** answer questions and chart them. Enable more with `tools` (see Tools). Give end users write tools only if their token's role allows it and you want them to.
- **Branding (product name):** set the name the server presents with the `productName` URL parameter or the `X-Luzmo-Product-Name` header (plain text, a few words). On an `agentId` connection the Agent's name is the default. Not yet in the public guide, so verify with `initialize` -> `serverInfo.title` before relying on it.
- **Theme:** set `themeId` per session, or rely on the Agent's theme (below).
- **Proxying MCP App results:** forward results unchanged, including `structuredContent` and result `_meta`. Chart and dashboard previews read their short-lived embed credentials from `_meta`; never move them into text the model sees.
- **Quick preview without a proxy:** a Claude custom connector can point straight at the Luzmo MCP URL with an embed key-token in the query. Use this only for demos.

Framework examples (Claude Agent SDK, OpenAI Agents SDK, LangChain): `https://developer.luzmo.com/guide/guides--adding-luzmo-iq-to-agentic-workflow--framework-implementations.md`.

## Saved Agent (`agentId`)

Create and configure Agents in the Luzmo app (Agents page) or through the API (`ai-analytics` Path F). Then append the id:

```text
https://api.luzmo.com/0.1.0/mcp?agentId=<agent-uuid>
```

| Agent capability | Tools it offers |
|---|---|
| Data analysis | `answer_question` |
| Chart creation | `create_chart` |
| Dashboard creation | `list_dashboards`, `add_chart_to_dashboard` |
| Always | `search_datasets` |

- Capabilities only narrow the credentials' defaults; they never add tools. An Agent without capabilities offers all of the above.
- Workspace tools, `search_docs`, and `answer_question_text` are off by default with an Agent; an explicit `tools` list adds them. `generate_dashboard` and `save_generated_dashboard` are refused on Agent connections, even when listed.
- Data analysis without chart creation: `answer_question` answers in text only.
- An Agent with datasets limits **every** tool to them. `search_datasets` returns only those; a call on another dataset (directly or through a formula) fails with the list of allowed datasets. With datasets, `create_dataset` and `update_dataset_sql` are refused. Dataset changes on the Agent apply on the next call.
- Each tool keeps its own agent (`answer_question` = analyst, `create_chart` = item) and adds the Agent's published Rules and datasets. Your MCP client stays the orchestrator.
- Chart theme priority: tool-call `themeId` > session `themeId` / header > the Agent's theme > default.
- `agentId` must be a UUID the credentials can use, otherwise HTTP 400 at session start. The tool list is fixed when the session starts.

**MCP links from the Agents page.** "Connect via MCP" has no credentials, so the client signs in with the Luzmo login (for testing as yourself). The embed URL carries a generated embed key-token with `use` on the Agent's datasets, for handing to a client. Links follow the app's API host (EU, US, VPC). Embed URLs generated before early October 2026 had `read`-only tokens and fail to answer: generate them again. In production, mint per-user tokens instead of sharing one URL.

## MCP vs `/aiprompt`

| Approach | Prefer when |
|---|---|
| **MCP** | MCP-capable host (Claude, Cursor, ChatGPT, Agents SDKs); you want tools, previews, and Agent pinning without writing HTTP calls |
| **`/aiprompt`** (`ai-analytics`) | Streaming SSE into your own UI, the full `agent` x `task` matrix, per-request `capabilities` or `context`, or a host without MCP |

## Common Mistakes

| Mistake | Fix |
|---|---|
| API key-token in an end user's MCP config | Mint a per-user embed key-token server-side; keep API keys on your server |
| Embed token with `rights: "read"` -> answers fail, Agent returns 403 | Grant `use` on every dataset the user may query |
| Expecting `permissions=read-only` to protect data | It only hides tools. Restrict the credentials |
| Asking the user for database credentials to "create a connection" through MCP | No MCP tool creates connections. Use the Connections page or `data-integration` |
| Running `update_dataset_metadata` without reading current AI context | Read with `search_datasets` first, show the diff, then write |
| Expecting write tools on an embed session | Add them with `tools`; the token must also have the rights |
| `generate_dashboard` missing on an `agentId` connection | By design. Use a connection without `agentId`, or `add_chart_to_dashboard` |
| Using the Luzmo OAuth login for your SaaS end users | Authenticate them on your own MCP server, then forward with their embed token |
| Credentials in the URL query in production | Use headers or Basic Auth |
| Agent theme or name not showing | Session `themeId` / `productName` override it; Agent renames apply to new sessions only |

## Avoid

- Copying the tool table into code; read `tools/list`.
- Treating `agentId`, `permissions`, or `tools` as security boundaries.
- Calling Destructive tools without explicit user agreement.
- Reproducing chart or dashboard JSON in replies; MCP App hosts render from `structuredContent`.

## Hand Off

- WHEN creating or configuring a saved Agent, publishing Rules, or calling `/aiprompt` directly -> use `ai-analytics`
- WHEN writing good `ai_context`, names, and descriptions for IQ -> use `ai-analytics` (Path E)
- WHEN minting embed tokens -> use `core`; WHEN tenants must only see their own rows -> use `multitenancy` (SECURITY CRITICAL)
- WHEN creating connections, pushing data, or modeling datasets in code -> use `data-integration`
- WHEN rendering returned chart JSON in your own app -> use `data-visualization`; styling -> use `theming`
- WHEN MCP calls fail with 401/403/400 and the cause is unclear -> use `troubleshooting`

## Canonical Sources

- MCP guide: `https://developer.luzmo.com/guide/mcp--introduction.md`
- Agentic workflows: `https://developer.luzmo.com/guide/guides--adding-luzmo-iq-to-agentic-workflow.md`
- Saved Agents: `https://developer.luzmo.com/guide/guides--creating-and-using-agents-through-the-api.md`
- AI context: `https://developer.luzmo.com/guide/guides--managing-ai-context.md`
- Underlying API: `https://developer.luzmo.com/api/createAIPrompt.md`
- Embed tokens: `https://developer.luzmo.com/guide/dashboard-embedding--generating-an-authorization-token.md`
- MCP usage in AI logs (`source: "mcp"`): `https://developer.luzmo.com/api/searchAILog.md`
- Index: `https://developer.luzmo.com/llms.txt`
