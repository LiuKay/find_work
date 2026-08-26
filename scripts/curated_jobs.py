#!/usr/bin/env python3
"""Maintain the reviewed Find Work job inventory with Python's standard library."""

from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable

from job_identity import (
    identity_key as shared_identity_key,
    normalize_text,
    normalize_url,
    stable_job_id,
    stable_url,
)


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "data" / "curated" / "jobs.ndjson"
DEFAULT_ISSUES = ROOT / "data" / "issues"
DEFAULT_CANDIDATES = ROOT / "data" / "candidates"
TAXONOMY_PATH = ROOT / "data" / "schema" / "job-taxonomy.json"
PUBLIC_REQUIRED = ("title", "company", "url", "china_applicability", "application_barrier", "best_for")
STATUSES = {"active", "expired", "closed"}
TRANSIENT_OUTCOMES = {"failure", "network_error", "http_403", "rate_limited", "timeout", "suspect"}
EXPLICIT_CLOSED_OUTCOMES = {"closed", "gone", "expired_page", "not_found"}

CHANNELS = (
    {
        "id": "low-english",
        "name": "低英文友好",
        "description": "中文、双语或明确低英文门槛的岗位。",
    },
    {
        "id": "ops-cs",
        "name": "运营 / 客服 / 客户成功",
        "description": "偏运营、客服与客户成功的岗位。",
    },
    {
        "id": "support-tech",
        "name": "技术支持 / IT",
        "description": "技术支持、IT 运营与 QA 岗位。",
    },
    {
        "id": "remote-apac",
        "name": "时区友好远程",
        "description": "远程且与中国或 APAC 工作时段较友好的岗位。",
    },
    {
        "id": "entry",
        "name": "入门 / 低门槛",
        "description": "入门阶段或申请门槛较低的岗位。",
    },
    {
        "id": "china-strong",
        "name": "中国可投高把握",
        "description": "中国可投把握为高的岗位。",
    },
)
CHANNEL_IDS = {item["id"] for item in CHANNELS}


def load_taxonomy(path: Path = TAXONOMY_PATH) -> dict[str, Any]:
    taxonomy = json.loads(path.read_text(encoding="utf-8"))
    fields = taxonomy.get("fields") if isinstance(taxonomy, dict) else None
    if not isinstance(fields, dict) or not fields:
        raise ValueError(f"{path}: expected a non-empty fields object")
    for field, config in fields.items():
        values = config.get("values") if isinstance(config, dict) else None
        aliases = config.get("aliases") if isinstance(config, dict) else None
        if not isinstance(values, list) or not values or len(values) != len(set(values)):
            raise ValueError(f"{path}: {field} must have unique values")
        if not isinstance(aliases, dict) or any(value not in values for value in aliases.values()):
            raise ValueError(f"{path}: {field} has an invalid alias target")
    return taxonomy


TAXONOMY = load_taxonomy()
TAXONOMY_FIELDS = TAXONOMY["fields"]


def normalize_taxonomy_fields(job: dict[str, Any]) -> dict[str, str]:
    changes: dict[str, str] = {}
    for field, config in TAXONOMY_FIELDS.items():
        raw_value = str(job.get(field) or "")
        value = plain_text(raw_value)
        normalized = config["aliases"].get(value, value)
        if normalized != raw_value:
            job[field] = normalized
            changes[field] = normalized
    return changes


def taxonomy_issues(jobs: list[dict[str, Any]]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    for job in jobs:
        for field, config in TAXONOMY_FIELDS.items():
            value = plain_text(job.get(field))
            if value in config["values"] or (not value and job.get("status") != "active"):
                continue
            issues.append(
                {
                    "job_id": str(job.get("job_id", "")),
                    "status": str(job.get("status", "")),
                    "field": field,
                    "value": value,
                    "url": str(job.get("url", "")),
                }
            )
    return issues


def plain_text(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r"\1", text)
    return re.sub(r"[*_`]", "", text).strip()


def canonical_company(value: Any) -> str:
    text = plain_text(value)
    return re.sub(
        r"\s*/\s*(?:Company Careers|Greenhouse|Ashby|Lever|Workable|SmartRecruiters|Teamtailor)$",
        "",
        text,
        flags=re.I,
    ).strip()


def identity_key(job: dict[str, Any]) -> str:
    return shared_identity_key(
        job.get("url"),
        job.get("company"),
        job.get("title"),
        job.get("location"),
    )


def job_id_for(job: dict[str, Any]) -> str:
    return stable_job_id(
        job.get("url"),
        job.get("company"),
        job.get("title"),
        job.get("location"),
    )


def parse_date(value: str) -> date:
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"invalid date: {value}") from exc
    if parsed.isoformat() != value:
        raise ValueError(f"invalid date: {value}")
    return parsed


