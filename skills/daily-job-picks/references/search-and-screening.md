# Search and Screening Reference

## Source Priority

Prefer reliable sources with direct job detail pages:

- Company career pages for foreign companies with China, Hong Kong, Singapore, APAC, or Asia teams
- Greenhouse, Lever, Ashby, Workable, SmartRecruiters, and similar ATS pages
- LinkedIn job detail pages
- RemoteOK, We Work Remotely, Wellfound, FlexJobs, Otta, Himalayas, Remote.com job listings
- Foreign-company China recruitment pages and APAC career pages

Avoid scraper pages, content farms, repost-only pages without a clear apply path, and pages that hide the employer.

If LinkedIn, Otta, FlexJobs, or another platform is blocked, login-gated, or only shows a summary, use it only for discovery. Find the same role on the company career page or ATS page before selecting it.

## Link Verification

Every selected job must have a direct link that opens to the specific job detail page. A valid link must satisfy all of these:

- The page displays the same job title or a clear equivalent.
- The page displays the same company or hiring platform identity.
- The page includes role details such as responsibilities, requirements, location, remote status, or employment type.
- The page has a visible application path, such as an apply button, application form, email instruction, or ATS apply flow.
- The job is not visibly closed, expired, archived, filled, or unavailable.

Reject or replace links that open to:

- A company careers homepage
- A job board search result page
- A list of many jobs without the selected role in focus
- A platform homepage
- A login wall with no visible job details
- A tracking redirect that fails to land on the selected job
- A different job title or different company
- A 404, access denied, expired, or closed posting page

Prefer canonical company or ATS URLs over search-result URLs. For ATS pages, prefer URLs from known job-detail patterns such as:

- Greenhouse: `/jobs/`, `/job/`, or `boards.greenhouse.io/.../jobs/...`
- Lever: `/jobs/...`
- Ashby: `/jobs/...`
- Workable, SmartRecruiters, and company career sites: the final page must visibly show the selected job.

Before final output, open every finalist link and verify it directly. In the output, set `链接核验` to `已打开岗位详情页，标题/公司匹配，申请入口有效` only when the check passed. If the user explicitly permits unverified leads, set `链接核验` to `待确认` and explain the limitation in `注意事项`.

## Public Roundup Coverage

Use public roundup mode for daily selections meant for friends, groups, communities, or newsletter readers who come from different industries. Aim for 6-10 total jobs with broad coverage:

- 1-2 lower-barrier non-technical roles such as support, operations, community, trust and safety, or coordinator roles
- 1-2 customer support, customer success, or technical support roles
- 1-2 content, localization, translation, editor, copywriter, or marketing operations roles
- 1-2 data, QA, AI trainer, product operations, or annotation roles
- 1-2 technical, technical support, implementation, solutions, or developer-adjacent roles
- 1 flexible contractor, freelance, part-time, or internship role when it is genuinely reputable

Do not force every category every day. Prefer fewer high-quality jobs over filling a quota. If a category is missing, mention the gap briefly in the file or in `注意事项` for a replacement role.

## Search Query Patterns

Adapt keywords to the user's role and industry. Combine role terms with APAC/Asia/China-friendly location terms:

- `site:greenhouse.io (APAC OR Asia OR Singapore OR China OR Hong Kong) remote "<role>"`
- `site:lever.co (APAC OR Asia OR Singapore OR China OR Hong Kong) remote "<role>"`
- `site:ashbyhq.com (APAC OR Asia OR Singapore OR China OR Hong Kong) remote "<role>"`
- `"<role>" "APAC" "Remote" "Apply"`
- `"<role>" "Asia" "Remote" "Apply"`
- `"<role>" "China" "foreign company" careers`
- `"<role>" "Shanghai" OR "Beijing" OR "Shenzhen" "English" careers`
- `"<role>" "Hong Kong" OR "Singapore" "APAC" careers`
- `site:jobs.lever.co "<role>" "APAC"`
- `site:boards.greenhouse.io "<role>" "APAC"`

For non-technical roles, include variations such as:

- customer support, customer success, support specialist
- operations, community, trust and safety, marketplace operations
- content, localization, translator, copywriter, editor
- sales support, business development, account coordinator
- QA, data annotation, AI trainer, product operations

For public roundups, rotate query sets across categories so the final list does not over-concentrate in one role family.

