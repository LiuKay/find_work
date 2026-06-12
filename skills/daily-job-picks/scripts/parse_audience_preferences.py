#!/usr/bin/env python3
"""Parse job-picks audience preferences Markdown into structured JSON."""

from __future__ import annotations

import argparse
import json
import re
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
SECTION_TARGET_COUNT = "本期总数"
SECTION_ENGLISH = "英文要求倾向"
SECTION_SENIORITY = "经验阶段倾向"
SECTION_BARRIER = "申请门槛倾向"

JOB_DIRECTION_ALIASES = {
    "客服": ["客服", "客户支持", "客户服务", "客户成功", "售后支持"],
    "运营": ["运营", "合规", "kyc", "教育", "新媒体", "内容运营"],
    "内容": ["内容", "新媒体"],
    "本地化": ["本地化", "翻译", "localization"],
    "销售支持": ["销售支持", "sales enablement"],
    "技术": ["软件开发", "技术开发", "开发", "工程", "web3"],
    "技术支持": ["技术支持", "support engineer"],
    "QA": ["qa", "软件测试", "质量工程", "测试"],
    "数据": ["数据处理", "数据分析", "数据"],
    "AI Trainer": ["ai trainer", "数据标注", "evaluator", "rater"],
    "产品": ["产品", "产品经理"],
    "项目管理": ["pmo", "项目"],
    "需求分析": ["业务分析", "ba"],
    "系统分析": ["系统分析"],
    "实施": ["实施"],
    "解决方案": ["解决方案", "solution"],
    "HR": ["hr", "招聘", "people"],
    "供应链": ["采购", "供应链", "service parts"],
    "销售": ["销售", "bd", "business development"],
    "其他": ["其他"],
}

WORK_MODE_ALIASES = {
    "中国本地办公": ["国内", "中国远程", "外企，可以不远程", "中国本地办公"],
    "APAC 远程": ["apac", "海外", "亚洲远程"],
    "全球远程": ["全球远程", "remote", "anywhere"],
    "混合办公": ["混合办公", "hybrid"],
}


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", "", value.casefold())


def append_unique(items: list[str], value: str) -> None:
    if value not in items:
        items.append(value)


def set_if_missing(preferences: dict[str, Any], key: str, value: str | None) -> None:
    if value and not preferences.get(key):
        preferences[key] = value


def labels_from_aliases(raw: str, alias_map: dict[str, list[str]]) -> list[str]:
    text = normalize_text(raw.split("：", 1)[0])
    matched: list[str] = []
    for label, aliases in alias_map.items():
        for alias in aliases:
            if normalize_text(alias) in text:
                append_unique(matched, label)
                break
    return matched


def parse_target_count_text(value: str) -> int | None:
    match = re.search(r"(\d+)", value)
    return int(match.group(1)) if match else None


def parse_english_preference(value: str) -> str | None:
    normalized = value.strip()
    if normalized in ENGLISH_PREFERENCES:
        return normalized
    text = normalize_text(value)
    if "低英文门槛" in text or "照顾低英文" in text:
        return "中文优先"
    if "读写英文" in text or "双语" in text:
        return "双语优先"
    if "不限" in text:
        return "不限"
    return None


def parse_seniority_preference(value: str) -> str | None:
    normalized = value.strip()
    if normalized in SENIORITY_PREFERENCES:
        return normalized
    text = normalize_text(value)
    if "入门" in text:
        return "入门优先"
    if "1-3年" in text:
        return "1-3 年优先"
    if "3-5年" in text:
        return "3-5 年优先"
    if "高级" in text:
        return "高级可接受"
    return None


def parse_barrier_preference(value: str) -> str | None:
    normalized = value.strip()
    if normalized in BARRIER_PREFERENCES:
        return normalized
    text = normalize_text(value)
    if "低门槛" in text and "中等" in text:
        return "低到中优先"
    if "低门槛" in text:
        return "低优先"
    if "中等门槛" in text:
        return "中优先"
    if "高门槛" in text:
        return "中到高可接受"
    return None


