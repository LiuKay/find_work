import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
SPEC = importlib.util.spec_from_file_location("curated_jobs", ROOT / "scripts" / "curated_jobs.py")
curated = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(curated)


def reviewed_job(**overrides):
    job = {
        "title": "Customer Support Specialist",
        "company_platform": "Example / Company Careers",
        "company": "Example",
        "job_group": "外企 APAC 岗位",
        "job_direction": "客服",
        "work_mode": "APAC 远程",
        "experience": "1-3 年",
        "language": "双语",
        "application_barrier": "中",
        "application_barrier_note": "需要基础客服经验",
        "china_applicability": "中",
        "china_applicability_note": "面向 APAC",
        "timezone_judgment": "APAC 工作时段与北京时间匹配",
        "best_for": "适合有基础客服经验的人",
        "notes": "申请前确认合同形式",
        "url": "https://example.com/jobs/123",
        "source": "Company Careers",
    }
    job.update(overrides)
    return job


def markdown(job):
    return f"""# 2026-07-20 外企/海外远程岗位精选

### 1. 岗位名称：{job["title"]}
公司 / 平台：{job["company_platform"]}
岗位归类：{job["job_group"]}
岗位方向：{job["job_direction"]}
工作方式：{job["work_mode"]}
经验要求：{job["experience"]}
语言要求：{job["language"]}
申请门槛：{job["application_barrier"]}，{job["application_barrier_note"]}
中国可投把握：{job["china_applicability"]}，{job["china_applicability_note"]}
时差判断：{job["timezone_judgment"]}
适合谁：{job["best_for"]}
注意事项：{job["notes"]}
链接：[直达链接]({job["url"]})
"""


