"""Workspace layout compatible with skill-creator aggregate_benchmark."""

from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from paths import REPO_ROOT, SKILL_INSTALL_DIRS, skill_evals_path, skill_path


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "eval"


def load_skill_evals(skill_name: str) -> dict:
    return json.loads(skill_evals_path(skill_name).read_text(encoding="utf-8"))


def eval_name_for(skill_name: str, eval_id: int, prompt: str) -> str:
    first_line = prompt.strip().splitlines()[0][:60]
    return slugify(f"{skill_name}-{eval_id}-{first_line}")


def build_eval_metadata(skill_name: str, eval_item: dict) -> dict:
    eval_id = eval_item["id"]
    return {
        "eval_id": eval_id,
        "eval_name": eval_name_for(skill_name, eval_id, eval_item["prompt"]),
        "prompt": eval_item["prompt"],
        "expected_output": eval_item.get("expected_output", ""),
        "expectations": eval_item.get("expectations", []),
    }


def create_iteration_dir(skill_name: str, iteration: int = 1) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    root = REPO_ROOT / "evals" / "workspaces" / skill_name / f"iteration-{iteration}--{stamp}"
    root.mkdir(parents=True, exist_ok=False)
    return root


def prepare_eval_dir(iteration_dir: Path, skill_name: str, eval_item: dict) -> Path:
    eval_dir = iteration_dir / f"eval-{eval_item['id']}"
    eval_dir.mkdir(parents=True, exist_ok=True)
    metadata = build_eval_metadata(skill_name, eval_item)
    (eval_dir / "eval_metadata.json").write_text(
        json.dumps(metadata, indent=2) + "\n",
        encoding="utf-8",
    )
    return eval_dir


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def install_skill(workdir: Path, skill_name: str) -> None:
    source = skill_path(skill_name)
    if not (source / "SKILL.md").exists():
        raise FileNotFoundError(f"SKILL.md not found for skill {skill_name}")
    for rel in SKILL_INSTALL_DIRS:
        target_root = workdir / rel
        target_root.mkdir(parents=True, exist_ok=True)
        target = target_root / skill_name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)


def ensure_claude_project_root(workdir: Path) -> None:
    (workdir / ".claude").mkdir(parents=True, exist_ok=True)