def parse_exclusion_sentence(value: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    text = value.strip()
    if not text:
        return items
    if any(keyword in text for keyword in ("crypto", "博彩", "成人行业", "刷单", "佣金", "押金", "培训费")):
        items.append({"type": "行业", "value": text})
    if any(keyword in text for keyword in ("平台首页", "搜索页", "职位列表页", "过期页", "404", "登录")):
        items.append({"type": "工作方式", "value": text})
    return items


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
            if heading in {
                SECTION_JOB_DIRECTION,
                SECTION_WORK_MODE,
                SECTION_EXCLUSIONS,
                SECTION_TARGET_COUNT,
                SECTION_ENGLISH,
                SECTION_SENIORITY,
                SECTION_BARRIER,
            }:
                current_section = heading
            elif line.startswith("##"):
                current_section = ""
                warnings.append(f"line {lineno}: unknown heading ignored: {heading}")
            continue

        if "：" in line and not line.startswith("- "):
            key, value = [part.strip() for part in line.split("：", 1)]
            if key == "本期总数":
                parsed = parse_target_count_text(value)
                if parsed is not None:
                    preferences["target_count"] = parsed
                else:
                    warnings.append(f"line {lineno}: invalid 本期总数 ignored")
            elif key == "英文要求倾向":
                parsed = parse_english_preference(value)
                if parsed:
                    preferences["english_preference"] = parsed
                else:
                    warnings.append(f"line {lineno}: invalid 英文要求倾向 ignored")
            elif key == "经验阶段倾向":
                parsed = parse_seniority_preference(value)
                if parsed:
                    preferences["seniority_preference"] = parsed
                else:
                    warnings.append(f"line {lineno}: invalid 经验阶段倾向 ignored")
            elif key == "申请门槛倾向":
                parsed = parse_barrier_preference(value)
                if parsed:
                    preferences["barrier_preference"] = parsed
                else:
                    warnings.append(f"line {lineno}: invalid 申请门槛倾向 ignored")
            else:
                warnings.append(f"line {lineno}: unknown field ignored: {key}")
            continue

        if line.startswith("- "):
            item = line[2:].strip()
            if current_section == SECTION_JOB_DIRECTION:
                labels = [item] if item in JOB_DIRECTIONS else labels_from_aliases(item, JOB_DIRECTION_ALIASES)
                if labels:
                    for label in labels:
                        append_unique(preferences["job_direction_priority"], label)
                else:
                    warnings.append(f"line {lineno}: unsupported 岗位方向 ignored: {item}")
                continue
            if current_section == SECTION_WORK_MODE:
                labels = [item] if item in WORK_MODES else labels_from_aliases(item, WORK_MODE_ALIASES)
                if labels:
                    for label in labels:
                        append_unique(preferences["work_mode_priority"], label)
                else:
                    warnings.append(f"line {lineno}: unsupported 工作方式 ignored: {item}")
                continue
            if current_section == SECTION_EXCLUSIONS:
                if "：" not in item:
                    parsed_items = parse_exclusion_sentence(item)
                    if parsed_items:
                        preferences["explicit_exclusions"].extend(parsed_items)
                    else:
                        warnings.append(f"line {lineno}: invalid 明确排除 item ignored")
                    continue
                item_type, value = [part.strip() for part in item.split("：", 1)]
                if item_type not in EXCLUSION_PREFIXES or not value:
                    warnings.append(f"line {lineno}: invalid 明确排除 item ignored")
                    continue
                preferences["explicit_exclusions"].append({"type": item_type, "value": value})
                continue
            if current_section == SECTION_ENGLISH:
                parsed = parse_english_preference(item)
                if parsed:
                    set_if_missing(preferences, "english_preference", parsed)
                else:
                    warnings.append(f"line {lineno}: invalid 英文要求倾向 ignored")
                continue
            if current_section == SECTION_SENIORITY:
                parsed = parse_seniority_preference(item)
                if parsed:
                    set_if_missing(preferences, "seniority_preference", parsed)
                else:
                    warnings.append(f"line {lineno}: invalid 经验阶段倾向 ignored")
                continue
            if current_section == SECTION_BARRIER:
                parsed = parse_barrier_preference(item)
                if parsed:
                    set_if_missing(preferences, "barrier_preference", parsed)
                else:
                    warnings.append(f"line {lineno}: invalid 申请门槛倾向 ignored")
                continue
            warnings.append(f"line {lineno}: list item outside supported section ignored")
            continue

        if current_section == SECTION_TARGET_COUNT:
            parsed = parse_target_count_text(line)
            if parsed is not None:
                preferences["target_count"] = parsed
                continue
        if current_section == SECTION_ENGLISH:
            parsed = parse_english_preference(line)
            if parsed:
                set_if_missing(preferences, "english_preference", parsed)
                continue
        if current_section == SECTION_SENIORITY:
            parsed = parse_seniority_preference(line)
            if parsed:
                set_if_missing(preferences, "seniority_preference", parsed)
                continue
        if current_section == SECTION_BARRIER:
            parsed = parse_barrier_preference(line)
            if parsed:
                set_if_missing(preferences, "barrier_preference", parsed)
                continue
        if current_section == SECTION_EXCLUSIONS:
            parsed_items = parse_exclusion_sentence(line)
            if parsed_items:
                preferences["explicit_exclusions"].extend(parsed_items)
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
