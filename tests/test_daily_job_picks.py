from __future__ import annotations

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
import run_daily_job_picks as runner  # noqa: E402
import curated_jobs  # noqa: E402


def candidate(index: int) -> dict[str, str]:
    return {
        "title": f"Role {index}",
        "company": f"Company {index}",
        "url": f"https://example.com/jobs/{index}",
        "source": "Company Careers",
        "location": "Shanghai, China",
        "direction": "运营",
        "screen_reason": "",
    }


def reviewed_job() -> dict[str, str]:
    return {
        "title": "Role 1",
        "company_platform": "Company 1 / Company Careers",
        "company": "Company 1",
        "job_group": "外企中国岗位",
        "job_direction": "运营与客户服务",
        "work_mode": "中国本地办公",
        "experience": "1-3 年",
        "language": "英文",
        "application_barrier": "中",
        "application_barrier_note": "需要基础运营经验",
        "china_applicability": "高",
        "china_applicability_note": "岗位明确位于上海",
        "timezone_judgment": "中国本地工作时区",
        "best_for": "适合有运营经验的人",
        "notes": "投递前确认办公安排",
        "url": "https://example.com/jobs/1",
        "source": "Company Careers",
        "published_date": "2026-08-01",
        "publication_status": "已披露",
    }


class DailyJobPicksTests(unittest.TestCase):
    def test_instruction_injects_taxonomy_from_shared_config(self) -> None:
        instruction = runner.build_instruction(
            run_date="2026-08-26",
            search_plan={},
            skill_text="skill rules",
            screening_text="screening rules",
            config_text="config",
            audience_text="",
            seen_rows=[],
            bad_rows=[],
        )
        self.assertIn("canonical taxonomy", instruction)
        self.assertIn("运营与客户服务", instruction)
        self.assertIn("中国远程", instruction)

    def test_taxonomy_normalizes_legacy_values_and_rejects_unknown_direction(self) -> None:
        legacy = {
            "job_direction": "QA",
            "work_mode": "全职居家",
            "experience": "1 年以下",
            "language": " 中文 / 英文 ",
        }
        changes = curated_jobs.normalize_taxonomy_fields(legacy)
        self.assertEqual(
            legacy,
            {
                "job_direction": "技术、测试与质量",
                "work_mode": "中国远程",
                "experience": "入门",
                "language": "双语",
            },
        )
        self.assertEqual(set(changes), {"job_direction", "work_mode", "experience", "language"})

        job = reviewed_job()
        job["job_direction"] = "未经规范的方向"
        with self.assertRaisesRegex(runner.PipelineError, "invalid job_direction"):
            runner.validate_job(job)

    def test_inventory_normalization_recomputes_derived_channels(self) -> None:
        job = curated_jobs.occurrence_from_raw(reviewed_job(), "2026-08-04", "2026-08-04")
        job["channels"] = []
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "jobs.ndjson"
            path.write_text(json.dumps(job, ensure_ascii=False) + "\n", encoding="utf-8")
            result = curated_jobs.normalize_inventory_taxonomy(path, write=True)
            saved = curated_jobs.read_ndjson(path)[0]
        self.assertEqual(result["changed_by_field"]["channels"], 1)
        self.assertEqual(saved["channels"], curated_jobs.channels_for(saved))

    def test_structured_response_requires_a_large_initial_candidate_pool(self) -> None:
        data = {"candidates": [candidate(1)], "jobs": []}
        with self.assertRaisesRegex(runner.PipelineError, "at least 24"):
            runner.validate_model_response(data, initial=True)

    def test_structured_response_accepts_candidates_and_final_job(self) -> None:
        data = {"candidates": [candidate(index) for index in range(1, 25)], "jobs": [reviewed_job()]}
        validated = runner.validate_model_response(data, initial=True)
        self.assertEqual(len(validated["candidates"]), 24)
        self.assertEqual(runner.validate_job(validated["jobs"][0])["url"], "https://example.com/jobs/1")

    def test_candidate_ndjson_is_atomic_and_has_pipeline_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "2026-08-04.ndjson"
            row = runner.candidate_record(candidate(1), "2026-08-04")
            row["pipeline_status"] = "promoted"
            runner.write_candidates(path, [row], "2026-08-04")
            saved = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(len(saved), 1)
            self.assertTrue(saved[0]["candidate_id"].startswith("cand_20260804_"))
            self.assertEqual(saved[0]["pipeline_status"], "promoted")

    def test_formatter_and_report_validator_accept_normal_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            input_path = root / "jobs.json"
            report = root / "2026-08-04.md"
            inventory = root / "curated.ndjson"
            issues = root / "issues"
            input_path.write_text(json.dumps([reviewed_job()], ensure_ascii=False), encoding="utf-8")
            formatter = ROOT / ".agents/skills/daily-job-picks/scripts/format_daily_picks.py"
            subprocess.run(
                [
                    sys.executable,
                    str(formatter),
                    "--input",
                    str(input_path),
                    "--date",
                    "2026-08-04",
                    "--mode",
                    "公共精选",
                    "--output",
                    str(report),
                    "--curated-output",
                    str(inventory),
                    "--issues-dir",
                    str(issues),
                    "--issue-id",
                    "2026-08-04",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            validation = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / ".agents/skills/daily-job-picks/scripts/validate_report.py"),
                    str(report),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            self.assertTrue(json.loads(validation.stdout)["valid"])
            saved = json.loads(inventory.read_text(encoding="utf-8").splitlines()[0])
            self.assertEqual(saved["published_date"], "2026-08-01")
            self.assertEqual(saved["publication_status"], "已披露")

    def test_existing_report_is_never_overwritten(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            report = Path(temp) / "2026-08-04.md"
            report.write_text("existing\n", encoding="utf-8")
            with self.assertRaisesRegex(runner.PipelineError, "refusing to overwrite"):
                runner.ensure_report_is_new(report)

    def test_date_override_must_use_dashed_iso_format(self) -> None:
        with self.assertRaisesRegex(runner.PipelineError, "YYYY-MM-DD"):
            runner.validate_date("20260804")

    def test_responses_output_text_is_extracted_without_markdown_fallback(self) -> None:
        payload = {
            "output": [
                {
                    "type": "message",
                    "content": [{"type": "output_text", "text": "{\"candidates\":[],\"jobs\":[]}"}],
                }
            ]
        }
        self.assertEqual(runner.extract_output_text(payload), '{"candidates":[],"jobs":[]}')

    def test_chat_completion_payload_targets_compatible_provider(self) -> None:
        with mock.patch.dict(
            os.environ,
            {
                "OPENAI_BASE_URL": "https://api.deepseek.com",
                "OPENAI_API_MODE": "chat_completions",
                "OPENAI_MODEL": "deepseek-v4-flash",
            },
            clear=True,
        ):
            self.assertEqual(runner.model_api_url(), "https://api.deepseek.com/chat/completions")
            payload = runner.build_model_payload("find jobs")
        self.assertEqual(payload["model"], "deepseek-v4-flash")
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertNotIn("tools", payload)

    def test_chat_completion_output_text_is_extracted(self) -> None:
        payload = {"choices": [{"message": {"content": '{"candidates":[],"jobs":[]}'}}]}
        self.assertEqual(runner.extract_output_text(payload), '{"candidates":[],"jobs":[]}')

    def test_api_mode_auto_uses_responses_only_for_openai(self) -> None:
        with mock.patch.dict(os.environ, {"OPENAI_BASE_URL": "https://api.deepseek.com"}, clear=True):
            self.assertEqual(runner.model_api_mode(), "chat_completions")
        with mock.patch.dict(os.environ, {"OPENAI_BASE_URL": "https://api.openai.com/v1"}, clear=True):
            self.assertEqual(runner.model_api_mode(), "responses")

    def test_child_scripts_do_not_inherit_openai_key(self) -> None:
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "test-secret"}, clear=False):
            with mock.patch.object(
                runner.subprocess,
                "run",
                return_value=subprocess.CompletedProcess([], 0, "", ""),
            ) as process:
                runner.run_command(["trusted-script"], cwd=ROOT, check=False)
        self.assertNotIn("OPENAI_API_KEY", process.call_args.kwargs["env"])

    def test_command_errors_redact_json_payloads(self) -> None:
        with mock.patch.object(
            runner.subprocess,
            "run",
            return_value=subprocess.CompletedProcess([], 1, "", "failed"),
        ):
            with self.assertRaises(runner.PipelineError) as raised:
                runner.run_command(["lark-cli", "--json", '{"private":"value"}'], cwd=ROOT)
        self.assertNotIn("private", str(raised.exception))
        self.assertIn("<redacted-json>", str(raised.exception))

    def test_publish_target_defaults_to_page_and_accepts_feishu(self) -> None:
        with mock.patch.object(sys, "argv", ["run_daily_job_picks.py"]):
            self.assertEqual(runner.parse_args().publish_target, "page")
        with mock.patch.object(sys, "argv", ["run_daily_job_picks.py", "feishu"]):
            self.assertEqual(runner.parse_args().publish_target, "feishu")

    def test_undisclosed_publication_date_is_valid(self) -> None:
        job = reviewed_job()
        job["published_date"] = ""
        job["publication_status"] = "未披露"
        self.assertEqual(runner.validate_job(job)["publication_status"], "未披露")
        job["publication_status"] = "已披露"
        with self.assertRaisesRegex(runner.PipelineError, "empty published_date"):
            runner.validate_job(job)

    def test_feishu_sync_creates_then_reads_back_by_job_id(self) -> None:
        job = reviewed_job()
        job.update(
            {
                "job_id": runner.stable_job_id(job["url"], job["company"], job["title"]),
                "aliases": [job["url"]],
                "channels": ["ops-cs"],
                "timezone_friendly": True,
                "review_state": "reviewed",
            }
        )
        select_fields = [
            {
                "name": label,
                "options": [{"name": job[key]}],
            }
            for label, key in runner.FEISHU_SELECT_FIELDS.items()
        ]
        all_fields = select_fields + [
            {"name": name}
            for name in runner.feishu_fields(job, include_empty=True)
            if name not in runner.FEISHU_SELECT_FIELDS
        ]
        with mock.patch.object(
            runner,
            "lark_json",
            side_effect=[
                {"ok": True, "data": {"fields": all_fields}},
                {"ok": True, "data": {"record_id_list": ["rec_new"]}},
            ],
        ), mock.patch.object(runner, "find_feishu_record", return_value=None), mock.patch.object(
            runner,
            "read_feishu_record",
            return_value=("rec_new", runner.feishu_fields(job, include_empty=True)),
        ):
            result = runner.sync_feishu(ROOT, [job])
        self.assertEqual(result, {"created": 1, "updated": 0, "verified": 1})

    def test_feishu_readback_unwraps_single_select_values(self) -> None:
        self.assertEqual(
            runner.normalize_feishu_readback("岗位归类", ["海外远程岗位"]),
            "海外远程岗位",
        )
        self.assertEqual(runner.normalize_feishu_readback("岗位名称", ["保留列表"]), ["保留列表"])

    def test_feishu_readback_normalizes_datetime_values(self) -> None:
        self.assertEqual(
            runner.normalize_feishu_readback("发布日期", "2026-07-03T00:00:00.000+08:00"),
            "2026-07-03 00:00:00",
        )

    def test_feishu_link_uses_raw_url_when_url_contains_parentheses(self) -> None:
        job = reviewed_job()
        job["url"] = "https://example.com/jobs/customer-success-(china)"
        self.assertEqual(runner.feishu_fields(job)["链接"], job["url"])
        readback = f"[{job['url']}]({job['url']})"
        self.assertEqual(runner.normalize_feishu_readback("链接", readback), job["url"])

    def test_feishu_update_clears_undisclosed_publication_date(self) -> None:
        job = reviewed_job()
        job.update(
            {
                "job_id": runner.stable_job_id(job["url"], job["company"], job["title"]),
                "published_date": "",
                "publication_status": "未披露",
                "first_seen_date": "2026-08-01",
            }
        )
        self.assertNotIn("发布日期", runner.feishu_fields(job))
        self.assertIsNone(runner.feishu_fields(job, include_empty=True)["发布日期"])
        self.assertEqual(runner.feishu_fields(job)["收录日期"], "2026-08-01 00:00:00")

    def test_new_undisclosed_date_clears_curated_date(self) -> None:
        existing_raw = reviewed_job()
        existing = curated_jobs.occurrence_from_raw(existing_raw, "2026-08-01", "2026-08-01")
        incoming_raw = reviewed_job()
        incoming_raw.update({"published_date": "", "publication_status": "未披露"})
        incoming = curated_jobs.occurrence_from_raw(incoming_raw, "2026-08-10", "2026-08-10")
        merged = curated_jobs.merge_occurrence(existing, incoming)
        self.assertEqual(merged["published_date"], "")
        self.assertEqual(merged["publication_status"], "未披露")


if __name__ == "__main__":
    unittest.main()
