"""Theme overlay and viewer wrapper for eval results."""

from __future__ import annotations

import importlib.util
import json
import signal
import subprocess
import sys
import time
import webbrowser
from functools import partial
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from paths import EVALS_ROOT, SKILL_CREATOR_ROOT

THEME_PATH = EVALS_ROOT / "viewer" / "theme.css"


def inject_theme(html: str) -> str:
    if not THEME_PATH.exists():
        return html
    theme = THEME_PATH.read_text(encoding="utf-8")
    injection = f'<style id="luzmo-eval-theme">\n{theme}\n</style>\n'
    if "</head>" in html:
        return html.replace("</head>", injection + "</head>", 1)
    return injection + html


def _load_generate_review():
    module_path = SKILL_CREATOR_ROOT / "eval-viewer" / "generate_review.py"
    spec = importlib.util.spec_from_file_location("generate_review", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["generate_review"] = module
    spec.loader.exec_module(module)
    return module


def generate_review_html(
    workspace: Path,
    *,
    skill_name: str,
    previous: dict | None = None,
    benchmark: dict | None = None,
) -> str:
    review = _load_generate_review()
    runs = review.find_runs(workspace)
    html = review.generate_html(runs, skill_name, previous or {}, benchmark)
    return inject_theme(html)


def _kill_port(port: int) -> None:
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        for pid_str in result.stdout.strip().split("\n"):
            if pid_str.strip():
                try:
                    import os

                    os.kill(int(pid_str.strip()), signal.SIGTERM)
                except (ProcessLookupError, ValueError):
                    pass
        if result.stdout.strip():
            time.sleep(0.5)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass


class ThemedReviewHandler(BaseHTTPRequestHandler):
    def __init__(
        self,
        workspace: Path,
        skill_name: str,
        feedback_path: Path,
        previous: dict,
        benchmark_path: Path | None,
        *args,
        **kwargs,
    ):
        self.workspace = workspace
        self.skill_name = skill_name
        self.feedback_path = feedback_path
        self.previous = previous
        self.benchmark_path = benchmark_path
        super().__init__(*args, **kwargs)

    def do_GET(self) -> None:
        if self.path in ("/", "/index.html"):
            benchmark = None
            if self.benchmark_path and self.benchmark_path.exists():
                try:
                    benchmark = json.loads(self.benchmark_path.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    benchmark = None
            html = generate_review_html(
                self.workspace,
                skill_name=self.skill_name,
                previous=self.previous,
                benchmark=benchmark,
            )
            content = html.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        elif self.path == "/api/feedback":
            data = b"{}"
            if self.feedback_path.exists():
                data = self.feedback_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            self.send_error(404)

    def do_POST(self) -> None:
        if self.path == "/api/feedback":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                if not isinstance(data, dict) or "reviews" not in data:
                    raise ValueError("Expected JSON object with 'reviews' key")
                self.feedback_path.write_text(json.dumps(data, indent=2) + "\n")
                resp = b'{"ok":true}'
                self.send_response(200)
            except (json.JSONDecodeError, OSError, ValueError) as exc:
                resp = json.dumps({"error": str(exc)}).encode()
                self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(resp)))
            self.end_headers()
            self.wfile.write(resp)
        else:
            self.send_error(404)

    def log_message(self, format: str, *args: object) -> None:
        return


def serve_review(
    workspace: Path,
    *,
    skill_name: str,
    port: int = 3117,
    benchmark_path: Path | None = None,
    previous_workspace: Path | None = None,
) -> int:
    review = _load_generate_review()
    if not workspace.is_dir():
        print(f"Error: {workspace} is not a directory", file=sys.stderr)
        return 1

    runs = review.find_runs(workspace)
    if not runs:
        print(f"No runs found in {workspace}", file=sys.stderr)
        return 1

    feedback_path = workspace / "feedback.json"
    previous: dict = {}
    if previous_workspace:
        previous = review.load_previous_iteration(previous_workspace.resolve())

    _kill_port(port)
    handler = partial(
        ThemedReviewHandler,
        workspace,
        skill_name,
        feedback_path,
        previous,
        benchmark_path.resolve() if benchmark_path else None,
    )
    try:
        server = HTTPServer(("127.0.0.1", port), handler)
    except OSError:
        server = HTTPServer(("127.0.0.1", 0), handler)
        port = server.server_address[1]

    url = f"http://localhost:{port}"
    print(f"\n  Eval viewer: {url}\n")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down viewer.")
    return 0


def write_static_review(
    workspace: Path,
    *,
    skill_name: str,
    output_path: Path,
    benchmark_path: Path | None = None,
    previous_workspace: Path | None = None,
) -> int:
    review = _load_generate_review()
    if not workspace.is_dir():
        print(f"Error: {workspace} is not a directory", file=sys.stderr)
        return 1

    runs = review.find_runs(workspace)
    if not runs:
        print(f"No runs found in {workspace}", file=sys.stderr)
        return 1

    previous: dict = {}
    if previous_workspace:
        previous = review.load_previous_iteration(previous_workspace.resolve())

    benchmark = None
    if benchmark_path and benchmark_path.exists():
        try:
            benchmark = json.loads(benchmark_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            benchmark = None

    html = generate_review_html(
        workspace,
        skill_name=skill_name,
        previous=previous,
        benchmark=benchmark,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
    print(f"\n  Static viewer written to: {output_path}\n")
    return 0
