---
name: daily-job-picks
description: Find and curate daily high-quality foreign-company China roles and overseas remote roles for China-based applicants, including public multi-category daily roundups and targeted searches for a specific role profile. Use when the user asks for daily job picks, China-applicable foreign company jobs, APAC/Asia remote jobs, overseas remote jobs compatible with China time zones, group-friendly job newsletters, curated job leads with deduplication by date, or parallel multi-agent job-search workflows.
---

# Daily Job Picks

## Purpose

Curate a daily list of high-quality jobs that China-based applicants can realistically apply to. Support both public multi-category roundups for friends from different backgrounds and targeted searches for a specific role profile. Prioritize quality over quantity, avoid repeats from previous daily picks, and output date-stamped Markdown records in the current project.

This skill is source-driven. Editable source groups, role profiles, screening rules, link rules, and output defaults live in `sources/job-search-config.toml`. `SKILL.md` defines the workflow and non-negotiable safety constraints; the TOML file defines the normal search and screening inputs.

Do not assume a personal default job profile. In targeted mode, the user must provide role keywords, industry, seniority, or other search parameters, or match an enabled role profile from `sources/job-search-config.toml`. In public roundup mode, use enabled role profiles from the TOML source as the coverage pool.

## Files

- Write public daily roundups to `/Users/kaybee/Documents/github/find_work/job-picks/YYYY-MM-DD.md`.
- Write targeted runs to `/Users/kaybee/Documents/github/find_work/job-picks/YYYY-MM-DD-<topic>.md`, where `<topic>` is a short hyphen-case or Chinese-safe label from the requested role or industry.
- Create `/Users/kaybee/Documents/github/find_work/job-picks/` if it does not exist.
- New public roundup files must use the top-level title `# YYYY-MM-DD 外企/海外远程岗位精选`.
- New targeted files must use a distinct top-level title, preferably `# YYYY-MM-DD <目标岗位/方向> 岗位专选`, so multiple runs on the same day are distinguishable in file lists and previews.
- If writing to an existing date file, append a new `## <run label>` section under the existing date file instead of repeating the top-level `# YYYY-MM-DD ...` title. Use labels such as `默认公共精选`, `低英文门槛精选`, or the user's requested role/topic.
- Maintain `/Users/kaybee/Documents/github/find_work/job-picks/seen-jobs.tsv` as a lightweight deduplication index with columns: `date`, `title`, `company`, `url`, `job_direction`, `source`.
- Before selecting jobs, scan both `seen-jobs.tsv` and existing Markdown files in `/Users/kaybee/Documents/github/find_work/job-picks/` and exclude any job whose company plus title or job URL already appeared.
- If the user asks for a different output path, follow the user path and still use date-named Markdown files unless told otherwise.
- Treat `sources/job-search-config.toml` as the editable source of truth for normal source lists, role profiles, screening preferences, and output defaults.

## Source Configuration

- Always read and validate `sources/job-search-config.toml` before searching.
- Use `scripts/validate_source_config.py` to validate the TOML source. Stop and report the configuration errors if validation fails.
- Configuration precedence is: user input for the current run > `sources/job-search-config.toml` > non-negotiable safety constraints in this `SKILL.md`.
- User input may override target roles, industry, seniority, language constraints, excluded industries, and count for the current run. Do not write those temporary overrides back to the TOML file unless the user explicitly asks to update the source.
- Public roundup mode must use enabled `role_profiles` from the TOML source for coverage. Do not require every profile every day; use them to build the candidate pool and keep quality high.
- Targeted mode must first try to match the user's requested role/industry against enabled `role_profiles` by `id`, `label`, `keywords`, or `directions`. If no profile matches, use the user's words as temporary role keywords for that run.
- Use enabled `source_groups` from the TOML source as the primary search lanes. Do not use disabled source groups.
- `trust_level = "A"` sources are preferred for final links. `trust_level = "B"` sources can be final links only when they are public, specific, active job pages. `trust_level = "C"` sources are discovery-only when `avoid_as_final_link = true`; find a canonical employer or ATS URL before selecting the job.
- `references/search-and-screening.md` is explanatory reference material. Use it to interpret edge cases, but do not treat it as the primary editable source list.