## Job Type Classification

Use exactly one of these labels:

- `外企中国岗位`: A foreign company hiring in mainland China. Remote is not required. Local office, hybrid, or remote are all acceptable if China-based applicants are plausible.
- `外企 APAC 岗位`: A foreign company hiring for an APAC, Asia, Hong Kong, Singapore, or regional role. Remote, hybrid, or regional collaboration may be acceptable.
- `海外远程岗位`: An overseas company/team hiring remotely. Must explicitly support remote work or cross-border remote collaboration.
- `中国可投待确认`: The role does not clearly exclude China, but employment entity, tax, contract form, time zone, or location eligibility needs confirmation.

In the output, put this value in `岗位归类`, not `岗位方向`.

## Job Direction Classification

Use a concise reader-friendly role category in `岗位方向`, such as:

- `客服`
- `运营`
- `内容`
- `本地化`
- `销售支持`
- `技术`
- `技术支持`
- `QA`
- `数据`
- `AI Trainer`
- `合同工`
- `兼职`
- `其他`

Choose the most useful category for self-selection. If a job fits multiple categories, choose the primary work content and mention the secondary angle in `适合谁` or `注意事项`.

## Work Mode Classification

Use exactly one of these labels:

- `中国本地办公`: Mainland China office role.
- `混合办公`: Part remote, part office.
- `全球远程`: Worldwide, global, remote anywhere, or work from anywhere.
- `APAC 远程`: Explicitly Asia-Pacific, Asia, East Asia, Southeast Asia, or nearby time-zone remote.
- `中国可投待确认`: China eligibility, employment structure, tax, contract form, time zone, or location limit is unclear.

## Time-Zone Rules

Use Beijing time UTC+8 as the baseline.

Priority order:

1. Mainland China, Hong Kong, Singapore, Malaysia, Philippines, Japan, Korea, and nearby Asia time zones.
2. APAC remote or Asia remote.
3. Australia and New Zealand remote if collaboration hours are feasible.
4. Europe only when the listing explicitly supports Asia time zones or flexible work.
5. Reject roles requiring US, Canada, Latin America, or other far-away fixed collaboration hours unless the user explicitly asks for them.

Hard rule: do not select roles with required fixed work hours more than 5 hours away from UTC+8. If no fixed hours are stated but the listing targets APAC/Asia, mark it as initially feasible.

## Risk Filters

Reject jobs with any strong warning sign:

- Upfront payment, training fees, deposit, equipment purchase, or pay-to-apply requirement
- Brush-order, click-farm, fake review, traffic manipulation, or task scam language
- Pure commission sales with unrealistic income claims
- Hidden company identity or no verifiable employer
- Vague role description plus unusually high pay
- Gambling, adult industry, illegal gray-market work, or aggressive high-risk crypto projects
- Recruiting that depends mainly on inviting others, downline growth, or referral commissions
- Job pages that are expired, closed, or lack a clear apply path
- Links that cannot be opened to a specific, active job detail page

For softer risks, keep the job only if otherwise strong and call out the risk in `注意事项`.

## Practical Labels

Use these labels to make group readers able to self-pick quickly:

- `经验要求`: `入门`, `1-3 年`, `3-5 年`, `高级`, or `不明确`.
- `语言要求`: `中文`, `英文`, `双语`, `其他`, or `不明确`.
- `申请门槛`: `低`, `中`, or `高`. Base this on experience, portfolio, language, technical depth, domain specialization, and location/employment constraints.
- `中国可投把握`: `高`, `中`, or `待确认`. Use `高` only when location, remote status, or China/APAC eligibility is explicit. Use `待确认` when contract, tax, entity, visa, or country restrictions are unclear.

## Deduplication

Before final selection, scan `/Users/kaybee/Documents/github/find_work/job-picks/seen-jobs.tsv` and all prior `/Users/kaybee/Documents/github/find_work/job-picks/*.md` files. Treat a job as duplicate when:

- The exact URL already appears.
- The same company and job title already appear.
- The platform reposts the same role under a tracking URL.

If unsure, prefer excluding the duplicate and find a fresh role.

After selection, append each accepted job to `seen-jobs.tsv` with tab-separated columns:

```text
date	title	company	url	job_direction	source
```

Create the file with the header if it does not exist. Do not remove prior rows.
