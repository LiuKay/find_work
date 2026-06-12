# Daily Job Picks Usage

## Purpose

This document explains how to use the project-local `daily-job-picks` skill after the new documentation and script upgrades in `skills/daily-job-picks/`.

It focuses on actual project usage:

- where the local skill lives
- which scripts to run
- what order to run them in
- what intermediate artifacts now exist

It does not replace the implementation references inside `skills/daily-job-picks/references/`.

## Local Skill Location

Use the project-local skill, not the global one:

- Skill root: [skills/daily-job-picks](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks)
- Main spec: [skills/daily-job-picks/SKILL.md](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/SKILL.md)

When working inside this repository, treat the files under `skills/daily-job-picks/` as the source of truth for the local workflow.

## What Changed

The local skill now has a stricter workflow around three areas:

1. Candidate screening can be documented as a structured `candidate review card`.
2. Audience preferences can be parsed from a fixed Markdown template.
3. Final link checks and final output validation now have tighter, more structured checks.

New project-local references:

- [candidate-review-card.md](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/references/candidate-review-card.md)
- [classification-rubric.md](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/references/classification-rubric.md)
- [final-link-review-checklist.md](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/references/final-link-review-checklist.md)
- [audience-preferences-template.md](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/references/audience-preferences-template.md)
- [implementation-contracts.md](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/references/implementation-contracts.md)
- [migration-plan.md](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/references/migration-plan.md)

New project-local scripts:

- [parse_audience_preferences.py](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/scripts/parse_audience_preferences.py)
- [validate_candidate_review.py](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/scripts/validate_candidate_review.py)

Updated project-local scripts:

- [link_check.py](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/scripts/link_check.py)
- [format_daily_picks.py](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/scripts/format_daily_picks.py)
- [validate_report.py](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/scripts/validate_report.py)

## Recommended Workflow

Use this order when running a real job-picks session.

### 1. Validate the source config

```bash
python3 skills/daily-job-picks/scripts/validate_source_config.py --summary
```

If this fails, stop and fix `sources/job-search-config.toml` first.

### 2. Parse audience preferences if the file exists

```bash
python3 skills/daily-job-picks/scripts/parse_audience_preferences.py \
  config/job-picks-audience-preferences.md
```

Use the fixed template from:

- [audience-preferences-template.md](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/references/audience-preferences-template.md)

If the file does not exist, that is valid. The parser returns an empty preferences object.

### 3. Resolve the search plan

```bash
python3 skills/daily-job-picks/scripts/resolve_search_plan.py \
  --mode 定向精选 \
  --role "customer support" \
  --industry "SaaS"
```

This gives you:

- matched profiles
- source lanes
- search queries
- basic screening rules from the local TOML config

### 4. Initialize dedupe and bad-link state

```bash
python3 skills/daily-job-picks/scripts/seen_jobs.py ensure
python3 skills/daily-job-picks/scripts/bad_links.py ensure
python3 skills/daily-job-picks/scripts/seen_jobs.py snapshot --format json
python3 skills/daily-job-picks/scripts/bad_links.py snapshot
```

### 5. Search and build a candidate pool

Search live sources using the resolved queries. Before spending deeper review time on a candidate:

```bash
python3 skills/daily-job-picks/scripts/seen_jobs.py check \
  --title "Customer Support Specialist" \
  --company "Example Co" \
  --url "https://example.com/jobs/123"

python3 skills/daily-job-picks/scripts/bad_links.py check \
  --title "Customer Support Specialist" \
  --company "Example Co" \
  --url "https://example.com/jobs/123"
```

### 6. Write candidate review cards for serious candidates

Before pushing candidates into finalists, structure them according to:

- [candidate-review-card.md](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/references/candidate-review-card.md)

Save one object or an array of objects to JSON, then validate:

```bash
python3 skills/daily-job-picks/scripts/validate_candidate_review.py \
  /path/to/candidate-review.json
```

If validation fails, do not continue with that candidate until the inconsistency is fixed.

### 7. Run ATS extraction and first-pass link checks on finalists

For ATS and career-site finalists:

```bash
python3 skills/daily-job-picks/scripts/ats_extract.py \
  "https://example.com/jobs/123"
```

Then run the first-pass link checker:

```bash
python3 skills/daily-job-picks/scripts/link_check.py \
  --url "https://example.com/jobs/123" \
  --title "Customer Support Specialist" \
  --company "Example Co"
```

The updated `link_check.py` now returns more structure, including:

- `title_match`
- `company_match`
- `apply_text_found`
- `bad_marker_hit`
- `final_url_changed`
- `suspected_page_type`

Use that as the machine gate, not as the final reader-facing verdict.

### 8. Run the final reader-facing link checklist

After `link_check.py` passes, review finalists using:

- [final-link-review-checklist.md](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/references/final-link-review-checklist.md)

This is still a human/model reading step, but it is no longer supposed to be free-form.

### 9. Produce final jobs JSON using the rubric

Use:

- [classification-rubric.md](/Users/kaybee/Documents/github/find_work/skills/daily-job-picks/references/classification-rubric.md)

Build the final jobs JSON with the normalized labels and required notes.

### 10. Render Markdown

```bash
python3 skills/daily-job-picks/scripts/format_daily_picks.py \
  --input /path/to/final-jobs.json \
  --date 2026-06-12 \
  --mode 定向精选 \
  --target "客服"
```

The updated formatter now enforces stricter rules, including:

- valid enums for `岗位归类`, `岗位方向`, `工作方式`
- required `application_barrier_note`
- required `china_applicability_note`
- stronger checks for `待确认`
- stronger checks for `AI Trainer` China-applicability claims

### 11. Validate the rendered report

```bash
python3 skills/daily-job-picks/scripts/validate_report.py \
  /path/to/report.md
```

If network is available, use:

```bash
python3 skills/daily-job-picks/scripts/validate_report.py \
  /path/to/report.md \
  --check-links
```

The updated report validator will now preserve more actionable link-failure reasons from `link_check.py`.

### 12. Append accepted jobs to the seen index

```bash
python3 skills/daily-job-picks/scripts/seen_jobs.py append \
  --date 2026-06-12 \
  --title "Customer Support Specialist" \
  --company "Example Co" \
  --url "https://example.com/jobs/123" \
  --job-direction "客服" \
  --source "Greenhouse"
```

## Minimal Command Set

If you only want the shortest practical sequence:

```bash
python3 skills/daily-job-picks/scripts/validate_source_config.py --summary
python3 skills/daily-job-picks/scripts/parse_audience_preferences.py config/job-picks-audience-preferences.md
python3 skills/daily-job-picks/scripts/resolve_search_plan.py --mode 定向精选 --role "customer support"
python3 skills/daily-job-picks/scripts/validate_candidate_review.py /path/to/candidate-review.json
python3 skills/daily-job-picks/scripts/link_check.py --url "https://example.com/jobs/123" --title "Customer Support Specialist" --company "Example Co"
python3 skills/daily-job-picks/scripts/format_daily_picks.py --input /path/to/final-jobs.json --date 2026-06-12 --mode 定向精选 --target "客服"
python3 skills/daily-job-picks/scripts/validate_report.py /path/to/report.md --check-links
```

## Notes

- This repository now has a project-local `daily-job-picks` path that may intentionally differ from the global `~/.codex/skills` version.
- The stricter local scripts are meant to reduce dependence on a stronger model, not eliminate judgment entirely.
- If evidence is weak, prefer rejection or `keep_with_confirmation` over optimistic inclusion.
