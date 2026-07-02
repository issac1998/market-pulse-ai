#!/usr/bin/env python3
"""Small JSON bridge for YouTube search via yt-dlp.

The script only reads search-result metadata. It does not download media.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any


def parse_target(value: str) -> tuple[str, str]:
    if "=" not in value:
        return "", value.strip()
    ticker, query = value.split("=", 1)
    return ticker.strip().upper(), query.strip()


def upload_date_to_iso(value: Any) -> str:
    text = str(value or "").strip()
    if len(text) == 8 and text.isdigit():
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}T00:00:00.000Z"
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def entry_url(entry: dict[str, Any]) -> str:
    url = str(entry.get("webpage_url") or entry.get("url") or "")
    if url.startswith("http"):
        return url
    video_id = entry.get("id")
    if video_id:
        return f"https://www.youtube.com/watch?v={video_id}"
    return ""


def normalize_entry(entry: dict[str, Any], ticker: str, query: str) -> dict[str, Any]:
    return {
        "ticker": ticker,
        "query": query,
        "id": entry.get("id") or entry_url(entry),
        "title": entry.get("title") or "",
        "publisher": entry.get("uploader") or entry.get("channel") or "YouTube",
        "publishedAt": upload_date_to_iso(entry.get("upload_date")),
        "url": entry_url(entry),
        "duration": entry.get("duration"),
        "viewCount": entry.get("view_count"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--target", action="append", default=[], help="TICKER=query")
    parser.add_argument("--limit", type=int, default=4)
    parser.add_argument("--timeout", type=float, default=12.0)
    args = parser.parse_args()

    try:
        import yt_dlp
    except Exception as exc:
        print(
            json.dumps(
                {
                    "status": "missing",
                    "error": f"{type(exc).__name__}: {exc}",
                    "install": f"{sys.executable} -m pip install yt-dlp",
                },
                ensure_ascii=False,
            )
        )
        return 0

    if args.check:
        print(json.dumps({"status": "ok", "version": getattr(yt_dlp.version, "__version__", "")}, ensure_ascii=False))
        return 0

    targets = [parse_target(item) for item in args.target if str(item).strip()]
    if not targets:
        print(json.dumps({"status": "ok", "videos": [], "errors": []}, ensure_ascii=False))
        return 0

    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or os.environ.get("ALL_PROXY") or ""
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": True,
        "noplaylist": True,
        "socket_timeout": max(3.0, float(args.timeout)),
    }
    if proxy:
        ydl_opts["proxy"] = proxy

    videos: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        for ticker, query in targets:
            if not query:
                continue
            search = f"ytsearch{max(1, min(args.limit, 10))}:{query}"
            try:
                data = ydl.extract_info(search, download=False)
                for entry in (data or {}).get("entries") or []:
                    if isinstance(entry, dict):
                        videos.append(normalize_entry(entry, ticker, query))
            except Exception as exc:
                errors.append({"ticker": ticker, "query": query, "error": f"{type(exc).__name__}: {exc}"})

    print(json.dumps({"status": "ok", "videos": videos, "errors": errors}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
