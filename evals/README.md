# Skill eval runbook

Luzmo skill evals use Anthropic's **skill-creator** pipeline (vendored verbatim under
[`tools/skill-creator/`](../tools/skill-creator/)). Per-skill cases live in
`skills/<skill>/evals/`. A thin headless driver in `evals/lib/` runs batch evals in CI;
grading and aggregation use upstream skill-creator scripts; the viewer wraps upstream HTML
with a Luzmo theme overlay (`evals/viewer/theme.css`).

## Prerequisites

- Python 3.10+
- [Claude Code](https://claude.com/product/claude-code) CLI (`claude` on `PATH`)
- `ANTHROPIC_API_KEY` (local and CI)
- Optional: `pip install pyyaml` for `quick_validate.py` during `validate`

```bash
cp evals/.env.example evals/.env.local
# edit ANTHROPIC_API_KEY and model ids
```

## Quick start

```bash
./evals/runner.sh validate
./evals/runner.sh task --skill core --case 1 --report --view
./evals/runner.sh trigger --skill core
```

Dry-run (no Claude calls; checks layout + aggregation):

```bash
./evals/runner.sh task --skill core --case 1 --dry-run --report
```

## Commands

| Command | Purpose |
|---------|---------|
| `validate` | Check `evals.json` / `trigger_set.json` schemas; optional `quick_validate` |
| `task` | Run `with_skill` vs `without_skill` for task evals |
| `grade` | Grade a workspace with vendored `agents/grader.md` |
| `aggregate` | Build `benchmark.json` / `benchmark.md` |
| `view` | HTML viewer with Luzmo theme (`--static out.html` for headless) |
| `trigger` | Trigger accuracy via vendored `scripts/run_eval.py` |
| `optimize` | Description optimization via vendored `scripts/run_loop.py` |

### Task eval workflow

```bash
./evals/runner.sh task --skill core --report
# workspaces: evals/workspaces/core/iteration-1--<timestamp>/
./evals/runner.sh view evals/workspaces/core/iteration-1--<timestamp> --skill-name core
```

Flags: `--case`, `--runs`, `--no-baseline`, `--all-skills`, `--model`, `--dry-run`.

### Trigger evals

Uses existing `skills/<skill>/evals/trigger_set.json` (`query`, `should_trigger`).

```bash
./evals/runner.sh trigger --skill core --runs-per-query 3 --trigger-threshold 0.5
```

### Description optimization

```bash
./evals/runner.sh optimize --skill core --max-iterations 5
```

Review `best_description` before editing `SKILL.md` frontmatter.

## Workspace layout

Matches skill-creator (`references/schemas.md`):

```text
evals/workspaces/<skill>/iteration-1--<timestamp>/
  eval-1/
    eval_metadata.json
    with_skill/run-1/
      eval_metadata.json          # copy for viewer prompt lookup
      prompt.txt
      outputs/
        execution.jsonl           # raw claude stream-json (debug)
        transcript.md             # human-readable answer (grader input)
        answer.md                 # same content (viewer Outputs panel)
        metrics.json
      grading.json
      timing.json
    without_skill/run-1/...
  benchmark.json
  benchmark.md
```

Per-run files:

- `execution.jsonl` — raw Claude stream-json for debugging
- `transcript.md` — clean markdown answer used by the grader
- `answer.md` — same answer, shown in the viewer Outputs tab (upstream viewer hides `transcript.md`)
- `eval_metadata.json` / `prompt.txt` — copied into each run dir for viewer compatibility

## Vendored upstream

See [`tools/skill-creator/VENDOR.md`](../tools/skill-creator/VENDOR.md).

**Re-vendor:** copy `skills/skill-creator` from a newer [anthropics/skills](https://github.com/anthropics/skills) commit, update `VENDOR.md`, diff `references/schemas.md` and `agents/grader.md`, adjust `evals/lib/` only if needed.

## Adding evals

Task cases — `skills/<skill>/evals/evals.json`:

```json
{
  "skill_name": "core",
  "evals": [
    {
      "id": 1,
      "prompt": "...",
      "expected_output": "...",
      "expectations": ["...", "..."]
    }
  ]
}
```

Trigger cases — `skills/<skill>/evals/trigger_set.json`:

```json
[
  {"query": "...", "should_trigger": true},
  {"query": "...", "should_trigger": false}
]
```

See also [`EVAL_FRAMEWORK.md`](../EVAL_FRAMEWORK.md).
