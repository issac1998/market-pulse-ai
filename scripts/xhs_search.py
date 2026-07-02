#!/usr/bin/env python3
import argparse
import ast
import contextlib
import io
import json
import os
import sys
import warnings

warnings.filterwarnings("ignore", category=Warning)


def pick(row, *keys):
    for key in keys:
        value = row.get(key) if isinstance(row, dict) else None
        if value not in (None, ""):
            return value
    return None


def normalize_note(row, keyword):
    note = row.get("note_card") if isinstance(row, dict) else None
    note = note if isinstance(note, dict) else row
    user = pick(note, "user", "user_info") or {}
    interact = pick(note, "interact_info", "interact") or {}
    title = pick(note, "display_title", "title", "desc") or ""
    body = pick(note, "desc", "description", "content") or title
    note_id = pick(note, "note_id", "id") or pick(row, "id", "note_id") or title
    liked = pick(interact, "liked_count", "like_count", "likes") or 0
    comments = pick(interact, "comment_count", "comments") or 0
    return {
        "id": str(note_id),
        "title": title,
        "body": body,
        "author": pick(user, "nickname", "name", "user_name") or "",
        "url": f"https://www.xiaohongshu.com/explore/{note_id}" if note_id else "",
        "publishedAt": pick(note, "time", "publish_time", "last_update_time") or "",
        "likes": liked,
        "comments": comments,
        "channel": "小红书",
        "keyword": keyword,
    }


def main():
    parser = argparse.ArgumentParser(description="Search Xiaohongshu and emit Market Pulse JSON rows.")
    sub = parser.add_subparsers(dest="command")
    search = sub.add_parser("search")
    search.add_argument("keyword")
    search.add_argument("--json", action="store_true")
    search.add_argument("--limit", type=int, default=10)
    args = parser.parse_args()

    if args.command != "search":
        parser.error("only the 'search' command is supported")

    cookie = os.environ.get("XHS_COOKIE", "").strip()
    if not cookie:
        print(json.dumps({"error": "XHS_COOKIE is not configured"}, ensure_ascii=False))
        return 2

    from xhs import XhsClient
    from xhs.help import sign

    def external_sign(uri, data=None, a1="", web_session=""):
        return sign(uri, data, a1=a1)

    client = XhsClient(
        cookie=cookie,
        timeout=int(os.environ.get("XHS_TIMEOUT_SECONDS", "15")),
        sign=external_sign,
    )
    with contextlib.redirect_stdout(io.StringIO()):
        payload = client.get_note_by_keyword(args.keyword, page=1, page_size=max(1, min(args.limit, 20)))
    rows = []
    items = payload.get("items") if isinstance(payload, dict) else payload
    for row in (items or [])[: args.limit]:
        if isinstance(row, dict):
            rows.append(normalize_note(row, args.keyword))
    print(json.dumps(rows, ensure_ascii=False))
    return 0


def error_message(exc):
    text = str(exc)
    try:
        parsed = ast.literal_eval(text)
        if isinstance(parsed, dict):
            return parsed.get("msg") or parsed.get("message") or text
    except Exception:
        pass
    return text


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"error": f"小红书接口返回：{error_message(exc)}"}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
