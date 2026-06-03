"""Grade runs using vendored agents/grader.md via claude -p."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

from agent import AgentError, extract_json_object, run_claude_prompt


def _significant_tokens(text: str) -> set[str]:
    stop = {
        "the", "that", "this", "with", "and", "not", "any", "does", "says", "must",
        "should", "instead", "explicitly", "mentions", "explains", "recommends",
        "provide", "points", "using", "only", "doesn",
    }
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return {token for token in tokens if len(token) > 3 and token not in stop}


def _fallback_match(corpus: str, expectation: str) -> bool:
    corpus_lower = corpus.lower()
    if expectation.lower() in corpus_lower:
        return True
    tokens = _significant_tokens(expectation)
    if not tokens:
        return False
    hits = sum(1 for token in tokens if token in corpus_lower)
    return hits / len(tokens) >= 0.6


def _fallback_grade(corpus: str, expectations: list[str]) -> dict:
    results = []
    for exp in expectations:
        passed = _fallback_match(corpus, exp)
        results.append(
            {
                "text": exp,
                "passed": passed,
                "evidence": (
                    "Fallback keyword match in answer transcript "
                    "(grader did not return valid grading JSON)"
                ),
            }
        )
    passed_count = sum(1 for r in results if r["passed"])
    total = len(results)
    return {
        "expectations": results,
        "summary": {
            "passed": passed_count,
            "failed": total - passed_count,
            "total": total,
            "pass_rate": (passed_count / total) if total else 0.0,
        },
        "claims": [],
        "user_notes_summary": {
            "uncertainties": ["Grader did not emit valid grading JSON; used fallback matcher"],
            "needs_review": [],
            "workarounds": [],
        },
    }


def load_grader_prompt(skill_creator_root: Path) -> str:
    return (skill_creator_root / "agents" / "grader.md").read_text(encoding="utf-8")


def _load_timing(run_dir: Path) -> dict:
    timing_path = run_dir / "timing.json"
    if not timing_path.exists():
        return {}
    try:
        return json.loads(timing_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _load_execution_metrics(outputs_dir: Path) -> dict:
    metrics_path = outputs_dir / "metrics.json"
    if not metrics_path.exists():
        return {}
    try:
        return json.loads(metrics_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _validate_grading_payload(payload: dict, expectations: list[str]) -> bool:
    if not isinstance(payload, dict):
        return False
    items = payload.get("expectations")
    if not isinstance(items, list) or len(items) != len(expectations):
        return False
    summary = payload.get("summary")
    if not isinstance(summary, dict):
        return False
    for item, expected_text in zip(items, expectations):
        if not isinstance(item, dict):
            return False
        if item.get("text") != expected_text:
            return False
        if "passed" not in item or "evidence" not in item:
            return False
    return True


def _merge_run_metrics(payload: dict, run_dir: Path, outputs_dir: Path, grader_duration: float) -> dict:
    timing = _load_timing(run_dir)
    timing["grader_duration_seconds"] = round(grader_duration, 3)
    timing["executor_duration_seconds"] = timing.get("total_duration_seconds", 0.0)
    timing["total_duration_seconds"] = round(
        timing.get("total_duration_seconds", 0.0) + grader_duration,
        3,
    )
    payload["timing"] = timing
    payload["execution_metrics"] = _load_execution_metrics(outputs_dir)
    if timing.get("total_tokens") and not payload["execution_metrics"].get("total_tokens"):
        payload["execution_metrics"]["total_tokens"] = timing["total_tokens"]
    return payload


def _write_grading(
    grading_path: Path,
    payload: dict,
    run_dir: Path,
    outputs_dir: Path,
    grader_duration: float,
) -> None:
    payload = _merge_run_metrics(payload, run_dir, outputs_dir, grader_duration)
    grading_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    timing_path = run_dir / "timing.json"
    timing_path.write_text(json.dumps(payload["timing"], indent=2) + "\n", encoding="utf-8")


def _build_grader_prompt(
    *,
    grader_md: str,
    expectations: list[str],
    transcript_path: Path,
    outputs_dir: Path,
    grading_path: Path,
    stdout_only: bool,
) -> str:
    output_instruction = (
        "Respond with ONLY the JSON object described in the Output Format section. "
        "Do not use the Write tool or create files."
        if stdout_only
        else f"Write ONLY valid JSON to `{grading_path}` following the Output Format section exactly."
    )
    return (
        f"{grader_md}\n\n"
        "---\n\n"
        f"You are running as the Grader agent. {output_instruction}\n\n"
        f"expectations: {json.dumps(expectations)}\n"
        f"transcript_path: {transcript_path}\n"
        f"outputs_dir: {outputs_dir}\n"
    )


def _try_parse_grading_from_response(response_text: str, expectations: list[str]) -> dict | None:
    payload = extract_json_object(response_text)
    if payload and _validate_grading_payload(payload, expectations):
        return payload
    return None


def grade_run_dir(
    run_dir: Path,
    *,
    expectations: list[str],
    skill_creator_root: Path,
    model: str | None,
    timeout_sec: int,
    dry_run: bool,
) -> Path:
    outputs_dir = run_dir / "outputs"
    transcript_path = outputs_dir / "transcript.md"
    grading_path = run_dir / "grading.json"

    if dry_run:
        results = [
            {
                "text": exp,
                "passed": True,
                "evidence": "dry-run: grading skipped",
            }
            for exp in expectations
        ]
        passed = len(results)
        total = len(results)
        payload = {
            "expectations": results,
            "summary": {
                "passed": passed,
                "failed": 0,
                "total": total,
                "pass_rate": 1.0 if total else 0.0,
            },
            "execution_metrics": _load_execution_metrics(outputs_dir),
            "timing": _load_timing(run_dir),
            "claims": [],
            "user_notes_summary": {
                "uncertainties": [],
                "needs_review": [],
                "workarounds": [],
            },
        }
        _write_grading(grading_path, payload, run_dir, outputs_dir, 0.0)
        return grading_path

    grader_md = load_grader_prompt(skill_creator_root)
    if grading_path.exists():
        grading_path.unlink()

    prompt = _build_grader_prompt(
        grader_md=grader_md,
        expectations=expectations,
        transcript_path=transcript_path,
        outputs_dir=outputs_dir,
        grading_path=grading_path,
        stdout_only=False,
    )

    grader_start = time.time()
    response_text = ""
    try:
        response_text, _ = run_claude_prompt(
            prompt,
            cwd=run_dir,
            model=model,
            timeout_sec=timeout_sec,
        )
    except AgentError:
        response_text = ""
    grader_duration = time.time() - grader_start

    payload = None
    if grading_path.exists():
        try:
            candidate = json.loads(grading_path.read_text(encoding="utf-8"))
            if _validate_grading_payload(candidate, expectations):
                payload = candidate
        except json.JSONDecodeError:
            payload = None

    if payload is None:
        payload = _try_parse_grading_from_response(response_text, expectations)

    if payload is None:
        retry_prompt = _build_grader_prompt(
            grader_md=grader_md,
            expectations=expectations,
            transcript_path=transcript_path,
            outputs_dir=outputs_dir,
            grading_path=grading_path,
            stdout_only=True,
        )
        grader_start = time.time()
        try:
            response_text, _ = run_claude_prompt(
                retry_prompt,
                cwd=run_dir,
                model=model,
                timeout_sec=timeout_sec,
            )
            payload = _try_parse_grading_from_response(response_text, expectations)
        except AgentError:
            payload = None
        grader_duration += time.time() - grader_start

    if payload is None:
        corpus = transcript_path.read_text(encoding="utf-8") if transcript_path.exists() else ""
        answer_path = outputs_dir / "answer.md"
        if answer_path.exists():
            corpus = answer_path.read_text(encoding="utf-8")
        payload = _fallback_grade(corpus, expectations)
        payload["execution_metrics"] = _load_execution_metrics(outputs_dir)
        payload["timing"] = _load_timing(run_dir)

    _write_grading(grading_path, payload, run_dir, outputs_dir, grader_duration)
    return grading_path


def grade_iteration(
    iteration_dir: Path,
    *,
    skill_creator_root: Path,
    model: str | None,
    timeout_sec: int,
    dry_run: bool,
) -> None:
    for eval_dir in sorted(iteration_dir.glob("eval-*")):
        metadata_path = eval_dir / "eval_metadata.json"
        if not metadata_path.exists():
            continue
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        expectations = metadata.get("expectations") or []
        for config_dir in sorted(p for p in eval_dir.iterdir() if p.is_dir()):
            if not list(config_dir.glob("run-*")):
                continue
            for run_dir in sorted(config_dir.glob("run-*")):
                grade_run_dir(
                    run_dir,
                    expectations=expectations,
                    skill_creator_root=skill_creator_root,
                    model=model,
                    timeout_sec=timeout_sec,
                    dry_run=dry_run,
                )
