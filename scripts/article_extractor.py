#!/usr/bin/env python3
"""Extract readable article text for Market Pulse AI.

The preferred extractor is trafilatura.  A small stdlib fallback keeps the app
usable if the optional dependency is not installed yet.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import signal
import sys
import time
import urllib.request
from urllib.parse import urlparse
from contextlib import contextmanager
from typing import Any


def print_json(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, default=str, allow_nan=False))


def clean_text(value: str) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"\s+", " ", value)
    value = re.sub(
        r"(?i)\bSkip to navigation\s+Skip to main content\s+Skip to right column\b",
        " ",
        value,
    )
    value = re.sub(r"(?i)\bNever miss an important update on your stock portfolio[^.。!?]*[.。!?]?", " ", value)
    return value.strip()


class ExtractionTimeout(Exception):
    pass


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


READER_FALLBACK_ENABLED = env_bool("ARTICLE_READER_FALLBACK_ENABLED", True)
ARTICLE_READER_BASE_URL = os.environ.get("ARTICLE_READER_BASE_URL", "https://r.jina.ai").rstrip("/")
JINA_API_KEY = os.environ.get("JINA_API_KEY", "")


@contextmanager
def time_limit(seconds: int):
    if seconds <= 0 or not hasattr(signal, "SIGALRM"):
        yield
        return

    def handle_timeout(_signum, _frame):
        raise ExtractionTimeout(f"operation timed out after {seconds}s")

    previous = signal.getsignal(signal.SIGALRM)
    signal.signal(signal.SIGALRM, handle_timeout)
    signal.setitimer(signal.ITIMER_REAL, max(0.1, float(seconds)))
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def has_time(deadline: float, minimum: float = 1.0) -> bool:
    return deadline - time.monotonic() >= minimum


def remaining_timeout(deadline: float) -> int:
    return max(1, int(deadline - time.monotonic()))


def stage_timeout(deadline: float, cap: int = 6) -> int:
    return max(1, min(cap, remaining_timeout(deadline)))


def fallback_fetch(url: str, timeout: int) -> tuple[str, str]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "MarketPulseAI/0.1 article-research",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        final_url = res.geturl()
        raw = res.read(2_500_000)
        charset = res.headers.get_content_charset() or "utf-8"
        return final_url, raw.decode(charset, errors="replace")


def reader_url(url: str) -> str:
    return f"{ARTICLE_READER_BASE_URL}/{url}"


def reader_extract(url: str, timeout: int) -> dict[str, Any]:
    headers = {
        "User-Agent": "MarketPulseAI/0.1 article-reader-fallback",
        "Accept": "text/plain",
    }
    if JINA_API_KEY:
        headers["Authorization"] = f"Bearer {JINA_API_KEY}"
    req = urllib.request.Request(reader_url(url), headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read(2_500_000)
        charset = res.headers.get_content_charset() or "utf-8"
        text = raw.decode(charset, errors="replace")
    title = ""
    body_lines: list[str] = []
    for line in text.splitlines():
        clean = clean_text(line)
        if not clean:
            continue
        if clean.lower().startswith("title:"):
            title = clean_text(clean.split(":", 1)[1])
            continue
        if clean.lower().startswith(("url source:", "markdown content:")):
            continue
        body_lines.append(clean)
    body = "\n\n".join(body_lines)
    return {
        "status": "ok" if len(clean_text(body)) >= 120 else "empty",
        "url": url,
        "finalUrl": url,
        "title": title,
        "text": body,
        "extractor": "jina-reader",
    }


def fallback_extract(html_text: str) -> tuple[str, str]:
    title = ""
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html_text, re.I | re.S)
    if title_match:
        title = clean_text(re.sub(r"<[^>]+>", " ", title_match.group(1)))
    body = re.sub(r"(?is)<(script|style|noscript|svg|header|footer|nav|aside)[^>]*>.*?</\1>", " ", html_text)
    paragraphs = re.findall(r"(?is)<p[^>]*>(.*?)</p>", body)
    if not paragraphs:
        paragraphs = re.findall(r"(?is)<article[^>]*>(.*?)</article>", body)
    rows = []
    for row in paragraphs:
        text = clean_text(re.sub(r"<[^>]+>", " ", row))
        if len(text) >= 40:
            rows.append(text)
    return title, "\n\n".join(rows)


def prefer_stdlib_first(url: str) -> bool:
    host = urlparse(url).netloc.lower()
    return host.endswith("finance.yahoo.com")


def stdlib_extract_url(url: str, deadline: float) -> dict[str, Any]:
    if not has_time(deadline, 1.5):
        raise ExtractionTimeout("stdlib fallback skipped because the extraction budget is exhausted")
    final_url, raw = fallback_fetch(url, stage_timeout(deadline, 14))
    title, text = fallback_extract(raw)
    original_url = original_content_url(text, final_url)
    if original_url and has_time(deadline, 1.5):
        try:
            original_final_url, original_raw = fallback_fetch(original_url, stage_timeout(deadline, 8))
            original_title, original_text = fallback_extract(original_raw)
            if len(original_text) >= max(120, len(text) * 0.5):
                final_url, title, text = original_final_url, original_title or title, original_text
        except Exception:
            pass
    return {
        "status": "ok" if len(text) >= 120 else "empty",
        "url": url,
        "finalUrl": final_url,
        "title": title,
        "text": text,
        "extractor": "stdlib-fallback",
    }


def original_content_url(text: str, current_url: str) -> str:
    match = re.search(r"View original content:\s*(https?://\S+)", text or "", re.I)
    if not match:
        return ""
    url = match.group(1).rstrip(").,;\"'")
    return "" if url == current_url else url


def trafilatura_extract(url: str, timeout: int) -> dict[str, Any] | None:
    try:
        import trafilatura  # type: ignore
    except Exception:
        return None

    try:
        with time_limit(timeout):
            downloaded = trafilatura.fetch_url(url, no_ssl=False, config=None)
            if not downloaded:
                return {
                    "status": "error",
                    "url": url,
                    "error": "trafilatura fetch returned empty content",
                    "extractor": "trafilatura",
                }
            text = trafilatura.extract(
                downloaded,
                include_comments=False,
                include_tables=False,
                favor_recall=True,
            ) or ""
            metadata = trafilatura.extract_metadata(downloaded)
    except Exception as exc:
        return {
            "status": "error",
            "url": url,
            "error": f"{type(exc).__name__}: {exc}",
            "extractor": "trafilatura",
        }
    meta = metadata.as_dict() if metadata else {}
    return {
        "status": "ok" if len(clean_text(text)) >= 120 else "empty",
        "url": url,
        "finalUrl": meta.get("url") or url,
        "title": clean_text(meta.get("title") or ""),
        "author": clean_text(meta.get("author") or ""),
        "siteName": clean_text(meta.get("sitename") or ""),
        "publishedAt": meta.get("date") or "",
        "text": clean_text(text),
        "extractor": "trafilatura",
    }


def extract(url: str, timeout: int, max_chars: int) -> dict[str, Any]:
    deadline = time.monotonic() + max(2, timeout)
    stdlib_first_error = ""
    payload: dict[str, Any] | None = None
    if prefer_stdlib_first(url):
        try:
            payload = stdlib_extract_url(url, deadline)
        except Exception as exc:
            stdlib_first_error = f"{type(exc).__name__}: {exc}"
    if payload is None or payload.get("status") in {"error", "empty"}:
        trafilatura_timeout = min(max(2, timeout // 3), 6, timeout)
        payload = trafilatura_extract(url, trafilatura_timeout)
    if payload is None or payload.get("status") in {"error", "empty"}:
        trafilatura_payload = payload
        fallback_error = ""
        try:
            payload = stdlib_extract_url(url, deadline)
        except Exception as exc:
            fallback_error = f"{type(exc).__name__}: {exc}"
            payload = {
                "status": "error",
                "url": url,
                "error": fallback_error,
                "extractor": "stdlib-fallback",
            }
        if (
            READER_FALLBACK_ENABLED
            and (payload is None or payload.get("status") in {"error", "empty"})
            and has_time(deadline, 2.0)
        ):
            try:
                reader_payload = reader_extract(url, remaining_timeout(deadline))
                if reader_payload.get("status") == "ok" or payload is None or payload.get("status") == "error":
                    payload = reader_payload
                    reasons = [
                        stdlib_first_error,
                        trafilatura_payload.get("error") if trafilatura_payload else "",
                        fallback_error,
                    ]
                    payload["fallbackReason"] = "; ".join(reason for reason in reasons if reason)
            except Exception as exc:
                if payload is None or payload.get("status") != "ok":
                    payload = {
                        "status": "error",
                        "url": url,
                        "error": f"{type(exc).__name__}: {exc}",
                        "extractor": "jina-reader",
                    }
                if trafilatura_payload and trafilatura_payload.get("error"):
                    payload["fallbackReason"] = trafilatura_payload.get("error")
    if payload is None:
        payload = {
            "status": "error",
            "url": url,
            "error": "all extractors returned empty content",
            "extractor": "none",
        }
    text = clean_text(payload.get("text") or "")
    payload["textChars"] = len(text)
    payload["text"] = text[:max_chars]
    if payload.get("status") == "ok" and len(text) < 120:
        payload["status"] = "empty"
    return payload


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    extract_parser = sub.add_parser("extract")
    extract_parser.add_argument("--url", required=True)
    extract_parser.add_argument("--timeout", type=int, default=18)
    extract_parser.add_argument("--max-chars", type=int, default=8000)
    args = parser.parse_args()
    if args.command == "extract":
        print_json(extract(args.url, args.timeout, args.max_chars))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print_json({"status": "fatal", "error": f"{type(exc).__name__}: {exc}"})
        raise SystemExit(1)
