# Candidate Review Card

## Purpose

Use a candidate review card between broad search and finalist selection. The card forces the agent to show evidence before making a keep/reject decision on China applicability, time-zone fit, and link validity.

This is a documentation contract for the next implementation. It is the source of truth for the intended intermediate schema and decision rules.

## Required JSON Shape

Each serious candidate must be represented as one JSON object:

```json
{
  "identity": {
    "title": "Customer Support Specialist",
    "company": "Example Co",
    "url": "https://example.com/jobs/123",
    "source": "Greenhouse"
  },
  "observed_signals": {
    "location_text": "Remote - APAC",
    "remote_text": "This role is fully remote",
    "timezone_text": "Must overlap with Singapore hours",
    "employment_text": "Contractor arrangement depends on local compliance",
    "language_text": "Fluent English required",
    "risk_text": "",
    "apply_path_text": "Apply for this job"
  },
  "rule_checks": {
    "remote_required_status": "pass",
    "timezone_status": "pass",
    "china_eligibility_status": "unclear",
    "ai_trainer_china_rule": "not_applicable",
    "risk_status": "pass",
    "page_status": "valid"
  },
  "evidence": {
    "remote_required": [
      "The page says the role is fully remote."
    ],
    "timezone": [
      "The listing requires overlap with Singapore hours."
    ],
    "china_eligibility": [
      "The page says APAC remote but does not list China explicitly."
    ],
    "ai_trainer_china_rule": [],
    "risk": [
      "The employer identity and apply path are visible."
    ],
    "page_validity": [
      "The page shows the role title, employer, and application button."
    ]
  },
  "decision": "keep_with_confirmation",
  "decision_reason": "APAC remote with visible apply path, but China contracting needs confirmation."
}
```

## Field Rules

### `identity`

- `title`: required, non-empty string
- `company`: required, non-empty string
- `url`: required, canonical finalist URL when known
- `source`: required, source family or hiring platform

### `observed_signals`

All fields are required string keys. Empty string is allowed only when the page truly provides no relevant signal.

- `location_text`
- `remote_text`
- `timezone_text`
- `employment_text`
- `language_text`
- `risk_text`
- `apply_path_text`

Use short factual excerpts or summaries tied to visible page content. Do not write broad conclusions here.

### `rule_checks`

Allowed enum values:

- `remote_required_status`: `pass`, `fail`, `not_applicable`
- `timezone_status`: `pass`, `fail`, `unclear`
- `china_eligibility_status`: `explicit_yes`, `explicit_no`, `unclear`
- `ai_trainer_china_rule`: `pass`, `fail`, `not_applicable`
- `risk_status`: `pass`, `fail`, `unclear`
- `page_status`: `valid`, `closed`, `wrong_page`, `blocked`

### `evidence`

Every key is required and maps to an array of short strings:

- `remote_required`
- `timezone`
- `china_eligibility`
- `ai_trainer_china_rule`
- `risk`
- `page_validity`

Rules:

- Any non-`not_applicable` or non-`valid` judgment must have at least one supporting evidence string.
- `keep` and `keep_with_confirmation` require non-empty evidence for `page_validity`.
- `china_eligibility_status = explicit_yes` or `explicit_no` requires non-empty `china_eligibility` evidence.
- `ai_trainer_china_rule = pass` or `fail` requires non-empty `ai_trainer_china_rule` evidence.

### `decision`

- `reject`
- `keep`
- `keep_with_confirmation`

### `decision_reason`

- Required, non-empty string
- One short sentence
- Must explain the main factor behind the decision
- Must not replace the evidence fields

## Decision Rules

Apply these rules in order:

1. If `page_status != valid`, decision must be `reject`.
2. If `remote_required_status = fail`, decision must be `reject`.
3. If `timezone_status = fail`, decision must be `reject`.
4. If `china_eligibility_status = explicit_no`, decision must be `reject`.
5. If the role is AI Trainer / annotation / evaluator / rater / language-model training and `ai_trainer_china_rule != pass`, decision must be `reject`.
6. If `risk_status = fail`, decision must be `reject`.
7. `keep_with_confirmation` is allowed only when:
   - `page_status = valid`
   - `timezone_status != fail`
   - `china_eligibility_status = unclear` or employment structure remains unclear
   - there is no explicit exclusion signal
8. `keep` is allowed only when:
   - the page is valid
   - remote/time-zone/risk checks pass
   - China eligibility is explicit enough for the chosen public label

## Model Behavior Rules

- Do not skip the card for “obvious” candidates.
- Do not write a free-form review paragraph instead of the card.
- Do not use language ability as a substitute for China eligibility.
- When evidence is weak, prefer `reject` or `keep_with_confirmation`, never optimistic guessing.

## Boundary Examples

### Example 1: APAC remote, China contract unclear

- `timezone_status`: `pass`
- `china_eligibility_status`: `unclear`
- `decision`: `keep_with_confirmation`

Reason: APAC collaboration is clear, but China contracting is not.

### Example 2: US-only remote support role

- `remote_required_status`: `pass`
- `timezone_status`: `fail` or `china_eligibility_status`: `explicit_no`
- `decision`: `reject`

Reason: remote alone is not enough if the region excludes China or the hours are incompatible.

### Example 3: Mandarin AI Trainer, no China hiring evidence

- `ai_trainer_china_rule`: `fail`
- `decision`: `reject`

Reason: language signal is not China eligibility.

### Example 4: Foreign company role in Shanghai office

- `remote_required_status`: `not_applicable`
- `timezone_status`: `pass`
- `china_eligibility_status`: `explicit_yes`
- `decision`: `keep`

Reason: this is a foreign-company China role, not an overseas remote role.

### Example 5: APAC remote role with “Singapore, Hong Kong, Australia” only

- `china_eligibility_status`: `unclear` or `explicit_no`
- `decision`: usually `reject` unless the page clearly leaves room for China-based contracting

Reason: nearby APAC countries do not automatically imply mainland China eligibility.

### Example 6: Role page is a careers list, not a job detail page

- `page_status`: `wrong_page`
- `decision`: `reject`

Reason: valid company identity does not save a non-specific page.

### Example 7: SmartRecruiters page with visible role but no visible apply path

- `page_status`: `valid`
- `risk_status`: `unclear` or `fail`
- `decision`: `reject`

Reason: the page must expose a normal reader-visible application path.

### Example 8: Global remote contractor, no country exclusion, flexible hours

- `timezone_status`: `pass`
- `china_eligibility_status`: `unclear`
- `decision`: `keep_with_confirmation`

Reason: plausible for China-based applicants, but contracting/tax still needs applicant-side confirmation.
