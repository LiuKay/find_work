---
name: daily-job-picks
description: Find and curate daily high-quality foreign-company China roles and overseas remote roles for China-based applicants, including public multi-category daily roundups and targeted searches for a specific role profile. Use when the user asks for daily job picks, China-applicable foreign company jobs, APAC/Asia remote jobs, overseas remote jobs compatible with China time zones, group-friendly job newsletters, or curated job leads with deduplication by date.
---

# Daily Job Picks

## Purpose

Curate a daily list of high-quality jobs that China-based applicants can realistically apply to. Support both public multi-category roundups for friends from different backgrounds and targeted searches for a specific role profile. Prioritize quality over quantity, avoid repeats from previous daily picks, and output date-stamped Markdown records in the current project.

Do not assume a personal default job profile. In targeted mode, the user must provide role keywords, industry, seniority, or other search parameters. In public roundup mode, use the multi-category coverage rules from `references/search-and-screening.md`.

## Files

- Write public daily roundups to `/Users/kaybee/Documents/github/find_work/job-picks/YYYY-MM-DD.md`.
- Write targeted runs to `/Users/kaybee/Documents/github/find_work/job-picks/YYYY-MM-DD-<topic>.md`, where `<topic>` is a short hyphen-case or Chinese-safe label from the requested role or industry.
- If writing to an existing date file, append a new clearly titled section instead of overwriting prior content.
- Maintain `/Users/kaybee/Documents/github/find_work/job-picks/seen-jobs.tsv` as a lightweight deduplication index with columns: `date`, `title`, `company`, `url`, `job_direction`, `source`.
- Before selecting jobs, scan both `seen-jobs.tsv` and existing Markdown files in `/Users/kaybee/Documents/github/find_work/job-picks/` and exclude any job whose company plus title or job URL already appeared.
- If the user asks for a different output path, follow the user path and still use date-named Markdown files unless told otherwise.

## Modes

- Public roundup mode: Use when the user asks for a daily selection for friends, a group, a newsletter, or people from multiple industries. Cover several job directions so readers can self-pick.
- Targeted mode: Use when the user specifies a role, industry, seniority, or personal profile. Optimize for that request instead of broad coverage.

## Workflow

1. Confirm the run date using the current date from the environment. Use that date in the output filename and final note.
2. Identify the mode. If the user did not specify a mode, infer public roundup mode for group/friend/newsletter wording and targeted mode for role/profile wording.
3. Parse the user's current parameters: role, industry, seniority, skill constraints, language requirements, excluded industries, requested count, and whether broad public coverage is desired.
4. Load `references/search-and-screening.md` for sources, search query patterns, classification rules, time-zone rules, and risk filters.
5. Search live job sources. Because job listings change frequently, always browse the web for current listings.
6. Build a candidate pool larger than the requested count, then remove duplicates already present in the TSV index or prior Markdown files.
7. Reject jobs that fail the hard rules:
   - Overseas jobs must be remote.
   - Do not select roles with China time-zone incompatibility over 5 hours unless the user explicitly requested them.
   - Do not select obvious scams, gray-market roles, high-risk crypto projects, gambling, adult industry, paid-to-apply jobs, brush-order work, pure pyramid/referral schemes, or vague high-pay roles with unclear company identity.
   - Do not select platform homepages, search pages, company job-board landing pages, category pages, expired pages, or pages that do not show the selected role.
8. Run a link verification pass for every finalist. Open each URL and confirm the page shows the same job title, company, location/remote status, and an active application path. Replace or reject any job whose link cannot be verified.
9. Classify and summarize each selected job using the required output format below.
10. Save or append the final answer to the appropriate Markdown file, update `seen-jobs.tsv`, and also provide the same content in the response unless the user only asked to save it.

## Quality Bar

Prefer 6-10 strong jobs for public roundup mode and 5-8 strong jobs for targeted mode. Return fewer if not enough high-quality, current, non-duplicate jobs meet all rules. Do not pad with weak matches.

Use direct evidence from the job page for location, remote status, company, time-zone feasibility, role requirements, and application path. If a field is unclear but the role is otherwise promising, label it as `中国可投待确认` and state what must be confirmed.

## Required Output Format

Use Chinese for the analysis, keep the original English job title and company name when applicable, and include a clickable direct job link. Split `岗位归类` from `岗位方向`; do not overload one field with both eligibility category and role category.

```markdown
# YYYY-MM-DD 外企/海外远程岗位精选

筛选参数：
- 模式：公共精选 / 定向精选
- 目标岗位：
- 行业/方向：
- 数量目标：

### 1. 岗位名称：
公司 / 平台：
岗位归类：外企中国岗位 / 外企 APAC 岗位 / 海外远程岗位 / 中国可投待确认
岗位方向：客服 / 运营 / 内容 / 本地化 / 销售支持 / 技术 / 技术支持 / QA / 数据 / AI Trainer / 合同工 / 兼职 / 其他
工作方式：中国本地办公 / 混合办公 / 全球远程 / APAC 远程 / 中国可投待确认
经验要求：入门 / 1-3 年 / 3-5 年 / 高级 / 不明确
语言要求：中文 / 英文 / 双语 / 其他 / 不明确
申请门槛：低 / 中 / 高
中国可投把握：高 / 中 / 待确认
时差判断：
链接核验：已打开岗位详情页，标题/公司匹配，申请入口有效 / 待确认
适合谁：
注意事项：
链接：

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
链接核验：
适合谁：
注意事项：
链接：

这些岗位的筛选时间是 YYYY-MM-DD，申请前仍需以岗位页面最新信息为准。
```

If a near-match replaces an unavailable category, state the replacement reason in `注意事项`. Keep `申请门槛` and `中国可投把握` as practical labels, not mathematical scores. Never output a job whose direct link was not verified unless the user explicitly allows unverified leads; if allowed, mark `链接核验：待确认` and explain why.
