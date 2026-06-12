#!/usr/bin/env python3
"""Validate candidate review cards for daily-job-picks."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


REQUIRED_TOP_LEVEL = {
    "identity",
    "observed_signals",
    "rule_checks",
    "evidence",
    "decision",
    "decision_reason",
}
IDENTITY_KEYS = {"title", "company", "url", "source"}
OBSERVED_SIGNAL_KEYS = {
    "location_text",
    "remote_text",
    "timezone_text",
    "employment_text",
    "language_text",
    "risk_text",
    "apply_path_text",
}
RULE_CHECK_KEYS = {
    "remote_required_status",
    "timezone_status",
    "china_eligibility_status",
    "ai_trainer_china_rule",
    "risk_status",
    "page_status",
}
EVIDENCE_KEYS = {
    "remote_required",
    "timezone",
    "china_eligibility",
    "ai_trainer_china_rule",
    "risk",
    "page_validity",
}
REMOTE_REQUIRED = {"pass", "fail", "not_applicable"}
TIMEZONE = {"pass", "fail", "unclear"}
CHINA_ELIGIBILITY = {"explicit_yes", "explicit_no", "unclear"}
AI_TRAINER_RULE = {"pass", "fail", "not_applicable"}
RISK = {"pass", "fail", "unclear"}
PAGE_STATUS = {"valid", "closed", "wrong_page", "blocked"}
DECISIONS = {"reject", "keep", "keep_with_confirmation"}
AI_TRAINER_HINTS = ("trainer", "annot", "rater", "evaluator", "rlhf", "labeling")


def require_keys(mapping: dict[str, Any], required: set[str], label: str) -> list[str]:
    return [f"{label}: missing {key}" for key in sorted(required - set(mapping))]


def is_string_array(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def is_nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def detect_ai_trainer_family(card: dict[str, Any]) -> bool:
    identity = card.get("identity", {})
    title = str(identity.get("title", "")).casefold()
    return any(hint in title for hint in AI_TRAINER_HINTS)


def validate_card(card: dict[str, Any], index: int) -> list[str]:
    errors: list[str] = []
    label = f"card {index}"
    errors.extend(require_keys(card, REQUIRED_TOP_LEVEL, label))

    identity = card.get("identity")
    if not isinstance(identity, dict):
        errors.append(f"{label}: identity must be an object")
        identity = {}
    observed = card.get("observed_signals")
    if not isinstance(observed, dict):
        errors.append(f"{label}: observed_signals must be an object")
        observed = {}
    rule_checks = card.get("rule_checks")
    if not isinstance(rule_checks, dict):
        errors.append(f"{label}: rule_checks must be an object")
        rule_checks = {}
    evidence = card.get("evidence")
    if not isinstance(evidence, dict):
        errors.append(f"{label}: evidence must be an object")
        evidence = {}

    errors.extend(require_keys(identity, IDENTITY_KEYS, f"{label}.identity"))
    errors.extend(require_keys(observed, OBSERVED_SIGNAL_KEYS, f"{label}.observed_signals"))
    errors.extend(require_keys(rule_checks, RULE_CHECK_KEYS, f"{label}.rule_checks"))
    errors.extend(require_keys(evidence, EVIDENCE_KEYS, f"{label}.evidence"))

    for key in IDENTITY_KEYS:
        if key in identity and not is_nonempty_string(identity.get(key)):
            errors.append(f"{label}.identity.{key} must be a non-empty string")
    if "url" in identity and isinstance(identity.get("url"), str):
        url = str(identity["url"]).strip()
        if not (url.startswith("https://") or url.startswith("http://")):
            errors.append(f"{label}.identity.url must start with http(s)")

    for key in OBSERVED_SIGNAL_KEYS:
        if key in observed and not isinstance(observed.get(key), str):
            errors.append(f"{label}.observed_signals.{key} must be a string")

    enum_checks = {
        "remote_required_status": REMOTE_REQUIRED,
        "timezone_status": TIMEZONE,
        "china_eligibility_status": CHINA_ELIGIBILITY,
        "ai_trainer_china_rule": AI_TRAINER_RULE,
        "risk_status": RISK,
        "page_status": PAGE_STATUS,
    }
    for key, allowed in enum_checks.items():
        if key in rule_checks and rule_checks.get(key) not in allowed:
            errors.append(f"{label}.rule_checks.{key} must be one of {', '.join(sorted(allowed))}")

    for key in EVIDENCE_KEYS:
        if key not in evidence:
            continue
        if not is_string_array(evidence.get(key)):
            errors.append(f"{label}.evidence.{key} must be an array of strings")

    decision = card.get("decision")
    if decision not in DECISIONS:
        errors.append(f"{label}.decision must be one of {', '.join(sorted(DECISIONS))}")
    if not is_nonempty_string(card.get("decision_reason")):
        errors.append(f"{label}.decision_reason must be a non-empty string")

    def evidence_nonempty(key: str) -> bool:
        return key in evidence and is_string_array(evidence.get(key)) and any(str(item).strip() for item in evidence[key])

    if rule_checks.get("page_status") != "valid" and not evidence_nonempty("page_validity"):
        errors.append(f"{label}: non-valid page_status requires page_validity evidence")
    if rule_checks.get("china_eligibility_status") in {"explicit_yes", "explicit_no"} and not evidence_nonempty("china_eligibility"):
        errors.append(f"{label}: explicit china_eligibility_status requires china_eligibility evidence")
    if rule_checks.get("ai_trainer_china_rule") in {"pass", "fail"} and not evidence_nonempty("ai_trainer_china_rule"):
        errors.append(f"{label}: ai_trainer_china_rule requires evidence")
    if decision in {"keep", "keep_with_confirmation"} and not evidence_nonempty("page_validity"):
        errors.append(f"{label}: keep decisions require page_validity evidence")

    if rule_checks.get("page_status") != "valid" and decision != "reject":
        errors.append(f"{label}: non-valid page_status must reject")
    if rule_checks.get("remote_required_status") == "fail" and decision != "reject":
        errors.append(f"{label}: remote_required_status=fail must reject")
    if rule_checks.get("timezone_status") == "fail" and decision != "reject":
        errors.append(f"{label}: timezone_status=fail must reject")
    if rule_checks.get("china_eligibility_status") == "explicit_no" and decision != "reject":
        errors.append(f"{label}: china_eligibility_status=explicit_no must reject")
    if rule_checks.get("risk_status") == "fail" and decision != "reject":
        errors.append(f"{label}: risk_status=fail must reject")

    is_ai_trainer = detect_ai_trainer_family(card)
    if is_ai_trainer and rule_checks.get("ai_trainer_china_rule") != "pass":
        if decision != "reject":
            errors.append(f"{label}: AI Trainer family roles must reject unless ai_trainer_china_rule=pass")

    if decision == "keep":
        if rule_checks.get("page_status") != "valid":
            errors.append(f"{label}: keep requires page_status=valid")
        if rule_checks.get("timezone_status") in {"fail", "unclear"}:
            errors.append(f"{label}: keep cannot use timezone_status={rule_checks.get('timezone_status')}")
        if rule_checks.get("risk_status") != "pass":
            errors.append(f"{label}: keep requires risk_status=pass")
        if rule_checks.get("china_eligibility_status") == "explicit_no":
            errors.append(f"{label}: keep cannot use explicit_no china eligibility")
    if decision == "keep_with_confirmation":
        if rule_checks.get("page_status") != "valid":
            errors.append(f"{label}: keep_with_confirmation requires page_status=valid")
        if rule_checks.get("timezone_status") == "fail":
            errors.append(f"{label}: keep_with_confirmation cannot use timezone_status=fail")
        if rule_checks.get("china_eligibility_status") not in {"unclear", "explicit_yes"}:
            errors.append(f"{label}: keep_with_confirmation requires plausible China eligibility")
        if rule_checks.get("risk_status") == "fail":
            errors.append(f"{label}: keep_with_confirmation cannot use risk_status=fail")

    return errors


def load_cards(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict):
        return [raw]
    if isinstance(raw, list):
        if not all(isinstance(item, dict) for item in raw):
            raise ValueError("input list must contain JSON objects")
        return raw
    raise ValueError("input must be a JSON object or array of objects")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="JSON file containing one card or an array of cards")
    args = parser.parse_args()

    try:
        cards = load_cards(args.input)
    except Exception as exc:  # noqa: BLE001
        result = {"valid": False, "errors": [str(exc)], "warnings": [], "cards_checked": 0}
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    errors: list[str] = []
    for idx, card in enumerate(cards, 1):
        errors.extend(validate_card(card, idx))

    result = {"valid": not errors, "errors": errors, "warnings": [], "cards_checked": len(cards)}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
