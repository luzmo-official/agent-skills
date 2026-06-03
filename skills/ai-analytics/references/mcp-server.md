# Luzmo MCP Server

Hosted Model Context Protocol server for Luzmo IQ and chart generation in agent frameworks (Claude Agent SDK, LangChain, OpenAI Agents SDK, Cursor, Codex).

**Canonical spec:** `https://developer.luzmo.com/guide/mcp--introduction.md` — fetch before implementing; do not duplicate the full tool catalog here.

## URL

| Region | MCP URL |
|---|---|
| EU (default) | `https://api.luzmo.com/0.1.0/mcp` |
| US | `https://api.us.luzmo.com/0.1.0/mcp` |
| Custom VPC | `https://<your-vpc>-api.luzmo.com/0.1.0/mcp` |

Use credentials for the same region/VPC as the API host. Optional query params: `tools`, `themeId`, `luzmo_app_url` (see canonical guide).

## Authentication (resolution order)

1. URL query: `authKey` + `authToken` (testing only — avoid in production)
2. Headers: `authKey` + `authToken`, or `X-Luzmo-Key` + `X-Luzmo-Token`
3. HTTP Basic: `Authorization: Basic <base64("key:token")>`

Prefer **headers** or **Basic Auth** in production. API key-token pairs and embed key-token pairs both work; embed tokens apply multitenancy automatically.

Example MCP client config:

```json
{
  "mcpServers": {
    "luzmo": {
      "type": "http",
      "url": "https://api.luzmo.com/0.1.0/mcp",
      "headers": {
        "authKey": "<api-key>",
        "authToken": "<api-token>"
      }
    }
  }
}
```

CLI install: `npx @luzmo/agent-skills@alpha add --with-mcp` merges this into your tool's MCP config (see repo `README.md`).

## Tools (default)

If `tools` query param is omitted, the server registers:

| Tool | Purpose |
|---|---|
| `search_datasets` | Browse/search datasets and schemas (read-only) |
| `answer_question` | Natural-language Q&A via Luzmo IQ (analyst); text + chart when appropriate |
| `create_chart` | Generate a chart from a prompt (item agent) |

**Not loaded by default:** `answer_question_text` (text-only, no charts). Opt in: `?tools=search_datasets,answer_question,answer_question_text,create_chart`

**Model guidance:** Prefer `answer_question` for analytics questions. Use `answer_question_text` only when charts must never be returned. Use `search_datasets` when resolving dataset IDs is required.

Chart tools may accept `conversation_id` for follow-up questions in the same thread.

## Themes

Default chart theme for the session (invalid values → HTTP 400):

1. URL: `themeId` (alias `luzmo_theme_id`)
2. Header: `X-Luzmo-Theme-Id`
3. Per tool call: optional `themeId` argument

Use a custom theme UUID from your account, or a built-in id: `default`, `default_dark`, `vivid`, `seasonal`, `orion`, `royale`, `urban`, `pinky`, `bliss`, `radiant`, `classic`, `classic_dark`.

## MCP App vs plain MCP

| Client | Behavior |
|---|---|
| Plain MCP | Tool text + visualization item JSON in the result |
| MCP App | Same results + **live Luzmo visualization** in the host UI when a chart is generated |

Visualization-capable tools: `answer_question` (when a chart is returned), `create_chart`. `search_datasets` and `answer_question_text` are text-only.

## When to use MCP vs `/aiprompt`

| Approach | Prefer when |
|---|---|
| **MCP** | Quick agent integration; Cursor/Codex; you want default IQ tools without custom HTTP |
| **`/aiprompt` API** | Full control over agents (`dashboard`), streaming SSE, custom orchestration, or non-MCP hosts |

See `references/agentic-integration.md` for direct `/aiprompt` tool patterns.

## Related

- Agentic workflow guide: `https://developer.luzmo.com/guide/guides--adding-luzmo-iq-to-agentic-workflow.md`
- Underlying API: `https://developer.luzmo.com/api/createAIPrompt.md`
