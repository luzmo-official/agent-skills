"""Validate per-skill eval fixtures against skill-creator schemas."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from paths import REPO_ROOT, load_manifest_skills, skill_evals_path, skill_trigger_path


def validate_evals_json(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"{path}: invalid JSON ({exc})"]

    if not isinstance(data, dict):
        return [f"{path}: root must be an object"]

    evals = data.get("evals")
    if not isinstance(evals, list) or not evals:
        errors.append(f"{path}: evals must be a non-empty array")
        return errors

    seen_ids: set[int] = set()
    for item in evals:
        if not isinstance(item, dict):
            errors.append(f"{path}: each eval must be an object")
            continue
        eval_id = item.get("id")
        if not isinstance(eval_id, int):
            errors.append(f"{path}: eval id must be an integer")
        elif eval_id in seen_ids:
            errors.append(f"{path}: duplicate eval id {eval_id}")
        else:
            seen_ids.add(eval_id)
        for field in ("prompt", "expected_output"):
            if field not in item or not isinstance(item[field], str) or not item[field].strip():
                errors.append(f"{path}: eval {eval_id} missing non-empty {field}")
        expectations = item.get("expectations")
        if not isinstance(expectations, list) or not expectations:
            errors.append(f"{path}: eval {eval_id} must include expectations[]")
        elif not all(isinstance(e, str) and e.strip() for e in expectations):
            errors.append(f"{path}: eval {eval_id} expectations must be non-empty strings")
        files = item.get("files", [])
        if files and not isinstance(files, list):
            errors.append(f"{path}: eval {eval_id} files must be an array when present")

    return errors


def validate_trigger_set(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"{path}: invalid JSON ({exc})"]

    if not isinstance(data, list) or not data:
        return [f"{path}: trigger_set must be a non-empty array"]

    for idx, item in enumerate(data):
        if not isinstance(item, dict):
            errors.append(f"{path}: item {idx} must be an object")
            continue
        if not isinstance(item.get("query"), str) or not item["query"].strip():
            errors.append(f"{path}: item {idx} missing query")
        if not isinstance(item.get("should_trigger"), bool):
            errors.append(f"{path}: item {idx} missing should_trigger boolean")

    return errors


def validate_all_skills(skill_names: list[str] | None = None) -> int:
    names = skill_names or load_manifest_skills()
    errors: list[str] = []
    for name in names:
        eval_path = skill_evals_path(name)
        trigger_path = skill_trigger_path(name)
        if not eval_path.exists():
            errors.append(f"Missing {eval_path}")
        else:
            errors.extend(validate_evals_json(eval_path))
        if not trigger_path.exists():
            errors.append(f"Missing {trigger_path}")
        else:
            errors.extend(validate_trigger_set(trigger_path))

    if errors:
        for err in errors:
            print(err, file=sys.stderr)
        return 1

    print(f"Validated eval fixtures for {len(names)} skill(s).")
    return 0


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Validate skill eval fixtures")
    parser.add_argument("--skill", action="append", dest="skills", help="Skill id (repeatable)")
    args = parser.parse_args()
    raise SystemExit(validate_all_skills(args.skills))


if __name__ == "__main__":
    main()
