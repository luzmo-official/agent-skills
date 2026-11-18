# AI rules and agents

## Contents

- [How AI rules reach IQ](#how-ai-rules-reach-iq)
- [Capture and review existing configuration](#capture-and-review-existing-configuration)
- [Knowledge proposal](#knowledge-proposal)
- [Approve and apply](#approve-and-apply)
- [What viewers can see during a run](#what-viewers-can-see-during-a-run)

API reference: [AI rules guide](https://developer.luzmo.com/guide/guides--creating-and-managing-rules-through-the-api.md), [agents guide](https://developer.luzmo.com/guide/guides--creating-and-using-agents-through-the-api.md), [updateAIRule](https://developer.luzmo.com/api/updateAIRule.md), [associateAgent](https://developer.luzmo.com/api/associateAgent.md).

## How AI rules reach IQ

AI rules are not global. Use this model whenever you describe a rule's effect:

- IQ applies an AI rule only through a saved agent it is linked to, and only when the request names that agent (an `/aiprompt` call or IQ embed with its `agentId`). A request without an agent loads no AI rules.
- IQ uses the rule's **published** version. Saving new text creates a new draft version; it changes nothing until that version is published.
- An unpublished rule, or one linked to no agent, has no effect on answers.
- Name the agents a rule reaches (and the integrations that call them). Never write that a rule applies "to all questions" or "to every dataset".

Put content where it belongs:

- AI rules: shared vocabulary and response preferences for the agents they are linked to.
- Dataset, column and formula metadata: definitions specific to that resource (see [metadata design](metadata-design.md)).
- Agent name and description: customer-facing. Describe audience, purpose and supported questions in plain business language. An agent is a saved configuration (datasets, AI rules, capabilities, theme), not a free-form system prompt; do not invent settings it does not have.

## Capture and review existing configuration

```text
node <skill>/scripts/knowledge.mjs --workspace luzmo-semantic-layer-review-artifacts --mode collect
```

Requires API credentials. Choose the scope in `config.knowledge_scope`:

| Setting | Captures |
|---|---|
| `[{"resource":"agent","id":"<id>"}, {"resource":"airule","id":"<id>"}]` | The listed resources plus everything linked to them, recursively (so every agent a shared rule reaches is included). |
| `[]` | Nothing existing; use when only proposing new configuration. |
| omitted | The full inventory visible to the credentials. |

A rule capture holds its name, latest (draft) and published version text, and linked agents. An agent capture holds its localized name and description, capabilities, theme, dataset links and linked AI rules. The capture is stored with a content hash, separate from dataset metadata.

- Partial access, inconsistent links or a page cap set `complete=false` and are listed under `issues`. Executable proposals need a complete capture. An API denial is missing evidence, not an empty inventory.
- Review every captured resource individually. Unrelated resources outside the scope need no assessment.
- Look for: duplicate or contradictory rules, a draft that differs from the published text, rules linked to agents for unrelated workflows, redundant agents, dataset links and capability choices. Prefer improving an existing resource over creating a near-duplicate.

## Knowledge proposal

```text
node <skill>/scripts/knowledge.mjs --workspace luzmo-semantic-layer-review-artifacts --mode seed
node <skill>/scripts/knowledge.mjs --workspace luzmo-semantic-layer-review-artifacts --mode review
```

`seed` refuses to overwrite an existing `knowledge-proposal.json`. Fill in:

- Top level: `verdict` (`ready`, `ready-with-corrections` or `not-ready`; only the first two can be applied), `assessment`, blocking `questions` (strings) and `resources`.
- Each resource: `key`, `id`, `kind` (`rule` or `agent`), `disposition` (`keep`, `revise`, `hold` or `create`), immutable `original`, full `proposed`, its own `assessment`, `evidence`, `scope_rationale` (who and what the change affects) and blocking `questions`.

Rules for entries:

- An existing resource's `key` is its live ID. A new resource uses a local key such as `new:response-language`, with `id: null`, `original: null` and disposition `create` (or `hold`). Never invent live IDs; local keys are resolved during apply.
- Any open question (top level, or on the entry) blocks executable changes. Hold the affected entry and review the rest.
- Changed resources need evidence and a concrete `scope_rationale`.
- Keep every existing locale of agent names and descriptions; changed agents need a name and description in each agreed language.

Rule `proposed`:

```json
{"name":"Response language","content":"Answer in the language of the user's question.","publication":"preserve"}
```

`publication` says what happens to the published version:

| Value | Effect |
|---|---|
| `preserve` | Save the proposed text as a new draft version; the published version stays as it is. New rules stay unpublished. |
| `latest` | Save the text, then publish that new version (`published_version_id` is set to it). |
| `unpublish` | Clear the published version. Version history is kept. |

Limits: name ≤ 120 and text ≤ 20,000 characters (Luzmo limits), both trimmed and nonempty. Working budget: text ≤ 5,000 characters; split broader guidance into focused rules. The review lists every violation at once.

Agent `proposed`:

```json
{"name":{"en":"Sales analyst"},"description":{"en":"Answers sales and refund questions."},"capabilities":["data_analysis"],"theme_id":null,"dataset_ids":["<selected-dataset-id>"],"rule_refs":["new:response-language"]}
```

- `name`: ≤ 150 characters per locale, at least one nonempty locale, supported Luzmo locales only.
- `capabilities`: any of `data_analysis`, `chart_creation`, `dashboard_creation`. An empty list means every capability the user has; it does not disable the agent.
- `dataset_ids`: an empty list means normal IQ dataset selection, not "no datasets". New links must be datasets selected in `config.json`; existing links outside that selection may stay. Links narrow selection; they never grant data access.
- `rule_refs`: captured rule IDs or new rule keys. Linking a draft rule does not activate it.
- Any user with access can invoke an agent; sharing controls who can modify it. A theme is presentation only.

`review` writes `knowledge-review.html`, `knowledge-review.md`, `knowledge-preview.json` and an empty `knowledge-approval.template.json`. The page compares published, draft and proposed rule text and current versus proposed agent settings and links. `review.mjs` also embeds this section in the main `review.html` when the knowledge files exist; run `knowledge.mjs --mode review` as well to refresh the executable preview.

## Approve and apply

Approval works as for metadata ([publishing](publishing.md)), with a separate preview hash and allowlist (`approved_keys`). One confirmation from the user can cover both when the request clearly shows both final selections; the agent then prepares two approval files.

- Offer new and changed AI rules and agents in the [publication choices](publishing.md#publication-choices), recommended from the review, not selected automatically. Saving text, publishing and linking are separate effects the user may choose differently.
- An approved agent that depends on a new rule or on a proposed edit of an existing rule needs that rule approved too; otherwise review the agent again against the current rule.

```text
node <skill>/scripts/knowledge.mjs --workspace luzmo-semantic-layer-review-artifacts --mode apply --approval <knowledge-approval.json>
node <skill>/scripts/knowledge.mjs --workspace luzmo-semantic-layer-review-artifacts --mode apply --approval <knowledge-approval.json> --execute
```

Without `--execute` this is a read-only preflight. With it, the script:

1. Refuses a `not-ready` verdict, a stale preview or an approval for another preview.
2. Recaptures the reviewed scope and refuses, listing each added, removed or edited rule or agent, if anything changed since capture. Checks that every approved dataset link is an accessible dataset.
3. Saves the full live AI rule and agent inventory (not only the reviewed scope) to `artifacts/backups/knowledge-<timestamp>.json`, and lists it in the backup manifest. If the full inventory cannot be read, nothing is written.
4. Per rule: creates it or saves the new text (a new version), then sets `published_version_id` when `publication` asks for it.
5. Per agent: creates it or updates its settings, then adds and removes dataset and rule links (links are made on the agent with the documented `Securables` and `linked_rules` roles).
6. Rechecks each resource right before writing it and reads it back afterwards.

It never changes sharing, permissions, Embed tokens or calculations. It deletes only resources created earlier in the same run, and only to roll that run back. A create whose response has no trustworthy ID is never adopted or deleted by name; the report lists candidate IDs to inspect.

Recovery follows [publishing](publishing.md#recovery-is-best-effort). Restoring rule text saves another version; history is kept. A verified run writes `artifacts/applied/knowledge-<timestamp>.json`; a failed run writes none.

To restore AI rules and agents from a backup, see [publishing](publishing.md#restore-ai-rules-and-agents).

## What viewers can see during a run

The API has no transaction, so tell the user about these effects when they apply:

- A new agent is visible to the organization as soon as it is created, before its dataset and rule links exist.
- When links are replaced, new links are added before old ones are removed, so the agent briefly has both.
- A published rule affects its linked agents immediately, before later steps finish.
- Do not use or share a new agent until the run reports success.

After applying, test representative questions through the agent, in the intended end-user context ([IQ evaluation](iq-evaluation.md)). A successful write does not prove better answers.
