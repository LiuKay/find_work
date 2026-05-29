#!/usr/bin/env python3
"""Record and check user-reported bad job links."""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


DEFAULT_ROOT = Path("/Users/kaybee/Documents/github/find_work/job-picks")
HEADER = ["date", "url", "title", "company", "reason", "replacement_url"]
TRACKING_KEYS = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gh_src", "ref", "src"}


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip().casefold()


def normalize_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return ""
    parts = urlsplit(url)
    query = urlencode(
        [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key.lower() not in TRACKING_KEYS],
        doseq=True,
    )
    return urlunsplit((parts.scheme.lower() or "https", parts.netloc.lower(), parts.path.rstrip("/"), query, ""))


def ensure_file(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / "bad-links.tsv"
    if not path.exists():
        path.write_text("\t".join(HEADER) + "\n", encoding="utf-8")
    return path


def read_rows(root: Path) -> list[dict[str, str]]:
    path = ensure_file(root)
    with path.open("r", encoding="utf-8", newline="") as fh:
        return [{key: (row.get(key) or "").strip() for key in HEADER} for row in csv.DictReader(fh, delimiter="\t")]


def matches(candidate: dict[str, str], rows: list[dict[str, str]]) -> list[dict[str, str]]:
    url = normalize_url(candidate.get("url", ""))
    title = normalize_text(candidate.get("title", ""))
    company = normalize_text(candidate.get("company", ""))
    found = []
    for row in rows:
        row_url = normalize_url(row.get("url", ""))
        row_title = normalize_text(row.get("title", ""))
        row_company = normalize_text(row.get("company", ""))
        if url and row_url and url == row_url:
            found.append(row)
        elif title and company and title == row_title and company == row_company:
            found.append(row)
    return found


def cmd_check(args: argparse.Namespace) -> int:
    found = matches({"url": args.url, "title": args.title, "company": args.company}, read_rows(args.root))
    print(json.dumps({"bad_link_match": bool(found), "matches": found}, ensure_ascii=False, indent=2))
    return 1 if found else 0


def cmd_append(args: argparse.Namespace) -> int:
    path = ensure_file(args.root)
    row = {
        "date": args.date,
        "url": normalize_url(args.url),
        "title": args.title,
        "company": args.company,
        "reason": args.reason,
        "replacement_url": normalize_url(args.replacement_url or ""),
    }
    existing = matches(row, read_rows(args.root))
    if existing:
        print(json.dumps({"added": False, "matches": existing}, ensure_ascii=False, indent=2))
        return 0
    with path.open("a", encoding="utf-8", newline="") as fh:
        csv.DictWriter(fh, fieldnames=HEADER, delimiter="\t", lineterminator="\n").writerow(row)
    print(json.dumps({"added": True, "row": row}, ensure_ascii=False, indent=2))
    return 0


def cmd_snapshot(args: argparse.Namespace) -> int:
    print(json.dumps(read_rows(args.root), ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    sub = parser.add_subparsers(dest="command", required=True)

    ensure = sub.add_parser("ensure")
    ensure.set_defaults(func=lambda args: (ensure_file(args.root), print("ok"), 0)[2])

    snapshot = sub.add_parser("snapshot")
    snapshot.set_defaults(func=cmd_snapshot)

    check = sub.add_parser("check")
    check.add_argument("--url", required=True)
    check.add_argument("--title", default="")
    check.add_argument("--company", default="")
    check.set_defaults(func=cmd_check)

    append = sub.add_parser("append")
    append.add_argument("--date", required=True)
    append.add_argument("--url", required=True)
    append.add_argument("--title", default="")
    append.add_argument("--company", default="")
    append.add_argument("--reason", required=True)
    append.add_argument("--replacement-url", default="")
    append.set_defaults(func=cmd_append)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
