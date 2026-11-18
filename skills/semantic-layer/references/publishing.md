# Approval, publishing, backups and restore

## Contents

- [Human approval is the final gate](#human-approval-is-the-final-gate)
- [Publication choices](#publication-choices)
- [Apply metadata](#apply-metadata)
- [Recovery is best effort](#recovery-is-best-effort)
- [Backups](#backups)
- [Restore metadata](#restore-metadata)
- [Restore AI rules and agents](#restore-ai-rules-and-agents)
- [Check behavior after publication](#check-behavior-after-publication)

## Human approval is the final gate

1. Present the concrete review and summarize the final selection in business terms: which updates, new resources, AI rule publication and shared effects.
2. Collect feedback in chat, resolve unclear references and requested changes, and resolve blocking questions. Regenerate and present the review after every edit.
3. Ask for authorization of that exact selection. Use the host's dedicated approval tool when one exists and is allowed; otherwise ask in chat. A generic question tool or a command-sandbox permission is not publication approval. Respect any extra approval gates of the host.
4. Only after the user explicitly authorizes it, copy `approval.template.json` to a separate private file and fill `reviewer`, ISO `reviewed_at` and `approved_ids` (only the authorized IDs). Keep `preview_sha256` as generated. Record privately what the user actually said.

What counts:

| Authorizes publishing | Does not |
|---|---|
| "Yes, publish the updates in this review" for the version shown. | The initial request to audit, credentials in `.env`, passing tests, a sandbox approval, "looks good", or a request for changes. |
| Approval of a subset ("everything except the two refund fields"). | Approval of an earlier version after the proposal changed. |

- Do not ask again just to fill in the approval file once the user has authorized the displayed set.
- The approval file is an execution guard against mistakes (wrong preview, stale proposal, unlisted IDs). It is not a signature and cannot prove who approved. Filling it without the user's decision is never acceptable.
- The user never handles JSON, IDs or hashes.
- Only `ready` and `ready-with-corrections` reviews can be applied. A `not-ready` review is for discussion: hold the blocked resources, record a new verdict, re-render and ask for approval of the new version.
- Metadata, AI rules and agents ([rules and agents](rules-and-agents.md#approve-and-apply)) and calculation changes are approved and executed separately.

## Publication choices

Once the review is concrete, ask which changes the user wants sent to Luzmo. Present a clear verdict first: what is ready, what is held (metadata or calculations), and what is optional future work.

**Recommend a selection from this review.** Base it on the evidence and confidence per change, the expected benefit, who is affected and the user's goals, and explain why. There is no fixed default: filling missing text is often the conservative choice, but a well-supported correction of existing text can matter more, and a new agent or published AI rule can have wider effects than any description. Held definitions and calculations never enter the selection.

Show only the groups that have items, with counts and names or review numbers:

| Choice | What the user selects |
|---|---|
| Fill missing descriptions and AI context | Only absent, null or blank values, decided per locale: adding English never replaces populated French text. |
| Replace existing descriptions or AI context | Specific reviewed replacements or clearings, naming the fields and locales. One resource can have both additions and replacements. |
| Create new agents and AI rules | The reviewed configurations, with their links, capabilities and each rule's publication effect. |
| Change existing agents | Text, capabilities and dataset or AI rule links, as reviewed. |
| Change existing AI rules | Saved text, publishing or unpublishing, with the effect on every linked agent. |
| Add new formulas | Reviewed candidates, as a separate implementation plan (below). |
| Update existing calculations | Expression repairs, separate from description changes on the same formula. |

- Use the host's choice or question tool when it fits, otherwise ask in chat. If it offers exclusive answers, give a few real alternatives such as "Recommended selection (Recommended)", "Fill missing metadata only" and "Choose individually", and describe the recommended contents beside the question. Always allow publishing nothing or custom exclusions. A preselected answer or silence is never consent.
- Let the user adjust single resources or groups.

**Turn the choice into exact values.** Choosing a group selects scope; it does not authorize unseen changes.

- Metadata approvals list resource IDs, not fields. To leave out one populated field of a selected resource (for example "fill missing only" on a resource that also has a replacement), set that field in `proposed` back to its captured value, re-render and check the new preview. Never edit captured originals to make a selection pass.
- Record left-out work as held in the review, not as "kept": its original text was not judged sufficient.
- AI rules and agents: select exact keys. Include the new rules a new agent needs, or review the agent again against the current rules. Creating or linking a rule never publishes it; never publish a draft or widen capabilities or datasets to complete a bundle.
- Formulas and expression repairs: neither apply script writes them. Prepare a separate plan (exact expressions, metadata, datasets, dependencies, checks) with authorized tooling, show it and get specific approval; otherwise leave them as pending implementation and say what remains ([formulas](formulas.md#recording-a-recommendation)).

**Final authorization.** Re-render the affected previews and present the final selection, exclusions, effects, backup and restore behavior and anything left pending. Then get explicit authorization as described [above](#human-approval-is-the-final-gate). A selection answer counts as authorization only if it explicitly approves the displayed final operations. Metadata, AI rules and agents, and calculations keep separate approvals; nothing is atomic across them.

**After applying.** Keep the `artifacts/applied/` record and the backup private; together they support a later restore. If a run stopped, act on its report and tell the user what was rolled back before asking again. Run the agreed test questions, or say that evaluation is still pending. End with a short list of next steps for calculation defects, owner decisions and source-data gaps; do not suggest the metadata solved them.

## Apply metadata

```text
node <skill>/scripts/apply.mjs --workspace luzmo-semantic-layer-review-artifacts --approval <approval-file>
node <skill>/scripts/apply.mjs --workspace luzmo-semantic-layer-review-artifacts --approval <approval-file> --execute
```

The first command is a read-only preflight. With `--execute` the script:

1. Revalidates proposal, capture, preview and approval, refuses a `not-ready` verdict, and checks that `.env` points at the same host as the review.
2. Reads every approved resource live. If its description, AI context, expression or name changed since capture, it writes nothing and lists each resource and field.
3. Saves a [backup](#backups) of the live values. If that fails, nothing is written.
4. Rechecks each resource right before writing, updates only `description` and `ai_context`, and reads it back.
5. On success writes `artifacts/applied/metadata-<timestamp>.json` with the approval, before and after values and the backup path. A failed run writes no applied record.

It never changes expressions, creates resources, publishes AI rules or agents, or changes access.

## Recovery is best effort

The API has no transaction across resources, so viewers can briefly see a value that is later rolled back. When a write fails or the run is interrupted, the script stops and tries to undo its earlier writes in reverse order, reading each one back:

- A resource still in its original state needs no undo (`unchanged`).
- A resource someone else changed meanwhile is kept and reported (`skipped-newer-edit`); never overwrite it automatically.
- A created rule or agent is deleted only when its ID came from the create response and it still matches this run. A create with no trustworthy ID is never adopted or deleted by name.
- A hard kill (power loss, `kill -9`, a second Ctrl+C) skips rollback. `update-preview.json` and `knowledge-preview.json` keep the original values for manual recovery.

The JSON report on stderr (also saved under `artifacts/recovery/`) lists `stopped_at` with the attempted and captured values, the `rollback` result per step (`rolled-back`, `unchanged`, `skipped-newer-edit`, `not-rolled-back`) and what was `not_attempted`. Keep it. Never say everything was rolled back unless the report verifies it.

Fix the cause before retrying:

| Report shows | Do this |
|---|---|
| HTTP 400 or a limit message | Correct that resource in the proposal, re-render, and get approval for the new preview. |
| HTTP 401 | Check host, complete credential pair, expiry, revocation and IP restrictions; the user repairs `.env`. |
| HTTP 403 | Check edit rights for these credentials. |
| Drift, a rename or `changed-before-write` | Recapture, carry the live edits into the proposal and review again. |
| Timeout or HTTP 5xx, with full rollback | Rerun the same approved apply. |
| Any `skipped-newer-edit` or `not-rolled-back` | Tell the user which resources now differ and the values listed under `restore`. |

Retry the same approval only after every attempted write is verified unchanged or restored and preflight passes.

## Backups

Executing apply, knowledge apply and restore save a backup after all checks pass and before the first write:

- `artifacts/backups/metadata-<timestamp>.json`: per approved resource its `id`, `resource`, `kind`, `dataset_id`, `name` and live `description`, `ai_context` and `expression`.
- `artifacts/backups/knowledge-<timestamp>.json`: `inventory`, the full live AI rule and agent inventory visible to the credentials, also when the review was scoped.

Every backup is listed with its SHA-256 in `artifacts/backups/manifest.json`. Backups are never overwritten and are kept after failed runs. They contain private metadata; keep them in the workspace. Tell the user where the backup and any recovery report are.

## Restore metadata

```text
node <skill>/scripts/restore.mjs --workspace luzmo-semantic-layer-review-artifacts --backup <workspace>/artifacts/backups/metadata-<timestamp>.json [--ids <id,id>]
node <skill>/scripts/restore.mjs --workspace luzmo-semantic-layer-review-artifacts --backup <same> [--ids <same>] --execute --plan-sha256 <printed-hash>
```

- Restore accepts only an unmodified backup saved by this toolkit: inside the workspace's `artifacts/backups/`, listed in the manifest, with a matching hash. Never write or edit a backup by hand.
- Without `--execute` it reads live values, writes `artifacts/restore-plan.json` and prints its hash. The plan lists `changes` (live `before`, backup `target`), `unchanged` IDs and `warnings` when an expression or name changed after the backup. Explain the plan in plain language; restoring is a metadata write and needs the user's explicit confirmation.
- With `--execute` it rebuilds the plan and refuses if anything changed, then runs it through the apply engine (drift check, backup of the values it replaces, readback, recovery) and writes `artifacts/applied/restore-<timestamp>.json`.
- Restoring an older backup over newer approved changes is fine when the user asks for it knowingly.

## Restore AI rules and agents

1. Recapture and seed a new knowledge proposal.
2. Set each affected resource's `proposed` value from the knowledge backup. For rule text use `publication: "latest"`, or `"unpublish"` when the backup had no published version.
3. Review, approve and apply it as usual.

Deleting resources that an earlier run created is left to the user in Luzmo.

## Check behavior after publication

When IQ evaluation is in scope, run the same questions again and present the comparison ([IQ evaluation](iq-evaluation.md)); equivalent context and unchanged source data matter. Investigate regressions and propose corrections or a restore for approval. A valid preview does not prove better answers or better resource selection.
