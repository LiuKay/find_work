#!/usr/bin/env python3
"""Record and check user-reported bad job links."""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import tempfile
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
from job_identity import normalize_url, stable_job_id  # noqa: E402

DEFAULT_ROOT = Path("/Users/kaybee/Documents/github/find_work/job-picks")
HEADER = ["date", "url", "title", "company", "reason", "replacement_url", "job_id"]


def write_rows_atomic(path: Path, rows: list[dict[str, str]]) -> None:
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", newline="", dir=path.parent, prefix=f".{path.name}.", delete=False
        ) as fh:
            temp_path = Path(fh.name)
            writer = csv.DictWriter(fh, fieldnames=HEADER, delimiter="\t", lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(temp_path, path)
        temp_path = None
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()


def ensure_file(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    path = root / "bad-links.tsv"
    if not path.exists():
        path.write_text("\t".join(HEADER) + "\n", encoding="utf-8")
    else:
        with path.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.DictReader(fh, delimiter="\t")
            rows = []
            changed = "job_id" not in (reader.fieldnames or [])
            for row in reader:
                normalized = {key: (row.get(key) or "").strip() for key in HEADER}
                expected = stable_job_id(normalized["url"], normalized["company"], normalized["title"])
                changed = changed or normalized["job_id"] != expected
                normalized["job_id"] = expected
                rows.append(normalized)
            if changed:
                write_rows_atomic(path, rows)
    return path


def read_rows(root: Path) -> list[dict[str, str]]:
    path = ensure_file(root)
    with path.open("r", encoding="utf-8", newline="") as fh:
        rows = [{key: (row.get(key) or "").strip() for key in HEADER} for row in csv.DictReader(fh, delimiter="\t")]
        for row in rows:
            row["job_id"] = row["job_id"] or stable_job_id(row["url"], row["company"], row["title"])
        return rows


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
        "job_id": stable_job_id(args.url, args.company, args.title),
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
