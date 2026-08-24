"""Publica o HEAD local no GitHub pela API, sem depender do transporte HTTPS do Git."""

from __future__ import annotations

import base64
import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "LeoPiero1992/orla-loja-virtual"
GIT = Path(
    r"C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe"
)


def execute(command: list[str], *, input_text: str | None = None) -> str:
    completed = subprocess.run(
        command,
        cwd=ROOT,
        input=input_text,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
        env=os.environ.copy(),
    )
    if completed.returncode:
        detail = (completed.stderr or completed.stdout).strip()
        raise RuntimeError(detail or f"Falha ao executar: {' '.join(command)}")
    return completed.stdout.strip()


def git(*arguments: str) -> str:
    return execute([str(GIT), "-c", f"safe.directory={ROOT}", *arguments])


def api(method: str, endpoint: str, payload: dict | None = None) -> dict:
    command = ["gh", "api", "--method", method, endpoint]
    input_text = None
    if payload is not None:
        command.extend(["--input", "-"])
        input_text = json.dumps(payload, ensure_ascii=False)
    output = execute(command, input_text=input_text)
    return json.loads(output) if output else {}


def main() -> None:
    remote = api("GET", f"repos/{REPOSITORY}/git/ref/heads/main")
    base_commit = remote["object"]["sha"]
    head_commit = git("rev-parse", "HEAD")
    if head_commit == base_commit:
        print("GitHub já está atualizado.")
        return

    base_data = api("GET", f"repos/{REPOSITORY}/git/commits/{base_commit}")
    changes = git("diff", "--name-status", f"{base_commit}..HEAD").splitlines()
    tree_entries: list[dict[str, object]] = []
    for change in changes:
        status, path = change.split("\t", 1)
        path = path.replace("\\", "/")
        if status.startswith("D"):
            tree_entries.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
            continue
        file_path = ROOT / path
        if not file_path.is_file():
            raise RuntimeError(f"Arquivo do commit não encontrado: {path}")
        blob = api(
            "POST",
            f"repos/{REPOSITORY}/git/blobs",
            {
                "content": base64.b64encode(file_path.read_bytes()).decode("ascii"),
                "encoding": "base64",
            },
        )
        mode_line = git("ls-tree", "HEAD", "--", path)
        mode = mode_line.split(maxsplit=1)[0] if mode_line else "100644"
        tree_entries.append({"path": path, "mode": mode, "type": "blob", "sha": blob["sha"]})

    tree = api(
        "POST",
        f"repos/{REPOSITORY}/git/trees",
        {"base_tree": base_data["tree"]["sha"], "tree": tree_entries},
    )
    message = git("log", "-1", "--pretty=%B")
    commit = api(
        "POST",
        f"repos/{REPOSITORY}/git/commits",
        {"message": message, "tree": tree["sha"], "parents": [base_commit]},
    )
    api(
        "PATCH",
        f"repos/{REPOSITORY}/git/refs/heads/main",
        {"sha": commit["sha"], "force": False},
    )
    print(f"SUCESSO: GitHub atualizado em {commit['sha'][:7]}.")


if __name__ == "__main__":
    main()
