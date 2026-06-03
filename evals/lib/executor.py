"""Execute task eval cases (with_skill / without_skill)."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from agent import AgentError, parse_stream_json, run_claude_prompt
from workspace import ensure_claude_project_root, install_skill, reset_dir


def build_task_prompt(
    *,
    eval_prompt: str,
    skill_name: str | None,
    skill_path: Path | None,
    outputs_dir: Path,
) -> str:
    outputs_dir.mkdir(parents=True, exist_ok=True)
    if skill_name and skill_path:
        return (
            "Execute this task:\n"
            f"- Skill path: {skill_path}\n"
            f"- Task: {eval_prompt}\n"
            "- Input files: none\n"
            f"- Save outputs to: {outputs_dir}\n"
            "- Outputs to save: transcript.md with your final answer and any supporting notes\n"
            "\n"
            "Read the skill at the given path and follow it. Write transcript.md into the outputs "
            "directory with your complete response."
        )
    return (
        "Execute this task without using any project skills:\n"
        f"- Task: {eval_prompt}\n"
        f"- Save outputs to: {outputs_dir}\n"
        "- Outputs to save: transcript.md with your final answer\n"
        "\n"
        "Write transcript.md into the outputs directory with your complete response."
    )


def _copy_run_metadata(run_dir: Path, eval_prompt: str) -> None:
    eval_metadata_src = run_dir.parent.parent / "eval_metadata.json"
    if eval_metadata_src.exists():
        shutil.copy2(eval_metadata_src, run_dir / "eval_metadata.json")
    (run_dir / "prompt.txt").write_text(eval_prompt + "\n", encoding="utf-8")


def _write_run_outputs(
    *,
    outputs_dir: Path,
    raw_stream: str,
    agent_written_transcript: str | None,
    timing: dict,
) -> tuple[str, dict]:
    execution_log, parsed_answer, stream_timing = parse_stream_json(
        raw_stream,
        outputs_dir=outputs_dir,
    )

    if stream_timing.get("total_tokens"):
        timing["total_tokens"] = stream_timing["total_tokens"]
    if stream_timing.get("duration_ms") and not timing.get("duration_ms"):
        timing["duration_ms"] = stream_timing["duration_ms"]
        timing["total_duration_seconds"] = round(stream_timing["duration_ms"] / 1000.0, 3)

    answer_text = agent_written_transcript or parsed_answer or raw_stream
    if not answer_text.strip():
        answer_text = raw_stream

    (outputs_dir / "execution.jsonl").write_text(execution_log, encoding="utf-8")
    (outputs_dir / "transcript.md").write_text(answer_text + "\n", encoding="utf-8")
    (outputs_dir / "answer.md").write_text(answer_text + "\n", encoding="utf-8")

    files_created = ["execution.jsonl", "transcript.md", "answer.md"]
    metrics = {
        "tool_calls": {},
        "total_tool_calls": 0,
        "total_steps": 0,
        "files_created": files_created,
        "errors_encountered": 1 if (outputs_dir / "error.txt").exists() else 0,
        "output_chars": len(answer_text),
        "transcript_chars": len(answer_text),
        "total_tokens": timing.get("total_tokens", 0),
    }
    (outputs_dir / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    return answer_text, metrics


def run_configuration(
    *,
    configuration: str,
    eval_prompt: str,
    skill_name: str,
    repo_root: Path,
    run_dir: Path,
    model: str | None,
    timeout_sec: int,
    dry_run: bool,
) -> None:
    outputs_dir = run_dir / "outputs"
    reset_dir(outputs_dir)
    _copy_run_metadata(run_dir, eval_prompt)

    workdir = run_dir / "workdir"
    reset_dir(workdir)
    ensure_claude_project_root(workdir)

    skill_source = repo_root / "skills" / skill_name
    if configuration == "with_skill":
        install_skill(workdir, skill_name)
        prompt = build_task_prompt(
            eval_prompt=eval_prompt,
            skill_name=skill_name,
            skill_path=skill_source,
            outputs_dir=outputs_dir,
        )
    elif configuration == "without_skill":
        prompt = build_task_prompt(
            eval_prompt=eval_prompt,
            skill_name=None,
            skill_path=None,
            outputs_dir=outputs_dir,
        )
    else:
        raise ValueError(f"Unknown configuration: {configuration}")

    if dry_run:
        answer_text = f"[dry-run:{configuration}] {eval_prompt}"
        timing = {"total_tokens": 0, "duration_ms": 0, "total_duration_seconds": 0.0}
        raw_stream = answer_text
        agent_written = None
    else:
        agent_written = None
        try:
            raw_stream, timing = run_claude_prompt(
                prompt,
                cwd=workdir,
                model=model,
                timeout_sec=timeout_sec,
            )
            transcript_path = outputs_dir / "transcript.md"
            if transcript_path.exists() and transcript_path.stat().st_size > 0:
                content = transcript_path.read_text(encoding="utf-8").strip()
                if content and not content.lstrip().startswith("{"):
                    agent_written = content
        except AgentError as exc:
            raw_stream = f"Agent error: {exc}"
            timing = {"total_tokens": 0, "duration_ms": 0, "total_duration_seconds": 0.0}
            (outputs_dir / "error.txt").write_text(str(exc), encoding="utf-8")

    _write_run_outputs(
        outputs_dir=outputs_dir,
        raw_stream=raw_stream,
        agent_written_transcript=agent_written,
        timing=timing,
    )
    (run_dir / "timing.json").write_text(json.dumps(timing, indent=2) + "\n", encoding="utf-8")
