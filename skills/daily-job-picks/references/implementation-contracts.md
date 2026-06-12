# Implementation Contracts

## Purpose

This document defines the intended interfaces for the next round of script changes. It does not describe code structure. It locks the inputs, outputs, and failure behavior so later implementation does not drift.

## `validate_candidate_review.py`

### Role

Validate candidate review card JSON objects before they are allowed into finalist review.

### Input

- File path argument to a JSON file
- Accept either:
  - one JSON object
  - one JSON array of objects

### Output

JSON object:

```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "cards_checked": 3
}
```

### Validation Scope

- Required top-level keys exist
- Enum values are legal
- Required evidence arrays are present
- Decision is consistent with the documented rules in `candidate-review-card.md`

### Failure Conditions

- Missing required key
- Illegal enum value
- Empty required evidence
- `keep` or `keep_with_confirmation` with invalid `page_status`
- AI Trainer family role without a passing China rule
- Any reject-required condition paired with `keep` or `keep_with_confirmation`

## `parse_audience_preferences.py`

### Role

Parse `job-picks-audience-preferences.md` into structured JSON without relying on model interpretation.

### Input

- File path argument to the Markdown file

### Output

```json
{
  "valid": true,
  "errors": [],
  "warnings": [],
  "preferences": {
    "target_count": 8,
    "job_direction_priority": ["客服", "运营"],
    "work_mode_priority": ["中国本地办公", "APAC 远程"],
    "english_preference": "双语优先",
    "seniority_preference": "1-3 年优先",
    "barrier_preference": "低到中优先",
    "explicit_exclusions": [
      {"type": "行业", "value": "高风险加密货币"}
    ]
  }
}
```

### Behavior

- Missing file: valid result with empty preferences
- Missing field: ignore silently
- Unknown heading or prose block: warning
- Illegal value in known field: warning and ignore that field or item

### Failure Conditions

- File unreadable
- Encoding failure
- Structural corruption severe enough that no deterministic parse is possible

## Planned `link_check.py` Additions

The next implementation should preserve current behavior and add these output keys when available:

- `title_match`: boolean
- `company_match`: boolean
- `apply_text_found`: boolean
- `bad_marker_hit`: string or empty string
- `final_url_changed`: boolean
- `suspected_page_type`: `job_detail`, `list`, `homepage`, `login`, `blocked`, `unknown`

The script remains a first-pass gate, not the full reader-facing final decision.

## Planned `format_daily_picks.py` Additions

The formatter should add validation for:

- `china_applicability = 待确认` requires a practical applicant-facing note
- obvious invalid enum combinations such as:
  - `海外远程岗位` + `中国本地办公`
  - `AI Trainer` + `china_applicability = 高` without explicit China evidence upstream
- rubric-driven note expectations for `申请门槛` and `中国可投把握`

The formatter should still avoid hidden semantic inference beyond obvious conflicts.

## Planned `validate_report.py` Relationship

`validate_report.py` remains a post-render regression gate.

It should:

- keep checking duplicate sections, required labels, and forbidden public wording
- continue calling `link_check.py` when asked
- stay compatible with the rubric-driven output format

It should not become the primary place where candidate-review logic lives.

## Compatibility Rules

- Existing scripts remain valid until implemented replacements land.
- New validators should fail closed on high-risk inconsistencies.
- Public Markdown output format remains backward-compatible unless explicitly revised in `SKILL.md`.
