#!/usr/bin/env python3
"""Resolve user intent plus TOML source config into deterministic search lanes."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - only reached on Python < 3.11
    tomllib = None  # type: ignore[assignment]


def load_config(path: Path) -> dict[str, Any]:
    if tomllib is None:
        raise RuntimeError("Python 3.11+ is required because this script uses standard-library tomllib")
    return tomllib.loads(path.read_text(encoding="utf-8"))


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.casefold()).strip()


def split_terms(raw: str) -> list[str]:
    terms = [item.strip() for item in re.split(r"[,，/、;；\n]+", raw) if item.strip()]
    return terms or ([raw.strip()] if raw.strip() else [])


def profile_score(profile: dict[str, Any], requested_terms: list[str]) -> int:
    haystack_parts: list[str] = []
    for key in ("id", "label", "notes"):
        if isinstance(profile.get(key), str):
            haystack_parts.append(profile[key])
    for key in ("keywords", "directions", "preferred_regions"):
        if isinstance(profile.get(key), list):
            haystack_parts.extend(str(item) for item in profile[key])
    haystack = normalize(" ".join(haystack_parts))
    score = 0
    for term in requested_terms:
        normalized_term = normalize(term)
        if normalized_term and normalized_term in haystack:
            score += max(1, len(normalized_term.split()))
    return score


def enabled_profiles(config: dict[str, Any]) -> list[dict[str, Any]]:
    profiles = config.get("role_profiles", [])
    return [item for item in profiles if isinstance(item, dict) and item.get("enabled") is True]


def enabled_sources(config: dict[str, Any]) -> list[dict[str, Any]]:
    groups = config.get("source_groups", [])
    return [item for item in groups if isinstance(item, dict) and item.get("enabled") is True]


def selected_profiles(config: dict[str, Any], mode: str, requested_terms: list[str]) -> tuple[list[dict[str, Any]], bool]:
    profiles = enabled_profiles(config)
    if mode == "公共精选":
        return profiles, False

    scored = [(profile_score(profile, requested_terms), profile) for profile in profiles]
    matches = [profile for score, profile in scored if score > 0]
    matches.sort(key=lambda profile: profile_score(profile, requested_terms), reverse=True)
    return matches, bool(matches)


def profile_keywords(profiles: list[dict[str, Any]], requested_terms: list[str], matched_profile: bool) -> list[str]:
    if not profiles:
        return requested_terms
    if not matched_profile and requested_terms:
        return requested_terms
    keywords: list[str] = []
    for profile in profiles:
        for keyword in profile.get("keywords", []):
            if isinstance(keyword, str) and keyword.strip() and keyword not in keywords:
                keywords.append(keyword)
        if not keywords:
            for direction in profile.get("directions", []):
                if isinstance(direction, str) and direction.strip() and direction not in keywords:
                    keywords.append(direction)
    return keywords or requested_terms


def build_queries(sources: list[dict[str, Any]], keywords: list[str], limit_per_source: int) -> list[dict[str, Any]]:
    lanes: list[dict[str, Any]] = []
    for source in sources:
        templates = source.get("search_templates", [])
        if not isinstance(templates, list):
            templates = []
        queries: list[str] = []
        for keyword in keywords:
            for template in templates:
                if not isinstance(template, str):
                    continue
                query = template.replace("{role}", keyword)
                if query not in queries:
                    queries.append(query)
                if len(queries) >= limit_per_source:
                    break
            if len(queries) >= limit_per_source:
                break
        lanes.append(
            {
                "source": source.get("name", ""),
                "trust_level": source.get("trust_level", ""),
                "source_type": source.get("source_type", ""),
                "avoid_as_final_link": source.get("avoid_as_final_link", False),
                "queries": queries,
            }
        )
    return lanes


def resolve(args: argparse.Namespace) -> dict[str, Any]:
    config = load_config(args.config)
    requested_terms = split_terms(args.role)
    profiles, matched_profile = selected_profiles(config, args.mode, requested_terms)
    keywords = profile_keywords(profiles, requested_terms, matched_profile)
    sources = enabled_sources(config)
    screening_rules = config.get("screening_rules", {}) if isinstance(config.get("screening_rules"), dict) else {}

    return {
        "mode": args.mode,
        "requested_role": args.role,
        "industry": args.industry,
        "matched_profile": matched_profile,
        "profiles": [
            {
                "id": profile.get("id", ""),
                "label": profile.get("label", ""),
                "directions": profile.get("directions", []),
            }
            for profile in profiles
        ],
        "keywords": keywords,
        "source_lanes": build_queries(sources, keywords, args.limit_per_source),
        "screening_rules": {
            "timezone_baseline": screening_rules.get("timezone_baseline"),
            "max_timezone_difference_hours": screening_rules.get("max_timezone_difference_hours"),
            "overseas_jobs_must_be_remote": screening_rules.get("overseas_jobs_must_be_remote"),
            "excluded_companies": screening_rules.get("excluded_companies", []),
            "excluded_domains": screening_rules.get("excluded_domains", []),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "sources" / "job-search-config.toml",
    )
    parser.add_argument("--mode", choices=["公共精选", "定向精选"], default="定向精选")
    parser.add_argument("--role", default="", help="user-requested role keywords")
    parser.add_argument("--industry", default="", help="user-requested industry or direction")
    parser.add_argument("--limit-per-source", type=int, default=8)
    args = parser.parse_args()

    try:
        result = resolve(args)
    except Exception as exc:  # pragma: no cover - CLI safety net
        result = {"valid": False, "errors": [str(exc)]}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
