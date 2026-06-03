# Vendored skill-creator

Upstream: https://github.com/anthropics/skills
Commit: da20c92503b2e8ff1cf28ca81a0df4673debdbf7
Path: skills/skill-creator

Files are copied verbatim from upstream. Do not patch vendored scripts/agents/eval-viewer.

## Re-vendor

1. Sparse-clone or download `skills/skill-creator` from a newer commit.
2. Replace this directory (except this file's commit line).
3. Diff `references/schemas.md` and `agents/grader.md`.
4. Update `evals/lib/` driver only if upstream layout or schemas changed.
