"""Patch benchmark token counts from run timing.json files."""

from __future__ import annotations

import json
import math
from pathlib import Path


def _calculate_stats(values: list[float]) -> dict:
    if not values:
        return {"mean": 0.0, "stddev": 0.0, "min": 0.0, "max": 0.0}
    n = len(values)
    mean = sum(values) / n
    if n > 1:
        variance = sum((x - mean) ** 2 for x in values) / (n - 1)
        stddev = math.sqrt(variance)
    else:
        stddev = 0.0
    return {
        "mean": round(mean, 4),
        "stddev": round(stddev, 4),
        "min": round(min(values), 4),
        "max": round(max(values), 4),
    }


def _tokens_for_run(workspace: Path, eval_id: int, configuration: str, run_number: int) -> int | None:
    run_dir = workspace / f"eval-{eval_id}" / configuration / f"run-{run_number}"
    timing_path = run_dir / "timing.json"
    if not timing_path.exists():
        return None
    try:
        timing = json.loads(timing_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    tokens = timing.get("total_tokens")
    return int(tokens) if tokens else None


def patch_benchmark_tokens(workspace: Path) -> None:
    benchmark_path = workspace / "benchmark.json"
    if not benchmark_path.exists():
        return

    data = json.loads(benchmark_path.read_text(encoding="utf-8"))
    runs = data.get("runs") or []
    changed = False
    for run in runs:
        eval_id = run.get("eval_id")
        configuration = run.get("configuration")
        run_number = run.get("run_number")
        if eval_id is None or not configuration or run_number is None:
            continue
        tokens = _tokens_for_run(workspace, int(eval_id), str(configuration), int(run_number))
        if tokens is None:
            continue
        result = run.setdefault("result", {})
        if result.get("tokens") != tokens:
            result["tokens"] = tokens
            changed = True

    if not changed:
        return

    summary = data.setdefault("run_summary", {})
    configs: dict[str, list[int]] = {}
    for run in runs:
        config = run.get("configuration")
        tokens = run.get("result", {}).get("tokens")
        if config is None or tokens is None:
            continue
        configs.setdefault(str(config), []).append(int(tokens))

    for config, token_values in configs.items():
        block = summary.setdefault(config, {})
        block["tokens"] = _calculate_stats([float(v) for v in token_values])

    configs_present = list(summary.keys())
    if len(configs_present) >= 2:
        primary_name = "with_skill" if "with_skill" in summary else configs_present[0]
        baseline_name = "without_skill" if "without_skill" in summary else configs_present[1]
        primary = summary.get(primary_name, {}).get("tokens", {})
        baseline = summary.get(baseline_name, {}).get("tokens", {})
        delta = data.setdefault("delta", {})
        delta["tokens"] = f"{primary.get('mean', 0) - baseline.get('mean', 0):+.0f}"

    benchmark_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")

    benchmark_md = workspace / "benchmark.md"
    if not benchmark_md.exists():
        return

    lines = benchmark_md.read_text(encoding="utf-8").splitlines()
    summary_block = data.get("run_summary", {})
    delta = data.get("delta", {})
    with_skill = summary_block.get("with_skill", {})
    without_skill = summary_block.get("without_skill", {})
    a_tokens = with_skill.get("tokens", {})
    b_tokens = without_skill.get("tokens", {})
    token_line = (
        f"| Tokens | {a_tokens.get('mean', 0):.0f} ± {a_tokens.get('stddev', 0):.0f} | "
        f"{b_tokens.get('mean', 0):.0f} ± {b_tokens.get('stddev', 0):.0f} | "
        f"{delta.get('tokens', '—')} |"
    )
    for idx, line in enumerate(lines):
        if line.startswith("| Tokens |"):
            lines[idx] = token_line
            benchmark_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
            break
