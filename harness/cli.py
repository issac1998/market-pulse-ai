import argparse
import json
import sys

from .agents.loader import load_agent
from .invoker import build_invoker
from .invoker.mock import MockInvoker
from .knowledge.base import FileKnowledgeBase
from .memory.sqlite_memory import SQLiteMemory
from .orchestrator.debate import run_debate
from .orchestrator.review import run_review
from .runtime.loop import RunContext, run_agent_loop
from .runtime.trace import write_artifact
from .tools.registry import build_default_registry


def _ctx(args):
    invoker = build_invoker(args.invoker)
    registry = build_default_registry(base_url=args.base_url, sqlite_path=args.sqlite)
    return RunContext(
        invoker=invoker,
        fallback_invoker=MockInvoker(),
        tools=registry,
        knowledge=FileKnowledgeBase(),
        memory=SQLiteMemory(),
    )


def _print(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n")


def _cmd_run(args):
    spec = load_agent(args.agent)
    task = {"ticker": args.ticker.upper() if args.ticker else "", "question": args.question or ""}
    result = run_agent_loop(spec, task, _ctx(args))
    payload = result.to_dict()
    payload["artifactPath"] = write_artifact("trace", "%s.%s" % (spec.id, task.get("ticker") or "NA"), payload)
    _print(payload)
    return 0


def _cmd_chat(args):
    args.agent = "chat_analyst"
    return _cmd_run(args)


def _cmd_debate(args):
    payload = run_debate(args.ticker.upper(), _ctx(args))
    payload["artifactPath"] = write_artifact("debate", args.ticker.upper(), payload)
    _print(payload)
    return 0


def _cmd_review(args):
    payload = run_review(args.ticker.upper(), _ctx(args), decision_id=args.decision_id)
    payload["artifactPath"] = write_artifact("review", args.ticker.upper(), payload)
    _print(payload)
    return 0


def build_parser():
    parser = argparse.ArgumentParser(prog="python -m harness")
    invoker_choices = ["agy-cli", "agy", "antigravity-cli", "codex-cli", "codex", "mock"]
    parser.add_argument("--invoker", default="agy-cli", choices=invoker_choices)
    parser.add_argument("--base-url", default=None)
    parser.add_argument("--sqlite", default=None)
    sub = parser.add_subparsers(dest="command", required=True)

    def add_common(child):
        child.add_argument("--invoker", default=argparse.SUPPRESS, choices=invoker_choices)
        child.add_argument("--base-url", default=argparse.SUPPRESS)
        child.add_argument("--sqlite", default=argparse.SUPPRESS)

    run = sub.add_parser("run")
    add_common(run)
    run.add_argument("--agent", required=True)
    run.add_argument("--ticker", default="")
    run.add_argument("--question", default="")
    run.set_defaults(func=_cmd_run)

    chat = sub.add_parser("chat")
    add_common(chat)
    chat.add_argument("--ticker", default="")
    chat.add_argument("--question", default="")
    chat.set_defaults(func=_cmd_chat)

    debate = sub.add_parser("debate")
    add_common(debate)
    debate.add_argument("--ticker", required=True)
    debate.set_defaults(func=_cmd_debate)

    review = sub.add_parser("review")
    add_common(review)
    review.add_argument("--ticker", required=True)
    review.add_argument("--decision-id", default="")
    review.set_defaults(func=_cmd_review)
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)
