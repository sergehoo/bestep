from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional

from . import __version__
from .config import config_path, initialize_project, load_config
from .knowledge import KnowledgeScanner
from .orchestrator import AgentOrchestrator
from .registry import AgentRegistry


COMMANDS = ("discover", "feature", "bug", "audit", "architecture", "design", "security", "qa", "document", "release", "update")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ostack", description="OStack AI software engineering OS")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    subparsers = parser.add_subparsers(dest="command", required=True)
    init = subparsers.add_parser("init", help="initialize OStack in a project")
    init.add_argument("path", nargs="?", default=".")
    init.add_argument("--name")
    init.add_argument("--provider", default="ollama")
    doctor = subparsers.add_parser("doctor", help="verify the local OStack installation")
    doctor.add_argument("path", nargs="?", default=".")
    agents = subparsers.add_parser("agents", help="list built-in agents")
    agents.add_argument("--category")
    for command in COMMANDS:
        task = subparsers.add_parser(command, help=f"run the {command} workflow")
        task.add_argument("prompt", nargs="*")
        task.add_argument("--path", default=".")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "init":
            root = Path(args.path)
            config = initialize_project(root, args.name or root.resolve().name, args.provider)
            print(f"Initialized OStack for {config.name} at {config_path(config.root)}")
            return 0
        if args.command == "doctor":
            return _doctor(Path(args.path))
        if args.command == "agents":
            agents = AgentRegistry().all()
            for agent in agents:
                if not args.category or agent.category == args.category:
                    print(f"{agent.id}\t{agent.category}\t{agent.name}")
            return 0
        return _plan_task(args.command, Path(args.path), " ".join(args.prompt))
    except (FileNotFoundError, KeyError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


def _doctor(root: Path) -> int:
    checks = {
        "initialized": config_path(root.resolve()).exists(),
        "python_supported": sys.version_info >= (3, 9),
        "git_repository": (root.resolve() / ".git").exists(),
    }
    for name, passed in checks.items():
        print(f"{'PASS' if passed else 'FAIL'} {name}")
    return 0 if all(checks.values()) else 1


def _plan_task(task_type: str, root: Path, prompt: str) -> int:
    config = load_config(root)
    mapped_type = task_type if task_type in AgentOrchestrator.ROUTING else "feature"
    assignments = AgentOrchestrator(AgentRegistry()).select(mapped_type)
    result = {
        "project": config.name,
        "task_type": task_type,
        "prompt": prompt,
        "provider": config.provider,
        "agents": [{"id": item.agent.id, "reason": item.reason} for item in assignments],
    }
    if task_type == "discover":
        result["knowledge"] = [document.__dict__ for document in KnowledgeScanner().scan(root.resolve())]
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

