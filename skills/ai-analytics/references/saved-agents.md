# Saved Agents and Rules

Use this reference when creating a reusable Luzmo Agent, attaching datasets or Rules, or invoking that Agent. A saved Agent is an organization resource. It is not the same thing as the `/aiprompt` request field `agent`.

## Docs

Consult these before generating production code. Do not invent payloads from this file.

- `https://developer.luzmo.com/guide/guides--creating-and-using-agents-through-the-api.md`
- `https://developer.luzmo.com/guide/guides--creating-and-managing-rules-through-the-api.md`
- `https://developer.luzmo.com/api/createAIPrompt.md`
- `https://developer.luzmo.com/api/createAgent.md`
- `https://developer.luzmo.com/api/createAIRule.md`

## Two meanings of "agent"

| What the user means | What to send |
|---|---|
| One-shot router: analyze, chart, or build a dashboard for this call | `properties.agent`: `"analyst"` \| `"item"` \| `"dashboard"`, plus `task` |
| A saved Agent configured in Luzmo (capabilities, datasets, Rules, theme) | `properties.agent_id` only |

Do not combine `agent_id` with `agent`, `task`, or `capabilities`. Those values come from the saved Agent. The returned `user_message.agent` is `auto`.

IQ Chat and IQ Answer components have no documented `agent_id`. Invoke a saved Agent from the server (`/aiprompt`) or pin an MCP session with `?agentId=` (see `references/mcp-server.md`).

## Setup (org API key, server-side)

1. Create the Agent (`POST /0.1.0/agent`, `action: "create"`) with a localized `name` and `capabilities`. Store the returned `id`.
2. Associate each permitted dataset with role `Securables`. Only securables with `type: "dataset"` are accepted.
3. Optionally create a Rule, publish a version, then link it (below).
4. Mint a per-user embed token that grants `use` on every dataset that user may query, including the Agent's datasets. Invoke with that embed key and token, not the org API key.

Creating or configuring an Agent requires a Designer or Owner organization role. Update, associate, and dissociate also require modifier access on the Agent. Delete requires owner access.

Agents are invocable by every member of their organization. Sharing controls who may modify or own an Agent. It does not restrict who may invoke it. An unknown, deleted, or other-organization `agent_id` returns `404 Not Found`.

### Capabilities

| Capability | Automatic routing may |
|---|---|
| `data_analysis` | Answer natural-language questions |
| `chart_creation` | Generate visualization items |
| `dashboard_creation` | Generate multi-item dashboards |

An empty `capabilities` array enables every capability available to the authenticated user. Use a non-empty list when the Agent should be narrower.

### Dataset allowlist

When the Agent has associated datasets:

- Omit dataset inputs and AIPrompt starts from the Agent's datasets.
- Supply dataset inputs and only IDs that are also associated with the Agent are considered.
- In both cases, Luzmo drops datasets the authenticated user cannot access.
- Dataset links from earlier conversation messages do not bypass the allowlist.

With no associated datasets, normal AIPrompt selection applies: explicit dataset inputs when present; otherwise the conversation and datasets the user can access.

## Rules

Rules are the written instructions a saved Agent follows (a pricing policy, a tone of voice, a shared definition). The API resource is `airule`. Text lives on versions, not on the Rule itself.

1. Create a Rule with `name` and `content`. It starts as `status: "draft"`.
2. Publish a version so Agents apply it. You write `published_version_id`; `status` and `has_unpublished_changes` follow from that.
3. Link it from the Agent with role `linked_rules`, or from the Rule with role `linked_agents`. Both write the same relation.

Only the currently published version is applied, read when the Agent runs. A Rule with no published version contributes nothing, even while linked. Saving an edit appends a version and does not change what Agents run until that version is published. Linking a draft first is fine: it starts applying when you publish. Unpublish to stop every Agent; dissociate to stop one Agent.

Every organization member can read Rules. Creating or editing requires an Organization Editor (Owners and Designers).

## Instruction stack

These combine. They are not substitutes for each other.

| Layer | Where it lives | Applies when |
|---|---|---|
| Per-request `context` | `/aiprompt` properties | That call (analyst instructions) |
| `iq.context` | Embed token | Queries made with that token |
| Published linked Rules | Saved Agent | That Agent runs |
| `ai_context` | Dataset, column, formula, dashboard metadata | IQ reads dataset, column, and formula context while answering. See `references/data-modeling-for-iq.md` |

`ai_context` is knowledge on the data. A Rule is an instruction bound to an Agent. Do not put Agent policy only in `ai_context`, and do not put column caveats only in a Rule.

## Theme

`theme_id` on the Agent is presentation metadata. AIPrompt does not load it or apply it to returned chart and dashboard assets. Retrieve the Agent and its Theme, then apply that theme when rendering (`theming`). On MCP, a session or tool `themeId` still overrides the Agent theme.

## Invoke

```javascript
await luzmoEmbedClient.create('aiprompt', {
  agent_id: '<agent-uuid>',
  stream: false,
  response_mode: 'mixed',
  text_format: 'markdown',
  locale_id: 'en',
  input: [{ type: 'text', text: 'How is revenue trending, and can you visualize it?' }],
});
```

Omit `conversation_id` to start a thread; pass the previous response's `conversation_id` to continue. Set `stream: true` for Server-Sent Events. You may still send per-request `context`; it is combined with the token's `iq.context` and the Agent's published Rules.

Consult `https://developer.luzmo.com/api/createAIPrompt.md` for the full request. Search, update, associate, dissociate, and delete docs follow `https://developer.luzmo.com/api/{action}Agent.md` and `https://developer.luzmo.com/api/{action}AIRule.md`.
