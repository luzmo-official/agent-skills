# Luzmo Skills Eval Framework

Evals follow Anthropic's **skill-creator** pipeline. Vendored tooling lives in
[`tools/skill-creator/`](tools/skill-creator/) (unmodified). A thin batch driver lives in
[`evals/`](evals/). Per-skill fixtures stay in `skills/<skill>/evals/`.

Full runbook: [`evals/README.md`](evals/README.md).

## Setup

```bash
cp evals/.env.example evals/.env.local
# set ANTHROPIC_API_KEY
./evals/runner.sh validate
```

Requires the **Claude Code** CLI (`claude`) and Python 3.

## Workflow

### 1. Run task evals (with skill vs baseline)

```bash
./evals/runner.sh task --skill core --report --view
```

Each case runs:

| Configuration | Meaning |
|---------------|---------|
| `with_skill` | Skill installed under `.claude/skills/` (and sibling dirs) |
| `without_skill` | Baseline without the skill |

Results: `evals/workspaces/<skill>/iteration-1--<timestamp>/`.

### 2. Grade and aggregate

Included automatically with `--report`. Manual steps:

```bash
./evals/runner.sh grade evals/workspaces/core/iteration-1--<ts>
./evals/runner.sh aggregate evals/workspaces/core/iteration-1--<ts> \
  --skill-name core --skill-path skills/core
```

Grading uses vendored [`agents/grader.md`](tools/skill-creator/agents/grader.md) via `claude -p`.
Outputs `grading.json` with `text` / `passed` / `evidence` per expectation.

### 3. View results

```bash
./evals/runner.sh view evals/workspaces/core/iteration-1--<ts> --skill-name core
```

Headless / CI: add `--static report.html`.

### Trigger evals

```bash
./evals/runner.sh trigger --skill core
```

Each query in `trigger_set.json` runs 3 times (default). Pass if trigger rate matches
`should_trigger` at the 0.5 threshold (skill-creator `run_eval.py`).

### Description optimization

```bash
./evals/runner.sh optimize --skill core
```

Uses vendored `run_loop.py` (60/40 train/test, 3 runs/query). Apply `best_description` manually.

## All skills

```bash
./evals/runner.sh task --all-skills --report
./evals/runner.sh trigger --all-skills
```

## Configuration

Defaults in [`eval.config.yaml`](eval.config.yaml) and `evals/.env.local`:

- `EVAL_MODEL` — Claude model for task execution (default `claude-sonnet-4-6`)
- `EVAL_GRADER_MODEL` — grader model (defaults to `EVAL_MODEL`)
- `EVAL_TIMEOUT_SEC` — per-case wall clock (default `600`)

Eval execution is **Claude-first**; other agent CLIs can be added later via the driver seam in
`evals/lib/agent.py`.

## Adding evals

See [`evals/README.md`](evals/README.md) and skill-creator
[`references/schemas.md`](tools/skill-creator/references/schemas.md).

## Re-vendor skill-creator

Documented in [`tools/skill-creator/VENDOR.md`](tools/skill-creator/VENDOR.md).
