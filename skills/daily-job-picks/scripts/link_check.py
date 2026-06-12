#!/usr/bin/env python3
"""Run basic reader-facing checks for candidate job URLs."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.error
import urllib.parse
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

LIST_PAGE_PATTERNS = [
    "all jobs",
    "open positions",
    "job openings",
    "search results",
    "browse jobs",
    "view all jobs",
    "careers",
]

HOMEPAGE_PATHS = {"", "/"}


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


def normalize_url_for_compare(url: str) -> str:
    return compact(url).rstrip("/")


def contains_any(text: str, patterns: list[str]) -> bool:
    return any(pattern in text for pattern in patterns)


def detect_page_type(
    candidate: Candidate,
    final_url: str,
    visible_text: str,
    page_title: str,
    apply_found: bool,
    bad_marker: str,
    title_match: bool,
    company_match: bool,
) -> str:
    visible_l = visible_text.casefold()
    title_l = page_title.casefold()
    final_path = urllib.parse.urlsplit(final_url).path.casefold() if final_url else ""

    if bad_marker in {"access denied", "captcha"}:
        return "blocked"
    if bad_marker in {"sign in", "log in", "subscribe"}:
        return "login"
    if bad_marker:
        return "unknown"
    if contains_any(visible_l, LIST_PAGE_PATTERNS) or contains_any(title_l, LIST_PAGE_PATTERNS):
        if not apply_found or (not title_match and not company_match):
            return "list"
    if final_path in HOMEPAGE_PATHS and not apply_found:
        return "homepage"
    if candidate.title and not title_match and company_match and apply_found:
        return "unknown"
    if apply_found and (title_match or not candidate.title) and (company_match or not candidate.company):
        return "job_detail"
    if not apply_found and (final_path in HOMEPAGE_PATHS or "career" in title_l):
        return "homepage"
    return "unknown"


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
        "title_match": False,
        "company_match": False,
        "apply_text_found": False,
        "bad_marker_hit": "",
        "final_url_changed": False,
        "suspected_page_type": "unknown",
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
    result["final_url_changed"] = normalize_url_for_compare(candidate.url) != normalize_url_for_compare(fetched["final_url"])

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
    result["bad_marker_hit"] = bad_marker
    result["apply_text_found"] = any(pattern in text_l for pattern in APPLY_PATTERNS)
    if not result["apply_text_found"]:
        result["warnings"].append("no obvious apply path text found")

    title_tokens = tokens(candidate.title)
    company_tokens = tokens(candidate.company)
    visible_text = visible_for_bad_markers
    result["title_match"] = not title_tokens or any(token in visible_text for token in title_tokens[:4])
    result["company_match"] = not company_tokens or any(token in visible_text for token in company_tokens[:3])
    title_missing = bool(title_tokens) and not result["title_match"]
    company_missing = bool(company_tokens) and not result["company_match"]
    if title_missing:
        result["warnings"].append("job title tokens not found")
    if company_missing:
        result["warnings"].append("company tokens not found")
    result["suspected_page_type"] = detect_page_type(
        candidate,
        result["final_url"],
        visible_text,
        result["page_title"],
        result["apply_text_found"],
        bad_marker,
        result["title_match"],
        result["company_match"],
    )
    if result["suspected_page_type"] in {"list", "homepage", "login", "blocked"}:
        result["warnings"].append(f"suspected non-job-detail page: {result['suspected_page_type']}")

    hard_warnings = [
        warning
        for warning in result["warnings"]
        if warning.startswith("http error")
        or warning in {"non-success status", "non-html response"}
        or warning.startswith("possible bad page marker")
        or warning == "job title tokens not found"
        or warning == "company tokens not found"
        or warning == "no obvious apply path text found"
        or warning.startswith("suspected non-job-detail page")
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
