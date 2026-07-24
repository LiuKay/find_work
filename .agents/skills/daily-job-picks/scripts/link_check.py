#!/usr/bin/env python3
"""Run basic reader-facing checks for candidate job URLs."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


BAD_PAGE_PATTERNS = [
    "404 not found",
    "not found",
    "page not found",
    "job not found",
    "we couldn't find this job",
    "we could not find this job",
    "no longer available",
    "no longer exists",
    "this position is no longer available",
    "position has been filled",
    "this job is closed",
    "job is no longer accepting applications",
    "no longer accepting applications",
    "not accepting applications",
    "job has expired",
    "sorry, this job has expired",
    "this job has expired",
    "access denied",
    "sign in",
    "log in",
    "subscribe",
    "captcha",
]

APPLY_PATTERNS = [
    "apply",
    "application",
    "submit application",
    "apply now",
    "apply for this job",
    "easy apply",
    "send your resume",
]


@dataclass
class Candidate:
    url: str
    title: str = ""
    company: str = ""


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def tokens(value: str) -> list[str]:
    return [part.casefold() for part in re.findall(r"[\w\u4e00-\u9fff]+", value or "") if len(part) >= 3]


def extract_title(text: str) -> str:
    match = re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)
    return compact(html.unescape(re.sub(r"<[^>]+>", " ", match.group(1)))) if match else ""


def visible_text_from_html(text: str, limit: int = 120_000) -> str:
    sample = text[:limit]
    sample = re.sub(r"<script\b[^>]*>.*?</script>", " ", sample, flags=re.I | re.S)
    sample = re.sub(r"<style\b[^>]*>.*?</style>", " ", sample, flags=re.I | re.S)
    sample = re.sub(r"<noscript\b[^>]*>.*?</noscript>", " ", sample, flags=re.I | re.S)
    return compact(re.sub(r"<[^>]+>", " ", sample))


def fetch(url: str, timeout: float) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 daily-job-picks link checker",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read(250_000)
        charset = response.headers.get_content_charset() or "utf-8"
        return {
            "status": response.status or 200,
            "final_url": response.geturl(),
            "content_type": response.headers.get("content-type", ""),
            "text": body.decode(charset, errors="replace"),
        }


def check_candidate(candidate: Candidate, timeout: float) -> dict[str, Any]:
    result: dict[str, Any] = {
        "url": candidate.url,
        "title": candidate.title,
        "company": candidate.company,
        "ok_basic": False,
        "status": None,
        "final_url": "",
        "page_title": "",
        "warnings": [],
    }
    try:
        fetched = fetch(candidate.url, timeout)
    except urllib.error.HTTPError as exc:
        result["status"] = exc.code
        result["warnings"].append(f"http error {exc.code}")
        return result
    except Exception as exc:  # noqa: BLE001 - CLI should report all URL failures.
        result["warnings"].append(f"fetch failed: {type(exc).__name__}: {exc}")
        return result

    text = fetched["text"]
    text_l = text.casefold()
    result["status"] = fetched["status"]
    result["final_url"] = fetched["final_url"]
    result["page_title"] = extract_title(text)

    if not (200 <= int(fetched["status"]) < 400):
        result["warnings"].append("non-success status")
    if "text/html" not in fetched["content_type"].casefold() and "text/plain" not in fetched["content_type"].casefold():
        result["warnings"].append("non-html response")
    visible_for_bad_markers = f"{result['page_title']} {visible_text_from_html(text)}".casefold()
    bad_marker = ""
    for pattern in BAD_PAGE_PATTERNS:
        if pattern in visible_for_bad_markers:
            bad_marker = pattern
            result["warnings"].append(f"possible bad page marker: {pattern}")
            break
    if not any(pattern in text_l for pattern in APPLY_PATTERNS):
        result["warnings"].append("no obvious apply path text found")

    title_tokens = tokens(candidate.title)
    company_tokens = tokens(candidate.company)
    visible_text = visible_for_bad_markers
    title_missing = bool(title_tokens) and not any(token in visible_text for token in title_tokens[:4])
    company_missing = bool(company_tokens) and not any(token in visible_text for token in company_tokens[:3])
    if title_missing:
        result["warnings"].append("job title tokens not found")
    if company_missing:
        result["warnings"].append("company tokens not found")

    hard_warnings = [
        warning
        for warning in result["warnings"]
        if warning.startswith("http error")
        or warning in {"non-success status", "non-html response"}
        or warning.startswith("possible bad page marker")
        or warning == "job title tokens not found"
        or warning == "company tokens not found"
        or warning == "no obvious apply path text found"
    ]
    result["ok_basic"] = not hard_warnings
    return result


def load_candidates(args: argparse.Namespace) -> list[Candidate]:
    if args.input:
        raw = json.loads(args.input.read_text(encoding="utf-8"))
        if isinstance(raw, dict) and "jobs" in raw:
            raw = raw["jobs"]
        return [Candidate(url=item["url"], title=item.get("title", ""), company=item.get("company", "")) for item in raw]
    if args.url:
        return [Candidate(url=args.url, title=args.title or "", company=args.company or "")]
    lines = [line.strip() for line in sys.stdin if line.strip()]
    return [Candidate(url=line) for line in lines]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="JSON file containing jobs or a jobs array")
    parser.add_argument("--url", help="single URL to check")
    parser.add_argument("--title", help="expected job title for single URL")
    parser.add_argument("--company", help="expected company for single URL")
    parser.add_argument("--timeout", type=float, default=12.0)
    args = parser.parse_args()

    results = [check_candidate(candidate, args.timeout) for candidate in load_candidates(args)]
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 1 if any(not item["ok_basic"] for item in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
