#!/usr/bin/env python3
"""Maintain the daily-job-picks deduplication index."""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


DEFAULT_ROOT = Path("/Users/kaybee/Documents/github/find_work/job-picks")
HEADER = ["date", "title", "company", "url", "job_direction", "source"]
TRACKING_PREFIXES = ("utm_",)
TRACKING_KEYS = {
    "gh_src",
    "ref",
    "ref_src",
    "source",
    "src",
    "trk",
    "fbclid",
    "gclid",
    "mc_cid",
    "mc_eid",
}


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip().casefold()


def normalize_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    parts = urlsplit(url)
    scheme = parts.scheme.lower() or "https"
    netloc = parts.netloc.lower()
    path = re.sub(r"/{2,}", "/", parts.path).rstrip("/")
    query_items = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        key_l = key.lower()
        if key_l in TRACKING_KEYS or key_l.startswith(TRACKING_PREFIXES):
            continue
        query_items.append((key, value))
    query = urlencode(query_items, doseq=True)
    return urlunsplit((scheme, netloc, path, query, ""))


def ensure_index(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    index = root / "seen-jobs.tsv"
    if not index.exists():
        index.write_text("\t".join(HEADER) + "\n", encoding="utf-8")
    return index


def read_index(root: Path) -> list[dict[str, str]]:
    index = ensure_index(root)
    with index.open("r", encoding="utf-8", newline="") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        rows = []
        for row in reader:
            if not row:
                continue
            normalized = {key: (row.get(key) or "").strip() for key in HEADER}
            rows.append(normalized)
        return rows


MARKDOWN_URL_RE = re.compile(r"https?://[^\s)\]>\"']+")
TITLE_RE = re.compile(r"岗位名称：\s*(.+)")
COMPANY_RE = re.compile(r"公司\s*/\s*平台：\s*(.+)")


def read_markdown_seen(root: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for path in sorted(root.glob("*.md")):
        title = ""
        company = ""
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            title_match = TITLE_RE.search(line)
            if title_match:
                title = title_match.group(1).strip()
            company_match = COMPANY_RE.search(line)
            if company_match:
                company = company_match.group(1).strip()
            for url in MARKDOWN_URL_RE.findall(line):
                rows.append(
                    {
                        "date": path.stem[:10],
                        "title": title,
                        "company": company,
                        "url": url,
                        "job_direction": "",
                        "source": "markdown",
                    }
                )
    return rows


def all_seen(root: Path) -> list[dict[str, str]]:
    rows = read_index(root)
    rows.extend(read_markdown_seen(root))
    return rows


def duplicate_reasons(candidate: dict[str, str], rows: Iterable[dict[str, str]]) -> list[str]:
    title = normalize_text(candidate.get("title", ""))
    company = normalize_text(candidate.get("company", ""))
    url = normalize_url(candidate.get("url", ""))
    reasons: list[str] = []
    for row in rows:
        row_url = normalize_url(row.get("url", ""))
        row_title = normalize_text(row.get("title", ""))
        row_company = normalize_text(row.get("company", ""))
        if url and row_url and url == row_url:
            reasons.append(f"same url: {row.get('date', '')} {row.get('title', '')}")
        if title and company and title == row_title and company == row_company:
            reasons.append(f"same company+title: {row.get('date', '')} {row.get('url', '')}")
    return reasons


def append_row(root: Path, row: dict[str, str]) -> bool:
    index = ensure_index(root)
    candidate = {key: (row.get(key) or "").strip() for key in HEADER}
    candidate["url"] = normalize_url(candidate["url"])
    if duplicate_reasons(candidate, read_index(root)):
        return False
    with index.open("a", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=HEADER, delimiter="\t", lineterminator="\n")
        writer.writerow(candidate)
    return True


def cmd_snapshot(args: argparse.Namespace) -> int:
    rows = all_seen(args.root)
    if args.format == "tsv":
        print("\t".join(HEADER))
        for row in rows:
            print("\t".join(row.get(key, "") for key in HEADER))
    else:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    candidate = {"title": args.title, "company": args.company, "url": args.url}
    reasons = duplicate_reasons(candidate, all_seen(args.root))
    print(json.dumps({"duplicate": bool(reasons), "reasons": reasons}, ensure_ascii=False, indent=2))
    return 1 if reasons else 0


def cmd_append(args: argparse.Namespace) -> int:
    row = {
        "date": args.date,
        "title": args.title,
        "company": args.company,
        "url": args.url,
        "job_direction": args.job_direction,
        "source": args.source,
    }
    added = append_row(args.root, row)
    print(json.dumps({"added": added, "url": normalize_url(args.url)}, ensure_ascii=False, indent=2))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    sub = parser.add_subparsers(dest="command", required=True)

    ensure = sub.add_parser("ensure", help="create job-picks directory and seen-jobs.tsv")
    ensure.set_defaults(func=lambda args: (ensure_index(args.root), print("ok"), 0)[2])

    snapshot = sub.add_parser("snapshot", help="print seen jobs from TSV and Markdown files")
    snapshot.add_argument("--format", choices=["json", "tsv"], default="json")
    snapshot.set_defaults(func=cmd_snapshot)

    check = sub.add_parser("check", help="check whether a candidate is already seen")
    check.add_argument("--title", required=True)
    check.add_argument("--company", required=True)
    check.add_argument("--url", required=True)
    check.set_defaults(func=cmd_check)

    append = sub.add_parser("append", help="append a selected job to seen-jobs.tsv")
    append.add_argument("--date", required=True)
    append.add_argument("--title", required=True)
    append.add_argument("--company", required=True)
    append.add_argument("--url", required=True)
    append.add_argument("--job-direction", required=True)
    append.add_argument("--source", required=True)
    append.set_defaults(func=cmd_append)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    result = args.func(args)
    return result if isinstance(result, int) else 0


if __name__ == "__main__":
    raise SystemExit(main())