def timestamp_for(day: str) -> str:
    parse_date(day)
    return f"{day}T00:00:00+08:00"


def validate_issue_id(issue_id: str, expected_date: str | None = None) -> None:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:-[A-Za-z0-9_\-\u4e00-\u9fff]+)?", issue_id):
        raise ValueError("issue_id must be a safe full issue slug")
    issue_date = issue_id[:10]
    parse_date(issue_date)
    if expected_date and issue_date != expected_date:
        raise ValueError("issue_id must start with the issue date")


def normalized_level(value: Any, allowed: Iterable[str], default: str = "") -> str:
    text = plain_text(value)
    for level in allowed:
        if text.startswith(level):
            return level
    return default


def note_after_level(value: Any, levels: Iterable[str]) -> str:
    text = plain_text(value)
    for level in levels:
        if text.startswith(level):
            return text[len(level) :].lstrip("，,：: ")
    return text


def ttl_days(job: dict[str, Any]) -> int:
    combined = " ".join(
        str(job.get(key, "")) for key in ("job_group", "job_direction", "title", "notes")
    )
    if (
        job.get("china_applicability") == "待确认"
        or re.search(r"AI\s*Trainer|数据标注|合同工|兼职|contract|freelance", combined, re.I)
    ):
        return 7
    if job.get("china_applicability") == "高" and job.get("job_group") == "外企中国岗位":
        return 21
    return 14


def infer_timezone_friendly(job: dict[str, Any]) -> bool:
    work_mode = str(job.get("work_mode", ""))
    judgment = str(job.get("timezone_judgment", ""))
    return bool(
        re.search(r"APAC|中国|北京时间|时区友好|匹配|可行", f"{work_mode} {judgment}", re.I)
        and not re.search(r"超过\s*5|[6-9]\s*小时|1\d\s*小时", judgment)
    )


def channels_for(job: dict[str, Any]) -> list[str]:
    direction = str(job.get("job_direction", ""))
    title = str(job.get("title", ""))
    language = str(job.get("language", ""))
    barrier_note = str(job.get("application_barrier_note", ""))
    work_mode = str(job.get("work_mode", ""))
    channels: list[str] = []
    if language in {"中文", "双语"} or re.search(r"低英文|英文要求低|中文为主", barrier_note):
        channels.append("low-english")
    if re.search(r"运营|客服|客户成功|售后支持", direction):
        channels.append("ops-cs")
    if direction == "技术支持与解决方案" or re.search(r"技术支持|IT\s*运营|QA|测试|quality", title, re.I):
        channels.append("support-tech")
    if re.search(r"远程", work_mode) and bool(job.get("timezone_friendly")):
        channels.append("remote-apac")
    if job.get("experience") == "入门" or job.get("application_barrier") == "低":
        channels.append("entry")
    if job.get("china_applicability") == "高":
        channels.append("china-strong")
    return channels


def extract_markdown_url(value: str) -> str:
    markdown = re.search(r"\[[^\]]+\]\((https?://[^)\s]+)\)", value or "")
    if markdown:
        return markdown.group(1)
    bare = re.search(r"https?://\S+", value or "")
    return bare.group(0).rstrip(").,") if bare else ""


