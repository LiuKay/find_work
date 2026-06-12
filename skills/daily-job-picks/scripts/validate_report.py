#!/usr/bin/env python3
"""Validate a rendered daily-job-picks Markdown report."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import tempfile
from pathlib import Path


REQUIRED_LABELS = [
    "公司 / 平台",
    "岗位归类",
    "岗位方向",
    "工作方式",
    "经验要求",
    "语言要求",
    "申请门槛",
    "中国可投把握",
    "时差判断",
    "适合谁",
    "注意事项",
    "链接",
]
FORBIDDEN_PUBLIC_TERMS = [
    "抓取",
    "爬取",
    "链接核验",
    "结构化字段",
    "无登录环境",
    "页面渲染",
    "解析",
    "检索结果",
    "不同环境",
    "parser",
    "crawler",
    "scraper",
]
LINK_RE = re.compile(r"链接：\[直达链接\]\((https?://[^)\s]+)\)")
JOB_HEADING_RE = re.compile(r"^###\s+\d+\.\s+岗位名称：(.+)$", re.M)
COUNT_RE = re.compile(r"-\s*数量：\s*(\d+)\s*个")


def split_jobs(text: str) -> list[str]:
    starts = [match.start() for match in JOB_HEADING_RE.finditer(text)]
    jobs = []
    for idx, start in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(text)
        jobs.append(text[start:end])
    return jobs


def validate(path: Path) -> dict[str, object]:
    text = path.read_text(encoding="utf-8")
    errors: list[str] = []
    warnings: list[str] = []
    jobs = split_jobs(text)

    if not jobs:
        errors.append("no job sections found")

    count_match = COUNT_RE.search(text)
    if not count_match:
        errors.append("missing 数量：N 个 metadata")
    elif int(count_match.group(1)) != len(jobs):
        errors.append(f"metadata count {count_match.group(1)} does not match job sections {len(jobs)}")

    for term in FORBIDDEN_PUBLIC_TERMS:
        if term.casefold() in text.casefold():
            errors.append(f"forbidden public term found: {term}")

    seen_pairs: set[tuple[str, str]] = set()
    seen_urls: set[str] = set()
    for idx, job in enumerate(jobs, 1):
        title_match = JOB_HEADING_RE.search(job)
        title = title_match.group(1).strip() if title_match else ""
        company = ""
        for line in job.splitlines():
            if line.startswith("公司 / 平台："):
                company = line.split("：", 1)[1].strip()
                break
        for label in REQUIRED_LABELS:
            if f"{label}：" not in job:
                errors.append(f"job {idx}: missing {label}")
        link_match = LINK_RE.search(job)
        if not link_match:
            errors.append(f"job {idx}: link must be 链接：[直达链接](https://...)")
        else:
            url = link_match.group(1)
            if url in seen_urls:
                errors.append(f"job {idx}: duplicate url {url}")
            seen_urls.add(url)
        pair = (company.casefold(), title.casefold())
        if title and company:
            if pair in seen_pairs:
                errors.append(f"job {idx}: duplicate company+title")
            seen_pairs.add(pair)
        if "数量目标" in job:
            warnings.append(f"job {idx}: contains 数量目标")

    return {"valid": not errors, "errors": errors, "warnings": warnings, "jobs": len(jobs)}


def extract_link_check_jobs(path: Path) -> list[dict[str, str]]:
    text = path.read_text(encoding="utf-8")
    jobs = []
    for job in split_jobs(text):
        title_match = JOB_HEADING_RE.search(job)
        link_match = LINK_RE.search(job)
        company = ""
        for line in job.splitlines():
            if line.startswith("公司 / 平台："):
                company = line.split("：", 1)[1].strip().split(" / ", 1)[0]
                break
        if title_match and link_match:
            jobs.append({"title": title_match.group(1).strip(), "company": company, "url": link_match.group(1)})
    return jobs


def run_link_checks(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    script = Path(__file__).with_name("link_check.py")
    jobs = extract_link_check_jobs(path)
    if not jobs:
        return ["no links available for link check"], []
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False) as fh:
        json.dump(jobs, fh, ensure_ascii=False)
        temp_path = Path(fh.name)
    try:
        proc = subprocess.run(
            ["python3", "-B", str(script), "--input", str(temp_path)],
            text=True,
            capture_output=True,
            check=False,
        )
    finally:
        temp_path.unlink(missing_ok=True)
    try:
        results = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return [f"link_check.py did not return JSON: {proc.stderr or proc.stdout}"], []
    errors = []
    bad_link_candidates = []
    for idx, item in enumerate(results, 1):
        if not item.get("ok_basic"):
            warning_list = item.get("warnings") or []
            warnings = "; ".join(warning_list)
            page_type = str(item.get("suspected_page_type", "")).strip()
            details: list[str] = []
            if warnings:
                details.append(warnings)
            if page_type:
                details.append(f"page_type={page_type}")
            if item.get("bad_marker_hit"):
                details.append(f"bad_marker={item.get('bad_marker_hit')}")
            if item.get("final_url_changed"):
                details.append("final_url_changed=true")
            detail_text = "; ".join(details) or f"status {item.get('status', '')}".strip()
            errors.append(f"job {idx}: link_check failed for {item.get('url')}: {detail_text}")
            bad_link_candidates.append(
                {
                    "url": str(item.get("url", "")),
                    "title": str(item.get("title", "")),
                    "company": str(item.get("company", "")),
                    "reason": detail_text,
                }
            )
    return errors, bad_link_candidates


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--check-links", action="store_true", help="run link_check.py against every report URL")
    args = parser.parse_args()
    result = validate(args.report)
    if args.check_links:
        link_errors, bad_link_candidates = run_link_checks(args.report)
        result["errors"].extend(link_errors)
        result["bad_link_candidates"] = bad_link_candidates
        result["valid"] = not result["errors"]
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
