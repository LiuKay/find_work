# Migration Plan

## Goal

Move the skill from free-form model-heavy screening toward a structured, single-model-first workflow without breaking current daily output conventions.

## Sequence

1. Add the candidate review card documentation and classification rubric.
2. Add the validator and parser scripts defined in `implementation-contracts.md`.
3. Update `SKILL.md` workflow so the structured intermediates become mandatory.
4. Update project-level audience preferences and final link review usage to follow the new templates and checklists.

## Why This Order

- The review card and rubric define the semantics first.
- The scripts then enforce those semantics.
- The main workflow should only require a structure after that structure is documented and implementable.
- Audience preferences and final link review are safer to tighten after the higher-risk screening logic is already constrained.

## Compatibility

The following existing artifacts remain compatible:

- `sources/job-search-config.toml`
- `seen-jobs.tsv`
- `bad-links.tsv`
- final Markdown file naming and title rules
- final jobs JSON top-level shape currently used by `format_daily_picks.py`

## New Requirements

The following are new required concepts for the next implementation:

- candidate review card before finalist review
- fixed enum-based link review checklist
- rubric-driven classification for final labels
- parser-friendly audience preferences Markdown

## Document-First Period

During the documentation-only stage:

- some steps are specified here but not yet enforced by scripts
- the agent should still prefer the documented structure when possible
- conservative rejection is better than improvised optimism

## Next Follow-Up After This Phase

The first implementation pass and second-round screening test surfaced a smaller second phase that should be treated as follow-up hardening, not a redesign.

That follow-up is documented in:

- `next-step-improvements.md`

The main remaining concerns are:

- public-mode query generation still needs full multi-profile coverage
- finalist-gate scripts still need one unified live-network execution contract
- ATS extraction mismatch reporting still needs more structured categories

## Non-Goals During Migration

- no new service
- no database migration
- no rewrite of the final Markdown format
- no assumption that stronger models will be added later

## Implementation Acceptance

Migration is complete only when:

- candidate review cards can be validated automatically
- audience preferences can be parsed without model interpretation
- final link review is checklist-based
- final classification is checked against rubric-driven constraints
- `SKILL.md` and the scripts no longer disagree about the intended workflow