def load_json_jobs(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    source = path.read_text(encoding="utf-8").strip()
    if not source:
        return []
    try:
        raw = json.loads(source)
    except json.JSONDecodeError:
        raw = [json.loads(line) for line in source.splitlines() if line.strip()]
    if isinstance(raw, dict) and isinstance(raw.get("jobs"), list):
        raw = raw["jobs"]
    if not isinstance(raw, list) or not all(isinstance(item, dict) for item in raw):
        raise ValueError(f"{path}: expected a job array")
    return raw


def parse_markdown_jobs(path: Path) -> tuple[str, list[dict[str, Any]]]:
    source = path.read_text(encoding="utf-8", errors="strict").replace("\r\n", "\n")
    heading = re.search(r"^#\s+(.+)$", source, re.M)
    issue_title = heading.group(1).strip() if heading else path.stem
    matches = list(re.finditer(r"^###\s+\d+\.\s+岗位名称[：:]\s*(.+)$", source, re.M))
    jobs: list[dict[str, Any]] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(source)
        fields: dict[str, str] = {}
        for line in source[match.end() : end].splitlines():
            field = re.match(r"^([^：:\n]+)[：:]\s*(.*)$", line.strip())
            if field:
                fields[field.group(1).strip()] = field.group(2).strip()
        barrier_raw = fields.get("申请门槛", "")
        applicability_raw = fields.get("中国可投把握", "")
        jobs.append(
            {
                "title": match.group(1).strip(),
                "company_platform": plain_text(fields.get("公司 / 平台", "")),
                "company": plain_text(fields.get("公司 / 平台", "")),
                "job_group": plain_text(fields.get("岗位归类", "")),
                "job_direction": plain_text(fields.get("岗位方向", "")),
                "work_mode": plain_text(fields.get("工作方式", "")),
                "experience": plain_text(fields.get("经验要求", "")),
                "language": plain_text(fields.get("语言要求", "")),
                "application_barrier": normalized_level(barrier_raw, ("低", "中", "高")),
                "application_barrier_note": note_after_level(barrier_raw, ("低", "中", "高")),
                "china_applicability": normalized_level(applicability_raw, ("高", "中", "待确认", "低", "不明确")),
                "china_applicability_note": note_after_level(applicability_raw, ("高", "中", "待确认", "低", "不明确")),
                "timezone_judgment": plain_text(fields.get("时差判断", "")),
                "best_for": plain_text(fields.get("适合谁", "")),
                "notes": plain_text(fields.get("注意事项", "")),
                "url": extract_markdown_url(fields.get("链接", "")),
                "source": "",
            }
        )
    return issue_title, jobs


def overlay_structured(
    markdown_jobs: list[dict[str, Any]], structured_jobs: list[dict[str, Any]], source_path: Path
) -> list[dict[str, Any]]:
    by_url: dict[str, list[int]] = {}
    by_title: dict[str, list[int]] = {}
    for index, job in enumerate(structured_jobs):
        url = normalize_url(job.get("url"))
        title = normalize_text(job.get("title"))
        if url:
            by_url.setdefault(url, []).append(index)
        if title:
            by_title.setdefault(title, []).append(index)

    output: list[dict[str, Any]] = []
    used: set[int] = set()
    for markdown_job in markdown_jobs:
        url_indexes = by_url.get(normalize_url(markdown_job.get("url")), [])
        title_indexes = by_title.get(normalize_text(markdown_job.get("title")), [])
        if len(url_indexes) > 1:
            raise ValueError(f"{source_path}: ambiguous URL match for {markdown_job.get('title')}")
        if url_indexes:
            if len(title_indexes) == 1 and title_indexes[0] != url_indexes[0]:
                raise ValueError(f"{source_path}: structured field mismatch for {markdown_job.get('title')}")
            candidates = {url_indexes[0]}
        else:
            if len(title_indexes) > 1:
                raise ValueError(f"{source_path}: ambiguous title match for {markdown_job.get('title')}")
            candidates = set(title_indexes)
        if len(candidates) > 1:
            raise ValueError(f"{source_path}: structured field mismatch for {markdown_job.get('title')}")
        structured = structured_jobs[next(iter(candidates))] if candidates else {}
        if candidates:
            used.update(candidates)
        merged = {**markdown_job}
        for key, value in structured.items():
            if value not in (None, ""):
                merged[key] = value
        merged["url"] = normalize_url(merged.get("url"))
        merged["company_platform"] = plain_text(merged.get("company_platform") or merged.get("company"))
        merged["company"] = canonical_company(merged.get("company") or merged.get("company_platform"))
        output.append(merged)

    for index, structured in enumerate(structured_jobs):
        if index in used:
            continue
        extra = dict(structured)
        extra["url"] = normalize_url(extra.get("url"))
        extra["company_platform"] = plain_text(extra.get("company_platform") or extra.get("company"))
        extra["company"] = canonical_company(extra.get("company") or extra.get("company_platform"))
        output.append(extra)
    return output


def public_complete(job: dict[str, Any]) -> bool:
    return all(str(job.get(field, "")).strip() for field in PUBLIC_REQUIRED)


def occurrence_from_raw(raw: dict[str, Any], issue_id: str, issue_date: str) -> dict[str, Any]:
    job = dict(raw)
    job["title"] = plain_text(job.get("title"))
    job["company"] = canonical_company(job.get("company") or job.get("company_platform"))
    job["company_platform"] = plain_text(job.get("company_platform") or job.get("company"))
    job["url"] = normalize_url(job.get("url"))
    job["application_barrier"] = normalized_level(job.get("application_barrier"), ("低", "中", "高"))
    job["china_applicability"] = normalized_level(
        job.get("china_applicability"), ("高", "中", "待确认", "低", "不明确")
    )
    normalize_taxonomy_fields(job)
    job["first_seen_date"] = issue_date
    job["last_featured_date"] = issue_date
    job["featured_issue_ids"] = [issue_id]
    job["aliases"] = [job["url"]] if job["url"] else []
    job["job_id"] = job_id_for(job)
    job["timezone_friendly"] = bool(job.get("timezone_friendly", infer_timezone_friendly(job)))
    job["channels"] = channels_for(job)
    job["review_state"] = "reviewed" if public_complete(job) else "incomplete"
    job["status"] = "active" if public_complete(job) else "expired"
    job["last_verified_at"] = str(job.get("last_verified_at") or timestamp_for(issue_date))
    job["ttl_days"] = ttl_days(job)
    job["expires_on"] = (parse_date(issue_date) + timedelta(days=job["ttl_days"])).isoformat()
    job["closed_at"] = job.get("closed_at")
    job["close_reason"] = job.get("close_reason")
    return job


def merge_occurrence(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    if normalize_text(existing.get("title")) != normalize_text(incoming.get("title")):
        raise ValueError(
            f"identity conflict for {existing['job_id']}: "
            f"{existing.get('company')} / {existing.get('title')} != "
            f"{incoming.get('company')} / {incoming.get('title')}"
        )
    merged = dict(existing)
    if incoming["last_featured_date"] >= existing["last_featured_date"]:
        for key, value in incoming.items():
            if key not in {
                "job_id",
                "first_seen_date",
                "featured_issue_ids",
                "aliases",
                "expires_on",
                "ttl_days",
                "status",
                "closed_at",
                "close_reason",
            } and value not in (None, "", []):
                merged[key] = value
    merged["first_seen_date"] = min(existing["first_seen_date"], incoming["first_seen_date"])
    merged["last_featured_date"] = max(existing["last_featured_date"], incoming["last_featured_date"])
    merged["featured_issue_ids"] = sorted(
        set(existing.get("featured_issue_ids", [])) | set(incoming.get("featured_issue_ids", []))
    )
    merged["aliases"] = sorted(set(existing.get("aliases", [])) | set(incoming.get("aliases", [])))
    merged["ttl_days"] = ttl_days(merged)
    merged["expires_on"] = (
        parse_date(merged["first_seen_date"]) + timedelta(days=merged["ttl_days"])
    ).isoformat()
    merged["timezone_friendly"] = infer_timezone_friendly(merged)
    merged["channels"] = channels_for(merged)
    merged["review_state"] = "reviewed" if public_complete(merged) else "incomplete"
    return merged


def validate_job(job: dict[str, Any]) -> None:
    if not re.fullmatch(r"j_[a-f0-9]{12}", str(job.get("job_id", ""))):
        raise ValueError(f"invalid job_id: {job.get('job_id')}")
    if job.get("status") not in STATUSES:
        raise ValueError(f"{job['job_id']}: invalid status {job.get('status')}")
    normalized_url = normalize_url(job.get("url"))
    if normalized_url != job.get("url"):
        raise ValueError(f"{job['job_id']}: URL is not canonical")
    for field in ("first_seen_date", "last_featured_date", "expires_on"):
        parse_date(str(job.get(field, "")))
    channels = job.get("channels", [])
    if not isinstance(channels, list) or any(item not in CHANNEL_IDS for item in channels):
        raise ValueError(f"{job['job_id']}: invalid channels")
    expected_channels = channels_for(job)
    if channels != expected_channels:
        raise ValueError(f"{job['job_id']}: channels do not match normalized job fields")
    invalid_taxonomy = taxonomy_issues([job])
    if invalid_taxonomy:
        issue = invalid_taxonomy[0]
        raise ValueError(
            f"{job['job_id']}: invalid {issue['field']} {issue['value'] or '<blank>'}"
        )
    if job["status"] == "active" and not public_complete(job):
        missing = [field for field in PUBLIC_REQUIRED if not str(job.get(field, "")).strip()]
        raise ValueError(f"{job['job_id']}: active job missing {', '.join(missing)}")


def validate_inventory(jobs: list[dict[str, Any]]) -> None:
    ids: set[str] = set()
    identity_owners: dict[str, str] = {}
    for job in jobs:
        validate_job(job)
        if job["job_id"] in ids:
            raise ValueError(f"duplicate job_id: {job['job_id']}")
        aliases = list(dict.fromkeys([job["url"], *(job.get("aliases") or [])]))
        for alias in aliases:
            identity = shared_identity_key(
                alias,
                job.get("company"),
                job.get("title"),
                job.get("location"),
            )
            owner = identity_owners.get(identity)
            if owner and owner != job["job_id"]:
                raise ValueError(f"duplicate identity: {identity}")
            identity_owners[identity] = job["job_id"]
        ids.add(job["job_id"])


def atomic_write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", delete=False
        ) as handle:
            temp_path = Path(handle.name)
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
        temp_path = None
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()


def atomic_write_ndjson(path: Path, jobs: list[dict[str, Any]]) -> None:
    validate_inventory(jobs)
    lines = [
        json.dumps(job, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        for job in sorted(jobs, key=lambda item: item["job_id"])
    ]
    atomic_write_text(path, "\n".join(lines) + ("\n" if lines else ""))


def atomic_write_json(path: Path, value: Any) -> None:
    atomic_write_text(path, json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def read_ndjson(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    jobs = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if not all(isinstance(job, dict) for job in jobs):
        raise ValueError(f"{path}: expected one JSON object per line")
    return jobs


def bad_link_urls(picks_dir: Path) -> dict[str, dict[str, Any]]:
    path = picks_dir / "bad-links.tsv"
    if not path.exists():
        return {}
    rows: dict[str, dict[str, Any]] = {}
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    if not lines:
        return rows
    header = lines[0].split("\t")
    for line in lines[1:]:
        values = line.split("\t")
        row = dict(zip(header, values))
        url = normalize_url(row.get("url"))
        if url:
            reason = row.get("reason", "recorded bad link")
            explicit = bool(
                re.search(
                    r"user reported|404|expired|no longer|not found|closed|filled|"
                    r"redirect(?:ed|s)? to (?:general|jobs landing|careers home)|"
                    r"missing job|job details no longer",
                    reason,
                    re.I,
                )
            )
            transient = bool(
                re.search(r"403|429|rate.?limit|timeout|transport|captcha|could not verify", reason, re.I)
            )
            rows[url] = {"reason": reason, "explicit": explicit and not (transient and not re.search(r"user reported", reason, re.I))}
    return rows


def migrate(picks_dir: Path, as_of: str, output: Path, issues_dir: Path) -> tuple[int, int]:
    as_of_date = parse_date(as_of)
    previous_by_id = {job["job_id"]: job for job in read_ndjson(output)}
    jobs_by_id: dict[str, dict[str, Any]] = {}
    issues: list[dict[str, Any]] = []
    markdown_paths = sorted(
        path
        for path in picks_dir.glob("*.md")
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:-[^.]+)?", path.stem)
        and path.stem[:10] <= as_of
    )
    for markdown_path in markdown_paths:
        issue_id = markdown_path.stem
        issue_date = issue_id[:10]
        validate_issue_id(issue_id, issue_date)
        issue_title, markdown_jobs = parse_markdown_jobs(markdown_path)
        structured_path = picks_dir / f"{issue_id}-final-jobs.json"
        raw_jobs = overlay_structured(markdown_jobs, load_json_jobs(structured_path), structured_path)
        issue_job_ids: list[str] = []
        for raw in raw_jobs:
            if not str(raw.get("title", "")).strip() or not str(raw.get("url", "")).strip():
                continue
            incoming = occurrence_from_raw(raw, issue_id, issue_date)
            existing = jobs_by_id.get(incoming["job_id"])
            jobs_by_id[incoming["job_id"]] = (
                merge_occurrence(existing, incoming) if existing else incoming
            )
            if incoming["job_id"] not in issue_job_ids:
                issue_job_ids.append(incoming["job_id"])
        issues.append(
            {
                "issue_id": issue_id,
                "title": issue_title,
                "mode": "targeted" if issue_id != issue_date else "public",
                "date": issue_date,
                "job_ids": issue_job_ids,
                "stats": {
                    "count": len(issue_job_ids),
                    "directions": sorted(
                        {
                            str(jobs_by_id[job_id].get("job_direction", ""))
                            for job_id in issue_job_ids
                            if str(jobs_by_id[job_id].get("job_direction", ""))
                        }
                    ),
                },
            }
        )

    known_bad = bad_link_urls(picks_dir)
    for job in jobs_by_id.values():
        if job["url"] in known_bad and known_bad[job["url"]]["explicit"]:
            job["status"] = "closed"
            job["closed_at"] = timestamp_for(as_of)
            job["close_reason"] = known_bad[job["url"]]["reason"]
        elif job["review_state"] != "reviewed" or as_of_date >= parse_date(job["expires_on"]):
            job["status"] = "expired"
        else:
            job["status"] = "active"
            if job["url"] in known_bad:
                job["verification_state"] = "suspect"
                job["verification_note"] = known_bad[job["url"]]["reason"]

    operational_fields = {
        "status",
        "closed_at",
        "close_reason",
        "last_verified_at",
        "expires_on",
        "verification_failures",
        "verification_state",
        "verification_note",
    }
    for job_id, previous in previous_by_id.items():
        if job_id not in jobs_by_id:
            jobs_by_id[job_id] = previous
            continue
        current = jobs_by_id[job_id]
        for field in operational_fields:
            if field in previous:
                current[field] = previous[field]
        current["aliases"] = sorted(
            set(current.get("aliases", [])) | set(previous.get("aliases", []))
        )
    for job in jobs_by_id.values():
        bad_record = known_bad.get(job["url"])
        if bad_record and bad_record["explicit"]:
            job["status"] = "closed"
            job["closed_at"] = timestamp_for(as_of)
            job["close_reason"] = bad_record["reason"]

    jobs = list(jobs_by_id.values())
    referenced = {job_id for issue in issues for job_id in issue["job_ids"]}
    missing = referenced - set(jobs_by_id)
    if missing:
        raise ValueError(f"issues reference missing job_ids: {sorted(missing)}")
    atomic_write_ndjson(output, jobs)
    for issue in issues:
        atomic_write_json(issues_dir / f"{issue['issue_id']}.json", issue)
    return len(jobs), len(issues)


def read_issues(issues_dir: Path) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    for path in sorted(issues_dir.glob("*.json")):
        issue = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(issue, dict):
            raise ValueError(f"{path}: expected an object")
        if issue.get("issue_id") != path.stem:
            raise ValueError(f"{path}: issue_id must equal full file slug")
        validate_issue_id(path.stem)
        parse_date(str(issue.get("date", "")))
        issues.append(issue)
    return issues


def check_inventory(output: Path, issues_dir: Path) -> dict[str, int]:
    jobs = read_ndjson(output)
    validate_inventory(jobs)
    issues = read_issues(issues_dir)
    issue_ids = [issue["issue_id"] for issue in issues]
    if len(issue_ids) != len(set(issue_ids)):
        raise ValueError("duplicate issue_id")
    job_ids = {job["job_id"] for job in jobs}
    missing = {
        job_id
        for issue in issues
        for job_id in issue.get("job_ids", [])
        if job_id not in job_ids
    }
    if missing:
        raise ValueError(f"issues reference missing job_ids: {sorted(missing)}")
    return {"jobs": len(jobs), "issues": len(issues), "active": sum(job["status"] == "active" for job in jobs)}


def normalize_inventory_taxonomy(output: Path, write: bool = False) -> dict[str, Any]:
    jobs = read_ndjson(output)
    changed_by_field = {**{field: 0 for field in TAXONOMY_FIELDS}, "channels": 0}
    changed_jobs = 0
    for job in jobs:
        changes = normalize_taxonomy_fields(job)
        expected_channels = channels_for(job)
        channels_changed = job.get("channels") != expected_channels
        if channels_changed:
            job["channels"] = expected_channels
            changed_by_field["channels"] += 1
        if changes or channels_changed:
            changed_jobs += 1
            for field in changes:
                changed_by_field[field] += 1
    unresolved = taxonomy_issues(jobs)
    if write:
        if unresolved:
            raise ValueError(f"taxonomy normalization has {len(unresolved)} unresolved value(s)")
        atomic_write_ndjson(output, jobs)
    return {
        "jobs": len(jobs),
        "changed_jobs": changed_jobs,
        "changed_by_field": changed_by_field,
        "unresolved": unresolved,
        "written": write,
    }


def upsert(
    input_path: Path,
    day: str,
    issue_id: str,
    issue_title: str,
    mode: str,
    output: Path,
    issues_dir: Path,
    reopen_closed: bool = False,
) -> tuple[int, list[str]]:
    parse_date(day)
    validate_issue_id(issue_id, day)
    existing_jobs = read_ndjson(output)
    by_id = {job["job_id"]: job for job in existing_jobs}
    raw_jobs = load_json_jobs(input_path)
    issue_job_ids: list[str] = []
    for raw in raw_jobs:
        incoming = occurrence_from_raw(raw, issue_id, day)
        if not public_complete(incoming):
            missing = [field for field in PUBLIC_REQUIRED if not str(incoming.get(field, "")).strip()]
            raise ValueError(f"{incoming.get('title')}: final job missing {', '.join(missing)}")
        current = by_id.get(incoming["job_id"])
        if current:
            merged = merge_occurrence(current, incoming)
            if current["status"] == "closed" and not reopen_closed:
                merged["status"] = "closed"
                merged["closed_at"] = current.get("closed_at")
                merged["close_reason"] = current.get("close_reason")
            else:
                merged["status"] = "active"
                merged["closed_at"] = None
                merged["close_reason"] = None
                if current["status"] == "expired":
                    merged["last_verified_at"] = timestamp_for(day)
                    merged["expires_on"] = (
                        parse_date(day) + timedelta(days=ttl_days(merged))
                    ).isoformat()
            by_id[incoming["job_id"]] = merged
        else:
            by_id[incoming["job_id"]] = incoming
        issue_job_ids.append(incoming["job_id"])
    atomic_write_ndjson(output, list(by_id.values()))
    existing_issue_path = issues_dir / f"{issue_id}.json"
    existing_issue = (
        json.loads(existing_issue_path.read_text(encoding="utf-8"))
        if existing_issue_path.exists()
        else {}
    )
    combined_job_ids = list(
        dict.fromkeys([*(existing_issue.get("job_ids") or []), *issue_job_ids])
    )
    issue = {
        "issue_id": issue_id,
        "title": issue_title,
        "mode": mode,
        "date": day,
        "job_ids": combined_job_ids,
        "stats": {
            "count": len(combined_job_ids),
            "directions": sorted(
                {
                    str(by_id[job_id].get("job_direction", ""))
                    for job_id in combined_job_ids
                    if str(by_id[job_id].get("job_direction", ""))
                }
            ),
        },
    }
    atomic_write_json(issues_dir / f"{issue_id}.json", issue)
    return len(raw_jobs), issue["job_ids"]


def load_verification_records(args: argparse.Namespace) -> list[dict[str, Any]]:
    if args.input:
        path = Path(args.input)
        source = path.read_text(encoding="utf-8").strip()
        if not source:
            return []
        try:
            raw = json.loads(source)
        except json.JSONDecodeError:
            raw = [json.loads(line) for line in source.splitlines() if line.strip()]
        if isinstance(raw, dict):
            raw = raw.get("results", [raw])
        if not isinstance(raw, list):
            raise ValueError("verification input must be an array, NDJSON, or an object with results")
        return raw
    if not args.job_id or not args.outcome:
        raise ValueError("verify requires --input or both --job-id and --outcome")
    return [{"job_id": args.job_id, "outcome": args.outcome, "reason": args.reason}]


def verify_jobs(output: Path, records: list[dict[str, Any]], as_of: str) -> dict[str, int]:
    parse_date(as_of)
    jobs = read_ndjson(output)
    by_id = {job["job_id"]: job for job in jobs}
    counts = {"active": 0, "closed": 0, "suspect": 0}
    for record in records:
        job_id = str(record.get("job_id", ""))
        if job_id not in by_id:
            raise ValueError(f"unknown job_id: {job_id}")
        job = by_id[job_id]
        outcome = str(record.get("outcome", "")).casefold()
        checked_at = str(record.get("checked_at") or timestamp_for(as_of))
        check_id = str(record.get("check_id") or checked_at)
        if outcome in {"open", "active", "ok"}:
            job["status"] = "active"
            job["last_verified_at"] = checked_at
            job["expires_on"] = (parse_date(as_of) + timedelta(days=ttl_days(job))).isoformat()
            job["closed_at"] = None
            job["close_reason"] = None
            job["verification_failures"] = []
            job["verification_state"] = "verified"
            counts["active"] += 1
        elif outcome in EXPLICIT_CLOSED_OUTCOMES:
            job["status"] = "closed"
            job["closed_at"] = checked_at
            job["close_reason"] = str(record.get("reason") or outcome)
            job["verification_state"] = "closed"
            counts["closed"] += 1
        elif outcome in TRANSIENT_OUTCOMES:
            failures = list(job.get("verification_failures", []))
            if not any(item.get("check_id") == check_id for item in failures):
                failures.append({"check_id": check_id, "checked_at": checked_at, "outcome": outcome})
            job["verification_failures"] = failures[-2:]
            if len(job["verification_failures"]) >= 2:
                job["status"] = "closed"
                job["closed_at"] = checked_at
                job["close_reason"] = "two independent verification failures"
                job["verification_state"] = "closed"
                counts["closed"] += 1
            else:
                job["verification_state"] = "suspect"
                job["verification_note"] = str(record.get("reason") or outcome)
                counts["suspect"] += 1
        else:
            raise ValueError(f"{job_id}: unknown verification outcome {outcome}")
    atomic_write_ndjson(output, jobs)
    return counts


def expire_jobs(output: Path, as_of: str) -> int:
    as_of_date = parse_date(as_of)
    jobs = read_ndjson(output)
    changed = 0
    for job in jobs:
        if job["status"] == "active" and as_of_date >= parse_date(job["expires_on"]):
            job["status"] = "expired"
            changed += 1
    atomic_write_ndjson(output, jobs)
    return changed


def candidate_stats(candidates_dir: Path, day: str) -> dict[str, Any]:
    parse_date(day)
    path = candidates_dir / f"{day}.ndjson"
    rows = read_ndjson_unchecked(path)
    counts = {
        "discovered": len(rows),
        "screened_out": 0,
        "duplicate": 0,
        "bad_link": 0,
        "promoted": 0,
    }
    for row in rows:
        status = str(row.get("pipeline_status", ""))
        if status in counts and status != "discovered":
            counts[status] += 1
    counts["promote_rate"] = round(counts["promoted"] / counts["discovered"], 4) if counts["discovered"] else 0.0
    return counts


def read_ndjson_unchecked(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise ValueError(f"candidate file not found: {path}")
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not all(isinstance(row, dict) for row in rows):
        raise ValueError(f"{path}: expected one JSON object per line")
    return rows


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    migrate_parser = sub.add_parser("migrate", help="deterministically migrate historical picks")
    migrate_parser.add_argument("--picks-dir", type=Path, required=True)
    migrate_parser.add_argument("--as-of", required=True)
    migrate_parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    migrate_parser.add_argument("--issues-dir", type=Path, default=DEFAULT_ISSUES)

    check_parser = sub.add_parser("check", help="validate inventory and issue references")
    check_parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    check_parser.add_argument("--issues-dir", type=Path, default=DEFAULT_ISSUES)

    normalize_parser = sub.add_parser("normalize", help="audit or apply controlled taxonomy aliases")
    normalize_parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    normalize_parser.add_argument("--write", action="store_true")

    upsert_parser = sub.add_parser("upsert", help="upsert reviewed final jobs and one issue")
    upsert_parser.add_argument("--input", type=Path, required=True)
    upsert_parser.add_argument("--date", required=True)
    upsert_parser.add_argument("--issue-id", required=True)
    upsert_parser.add_argument("--issue-title", required=True)
    upsert_parser.add_argument("--mode", default="public")
    upsert_parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    upsert_parser.add_argument("--issues-dir", type=Path, default=DEFAULT_ISSUES)
    upsert_parser.add_argument("--reopen-closed", action="store_true")

    verify_parser = sub.add_parser("verify", help="apply explicit link verification results")
    verify_parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    verify_parser.add_argument("--input", type=Path)
    verify_parser.add_argument("--job-id")
    verify_parser.add_argument("--outcome")
    verify_parser.add_argument("--reason", default="")
    verify_parser.add_argument("--as-of", required=True)

    expire_parser = sub.add_parser("expire", help="expire active jobs past their TTL")
    expire_parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    expire_parser.add_argument("--as-of", required=True)

    stats_parser = sub.add_parser("stats", help="summarize one candidate discovery file")
    stats_parser.add_argument("--date", required=True)
    stats_parser.add_argument("--candidates-dir", type=Path, default=DEFAULT_CANDIDATES)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        if args.command == "migrate":
            jobs, issues = migrate(args.picks_dir, args.as_of, args.output, args.issues_dir)
            result: Any = {"migrated_jobs": jobs, "issues": issues}
        elif args.command == "check":
            result = check_inventory(args.output, args.issues_dir)
        elif args.command == "normalize":
            result = normalize_inventory_taxonomy(args.output, args.write)
        elif args.command == "upsert":
            count, job_ids = upsert(
                args.input,
                args.date,
                args.issue_id,
                args.issue_title,
                args.mode,
                args.output,
                args.issues_dir,
                args.reopen_closed,
            )
            result = {"upserted": count, "job_ids": job_ids}
        elif args.command == "verify":
            result = verify_jobs(args.output, load_verification_records(args), args.as_of)
        elif args.command == "expire":
            result = {"expired": expire_jobs(args.output, args.as_of)}
        else:
            result = candidate_stats(args.candidates_dir, args.date)
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
