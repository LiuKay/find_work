# Next-Step Improvements

## Purpose

This document records the remaining gaps discovered after the first implementation pass and the second-round screening test.

It is not a new workflow spec. It is a constrained follow-up design so the next implementation round can focus on the highest-leverage gaps without reopening earlier decisions.

## Current Status

The local skill now has:

- documented candidate review cards
- documented classification and link-review rubrics
- parser support for structured audience preferences
- validator support for candidate review cards
- tighter final JSON and Markdown validation

The remaining issues are no longer about free-form judgment first. They are mainly about candidate coverage and deterministic execution consistency.

## Priority 1: Expand Public Roundup Query Coverage

### Problem

`resolve_search_plan.py` no longer returns empty public-mode queries, but its current query expansion still overweights the first matched profile family in practice.

Observed result in the second-round test:

- the public mode recovered from zero candidates
- the generated queries still clustered around `customer support` and `customer success`
- other enabled role profiles did not receive equivalent query expansion effort

This means the workflow can still underperform even with a stronger model, because the upstream candidate pool is structurally narrow.

### Goal

Public roundup mode must generate a visibly multi-profile candidate pool before model judgment starts.

### Design Direction

1. Treat every enabled public-roundup profile as a first-class search contributor.
2. Build queries per profile, not from one flattened keyword list only.
3. Preserve profile identity through the search plan so downstream ranking can measure coverage by direction.
4. Add a soft coverage target per public run, for example:
   - support / ops lane
   - content / localization lane
   - data / QA / AI lane
   - technical lane
   - product / project lane
   - sales / HR / supply lane
5. Allow audience preferences to rebalance lane effort, but not collapse public mode into a single lane unless the user explicitly asks for a targeted run.

### Implementation Target

The next implementation round should update `resolve_search_plan.py` and, if needed, `sources/job-search-config.toml` contracts so the emitted plan includes:

- `profile_id`
- `profile_label`
- `profile_keywords`
- `lane_queries`
- optional `lane_priority`

### Acceptance Criteria

- public mode emits non-empty queries for multiple enabled profiles
- the emitted plan makes profile-to-query mapping explicit
- downstream screening can explain which profile lane produced each candidate

## Priority 2: Unify Network Execution Contracts

### Problem

The second-round test exposed inconsistent runtime behavior:

- `link_check.py` could pass when run directly
- `ats_extract.py` could still fail on DNS/network access in the same overall workflow
- `validate_report.py --check-links` could fail under restricted execution even when the underlying links were valid

This is not a model-quality problem. It is an execution-contract problem.

### Goal

All scripts used in the finalist gate must have one consistent rule for how live network checks are performed and how failures are surfaced.

### Design Direction

1. Define one shared fetch layer for ATS/detail-page retrieval.
2. Stop letting each script invent its own network path and fallback behavior.
3. Separate these two cases clearly:
   - logical validation failure
   - execution-environment/network failure
4. Return structured failure categories so the workflow knows whether to:
   - reject the job
   - retry with approved network access
   - continue with a documented manual fallback
5. Keep applicant-facing output free of these mechanics.

### Implementation Target

The next implementation round should either:

1. factor shared fetch logic into a reusable module used by `link_check.py`, `ats_extract.py`, and `validate_report.py`, or
2. define one script as the single network authority and make the others call it through a stable internal interface

The contract should normalize:

- timeout handling
- redirects
- user-agent behavior
- error taxonomy
- retry rules
- “network unavailable” versus “job invalid”

### Acceptance Criteria

- the same finalist URL should not pass in one step and fail in another purely because different scripts fetch differently
- `validate_report.py --check-links` should distinguish network-unavailable from bad-link rejection
- `ats_extract.py` should not be the odd script out for ATS pages

## Priority 3: Reduce Manual Recovery Inside Step 15

### Problem

Step 15 still falls back to manual interpretation too often when extraction disagrees, network access differs, or ATS metadata is incomplete.

### Goal

Keep human/model review for final reading, but remove avoidable manual recovery caused by inconsistent machine prechecks.

### Design Direction

1. Make ATS extraction output explicitly advisory:
   - `matched`
   - `mismatch`
   - `network_unavailable`
   - `insufficient_fields`
2. Require manual resolution only for real content ambiguity, not transport inconsistency.
3. Add clearer mismatch reasons:
   - title mismatch
   - company mismatch
   - location mismatch
   - redirect-to-list
   - expired/closed marker

### Acceptance Criteria

- step 15 manual review happens because the job is ambiguous, not because the scripts disagree about transport
- mismatch reasons are script-readable and can be logged without free-form interpretation

## Priority 4: Preserve Test Findings as Product Constraints

The second-round test already produced useful constraints that should remain true:

- remote region restrictions like `LATAM/Europe` must be rejected upstream for China-based screening
- local China office roles should pass with lower model dependence when location evidence is explicit
- AI Trainer and similar language-only roles still need stronger China evidence than ordinary remote roles
- search quality and screening quality should be evaluated separately

These constraints should continue to guide future implementation decisions.

## Non-Goals For The Next Round

- no redesign of final Markdown output
- no expansion into a database-backed workflow
- no attempt to solve search-engine discoverability generically
- no weakening of the existing structured review-card and rubric model

## Recommended Next Implementation Order

1. Expand public-mode query generation by profile lane.
2. Unify network fetch behavior across finalist-gate scripts.
3. Tighten ATS extraction result categories and mismatch reporting.
4. Re-run the same second-round screening test as a regression check.
