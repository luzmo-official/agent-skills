"""Agent invocation seam (Claude-first; generalize later)."""

from __future__ import annotations

import json
import os
import re
import select
import shutil
import subprocess
import time
from pathlib import Path
from typing import Callable


class AgentError(RuntimeError):
    pass


def claude_available() -> bool:
    return shutil.which("claude") is not None


def _extract_assistant_text(event: dict) -> list[str]:
    parts: list[str] = []
    message = event.get("message") or {}
    for block in message.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text)
    return parts


def _is_transcript_write(path: str, outputs_dir: Path | None) -> bool:
    normalized = path.replace("\\", "/")
    if normalized.endswith("/transcript.md") or normalized.endswith("outputs/transcript.md"):
        return True
    if outputs_dir is not None:
        try:
            return Path(path).resolve() == (outputs_dir / "transcript.md").resolve()
        except OSError:
            return str(outputs_dir) in path and "transcript.md" in path
    return "transcript.md" in normalized


def parse_stream_json(
    raw: str,
    *,
    outputs_dir: Path | None = None,
) -> tuple[str, str, dict]:
    """Parse claude stream-json into execution log, answer text, and usage timing."""
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    execution_log = raw if raw.endswith("\n") or not raw else raw + "\n"

    written_transcript: str | None = None
    assistant_text_parts: list[str] = []
    result_text = ""
    total_tokens = 0
    duration_ms = 0

    for line in lines:
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        if event.get("type") == "assistant":
            assistant_text_parts.extend(_extract_assistant_text(event))

        if event.get("type") == "user":
            tool_result = event.get("tool_use_result") or {}
            if isinstance(tool_result, dict) and tool_result.get("type") == "create":
                file_path = str(tool_result.get("filePath") or "")
                content = tool_result.get("content")
                if _is_transcript_write(file_path, outputs_dir) and isinstance(content, str):
                    written_transcript = content

        if event.get("type") == "result":
            usage = event.get("usage") or {}
            if isinstance(usage, dict):
                total_tokens = int(usage.get("input_tokens", 0) or 0) + int(
                    usage.get("output_tokens", 0) or 0
                )
            duration_ms = int(event.get("duration_ms") or 0)
            result = event.get("result")
            if isinstance(result, str):
                result_text = result
            elif isinstance(result, dict):
                result_text = json.dumps(result, indent=2)

    answer_text = (written_transcript or result_text or "\n\n".join(assistant_text_parts)).strip()
    stream_timing = {
        "total_tokens": total_tokens,
        "duration_ms": duration_ms,
    }
    return execution_log, answer_text, stream_timing


def extract_json_object(text: str) -> dict | None:
    """Best-effort parse of a JSON object from model output."""
    stripped = text.strip()
    if not stripped:
        return None

    fence = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", stripped)
    if fence:
        stripped = fence.group(1)

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    try:
        payload = json.loads(stripped[start : end + 1])
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def run_claude_prompt(
    prompt: str,
    *,
    cwd: Path,
    model: str | None = None,
    timeout_sec: int = 600,
    permission_mode: str = "bypassPermissions",
    on_event: Callable[[dict], None] | None = None,
) -> tuple[str, dict]:
    """Run `claude -p` and collect stream-json transcript + timing."""
    cmd = [
        "claude",
        "-p",
        prompt,
        "--output-format",
        "stream-json",
        "--verbose",
    ]
    if model:
        cmd.extend(["--model", model])
    if permission_mode:
        cmd.extend(["--permission-mode", permission_mode])

    env = {k: v for k, v in os.environ.items() if k != "CLAUDECODE"}
    start = time.time()
    process = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=False,
    )

    buffer = ""
    transcript_lines: list[str] = []
    total_tokens = 0
    result_text = ""

    try:
        while True:
            if time.time() - start > timeout_sec:
                process.kill()
                raise AgentError(f"claude -p timed out after {timeout_sec}s")

            if process.poll() is not None:
                remaining = process.stdout.read() if process.stdout else b""
                if remaining:
                    buffer += remaining.decode("utf-8", errors="replace")
                break

            if not process.stdout:
                break

            ready, _, _ = select.select([process.stdout], [], [], 1.0)
            if not ready:
                continue

            chunk = os.read(process.stdout.fileno(), 8192)
            if not chunk:
                break
            buffer += chunk.decode("utf-8", errors="replace")

            while "\n" in buffer:
                line, buffer = buffer.split("\n", 1)
                line = line.strip()
                if not line:
                    continue
                transcript_lines.append(line)
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if on_event:
                    on_event(event)
                if event.get("type") == "result":
                    usage = event.get("usage") or {}
                    if isinstance(usage, dict):
                        total_tokens = int(usage.get("input_tokens", 0) or 0) + int(
                            usage.get("output_tokens", 0) or 0
                        )
                    result = event.get("result")
                    if isinstance(result, str):
                        result_text = result
                    elif isinstance(result, dict):
                        result_text = json.dumps(result, indent=2)
    finally:
        if process.poll() is None:
            process.kill()
        process.wait(timeout=5)

    if buffer.strip():
        for line in buffer.splitlines():
            line = line.strip()
            if line and line not in transcript_lines:
                transcript_lines.append(line)

    duration_ms = int((time.time() - start) * 1000)
    stderr = ""
    if process.stderr:
        stderr = process.stderr.read().decode("utf-8", errors="replace")

    exit_code = process.returncode
    timing = {
        "total_tokens": total_tokens,
        "duration_ms": duration_ms,
        "total_duration_seconds": round(duration_ms / 1000.0, 3),
    }

    if exit_code not in (0, None) and not result_text and not transcript_lines:
        raise AgentError(stderr.strip() or f"claude -p failed with exit code {exit_code}")

    transcript = "\n".join(transcript_lines)
    if result_text and result_text not in transcript:
        transcript = transcript + ("\n\n" if transcript else "") + result_text

    return transcript, timing
