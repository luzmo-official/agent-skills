# Writing descriptions and AI context

A drafting checklist. Admission tests and examples are in [metadata design](metadata-design.md).

- **Fix a meaningful gap; keep sufficient text.** Translate missing locales faithfully without rewriting adequate originals. Preserve every existing locale and useful customer term.
- **Descriptions serve people:** meaning, unit, eligibility and material interpretation limits, in plain language.
- **AI context adds** supported selection cues, query rules, guards and short `Aliases:`. Use null when nothing is needed. Metadata readers may see context, so never put secrets or personal records in it.
- **Put facts on the lowest owning resource.** Field-specific definitions belong on fields. AI rules reach IQ only through the saved agents they are linked to ([rules-and-agents.md](rules-and-agents.md)).
- **Keep public definitions complete.** Context is never the only place a reader-relevant unit, population or limitation appears. Do not repeat descriptions or expressions in context; keep needed companion-column conditions together.
- **State supported meaning directly.** Evidence, verification history, dashboard-use references, naming repairs and duplicate inventories belong in review artifacts. Keep substantive caveats while removing narration; stripping a source phrase does not establish the remaining claim.
- **Never silently repair an expression** or describe behaviour the current calculation does not implement. Inspect formula distinctions with [formulas](formulas.md) and record calculation changes separately.

## Budgets and API limits

| Field | Toolkit writing ceiling | API limit |
|---|---|---|
| Description per locale | 300 characters | 4,000 characters |
| Dataset AI context | 1,000 JSON-encoded characters | No documented storage ceiling |
| Column/formula AI context | 450 JSON-encoded characters | No documented storage ceiling |
| AI rule text | 5,000 characters | 20,000 characters |
| AI rule name | 120 characters | 120 characters |
| Agent name per locale | 150 characters | 150 characters |

- Budgets are ceilings, not targets. Shorten repetition while keeping meaning; never truncate silently.
- AI context length is `JSON.stringify(text.trim().replace(/\s+/g, ' ')).length`, counting escaping and UTF-16 code units.
- IQ may shorten stored context in prompts, so lead with the most useful selection cue.
- The writing ceilings are toolkit policy, not API storage limits. Read the [AI context documentation](https://developer.luzmo.com/guide/guides--managing-ai-context.md) before changing them.

Format:

- Descriptions are locale maps; AI context is one shared string or null.
- Use the supported locales in `scripts/limits.mjs`. Do not mix legacy `zh_cn`/`zh_tw` with their modern equivalents.
- Changed text must be trimmed. The renderer rejects changed values over a writing budget and warns about retained oversized text.

Phrase checks:

- They are backstops with limited language coverage, not semantic validation. Review every locale yourself.
- Resolve a warning against evidence; do not delete a legitimate query rule just to silence it.
- `dashboard_subject` is an explicit exception for data whose business subject is dashboards, not permission for usage-source narration.
