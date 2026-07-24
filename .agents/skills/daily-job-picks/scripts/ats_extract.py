#!/usr/bin/env python3
"""Extract basic public job details from common ATS or job detail pages."""

from __future__ import annotations

import argparse
import html
import json
import re
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import urlsplit


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def fetch(url: str, timeout: float) -> tuple[str, str, int]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 daily-job-picks ats extractor",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = response.read(500_000)
        charset = response.headers.get_content_charset() or "utf-8"
        return response.geturl(), body.decode(charset, errors="replace"), response.status or 200


def meta_content(text: str, name: str) -> str:
    patterns = [
        rf'<meta[^>]+property=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+name=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']+)["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.I | re.S)
        if match:
            return compact(match.group(1))
    return ""


def html_title(text: str) -> str:
    match = re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)
    return compact(re.sub(r"<[^>]+>", " ", match.group(1))) if match else ""


def json_ld_jobs(text: str) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    for match in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', text, re.I | re.S):
        raw = compact(match.group(1))
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if isinstance(item, dict) and item.get("@type") == "JobPosting":
                jobs.append(item)
    return jobs


def extract_json_ld(job: dict[str, Any]) -> dict[str, str]:
    org = job.get("hiringOrganization") or {}
    location = job.get("jobLocation") or ""
    if isinstance(location, list):
        location_text = "; ".join(compact(json.dumps(item, ensure_ascii=False)) for item in location)
    elif isinstance(location, dict):
        location_text = compact(json.dumps(location, ensure_ascii=False))
    else:
        location_text = compact(str(location))
    return {
        "title": compact(str(job.get("title", ""))),
        "company": compact(str(org.get("name", "") if isinstance(org, dict) else org)),
        "location": location_text,
        "employment_type": compact(str(job.get("employmentType", ""))),
        "date_posted": compact(str(job.get("datePosted", ""))),
        "valid_through": compact(str(job.get("validThrough", ""))),
        "apply_url": compact(str(job.get("url", ""))),
    }


def detect_source(url: str) -> str:
    host = urlsplit(url).netloc.lower()
    if "greenhouse.io" in host:
        return "Greenhouse"
    if "lever.co" in host:
        return "Lever"
    if "ashbyhq.com" in host:
        return "Ashby"
    if "workable.com" in host:
        return "Workable"
    if "smartrecruiters.com" in host:
        return "SmartRecruiters"
    return host or "unknown"


def extract(url: str, timeout: float) -> dict[str, Any]:
    result: dict[str, Any] = {
        "url": url,
        "final_url": "",
        "status": None,
        "source": detect_source(url),
        "title": "",
        "company": "",
        "location": "",
        "employment_type": "",
        "date_posted": "",
        "valid_through": "",
        "apply_url": "",
        "page_title": "",
        "warnings": [],
    }
    try:
        final_url, text, status = fetch(url, timeout)
    except urllib.error.HTTPError as exc:
        result["status"] = exc.code
        result["warnings"].append(f"http error {exc.code}")
        return result
    except Exception as exc:  # noqa: BLE001 - CLI reports extraction failures.
        result["warnings"].append(f"fetch failed: {type(exc).__name__}: {exc}")
        return result

    result["final_url"] = final_url
    result["status"] = status
    result["page_title"] = html_title(text)

    jobs = json_ld_jobs(text)
    if jobs:
        result.update({key: value for key, value in extract_json_ld(jobs[0]).items() if value})

    og_title = meta_content(text, "og:title")
    if not result["title"]:
        result["title"] = og_title or result["page_title"]
    if not result["company"]:
        site_name = meta_content(text, "og:site_name")
        result["company"] = site_name
    if not result["apply_url"]:
        result["apply_url"] = final_url

    body_text = compact(re.sub(r"<[^>]+>", " ", text[:120_000]))
    if "apply" not in body_text.casefold() and "application" not in body_text.casefold():
        result["warnings"].append("no obvious apply text")
    if not result["title"]:
        result["warnings"].append("no title extracted")
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urls", nargs="+")
    parser.add_argument("--timeout", type=float, default=12.0)
    args = parser.parse_args()
    results = [extract(url, args.timeout) for url in args.urls]
    print(json.dumps(results, ensure_ascii=False, indent=2))
    return 1 if any(item["warnings"] for item in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
