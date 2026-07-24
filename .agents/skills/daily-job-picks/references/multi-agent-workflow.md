# Multi-Agent Workflow

Use this workflow when a subagent tool is available and the user asks for a default public roundup, broad multi-category coverage, or more than one role family. Do not use it for a narrow 1-3 role targeted run unless the user explicitly asks for parallel search.

If no subagent tool is available, run the same lanes sequentially in the main agent and keep the same candidate-table discipline.

## Roles

- Main agent: dispatcher, deduper, final screener, final writer, final link validator.
- Child agents: candidate finders only. They do not write final Markdown files and do not update `seen-jobs.tsv`.

## Dispatch Pattern

Split the search into independent lanes. Assign each child agent one lane with a hard output schema:

- Lane A: customer support, customer success, trust and safety, operations.
- Lane B: content, localization, translation, writing, marketing operations.
- Lane C: data, QA, AI trainer, annotation, product operations.
- Lane D: technical support, implementation, solutions, developer-adjacent roles.
- Lane E: flexible contractor, part-time, internship, HR, sales, supply chain, or role categories underrepresented by the user's audience.

For targeted searches, split by source family instead of category:

- Company career pages and ATS pages.
- Remote job boards such as Remote.co, We Work Remotely, RemoteOK, Himalayas, Remote.com.
- APAC/China regional searches.

## Main Agent Setup Before Dispatch

Before spawning children, the main agent must:

1. Run `scripts/seen_jobs.py ensure` and `scripts/seen_jobs.py snapshot --format json` to read `seen-jobs.tsv` and existing Markdown files.
2. Run `scripts/bad_links.py ensure` and `scripts/bad_links.py snapshot` to read user-reported bad links.
3. Build a compact dedupe and bad-link snapshot containing existing `company | title | url` rows.
4. Pass those snapshots to every child agent. Do not assume child agents can or should read local files.
5. Assign disjoint lanes so children do not duplicate the same source/category search.
6. Continue useful local work while children run, such as checking current files, preparing output paths, or searching one lane not assigned to children.

When a multi-agent tool exists, spawn one child per lane that is worth searching. Use concise prompts and ask for candidate tables only. Wait for child results only when candidate integration is the next blocking step.

## Child Agent Prompt Requirements

Give each child agent:

- The user request and date.
- The lane it owns.
- The compact dedupe snapshot from the main agent.
- The deduplication rule: reject exact URLs and same company plus title already present in the dedupe snapshot.
- The bad-link rule: reject exact URLs and same company plus title already present in the bad-link snapshot unless a working replacement employer/ATS URL is found.
- The hard filters from `search-and-screening.md`.
- A target of 6-12 raw candidates, knowing the main agent may select fewer.
- A requirement to prefer company career or ATS URLs over job-board summaries.

Require each child agent to return only a candidate table:

```text
title | company | url | source | location/remote | direction | language | experience | why it fits | risks/questions
```

Child agents must not present final recommendations to the user and must not use public-facing fields such as `链接核验`.

## Main Agent Integration

The main agent must:

1. Merge all child candidate tables.
2. Remove duplicates by URL, company plus title, and obvious reposts.
3. Run `scripts/seen_jobs.py check --title ... --company ... --url ...` and `scripts/bad_links.py check --title ... --company ... --url ...` for promising finalists; remove jobs already seen or reported bad.
4. Reject candidates that are weak on China eligibility, time zone, company identity, or application path.
5. Use `scripts/ats_extract.py` on ATS/company career finalists when shell network access is available to catch title/company/location mismatches.
6. Run `scripts/link_check.py` as a basic first-pass URL check when shell network access is available, then open the finalist links directly and run the reader-usability pass in `search-and-screening.md`; never delegate this final pass completely to children or to the script.
7. Select the strongest 6-10 jobs for public mode, or fewer if quality is insufficient.
8. Create final jobs JSON, render it with `scripts/format_daily_picks.py`, validate the rendered Markdown with `scripts/validate_report.py`, and append accepted jobs with `scripts/seen_jobs.py append`.

## Failure Handling

- If a child agent returns mostly weak or duplicate roles, ignore that lane and search locally for replacements.
- If several candidates come from the same company or platform, keep only the strongest unless the user asked for a narrowly focused list.
- If final validation fails for a link that looked valid in a child result, reject it rather than explaining the mismatch in the final output.
- If the user reports a selected link opens to a 404, closed, removed, login/paywall, or empty page in a normal browser, treat it as unavailable for the roundup and replace it.
