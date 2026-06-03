#!/usr/bin/env python3
"""Headless batch driver for Luzmo skill evals (skill-creator compatible)."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

# Allow running as `python evals/lib/driver.py` from repo root.
LIB_DIR = Path(__file__).resolve().parent
if str(LIB_DIR) not in sys.path:
    sys.path.insert(0, str(LIB_DIR))

from agent import claude_available  # noqa: E402
from benchmark import patch_benchmark_tokens  # noqa: E402
from executor import run_configuration  # noqa: E402
from grade import grade_iteration  # noqa: E402
from paths import (  # noqa: E402
    EVALS_ROOT,
    REPO_ROOT,
    SKILL_CREATOR_ROOT,
    load_manifest_skills,
    skill_path,
    skill_trigger_path,
)
from validate_evals import validate_all_skills  # noqa: E402
from view import serve_review, write_static_review  # noqa: E402
from workspace import create_iteration_dir, load_skill_evals, prepare_eval_dir  # noqa: E402


def _default_model() -> str | None:
    return __import__("os").environ.get("EVAL_MODEL", "claude-sonnet-4-6")


def _default_timeout() -> int:
    return int(__import__("os").environ.get("EVAL_TIMEOUT_SEC", "600"))


def _default_grader_model() -> str | None:
    return __import__("os").environ.get("EVAL_GRADER_MODEL") or _default_model()


def cmd_validate(args: argparse.Namespace) -> int:
    code = validate_all_skills(args.skills)
    if code != 0:
        return code
    quick = SKILL_CREATOR_ROOT / "scripts" / "quick_validate.py"
    try:
        __import__("yaml")
    except ImportError:
        print(
            "Note: skip quick_validate (install PyYAML to validate SKILL.md frontmatter).",
            file=sys.stderr,
        )
        return 0
    targets = args.skills if args.skills else load_manifest_skills()
    if quick.exists():
        for skill in targets:
            subprocess.run(
                [sys.executable, str(quick), str(skill_path(skill))],
                cwd=str(SKILL_CREATOR_ROOT),
                check=False,
            )
    return 0


def _resolve_skills(args: argparse.Namespace) -> list[str]:
    if args.all_skills:
        return load_manifest_skills()
    if args.skill:
        return args.skill
    raise SystemExit("Specify --skill <name> or --all-skills")


def cmd_task(args: argparse.Namespace) -> int:
    skills = _resolve_skills(args)
    if not args.dry_run and not claude_available():
        print("Error: `claude` CLI not found. Install Claude Code or pass --dry-run.", file=sys.stderr)
        return 1

    configs = ["with_skill"]
    if not args.no_baseline:
        configs.append("without_skill")

    for skill_name in skills:
        evals_data = load_skill_evals(skill_name)
        eval_items = evals_data.get("evals", [])
        if args.case:
            eval_items = [e for e in eval_items if e.get("id") in args.case]
            if not eval_items:
                print(f"No matching eval cases for skill {skill_name}", file=sys.stderr)
                return 1

        iteration_dir = create_iteration_dir(skill_name, args.iteration)
        print(f"Workspace: {iteration_dir}")

        for eval_item in eval_items:
            eval_dir = prepare_eval_dir(iteration_dir, skill_name, eval_item)
            prompt = eval_item["prompt"]
            for configuration in configs:
                for run_num in range(1, args.runs + 1):
                    run_dir = eval_dir / configuration / f"run-{run_num}"
                    run_dir.mkdir(parents=True, exist_ok=True)
                    print(f"  eval-{eval_item['id']} {configuration} run-{run_num} ...")
                    run_configuration(
                        configuration=configuration,
                        eval_prompt=prompt,
                        skill_name=skill_name,
                        repo_root=REPO_ROOT,
                        run_dir=run_dir,
                        model=args.model,
                        timeout_sec=args.timeout_sec,
                        dry_run=args.dry_run,
                    )

        if args.report:
            grade_args = argparse.Namespace(
                workspace=iteration_dir,
                model=args.grader_model,
                timeout_sec=args.grader_timeout,
                dry_run=args.dry_run,
            )
            cmd_grade(grade_args)
            aggregate_args = argparse.Namespace(
                workspace=iteration_dir,
                skill_name=skill_name,
                skill_path=str(skill_path(skill_name)),
            )
            cmd_aggregate(aggregate_args)
            if args.view or args.static:
                view_args = argparse.Namespace(
                    workspace=iteration_dir,
                    skill_name=skill_name,
                    port=args.port,
                    static=args.static,
                    benchmark=iteration_dir / "benchmark.json",
                )
                cmd_view(view_args)

    return 0


def cmd_grade(args: argparse.Namespace) -> int:
    if not args.workspace.exists():
        print(f"Workspace not found: {args.workspace}", file=sys.stderr)
        return 1
    if not args.dry_run and not claude_available():
        print("Error: `claude` CLI not found.", file=sys.stderr)
        return 1
    grade_iteration(
        args.workspace,
        skill_creator_root=SKILL_CREATOR_ROOT,
        model=args.model,
        timeout_sec=args.timeout_sec,
        dry_run=args.dry_run,
    )
    print(f"Graded runs under {args.workspace}")
    return 0


def cmd_aggregate(args: argparse.Namespace) -> int:
    script = SKILL_CREATOR_ROOT / "scripts" / "aggregate_benchmark.py"
    workspace = args.workspace.resolve()
    cmd = [
        sys.executable,
        str(script),
        str(workspace),
        "--skill-name",
        args.skill_name,
        "--skill-path",
        str(Path(args.skill_path).resolve()),
    ]
    code = subprocess.call(cmd, cwd=str(SKILL_CREATOR_ROOT))
    if code == 0:
        patch_benchmark_tokens(workspace)
    return code


def cmd_view(args: argparse.Namespace) -> int:
    benchmark_path = args.benchmark
    if benchmark_path is None and (args.workspace / "benchmark.json").exists():
        benchmark_path = args.workspace / "benchmark.json"

    if args.static:
        return write_static_review(
            args.workspace.resolve(),
            skill_name=args.skill_name,
            output_path=args.static,
            benchmark_path=benchmark_path.resolve() if benchmark_path else None,
        )

    return serve_review(
        args.workspace.resolve(),
        skill_name=args.skill_name,
        port=args.port,
        benchmark_path=benchmark_path.resolve() if benchmark_path else None,
    )


def cmd_trigger(args: argparse.Namespace) -> int:
    if not claude_available():
        print("Error: `claude` CLI not found.", file=sys.stderr)
        return 1
    skills = _resolve_skills(args)
    script = SKILL_CREATOR_ROOT / "scripts" / "run_eval.py"
    for skill_name in skills:
        trigger_path = skill_trigger_path(skill_name)
        cmd = [
            sys.executable,
            "-m",
            "scripts.run_eval",
            "--eval-set",
            str(trigger_path),
            "--skill-path",
            str(skill_path(skill_name)),
            "--runs-per-query",
            str(args.runs_per_query),
            "--trigger-threshold",
            str(args.trigger_threshold),
            "--timeout",
            str(args.timeout),
            "--num-workers",
            str(args.workers),
            "--verbose",
        ]
        if args.model:
            cmd.extend(["--model", args.model])
        print(f"Trigger eval: {skill_name}")
        env = __import__("os").environ.copy()
        env["PYTHONPATH"] = str(SKILL_CREATOR_ROOT)
        result = subprocess.run(cmd, cwd=str(REPO_ROOT), env=env)
        if result.returncode != 0:
            return result.returncode
    return 0


def cmd_optimize(args: argparse.Namespace) -> int:
    if not claude_available():
        print("Error: `claude` CLI not found.", file=sys.stderr)
        return 1
    script = SKILL_CREATOR_ROOT / "scripts" / "run_loop.py"
    cmd = [
        sys.executable,
        "-m",
        "scripts.run_loop",
        "--eval-set",
        str(skill_trigger_path(args.skill)),
        "--skill-path",
        str(skill_path(args.skill)),
        "--max-iterations",
        str(args.max_iterations),
        "--verbose",
    ]
    if args.model:
        cmd.extend(["--model", args.model])
    env = __import__("os").environ.copy()
    env["PYTHONPATH"] = str(SKILL_CREATOR_ROOT)
    return subprocess.call(cmd, cwd=str(REPO_ROOT), env=env)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Luzmo skill eval driver (skill-creator pipeline)")
    sub = parser.add_subparsers(dest="command", required=True)

    p_validate = sub.add_parser("validate", help="Validate eval fixtures and skill structure")
    p_validate.add_argument("--skill", action="append", dest="skills")
    p_validate.set_defaults(func=cmd_validate)

    p_task = sub.add_parser("task", help="Run task evals (with_skill vs baseline)")
    p_task.add_argument("--skill", action="append")
    p_task.add_argument("--all-skills", action="store_true")
    p_task.add_argument("--case", type=int, nargs="+", help="Eval id(s)")
    p_task.add_argument("--iteration", type=int, default=1)
    p_task.add_argument("--runs", type=int, default=1)
    p_task.add_argument("--no-baseline", action="store_true")
    p_task.add_argument("--model", default=_default_model())
    p_task.add_argument("--grader-model", default=_default_grader_model())
    p_task.add_argument("--timeout-sec", type=int, default=_default_timeout())
    p_task.add_argument("--grader-timeout", type=int, default=300)
    p_task.add_argument("--dry-run", action="store_true")
    p_task.add_argument("--report", action="store_true", help="Grade + aggregate after run")
    p_task.add_argument("--view", action="store_true", help="Open viewer when used with --report")
    p_task.add_argument("--port", type=int, default=3117)
    p_task.add_argument("--static", type=Path, help="Write static HTML instead of serving")
    p_task.set_defaults(func=cmd_task)

    p_grade = sub.add_parser("grade", help="Grade an iteration workspace")
    p_grade.add_argument("workspace", type=Path)
    p_grade.add_argument("--model", default=_default_grader_model())
    p_grade.add_argument("--timeout-sec", type=int, default=300)
    p_grade.add_argument("--dry-run", action="store_true")
    p_grade.set_defaults(func=cmd_grade)

    p_agg = sub.add_parser("aggregate", help="Aggregate grading into benchmark.json")
    p_agg.add_argument("workspace", type=Path)
    p_agg.add_argument("--skill-name", required=True)
    p_agg.add_argument("--skill-path", required=True)
    p_agg.set_defaults(func=cmd_aggregate)

    p_view = sub.add_parser("view", help="Launch eval viewer")
    p_view.add_argument("workspace", type=Path)
    p_view.add_argument("--skill-name", required=True)
    p_view.add_argument("--benchmark", type=Path)
    p_view.add_argument("--port", type=int, default=3117)
    p_view.add_argument("--static", type=Path)
    p_view.set_defaults(func=cmd_view)

    p_trigger = sub.add_parser("trigger", help="Run trigger evals via skill-creator run_eval.py")
    p_trigger.add_argument("--skill", action="append")
    p_trigger.add_argument("--all-skills", action="store_true")
    p_trigger.add_argument("--runs-per-query", type=int, default=3)
    p_trigger.add_argument("--trigger-threshold", type=float, default=0.5)
    p_trigger.add_argument("--timeout", type=int, default=30)
    p_trigger.add_argument("--workers", type=int, default=5)
    p_trigger.add_argument("--model", default=_default_model())
    p_trigger.set_defaults(func=cmd_trigger)

    p_opt = sub.add_parser("optimize", help="Optimize skill description (run_loop.py)")
    p_opt.add_argument("--skill", required=True)
    p_opt.add_argument("--max-iterations", type=int, default=5)
    p_opt.add_argument("--model", default=_default_model())
    p_opt.set_defaults(func=cmd_optimize)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
