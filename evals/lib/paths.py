"""Repository and skill-creator path helpers."""

from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
EVALS_ROOT = REPO_ROOT / "evals"
SKILL_CREATOR_ROOT = REPO_ROOT / "tools" / "skill-creator"
WORKSPACES_ROOT = EVALS_ROOT / "workspaces"
MANIFEST_PATH = REPO_ROOT / "skills.manifest.json"
SKILLS_ROOT = REPO_ROOT / "skills"

SKILL_INSTALL_DIRS = (
    ".agents/skills",
    ".cursor/skills",
    ".claude/skills",
    ".codex/skills",
)


def skill_creator_scripts() -> Path:
    return SKILL_CREATOR_ROOT / "scripts"


def load_manifest_skills() -> list[str]:
    data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return [entry["id"] for entry in data.get("skills", [])]


def skill_path(skill_name: str) -> Path:
    return SKILLS_ROOT / skill_name


def skill_evals_path(skill_name: str) -> Path:
    return skill_path(skill_name) / "evals" / "evals.json"


def skill_trigger_path(skill_name: str) -> Path:
    return skill_path(skill_name) / "evals" / "trigger_set.json"
