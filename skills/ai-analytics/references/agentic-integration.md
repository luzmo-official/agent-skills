# IQ as a Tool for LLM Agents

Use this reference when an LLM agent (Claude, OpenAI, custom) needs to answer analytics questions by calling Luzmo IQ as a tool or function.

## Docs

- `https://developer.luzmo.com/api/createAIPrompt.md` (canonical; replaces legacy IQ Backend API)
- `https://developer.luzmo.com/guide/guides--adding-luzmo-iq-to-agentic-workflow.md`
- `https://developer.luzmo.com/guide/mcp--introduction.md` (hosted MCP; alternative to direct `/aiprompt` calls)
- `references/mcp-server.md` - MCP tools, auth, and themes (this directory)

Fetch these and any guides they reference before generating production code.

## Architecture

LLM agents already run server-side, so they can call **`POST /0.1.0/aiprompt`** directly. The critical requirement is to use a **per-user embed token** — not broad API credentials — so that IQ automatically enforces the correct context: which datasets are accessible, which securables the user can see, and any tenant-level filters.

```text
User -> LLM agent server
  1. Generate an Embed Authorization token for the logged-in user/tenant with the correct dataset scope.
  2. POST /aiprompt with agent: "analyst" and only those dataset inputs.
  3. Return the answer, conversation_id, and any generated item assets.
```

The embed token's `access.datasets`, `parameter_overrides`, and `filters` determine exactly what data IQ can see — making token scoping the primary security and accuracy control.

**Alternative:** Use the hosted Luzmo MCP server (`/0.1.0/mcp`) so the agent calls `answer_question` / `create_chart` without building custom `/aiprompt` integrations. See `references/mcp-server.md`.

## Tool Definition (Claude / OpenAI style)

```json
{
  "name": "ask_luzmo_iq",
  "description": "Answer an analytics question about the user's data. Use when the user asks for metrics, trends, comparisons, or any quantitative question about their organization's data.",
  "input_schema": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "The user's question in natural language."
      },
      "conversation_id": {
        "type": "string",
        "description": "Optional. AIConversation id for multi-turn follow-ups (i.e. to continue a conversation from a previous /aiprompt response)."
      }
    },
    "required": ["question"]
  }
}
```

## Backend Implementation

Fetch `https://developer.luzmo.com/api/createAIPrompt.md` for the full request/response schema. Example pattern:

```javascript
import Luzmo from '@luzmo/nodejs-sdk';

// Your backend exposes the tool to the agent.
async function askLuzmoIQ({ question, conversation_id, user }) {
  const luzmoAdminClient = new Luzmo({
    host: process.env.LUZMO_API_HOST,
    api_key: process.env.LUZMO_API_KEY,
    api_token: process.env.LUZMO_API_TOKEN,
  });

  const accessibleDatasetIds = user.accessible_dataset_ids;
  if (!Array.isArray(accessibleDatasetIds) || accessibleDatasetIds.length === 0) {
    throw new Error('No datasets are scoped for this user.');
  }

  // 1. Build/refresh a per-user embed token scoped to this user's datasets
  const auth = await luzmoAdminClient.create('authorization', {
    type: 'embed',
    username: user.id,
    access: { datasets: accessibleDatasetIds.map((id) => ({ id, rights: 'use' })), },
    parameter_overrides: { tenant_id: user.tenant_id },
  });

  // 2. Call /aiprompt (server-side) — fetch https://developer.luzmo.com/api/createAIPrompt.md for exact fields
  const luzmoEmbedClient = new Luzmo({
    host: process.env.LUZMO_API_HOST,
    api_key: auth.id,
    api_token: auth.token,
  });
  const resp = await luzmoEmbedClient.create('aiprompt', {
    agent: 'analyst',
    task: 'generate',
    conversation_id,
    response_mode: 'mixed',
    input: [
      { type: 'text', text: question },
      // optional: { type: 'dataset', id: '<uuid>' } to limit the question to e.g. a specific dataset
    ],
  });

  // 3. Return structured output the agent can interpret.
  return {
    answer: resp.assistant_message?.message,
    conversation_id: resp.conversation_id,
    assets: resp.assistant_message?.aiMessageAssets,
  };
}
```

For chart-only generation from a prompt, use `agent: 'item'` with `task: 'generate'`. Fetch `createAIPrompt.md` for the full agent/task matrix.

## Multi-Turn Conversations

Pass `conversation_id` from a previous `/aiprompt` response (or from `createAIConversation`) so IQ can use context for follow-ups.

```javascript
// Turn 1
const r1 = await askLuzmoIQ({ question: 'What was our revenue last quarter?', user });

// Turn 2 — agent passes r1.conversation_id back
const r2 = await askLuzmoIQ({
  question: 'Break it down by region',
  conversation_id: r1.conversation_id,
  user,
});
```

To list prior messages or assets: `https://developer.luzmo.com/api/searchAIMessage.md`, `https://developer.luzmo.com/api/searchAIMessageAsset.md`.

## Security Considerations

- Embed tokens generated per-call should be scoped to the LOGGED-IN USER'S allowed datasets and tenant context — not a generic shared token.
- Apply tenant filters (`parameter_overrides` / `filters`) in the embed token so the agent can never query other tenants' data, even if the LLM rewrites the user's question.
- Validate that `conversation_id` belongs to the same logged-in user before continuing multi-turn threads.
- Rate-limit calls per user to control IQ usage costs.

## Quality Considerations

The same quality fundamentals from `data-modeling-for-iq.md` apply here, with extra emphasis on:

- **Narrow token scope** — agentic flows tend to encourage broader questions, which makes scope discipline more important
- **Pre-built formulas** — agents work best when they get deterministic answers, not freshly invented calculations
- **Clear column descriptions** — agents will summarize results back to the user, and accurate descriptions feed accurate summaries

## When the Agent Should NOT Call IQ

- Pure visualization rendering ("show me a bar chart of X") — call the dashboard/Flex embed instead, or MCP `create_chart`
- Editing data — IQ is read-only for analytics
- Non-data questions — let the agent answer directly

## Fallback Behavior

If IQ returns low-confidence answers or errors:
- Surface the IQ error/uncertainty to the agent so it can ask a clarifying question
- Don't pretend IQ gave a clean answer if it didn't
- Log the question + low-confidence response for later dataset/column improvements
