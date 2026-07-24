#!/usr/bin/env python3
"""Validate structured job picks and render the daily Markdown format."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[4]
CURATED_SCRIPT = PROJECT_ROOT / "scripts" / "curated_jobs.py"

REQUIRED_FIELDS = [
    "title",
    "company_platform",
    "job_group",
    "job_direction",
    "work_mode",
    "experience",
    "language",
    "application_barrier",
    "china_applicability",
    "timezone_judgment",
    "best_for",
    "notes",
    "url",
]

OPTIONAL_EXPLANATION_FIELDS = [
    "application_barrier_note",
    "china_applicability_note",
]

JOB_GROUPS = {"外企中国岗位", "外企 APAC 岗位", "海外远程岗位", "中国可投待确认"}
WORK_MODES = {"中国本地办公", "混合办公", "全球远程", "APAC 远程", "中国可投待确认"}
EXPERIENCE = {"入门", "1-3 年", "3-5 年", "高级", "不明确"}
LANGUAGE = {"中文", "英文", "双语", "其他", "不明确"}
LEVELS = {"低", "中", "高"}
CHINA_APPLICABILITY = {"高", "中", "待确认"}


def load_jobs(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "jobs" in raw:
        raw = raw["jobs"]
    if not isinstance(raw, list):
        raise ValueError("input must be a JSON array or an object with a jobs array")
    return raw


def validate_job(job: dict[str, Any], index: int) -> list[str]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        if not str(job.get(field, "")).strip():
            errors.append(f"job {index}: missing {field}")
    if job.get("job_group") and job["job_group"] not in JOB_GROUPS:
        errors.append(f"job {index}: invalid job_group {job['job_group']}")
    if job.get("work_mode") and job["work_mode"] not in WORK_MODES:
        errors.append(f"job {index}: invalid work_mode {job['work_mode']}")
    if job.get("experience") and job["experience"] not in EXPERIENCE:
        errors.append(f"job {index}: invalid experience {job['experience']}")
    if job.get("language") and job["language"] not in LANGUAGE:
        errors.append(f"job {index}: invalid language {job['language']}")
    if job.get("application_barrier") and job["application_barrier"] not in LEVELS:
        errors.append(f"job {index}: invalid application_barrier {job['application_barrier']}")
    if job.get("china_applicability") and job["china_applicability"] not in CHINA_APPLICABILITY:
        errors.append(f"job {index}: invalid china_applicability {job['china_applicability']}")
    for field in OPTIONAL_EXPLANATION_FIELDS:
        if field in job and not isinstance(job.get(field), str):
            errors.append(f"job {index}: {field} must be a string when provided")
    url = str(job.get("url", ""))
    if not (url.startswith("https://") or url.startswith("http://")):
        errors.append(f"job {index}: url must start with http(s)")
    return errors


def line(label: str, value: Any) -> str:
    return f"{label}：{str(value).strip()}"


def label_with_note(value: Any, note: Any) -> str:
    base = str(value).strip()
    extra = str(note or "").strip()
    if not extra:
        return base
    return f"{base}，{extra}"


def default_title(date: str, mode: str, target: str) -> str:
    normalized_mode = mode.strip()
    normalized_target = target.strip()
    if normalized_mode == "定向精选":
        if normalized_target and normalized_target != "多岗位方向":
            return f"# {date} {normalized_target} 岗位专选"
        return f"# {date} 定向岗位专选"
    return f"# {date} 外企/海外远程岗位精选"


def render(
    date: str,
    mode: str,
    target: str,
    industry: str,
    jobs: list[dict[str, Any]],
    section: str = "",
    title: str = "",
) -> str:
    lines: list[str] = []
    if section:
        lines.append(f"## {section}")
        lines.append("")
    else:
        lines.append(title.strip() or default_title(date, mode, target))
        lines.append("")
    lines.extend(
        [
            "筛选参数：",
            f"- 模式：{mode}",
            f"- 目标岗位：{target}",
            f"- 行业/方向：{industry}",
            f"- 数量：{len(jobs)} 个",
            "",
        ]
    )
    for idx, job in enumerate(jobs, 1):
        lines.extend(
            [
                f"### {idx}. 岗位名称：{job['title']}",
                line("公司 / 平台", job["company_platform"]),
                line("岗位归类", job["job_group"]),
                line("岗位方向", job["job_direction"]),
                line("工作方式", job["work_mode"]),
                line("经验要求", job["experience"]),
                line("语言要求", job["language"]),
                line("申请门槛", label_with_note(job["application_barrier"], job.get("application_barrier_note", ""))),
                line("中国可投把握", label_with_note(job["china_applicability"], job.get("china_applicability_note", ""))),
                line("时差判断", job["timezone_judgment"]),
                line("适合谁", job["best_for"]),
                line("注意事项", job["notes"]),
                f"链接：[直达链接]({job['url']})",
                "",
            ]
        )
    lines.append(f"这些岗位的筛选时间是 {date}，申请前仍需以岗位页面最新信息为准。")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="JSON file containing final jobs")
    parser.add_argument("--date", required=True)
    parser.add_argument("--mode", required=True)
    parser.add_argument("--target", default="多岗位方向")
    parser.add_argument("--industry", default="外企中国岗位 / APAC / 海外远程")
    parser.add_argument("--section", default="", help="section heading when appending to an existing date file")
    parser.add_argument("--title", default="", help="top-level title for a new report file")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--append", action="store_true")
    parser.add_argument("--curated-output", type=Path, help="also upsert the reviewed inventory")
    parser.add_argument("--issues-dir", type=Path, default=PROJECT_ROOT / "data" / "issues")
    parser.add_argument("--issue-id", default="", help="full issue slug; defaults to the Markdown filename")
    args = parser.parse_args()

    jobs = load_jobs(args.input)
    errors: list[str] = []
    for idx, job in enumerate(jobs, 1):
        errors.extend(validate_job(job, idx))
    if errors:
        print(json.dumps({"valid": False, "errors": errors}, ensure_ascii=False, indent=2))
        return 1

    markdown = render(args.date, args.mode, args.target, args.industry, jobs, args.section, args.title)
    if args.curated_output:
        issue_id = args.issue_id or (args.output.stem if args.output else args.date)
        issue_title = (args.title.strip() or default_title(args.date, args.mode, args.target)).removeprefix("# ")
        command = [
            sys.executable,
            str(CURATED_SCRIPT),
            "upsert",
            "--input",
            str(args.input),
            "--date",
            args.date,
            "--issue-id",
            issue_id,
            "--issue-title",
            issue_title,
            "--mode",
            "targeted" if args.mode == "定向精选" else "public",
            "--output",
            str(args.curated_output),
            "--issues-dir",
            str(args.issues_dir),
        ]
        result = subprocess.run(command, text=True, capture_output=True, check=False)
        if result.returncode:
            print(result.stdout or result.stderr)
            return result.returncode

    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        if args.append and args.output.exists():
            with args.output.open("a", encoding="utf-8") as fh:
                fh.write("\n" + markdown)
        else:
            args.output.write_text(markdown, encoding="utf-8")
    else:
        print(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
