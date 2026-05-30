#!/usr/bin/env python3
"""Validate the editable daily-job-picks source configuration."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - only reached on Python < 3.11
    tomllib = None  # type: ignore[assignment]


REQUIRED_TOP_LEVEL = {
    "output_defaults",
    "source_groups",
    "role_profiles",
    "screening_rules",
    "link_rules",
}
SOURCE_TYPES = {"company_career", "ats", "remote_board", "discovery"}
TRUST_LEVELS = {"A", "B", "C"}
REQUIRED_OUTPUT_DEFAULTS = {
    "public_mode",
    "targeted_mode",
    "public_count_min",
    "public_count_max",
    "targeted_count_min",
    "targeted_count_max",
    "public_title_template",
    "targeted_title_template",
    "default_industry",
}
REQUIRED_SOURCE_FIELDS = {
    "name",
    "enabled",
    "trust_level",
    "source_type",
    "avoid_as_final_link",
    "search_templates",
}
REQUIRED_PROFILE_FIELDS = {
    "id",
    "label",
    "enabled",
    "keywords",
    "directions",
    "preferred_regions",
    "notes",
}
REQUIRED_SCREENING_RULES = {
    "timezone_baseline",
    "max_timezone_difference_hours",
    "overseas_jobs_must_be_remote",
    "prefer_regions",
    "reject_regions",
    "reject_industries",
    "risk_keywords",
}
REQUIRED_LINK_RULES = {
    "must_be_specific_job_page",
    "must_show_matching_title",
    "must_show_company",
    "must_show_role_details",
    "must_have_application_path",
    "reject_homepages",
    "reject_search_pages",
    "reject_login_walls",
    "reject_closed_or_expired",
    "prefer_canonical_company_or_ats_url",
}


def load_config(path: Path) -> tuple[dict[str, Any] | None, list[str]]:
    if tomllib is None:
        return None, ["Python 3.11+ is required because this script uses standard-library tomllib"]
    try:
        return tomllib.loads(path.read_text(encoding="utf-8")), []
    except FileNotFoundError:
        return None, [f"config file not found: {path}"]
    except tomllib.TOMLDecodeError as exc:
        return None, [f"invalid TOML: {exc}"]


def require_keys(mapping: dict[str, Any], required: set[str], label: str) -> list[str]:
    return [f"{label}: missing {key}" for key in sorted(required - set(mapping))]


def is_nonempty_string_list(value: Any) -> bool:
    return isinstance(value, list) and bool(value) and all(isinstance(item, str) and item.strip() for item in value)


def validate_output_defaults(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    output = config.get("output_defaults")
    if not isinstance(output, dict):
        return ["output_defaults must be a table"]
    errors.extend(require_keys(output, REQUIRED_OUTPUT_DEFAULTS, "output_defaults"))
    for key in ("public_count_min", "public_count_max", "targeted_count_min", "targeted_count_max"):
        if key in output and not isinstance(output[key], int):
            errors.append(f"output_defaults.{key} must be an integer")
    if isinstance(output.get("public_count_min"), int) and isinstance(output.get("public_count_max"), int):
        if output["public_count_min"] > output["public_count_max"]:
            errors.append("output_defaults.public_count_min must not exceed public_count_max")
    if isinstance(output.get("targeted_count_min"), int) and isinstance(output.get("targeted_count_max"), int):
        if output["targeted_count_min"] > output["targeted_count_max"]:
            errors.append("output_defaults.targeted_count_min must not exceed targeted_count_max")
    return errors


def validate_source_groups(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    groups = config.get("source_groups")
    if not isinstance(groups, list):
        return ["source_groups must be an array of tables"]
    if not groups:
        return ["source_groups must contain at least one source group"]

    enabled_count = 0
    names: set[str] = set()
    for idx, group in enumerate(groups, 1):
        label = f"source_groups[{idx}]"
        if not isinstance(group, dict):
            errors.append(f"{label} must be a table")
            continue
        errors.extend(require_keys(group, REQUIRED_SOURCE_FIELDS, label))
        name = group.get("name")
        if isinstance(name, str):
            normalized_name = name.casefold()
            if normalized_name in names:
                errors.append(f"{label}.name must be unique: {name}")
            names.add(normalized_name)
        if "enabled" in group and not isinstance(group["enabled"], bool):
            errors.append(f"{label}.enabled must be a boolean")
        if group.get("enabled") is True:
            enabled_count += 1
        if "trust_level" in group and group["trust_level"] not in TRUST_LEVELS:
            errors.append(f"{label}.trust_level must be one of A, B, C")
        if "source_type" in group and group["source_type"] not in SOURCE_TYPES:
            errors.append(f"{label}.source_type must be one of {', '.join(sorted(SOURCE_TYPES))}")
        if "avoid_as_final_link" in group and not isinstance(group["avoid_as_final_link"], bool):
            errors.append(f"{label}.avoid_as_final_link must be a boolean")
        if "search_templates" in group and not is_nonempty_string_list(group["search_templates"]):
            errors.append(f"{label}.search_templates must be a non-empty string array")
    if enabled_count == 0:
        errors.append("source_groups must contain at least one enabled source group")
    return errors


def validate_role_profiles(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    profiles = config.get("role_profiles")
    if not isinstance(profiles, list):
        return ["role_profiles must be an array of tables"]
    if not profiles:
        return ["role_profiles must contain at least one role profile"]

    enabled_count = 0
    ids: set[str] = set()
    for idx, profile in enumerate(profiles, 1):
        label = f"role_profiles[{idx}]"
        if not isinstance(profile, dict):
            errors.append(f"{label} must be a table")
            continue
        errors.extend(require_keys(profile, REQUIRED_PROFILE_FIELDS, label))
        profile_id = profile.get("id")
        if isinstance(profile_id, str):
            normalized_id = profile_id.casefold()
            if normalized_id in ids:
                errors.append(f"{label}.id must be unique: {profile_id}")
            ids.add(normalized_id)
        if "enabled" in profile and not isinstance(profile["enabled"], bool):
            errors.append(f"{label}.enabled must be a boolean")
        if profile.get("enabled") is True:
            enabled_count += 1
        for key in ("keywords", "directions", "preferred_regions"):
            if key in profile and not is_nonempty_string_list(profile[key]):
                errors.append(f"{label}.{key} must be a non-empty string array")
    if enabled_count == 0:
        errors.append("role_profiles must contain at least one enabled role profile")
    return errors


def validate_screening_rules(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    rules = config.get("screening_rules")
    if not isinstance(rules, dict):
        return ["screening_rules must be a table"]
    errors.extend(require_keys(rules, REQUIRED_SCREENING_RULES, "screening_rules"))
    if "max_timezone_difference_hours" in rules and not isinstance(rules["max_timezone_difference_hours"], int):
        errors.append("screening_rules.max_timezone_difference_hours must be an integer")
    if "overseas_jobs_must_be_remote" in rules and not isinstance(rules["overseas_jobs_must_be_remote"], bool):
        errors.append("screening_rules.overseas_jobs_must_be_remote must be a boolean")
    for key in ("prefer_regions", "reject_regions", "reject_industries", "risk_keywords"):
        if key in rules and not is_nonempty_string_list(rules[key]):
            errors.append(f"screening_rules.{key} must be a non-empty string array")
    return errors


def validate_link_rules(config: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    rules = config.get("link_rules")
    if not isinstance(rules, dict):
        return ["link_rules must be a table"]
    errors.extend(require_keys(rules, REQUIRED_LINK_RULES, "link_rules"))
    for key in REQUIRED_LINK_RULES:
        if key in rules and not isinstance(rules[key], bool):
            errors.append(f"link_rules.{key} must be a boolean")
    return errors


def validate(path: Path) -> dict[str, Any]:
    config, load_errors = load_config(path)
    if config is None:
        return {"valid": False, "errors": load_errors, "warnings": []}

    errors: list[str] = []
    warnings: list[str] = []
    errors.extend(require_keys(config, REQUIRED_TOP_LEVEL, "top-level"))
    errors.extend(validate_output_defaults(config))
    errors.extend(validate_source_groups(config))
    errors.extend(validate_role_profiles(config))
    errors.extend(validate_screening_rules(config))
    errors.extend(validate_link_rules(config))

    source_groups = config.get("source_groups") if isinstance(config.get("source_groups"), list) else []
    role_profiles = config.get("role_profiles") if isinstance(config.get("role_profiles"), list) else []
    enabled_sources = [item for item in source_groups if isinstance(item, dict) and item.get("enabled") is True]
    enabled_profiles = [item for item in role_profiles if isinstance(item, dict) and item.get("enabled") is True]

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "source_groups": len(source_groups),
        "enabled_source_groups": len(enabled_sources),
        "role_profiles": len(role_profiles),
        "enabled_role_profiles": len(enabled_profiles),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "config",
        nargs="?",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "sources" / "job-search-config.toml",
    )
    args = parser.parse_args()

    if sys.version_info < (3, 11) or tomllib is None:
        result = {
            "valid": False,
            "errors": ["Python 3.11+ is required because this script uses standard-library tomllib"],
            "warnings": [],
        }
    else:
        result = validate(args.config)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
