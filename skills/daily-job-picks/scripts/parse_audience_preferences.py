#!/usr/bin/env python3
"""Parse job-picks audience preferences Markdown into structured JSON."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


JOB_DIRECTIONS = {
    "客服",
    "运营",
    "内容",
    "本地化",
    "销售支持",
    "技术",
    "技术支持",
    "QA",
    "数据",
    "AI Trainer",
    "产品",
    "项目管理",
    "需求分析",
    "系统分析",
    "实施",
    "解决方案",
    "HR",
    "供应链",
    "销售",
    "合同工",
    "兼职",
    "其他",
}
WORK_MODES = {"中国本地办公", "混合办公", "全球远程", "APAC 远程", "中国可投待确认"}
ENGLISH_PREFERENCES = {"中文优先", "双语优先", "英文可接受", "不限"}
SENIORITY_PREFERENCES = {"入门优先", "1-3 年优先", "3-5 年优先", "高级可接受", "不限"}
BARRIER_PREFERENCES = {"低优先", "低到中优先", "中优先", "中到高可接受", "不限"}
EXCLUSION_PREFIXES = {"公司", "行业", "地域", "工作方式"}
SECTION_JOB_DIRECTION = "岗位方向优先级"
SECTION_WORK_MODE = "工作方式优先级"
SECTION_EXCLUSIONS = "明确排除"


def empty_result() -> dict[str, Any]:
    return {
        "target_count": None,
        "job_direction_priority": [],
        "work_mode_priority": [],
        "english_preference": None,
        "seniority_preference": None,
        "barrier_preference": None,
        "explicit_exclusions": [],
    }


def parse_markdown(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"valid": True, "errors": [], "warnings": [], "preferences": empty_result()}

    text = path.read_text(encoding="utf-8")
    preferences = empty_result()
    warnings: list[str] = []
    current_section = ""

    for lineno, raw_line in enumerate(text.splitlines(), 1):
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            heading = line.lstrip("#").strip()
            if heading in {SECTION_JOB_DIRECTION, SECTION_WORK_MODE, SECTION_EXCLUSIONS}:
                current_section = heading
            elif line.startswith("##"):
                current_section = ""
                warnings.append(f"line {lineno}: unknown heading ignored: {heading}")
            continue

        if "：" in line and not line.startswith("- "):
            key, value = [part.strip() for part in line.split("：", 1)]
            if key == "本期总数":
                if value.isdigit():
                    preferences["target_count"] = int(value)
                else:
                    warnings.append(f"line {lineno}: invalid 本期总数 ignored")
            elif key == "英文要求倾向":
                if value in ENGLISH_PREFERENCES:
                    preferences["english_preference"] = value
                else:
                    warnings.append(f"line {lineno}: invalid 英文要求倾向 ignored")
            elif key == "经验阶段倾向":
                if value in SENIORITY_PREFERENCES:
                    preferences["seniority_preference"] = value
                else:
                    warnings.append(f"line {lineno}: invalid 经验阶段倾向 ignored")
            elif key == "申请门槛倾向":
                if value in BARRIER_PREFERENCES:
                    preferences["barrier_preference"] = value
                else:
                    warnings.append(f"line {lineno}: invalid 申请门槛倾向 ignored")
            else:
                warnings.append(f"line {lineno}: unknown field ignored: {key}")
            continue

        if line.startswith("- "):
            item = line[2:].strip()
            if current_section == SECTION_JOB_DIRECTION:
                if item in JOB_DIRECTIONS:
                    preferences["job_direction_priority"].append(item)
                else:
                    warnings.append(f"line {lineno}: unsupported 岗位方向 ignored: {item}")
                continue
            if current_section == SECTION_WORK_MODE:
                if item in WORK_MODES:
                    preferences["work_mode_priority"].append(item)
                else:
                    warnings.append(f"line {lineno}: unsupported 工作方式 ignored: {item}")
                continue
            if current_section == SECTION_EXCLUSIONS:
                if "：" not in item:
                    warnings.append(f"line {lineno}: invalid 明确排除 item ignored")
                    continue
                item_type, value = [part.strip() for part in item.split("：", 1)]
                if item_type not in EXCLUSION_PREFIXES or not value:
                    warnings.append(f"line {lineno}: invalid 明确排除 item ignored")
                    continue
                preferences["explicit_exclusions"].append({"type": item_type, "value": value})
                continue
            warnings.append(f"line {lineno}: list item outside supported section ignored")
            continue

        warnings.append(f"line {lineno}: free-form prose ignored")

    return {"valid": True, "errors": [], "warnings": warnings, "preferences": preferences}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Markdown file to parse")
    args = parser.parse_args()

    try:
        result = parse_markdown(args.input)
    except Exception as exc:  # noqa: BLE001
        result = {"valid": False, "errors": [str(exc)], "warnings": [], "preferences": empty_result()}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
