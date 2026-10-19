# Luzmo MCP Server

Hosted Model Context Protocol server for Luzmo IQ, chart generation, and Luzmo content in agent frameworks (Claude Agent SDK, LangChain, OpenAI Agents SDK, Cursor, Codex).

**Canonical spec:** `https://developer.luzmo.com/guide/mcp--introduction.md` — consult before implementing. Do not duplicate the full tool catalog here.

## URL

| Region | MCP URL |
|---|---|
| EU (default) | `https://api.luzmo.com/0.1.0/mcp` |
| US | `https://api.us.luzmo.com/0.1.0/mcp` |
| Custom VPC | `https://<your-vpc>-api.luzmo.com/0.1.0/mcp` |

Use credentials for the same region/VPC as the API host.

Optional query params (see the canonical guide):

| Param | Effect |
|---|---|
| `tools` | Override the default tool set. A listed tool is registered when `permissions` allows it. |
| `permissions` | `read-only`, `non-destructive`, or `full` (default). This limits which tools the session offers. It is not an access-control boundary; credentials still decide what a call can do. |
| `agentId` | UUID of a saved Agent. Pins `answer_question`, `answer_question_text`, and `create_chart` to that Agent's datasets, Rules, capabilities, and default theme. Fixed when the session starts. An invalid value returns HTTP 400. It does not grant dataset access — pair it with credentials that can read the Agent's datasets. |
| `themeId` | Default chart theme. Still overrides the Agent theme. |
| `luzmo_app_url` | Override app hosts so generated charts render against the right host. |

To attach a saved Agent, append the id yourself. The installer does not take an agent id, because it is per organization:

```text
https://api.luzmo.com/0.1.0/mcp?agentId=<agent-uuid>
```

## Authentication (resolution order)

1. URL query: `authKey` + `authToken` (testing only — avoid in production)
2. Headers: `authKey` + `authToken`, or `X-Luzmo-Key` + `X-Luzmo-Token`
3. HTTP Basic: `Authorization: Basic <base64("key:token")>`
4. No key or token: the server starts the Luzmo OAuth login flow

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

CLI install: `npx @luzmo/agent-skills@alpha add --with-mcp` merges a `type: "http"` entry into your tool's MCP config (see repo `README.md`). Headers use `X-Luzmo-Key` and `X-Luzmo-Token` from the environment.

## Tools

Defaults depend on the credentials. Consult the canonical guide for the current list before naming a tool that is not in this delta.

| Credentials | Default |
|---|---|
| Embed key-token | `search_datasets`, `answer_question`, `create_chart` |
| API key-token, OAuth, SSO, technical user | The wider set: dashboards, connections, datasets, formulas, and `search_docs`, except `answer_question_text` |

`answer_question_text` is never loaded by default. Opt in by listing it in `tools`.

The wider set includes write and destructive tools such as `add_chart_to_dashboard`, `create_dataset`, `update_dataset_data`, `update_dataset_sql`, formula create/update/delete, and `update_dataset_metadata` (names, descriptions, and `ai_context`). An embed session can be given extra tools explicitly, for example `list_dashboards` and `add_chart_to_dashboard`, when `permissions` allows them. Whether the call succeeds still depends on those credentials.

**Model guidance:** Prefer `answer_question` for analytics questions. It already returns text-only when Luzmo cannot build a chart. Use `answer_question_text` only when charts must never be returned. Use `search_datasets` when resolving dataset IDs is required. Chart tools may accept `conversation_id` for follow-ups in the same thread.

## Themes

Default chart theme for the session (invalid values → HTTP 400):

1. URL: `themeId` (alias `luzmo_theme_id`)
2. Header: `X-Luzmo-Theme-Id`
3. Per tool call: optional `themeId` argument

Use a custom theme UUID from your account, or a built-in id: `default`, `default_dark`, `vivid`, `seasonal`, `orion`, `royale`, `urban`, `pinky`, `bliss`, `radiant`, `classic`, `classic_dark`.

A `themeId` in the URL, header, or tool call overrides a saved Agent's theme.

## MCP App vs plain MCP

| Client | Behavior |
|---|---|
| Plain MCP | Tool text + visualization item JSON in the result |
| MCP App | Same results + **live Luzmo visualization** in the host UI when a chart is generated |

Visualization-capable tools: `answer_question` (when a chart is returned), `create_chart`. `search_datasets` and `answer_question_text` are text-only.

## When to use MCP vs `/aiprompt`

| Approach | Prefer when |
|---|---|
| **MCP** | Quick agent integration; Cursor/Codex; you want the credential-default tools without custom HTTP. Add `?agentId=` to pin a saved Agent. |
| **`/aiprompt` API** | Full control over `analyst` / `item` / `dashboard` or `agent_id`, streaming SSE, custom orchestration, or non-MCP hosts |

See `references/agentic-integration.md` for direct `/aiprompt` tool patterns and `references/saved-agents.md` for Agent setup.

## Related

- Agentic workflow guide: `https://developer.luzmo.com/guide/guides--adding-luzmo-iq-to-agentic-workflow.md`
- Underlying API: `https://developer.luzmo.com/api/createAIPrompt.md`
- Saved Agents: `https://developer.luzmo.com/guide/guides--creating-and-using-agents-through-the-api.md`