## Scripts

Use bundled scripts for deterministic bookkeeping and output. Run them from the skill folder or pass absolute paths.

- `scripts/seen_jobs.py`: create/read/update `seen-jobs.tsv`, normalize URLs, and check duplicates against TSV plus prior Markdown files.
- `scripts/bad_links.py`: create/read/update `bad-links.tsv` and avoid links or company-title pairs that users reported as broken, closed, paywalled, or not publicly useful.
- `scripts/ats_extract.py`: extract basic public fields from common ATS/job-detail pages to reduce title/company/link mistakes. Use this as an aid, not as the final truth.
- `scripts/link_check.py`: run basic reader-facing URL checks. Use it as a first-pass filter; still open finalist links directly before final output.
- `scripts/format_daily_picks.py`: validate final structured jobs and render the required Markdown format.
- `scripts/validate_report.py`: validate the rendered Markdown report for required fields, link format, count consistency, duplicate sections, and forbidden internal wording.
- `scripts/validate_source_config.py`: validate `sources/job-search-config.toml` using Python standard-library `tomllib`; requires Python 3.11+ and no third-party package.

These scripts do not decide whether a job is good or China-applicable. The agent still owns source search, JD interpretation, risk judgment, time-zone judgment, and final selection.

## Modes

- Public roundup mode: Use when the user asks for a daily selection for friends, a group, a newsletter, or people from multiple industries. Cover several job directions so readers can self-pick.
- Targeted mode: Use when the user specifies a role, industry, seniority, or personal profile. Optimize for that request instead of broad coverage.

## Workflow

1. Confirm the run date using the current date from the environment. Use that date in the output filename and final note.
2. Identify the mode. If the user did not specify a mode, infer public roundup mode for group/friend/newsletter wording and targeted mode for role/profile wording.
3. Run `scripts/validate_source_config.py`. If it fails, stop before searching and report the TOML configuration errors.
4. Load `sources/job-search-config.toml` and parse enabled `source_groups`, enabled `role_profiles`, `screening_rules`, `link_rules`, and `output_defaults`. Also load `references/search-and-screening.md` only as explanatory reference for edge cases.
5. Parse the user's current parameters: role, industry, seniority, skill constraints, language requirements, excluded industries, requested count, and whether broad public coverage is desired.
6. Resolve the search plan from user input plus TOML:
   - Public roundup mode: use enabled TOML role profiles as the coverage pool and use TOML count defaults unless the user specified a count.
   - Targeted mode: match user input to enabled TOML role profiles. If no profile matches, use the user input as temporary keywords for this run.
   - Build search queries from enabled TOML source groups and their `search_templates`, replacing `{role}` with role/profile keywords.
7. Run `scripts/seen_jobs.py ensure` and `scripts/bad_links.py ensure`, then run `scripts/seen_jobs.py snapshot --format json` plus `scripts/bad_links.py snapshot`. Keep a compact dedupe and bad-link snapshot for this run.
8. If subagents are available and the requested search is broad, use the dispatcher workflow in `references/multi-agent-workflow.md`: the main agent assigns distinct source/category lanes to child agents, then owns deduplication, final screening, writing, and final link validation. If subagents are unavailable or the request is narrow, run the same lanes sequentially.
9. Search live job sources. Because job listings change frequently, always browse the web for current listings. Use enabled TOML source groups as the search lanes and do not use disabled source groups.
10. Build a candidate pool larger than the requested count. For each promising candidate, run `scripts/seen_jobs.py check --title ... --company ... --url ...` and `scripts/bad_links.py check --title ... --company ... --url ...`; remove duplicates and previously reported bad links before spending more review time.
11. Reject jobs that fail the hard rules:
   - Overseas jobs must be remote.
   - Do not select roles with China time-zone incompatibility over 5 hours unless the user explicitly requested them.
   - Do not select obvious scams, gray-market roles, high-risk crypto projects, gambling, adult industry, paid-to-apply jobs, brush-order work, pure pyramid/referral schemes, or vague high-pay roles with unclear company identity.
   - Do not select platform homepages, search pages, company job-board landing pages, category pages, expired pages, or pages that do not show the selected role.