class CuratedJobsTests(unittest.TestCase):
    def test_url_dedup_and_same_day_multiple_issues(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            picks = root / "picks"
            picks.mkdir()
            first = reviewed_job()
            second = reviewed_job(url="https://example.com/jobs/123?utm_source=repeat")
            (picks / "2026-07-20.md").write_text(markdown(first), encoding="utf-8")
            (picks / "2026-07-20-low-english.md").write_text(markdown(second), encoding="utf-8")
            output = root / "jobs.ndjson"
            issues = root / "issues"

            count, issue_count = curated.migrate(picks, "2026-07-23", output, issues)

            self.assertEqual((count, issue_count), (1, 2))
            job = curated.read_ndjson(output)[0]
            self.assertEqual(
                job["featured_issue_ids"],
                ["2026-07-20", "2026-07-20-low-english"],
            )
            self.assertTrue((issues / "2026-07-20.json").exists())
            self.assertTrue((issues / "2026-07-20-low-english.json").exists())
            first_inventory = output.read_bytes()
            first_issues = {
                path.name: path.read_bytes() for path in sorted(issues.glob("*.json"))
            }
            curated.migrate(picks, "2026-07-23", output, issues)
            self.assertEqual(output.read_bytes(), first_inventory)
            self.assertEqual(
                {path.name: path.read_bytes() for path in sorted(issues.glob("*.json"))},
                first_issues,
            )

    def test_structured_field_mismatch_is_rejected(self):
        md_job = reviewed_job()
        structured = [
            reviewed_job(title="Different title"),
            reviewed_job(url="https://example.com/jobs/other"),
        ]
        with self.assertRaisesRegex(ValueError, "structured field mismatch"):
            curated.overlay_structured([md_job], structured, Path("final-jobs.json"))

    def test_unsafe_url_and_issue_path_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "http or https"):
            curated.occurrence_from_raw(
                reviewed_job(url="javascript:alert(document.domain)"),
                "2026-07-23",
                "2026-07-23",
            )
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            input_path = root / "jobs.json"
            input_path.write_text(
                json.dumps([reviewed_job()], ensure_ascii=False),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "safe full issue slug"):
                curated.upsert(
                    input_path,
                    "2026-07-23",
                    "2026-07-23-../../escape",
                    "Unsafe",
                    "public",
                    root / "jobs.ndjson",
                    root / "issues",
                )
            self.assertFalse((root / "escape.json").exists())

    def test_transient_bad_link_record_does_not_close_migrated_job(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            picks = root / "picks"
            picks.mkdir()
            job = reviewed_job()
            (picks / "2026-07-20.md").write_text(markdown(job), encoding="utf-8")
            (picks / "bad-links.tsv").write_text(
                "date\turl\ttitle\tcompany\treason\treplacement_url\n"
                f"2026-07-21\t{job['url']}\t{job['title']}\t{job['company']}\tHTTP 403 could not verify\t\n",
                encoding="utf-8",
            )
            output = root / "jobs.ndjson"
            curated.migrate(picks, "2026-07-23", output, root / "issues")
            migrated = curated.read_ndjson(output)[0]
            self.assertEqual(migrated["status"], "active")
            self.assertEqual(migrated["verification_state"], "suspect")

    def test_ttl_rules_are_7_14_and_21_days(self):
        seven = curated.occurrence_from_raw(
            reviewed_job(job_direction="AI Trainer"), "2026-07-20", "2026-07-20"
        )
        fourteen = curated.occurrence_from_raw(reviewed_job(), "2026-07-20", "2026-07-20")
        twenty_one = curated.occurrence_from_raw(
            reviewed_job(job_group="外企中国岗位", china_applicability="高"),
            "2026-07-20",
            "2026-07-20",
        )
        self.assertEqual((seven["ttl_days"], fourteen["ttl_days"], twenty_one["ttl_days"]), (7, 14, 21))

    def test_lifecycle_transitions_and_single_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "jobs.ndjson"
            job = curated.occurrence_from_raw(reviewed_job(), "2026-07-01", "2026-07-01")
            curated.atomic_write_ndjson(output, [job])

            self.assertEqual(curated.expire_jobs(output, "2026-07-15"), 1)
            self.assertEqual(curated.read_ndjson(output)[0]["status"], "expired")

            curated.verify_jobs(
                output,
                [{"job_id": job["job_id"], "outcome": "open", "check_id": "open-1"}],
                "2026-07-15",
            )
            self.assertEqual(curated.read_ndjson(output)[0]["status"], "active")

            curated.verify_jobs(
                output,
                [{"job_id": job["job_id"], "outcome": "network_error", "check_id": "failure-1"}],
                "2026-07-16",
            )
            suspect = curated.read_ndjson(output)[0]
            self.assertEqual(suspect["status"], "active")
            self.assertEqual(suspect["verification_state"], "suspect")

            curated.verify_jobs(
                output,
                [{"job_id": job["job_id"], "outcome": "closed", "reason": "position filled"}],
                "2026-07-17",
            )
            self.assertEqual(curated.read_ndjson(output)[0]["status"], "closed")

    def test_two_independent_failures_close_job(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "jobs.ndjson"
            job = curated.occurrence_from_raw(reviewed_job(), "2026-07-20", "2026-07-20")
            curated.atomic_write_ndjson(output, [job])
            curated.verify_jobs(
                output,
                [{"job_id": job["job_id"], "outcome": "http_403", "check_id": "one"}],
                "2026-07-21",
            )
            curated.verify_jobs(
                output,
                [{"job_id": job["job_id"], "outcome": "timeout", "check_id": "two"}],
                "2026-07-22",
            )
            self.assertEqual(curated.read_ndjson(output)[0]["status"], "closed")

    def test_migration_preserves_state_and_upsert_renews_expired_job(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            picks = root / "picks"
            picks.mkdir()
            job = reviewed_job()
            (picks / "2026-07-01.md").write_text(markdown(job), encoding="utf-8")
            output = root / "jobs.ndjson"
            issues = root / "issues"
            curated.migrate(picks, "2026-07-23", output, issues)
            self.assertEqual(curated.read_ndjson(output)[0]["status"], "expired")

            input_path = root / "final.json"
            input_path.write_text(json.dumps([job], ensure_ascii=False), encoding="utf-8")
            curated.upsert(
                input_path,
                "2026-07-23",
                "2026-07-23-returning",
                "Returning",
                "public",
                output,
                issues,
            )
            reopened = curated.read_ndjson(output)[0]
            self.assertEqual(reopened["status"], "active")
            self.assertGreater(reopened["expires_on"], "2026-07-23")
            expected_expiry = reopened["expires_on"]

            curated.migrate(picks, "2026-07-23", output, issues)
            preserved = curated.read_ndjson(output)[0]
            self.assertEqual(preserved["status"], "active")
            self.assertEqual(preserved["expires_on"], expected_expiry)

    def test_upsert_merges_batches_for_the_same_issue(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            output = root / "jobs.ndjson"
            issues = root / "issues"
            for index in (1, 2):
                input_path = root / f"batch-{index}.json"
                input_path.write_text(
                    json.dumps(
                        [reviewed_job(title=f"Role {index}", url=f"https://example.com/jobs/{index}")],
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
                curated.upsert(
                    input_path,
                    "2026-07-23",
                    "2026-07-23-two-batches",
                    "Two batches",
                    "public",
                    output,
                    issues,
                )
            issue = json.loads((issues / "2026-07-23-two-batches.json").read_text(encoding="utf-8"))
            self.assertEqual(len(issue["job_ids"]), 2)
            self.assertEqual(issue["stats"]["count"], 2)

    def test_atomic_replace_failure_preserves_old_inventory(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "jobs.ndjson"
            output.write_text("old inventory\n", encoding="utf-8")
            job = curated.occurrence_from_raw(reviewed_job(), "2026-07-20", "2026-07-20")
            with mock.patch.object(os, "replace", side_effect=OSError("simulated replace failure")):
                with self.assertRaisesRegex(OSError, "simulated"):
                    curated.atomic_write_ndjson(output, [job])
            self.assertEqual(output.read_text(encoding="utf-8"), "old inventory\n")

    def test_candidate_stats(self):
        with tempfile.TemporaryDirectory() as temp:
            candidates = Path(temp)
            rows = [
                {"candidate_id": "1", "pipeline_status": "screened_out"},
                {"candidate_id": "2", "pipeline_status": "duplicate"},
                {"candidate_id": "3", "pipeline_status": "bad_link"},
                {"candidate_id": "4", "pipeline_status": "promoted"},
                {"candidate_id": "5", "pipeline_status": "promoted"},
            ]
            (candidates / "2026-07-23.ndjson").write_text(
                "\n".join(json.dumps(row) for row in rows) + "\n",
                encoding="utf-8",
            )
            self.assertEqual(
                curated.candidate_stats(candidates, "2026-07-23"),
                {
                    "discovered": 5,
                    "screened_out": 1,
                    "duplicate": 1,
                    "bad_link": 1,
                    "promoted": 2,
                    "promote_rate": 0.4,
                },
            )

    def test_formatter_can_write_markdown_curated_and_issue_idempotently(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            input_path = root / "final-jobs.json"
            report = root / "2026-07-23-low-english.md"
            inventory = root / "jobs.ndjson"
            issues = root / "issues"
            input_path.write_text(
                json.dumps([reviewed_job()], ensure_ascii=False),
                encoding="utf-8",
            )
            command = [
                sys.executable,
                str(ROOT / ".agents/skills/daily-job-picks/scripts/format_daily_picks.py"),
                "--input",
                str(input_path),
                "--date",
                "2026-07-23",
                "--mode",
                "公共精选",
                "--output",
                str(report),
                "--curated-output",
                str(inventory),
                "--issues-dir",
                str(issues),
            ]
            subprocess.run(command, check=True, capture_output=True, text=True)
            subprocess.run(command, check=True, capture_output=True, text=True)

            self.assertEqual(len(curated.read_ndjson(inventory)), 1)
            issue = json.loads((issues / "2026-07-23-low-english.json").read_text(encoding="utf-8"))
            self.assertEqual(issue["issue_id"], "2026-07-23-low-english")
            validation = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / ".agents/skills/daily-job-picks/scripts/validate_report.py"),
                    str(report),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(validation.returncode, 0, validation.stdout + validation.stderr)

    def test_legacy_seen_and_bad_link_indexes_gain_stable_job_id(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            url = "https://example.com/jobs/123?b=2&utm_source=legacy&a=1"
            (root / "seen-jobs.tsv").write_text(
                "date\ttitle\tcompany\turl\tjob_direction\tsource\n"
                f"2026-07-23\tSupport\tExample\t{url}\t客服\tCareers\n",
                encoding="utf-8",
            )
            (root / "bad-links.tsv").write_text(
                "date\turl\ttitle\tcompany\treason\treplacement_url\n"
                f"2026-07-23\t{url}\tSupport\tExample\tclosed\t\n",
                encoding="utf-8",
            )
            for script in ("seen_jobs.py", "bad_links.py"):
                subprocess.run(
                    [
                        sys.executable,
                        str(ROOT / ".agents/skills/daily-job-picks/scripts" / script),
                        "--root",
                        str(root),
                        "ensure",
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                )

            expected = curated.job_id_for({"url": url, "title": "Support", "company": "Example"})
            seen_lines = (root / "seen-jobs.tsv").read_text(encoding="utf-8").splitlines()
            bad_lines = (root / "bad-links.tsv").read_text(encoding="utf-8").splitlines()
            self.assertTrue(seen_lines[0].endswith("\tjob_id"))
            self.assertTrue(bad_lines[0].endswith("\tjob_id"))
            self.assertTrue(seen_lines[1].endswith(f"\t{expected}"))
            self.assertTrue(bad_lines[1].endswith(f"\t{expected}"))

            for script in ("seen_jobs.py", "bad_links.py"):
                checked = subprocess.run(
                    [
                        sys.executable,
                        str(ROOT / ".agents/skills/daily-job-picks/scripts" / script),
                        "--root",
                        str(root),
                        "check",
                        "--title",
                        "Support",
                        "--company",
                        "Example",
                        "--url",
                        url,
                    ],
                    check=False,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(checked.returncode, 1, checked.stdout + checked.stderr)


if __name__ == "__main__":
    unittest.main()