12. Apply TOML `screening_rules` and `link_rules` as practical screening inputs, but never use TOML to weaken the hard rules above.
13. For Greenhouse, Lever, Ashby, Workable, SmartRecruiters, and company career URLs, run `scripts/ats_extract.py <url>` when shell network access is available. Use extracted title/company/location as a consistency check; if it disagrees with the candidate, open the page and resolve the mismatch before proceeding.
14. **MANDATORY link check — do not skip, do not proceed to step 15 until complete.** Run `scripts/link_check.py --url <url> --title <title> --company <company>` for every finalist URL one by one. Any URL that returns `"ok_basic": false`, an HTTP error, or a bad-page marker must be dropped and replaced before continuing. After the script passes, also open each finalist URL directly and run the final reader-usability pass from `references/search-and-screening.md`; replace or reject any job whose link cannot be verified. Record every dropped link via `scripts/bad_links.py append` before searching for a replacement. This verification is internal; do not include a `链接核验` field or mention scraping, crawling, rendering, parser behavior, ATS quirks, or verification mechanics in the public output.
15. Classify and summarize each selected job into the structured JSON schema below. Only jobs that passed step 14 may appear here.
16. Run `scripts/format_daily_picks.py --input <final-jobs.json> ...` to validate required fields and render Markdown. For targeted runs, pass `--mode 定向精选 --target "<用户请求的目标岗位/方向>"`; the renderer will automatically produce a `岗位专选` title unless `--title` is provided. Fix any validation errors before writing final output.
17. Save or append the rendered Markdown to the appropriate file, then run `scripts/validate_report.py <report.md> --check-links` whenever shell network access is available. Fix validation errors before responding. If shell network is unavailable, run `scripts/link_check.py` on every final URL separately as soon as access is available; do not rely on Markdown-only validation.
18. For each accepted job, run `scripts/seen_jobs.py append --date ... --title ... --company ... --url ... --job-direction ... --source ...`. Also provide the same content in the response unless the user only asked to save it.

If the user reports a broken, closed, login-gated, paywalled, wrong-job, or unavailable link from a previous report, run `scripts/bad_links.py append --date ... --url ... --title ... --company ... --reason ...` before finding a replacement. Treat that report as decisive for future public usefulness.

## Quality Bar

Prefer 6-10 strong jobs for public roundup mode and 5-8 strong jobs for targeted mode. Return fewer if not enough high-quality, current, non-duplicate jobs meet all rules. Do not pad with weak matches.

Use direct evidence from the job page for location, remote status, company, time-zone feasibility, role requirements, and application path. If a field is unclear but the role is otherwise promising, label it as `中国可投待确认` and state what the applicant should confirm, using applicant-facing wording such as `投递前确认中国大陆雇佣/合同形式`. Do not expose internal collection or verification details such as `抓取`, `爬取`, `结构化字段`, `无登录环境`, `页面渲染`, `ATS`, `解析`, `检索结果`, or `不同环境显示不完全`.

## Required Output Format

Use Chinese for the analysis, keep the original English job title and company name when applicable, and include a clickable direct job link. Split `岗位归类` from `岗位方向`; do not overload one field with both eligibility category and role category.

Output style rules:

- Do not include a `链接核验` field in final Markdown files or user-facing responses. Link verification is mandatory but internal.
- The `链接` field must be a Markdown link with the visible text `直达链接`, for example `链接：[直达链接](https://example.com/job/123)`. Do not display the raw URL as the link text.
- In the header/summary metadata, `数量` must report the actual number of selected jobs, not the requested target range. For example, if the target was 5-8 and 5 jobs were selected, write `数量：5 个`; do not write `数量目标：5-8 个`.
- Do not mention scraping/crawling/search mechanics, parser behavior, login-less environments, structured fields, link verification, or page-rendering limitations in `注意事项` or any public-facing text.
- If eligibility or employment structure is unclear, describe only the applicant-facing uncertainty, such as `投递前确认是否支持中国大陆远程签约、税务和合同形式`.
- Infer `岗位方向` from the job title and JD responsibilities, not just from broad skill defaults. Use `其他` only when no more specific label fits after reading the JD.

Top-level title rules:

- Public roundup mode: `# YYYY-MM-DD 外企/海外远程岗位精选`
- Targeted mode: `# YYYY-MM-DD <目标岗位/方向> 岗位专选`

```markdown
# YYYY-MM-DD 外企/海外远程岗位精选

筛选参数：
- 模式：公共精选 / 定向精选
- 目标岗位：
- 行业/方向：
- 数量：

### 1. 岗位名称：
公司 / 平台：
岗位归类：外企中国岗位 / 外企 APAC 岗位 / 海外远程岗位 / 中国可投待确认
岗位方向：客服 / 运营 / 内容 / 本地化 / 销售支持 / 技术 / 技术支持 / QA / 数据 / AI Trainer / 产品 / 项目管理 / 需求分析 / 系统分析 / 实施 / 解决方案 / HR / 供应链 / 销售 / 合同工 / 兼职 / 其他
工作方式：中国本地办公 / 混合办公 / 全球远程 / APAC 远程 / 中国可投待确认
经验要求：入门 / 1-3 年 / 3-5 年 / 高级 / 不明确
语言要求：中文 / 英文 / 双语 / 其他 / 不明确
申请门槛：低 / 中 / 高
中国可投把握：高 / 中 / 待确认
时差判断：
适合谁：
注意事项：
链接：[直达链接](URL)

### 2. 岗位名称：
公司 / 平台：
岗位归类：
岗位方向：
工作方式：
经验要求：
语言要求：
申请门槛：
中国可投把握：
时差判断：
适合谁：
注意事项：
链接：[直达链接](URL)

这些岗位的筛选时间是 YYYY-MM-DD，申请前仍需以岗位页面最新信息为准。
```

If a near-match replaces an unavailable category, state the replacement reason in `注意事项` using applicant-facing wording. Keep `申请门槛` and `中国可投把握` as practical labels, not mathematical scores. Never output a job whose direct link was not verified unless the user explicitly allows unverified leads; if allowed, still do not add `链接核验`, and instead state the practical limitation in `注意事项`, for example `链接状态需投递前再次确认`.

## Final Jobs JSON Schema

Before rendering Markdown, create a temporary JSON file containing the final jobs as an array. Use these exact keys so `scripts/format_daily_picks.py` can validate and render the output:

```json
[
  {
    "title": "Customer Support Specialist",
    "company_platform": "Company / Greenhouse",
    "company": "Company",
    "job_group": "海外远程岗位",
    "job_direction": "客服",
    "work_mode": "APAC 远程",
    "experience": "1-3 年",
    "language": "英文",
    "application_barrier": "中",
    "china_applicability": "中",
    "timezone_judgment": "面向 APAC，和北京时间协作可行",
    "best_for": "适合英语较好、有客服或 SaaS 支持经验的人",
    "notes": "投递前确认是否支持中国大陆远程签约、税务和合同形式",
    "url": "https://example.com/jobs/123",
    "source": "Greenhouse"
  }
]
```

`company` and `source` are used for `seen_jobs.py append`; the rendered Markdown uses `company_platform`.
