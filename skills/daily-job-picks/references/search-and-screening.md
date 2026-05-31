# Search and Screening Reference

## Source Priority

Prefer reliable sources with direct job detail pages:

- Company career pages for foreign companies with China, Hong Kong, Singapore, APAC, or Asia teams
- Greenhouse, Lever, Ashby, Workable, SmartRecruiters, and similar ATS pages
- LinkedIn job detail pages
- RemoteOK, We Work Remotely, Remote.co, Wellfound, FlexJobs, Otta, Himalayas, Remote.com job listings
- Foreign-company China recruitment pages and APAC career pages

Avoid scraper pages, content farms, repost-only pages without a clear apply path, and pages that hide the employer.

Use source trust levels when choosing between otherwise similar candidates:

- A-level: employer career pages and stable ATS detail pages such as Greenhouse, Lever, Workable, and SmartRecruiters.
- B-level: public remote job boards with specific detail pages, such as RemoteOK, We Work Remotely, Remote.co, Wellfound, Himalayas, and Remote.com.
- C-level: discovery-only, often-gated, or user-fragile sources such as LinkedIn, Otta, FlexJobs, and Ashby pages that cannot be confirmed in a normal reader-facing browser. Prefer not to output these directly unless the page itself is a public, specific, active job detail page with a visible application path.

When a B-level or C-level source reveals a promising job, first try to locate an A-level employer or ATS URL for the same role. Treat Ashby search snippets as discovery-only unless a normal browser page visibly shows the selected role; if a user reports an Ashby link as `job not found` or missing job details, record it in `bad-links.tsv` and avoid that same company-title pair.

If LinkedIn, Otta, FlexJobs, Remote.co, or another platform is blocked, login-gated, paywalled, or only shows a summary, use it only for discovery. Find the same role on the company career page or ATS page before selecting it.

Remote.co is acceptable as a discovery source for legitimate remote roles, especially customer support, operations, marketing, HR, writing, product, and engineering roles. Treat it as medium-trust rather than canonical: many listings are US/Canada-only, and some applications route through Remote.co or FlexJobs-style flows. For final selections, prefer the employer's own career page or ATS URL. Use a Remote.co job detail page only when it clearly shows the company, exact role, location restrictions, remote status, and a visible application path without requiring paid access.

## Link Verification

Every selected job must have a direct link that opens to the specific job detail page for an ordinary reader in a normal browser. A valid link must satisfy all of these:

- The page displays the same job title or a clear equivalent.
- The page displays the same company or hiring platform identity.
- The page includes role details such as responsibilities, requirements, location, remote status, or employment type.
- The page has a visible application path, such as an apply button, application form, email instruction, or ATS apply flow.
- The job is not visibly closed, expired, archived, filled, or unavailable.
- The page is usable without a paid account, special cookies, private preview permissions, or an internal/admin/session URL.

Reject or replace links that open to:

- A company careers homepage
- A job board search result page
- A list of many jobs without the selected role in focus
- A platform homepage
- A login wall with no visible job details
- A tracking redirect that fails to land on the selected job
- A different job title or different company
- A 404, access denied, expired, or closed posting page
- A page that appears valid only in one collection environment but opens as closed, removed, empty, login-gated, or unavailable for a normal reader

Prefer canonical company or ATS URLs over search-result URLs. If a job board is used for discovery, try to find the employer's own career page or ATS URL before selecting it. For ATS pages, prefer URLs from known job-detail patterns such as:

- Greenhouse: `/jobs/`, `/job/`, or `boards.greenhouse.io/.../jobs/...`
- Lever: `/jobs/...`
- Ashby: `/jobs/...`
- Workable, SmartRecruiters, and company career sites: the final page must visibly show the selected job.

Before final output, open every finalist link and verify it directly as a reader-facing page. Link verification is mandatory but internal. Do not include a `链接核验` field in the final Markdown or user response. If the user explicitly permits unverified leads, explain the practical applicant-facing limitation in `注意事项`, such as `链接状态需投递前再次确认`, without mentioning verification mechanics.

When a user reports that a selected link opens to a 404, closed, removed, unavailable, login/paywall, or empty page, treat that report as decisive for public usefulness even if another environment can still see content. Replace the job or switch to a working employer/ATS URL; do not argue that the role is still available in the public output.

Record reported failures in `bad-links.tsv` using `scripts/bad_links.py append`. Future runs must check `bad-links.tsv` and avoid the same URL or same company-title pair unless a working replacement URL is found.

Concrete validation procedure:

1. Open the final URL directly, not only through search snippets or cached summaries.
2. Follow redirects and use the final URL in the output if the redirected page is the stable job detail page.
3. Confirm the page itself displays the selected role and company. A generic company careers list is not enough.
4. Confirm a reader can reach an apply button, form, or application instruction without paid access or private preview/session credentials.
5. Reject pages blocked by CAPTCHA, hard login, paywall, access denied, closed/removed messages, 404, or mobile/normal-browser reports of unavailability.
6. For JavaScript-heavy pages, accept only if the visible page content is accessible in a normal browser or a public job-detail route; otherwise find an employer/ATS alternative or reject.

When writing public output, never expose collection or verification mechanics. Do not mention scraping, crawling, parser output, structured fields, ATS quirks, login-less environments, page rendering, search snippets, or differences between environments. If details are unclear, write the uncertainty from the applicant's perspective: `投递前确认是否支持中国大陆远程签约、税务和合同形式`.

## Public Roundup Coverage

Use public roundup mode for daily selections meant for friends, groups, communities, or newsletter readers who come from different industries. Aim for 6-10 total jobs with broad coverage:

- 1-2 lower-barrier non-technical roles such as support, operations, community, trust and safety, or coordinator roles
- 1-2 customer support, customer success, or technical support roles
- 1-2 content, localization, translation, editor, copywriter, or marketing operations roles
- 1-2 data, QA, AI trainer, product operations, or annotation roles
- 1-2 technical, technical support, implementation, solutions, or developer-adjacent roles
- 1 flexible contractor, freelance, part-time, or internship role when it is genuinely reputable

Do not force every category every day. Prefer fewer high-quality jobs over filling a quota. If a category is missing, mention the gap briefly in the file or in `注意事项` for a replacement role.

In the final output metadata, report the actual number selected, not the requested target range. Use `数量：N 个`, not `数量目标：6-10 个` or similar.

## AI Trainer and Chinese-Language Contractor Trap

Do not treat Mandarin, Simplified Chinese, or Chinese-language requirements as evidence that a role accepts mainland China-based applicants. Many overseas AI Trainer, data annotation, rater, evaluator, search-quality, ads-quality, and language-model training contractor roles recruit Chinese speakers who live abroad, and may exclude mainland China for payment, tax, platform, or legal reasons.

Reject these roles for China-based daily picks unless the job page explicitly states one of:

- work location includes mainland China or China
- hiring jurisdiction includes China
- applicant may work from China
- company has a China-local hiring or contracting path for the role

Do not use `中国可投待确认` for a generic `Mandarin Chinese AI Trainer`, `Simplified Chinese Evaluator`, `Chinese Data Annotator`, or similar overseas contractor role when the only China-related signal is language. If the user explicitly asks for overseas Chinese applicants, this rule can be relaxed for that run.

## Freshness

Prefer jobs posted or refreshed within the last 45 days when a posting date is visible. If no date is visible, an active job page with a working application path may still be used, but prefer it only when it clearly matches China/APAC eligibility and fills an important category. Reject stale-looking roles that have no posting date, no fresh company signal, and weak eligibility.

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
- `site:remote.co/remote-jobs "<role>" "remote"`
- `site:remote.co/remote-jobs "<role>" "Asia" OR "APAC" OR "China" OR "Singapore" OR "Hong Kong"`

For non-technical roles, include variations such as:

- customer support, customer success, support specialist
- operations, community, trust and safety, marketplace operations
- content, localization, translator, copywriter, editor
- sales support, business development, account coordinator
- QA, data annotation, AI trainer, product operations

For public roundups, rotate query sets across categories so the final list does not over-concentrate in one role family.

If live web access, a job board, or a source family is blocked, use other approved source families rather than padding weak results. Minimum fallback order:

1. Company career pages and ATS pages found through search.
2. Remote job boards that expose public job detail pages.
3. Broad search queries for the role plus APAC/Asia/China location terms.
4. Return fewer jobs and state only that the list was kept selective; do not mention tool or access limitations in the public output.

## Job Type Classification

Use exactly one of these labels:

- `外企中国岗位`: A foreign company hiring in mainland China. Remote is not required. Local office, hybrid, or remote are all acceptable if China-based applicants are plausible.
- `外企 APAC 岗位`: A foreign company hiring for an APAC, Asia, Hong Kong, Singapore, or regional role. Remote, hybrid, or regional collaboration may be acceptable.
- `海外远程岗位`: An overseas company/team hiring remotely. Must explicitly support remote work or cross-border remote collaboration.
- `中国可投待确认`: The role does not clearly exclude China, but employment entity, tax, contract form, time zone, or location eligibility needs confirmation.

In the output, put this value in `岗位归类`, not `岗位方向`.

Use `中国可投待确认` only when the role is plausibly open to China-based applicants: examples include worldwide remote, remote-anywhere, APAC/Asia remote, contractor/freelance work with no country exclusion, or a job page that lists multiple countries including nearby Asia but not mainland China. Reject the role instead of using `待确认` when it explicitly requires US/Canada/EU work authorization, a fixed far-away time zone over 5 hours from UTC+8, local residence in another country, or an employer entity that excludes cross-border applicants.

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
- `产品`
- `项目管理`
- `需求分析`
- `系统分析`
- `实施`
- `解决方案`
- `HR`
- `供应链`
- `销售`
- `合同工`
- `兼职`
- `其他`

Choose the most useful category for self-selection. Infer this from the job title and JD responsibilities, not only from the user's requested keyword or source category. Avoid `其他` unless no specific label fits after reading the JD.

Useful inference rules:

- Product Manager, Product Owner, Growth PM, Technical PM, Head of Product -> `产品`
- Business Analyst, Requirements Analyst, Functional Analyst, Business Solutions Architect where the work centers on requirements and documentation -> `需求分析`
- Systems Analyst, Solution Analyst, Business/Solutions Architect where the work centers on system design, integration, and technical specifications -> `系统分析` or `解决方案`
- Project Manager, Program Manager, Delivery Manager, Implementation Project Manager -> `项目管理`
- Implementation Manager/Specialist/Consultant, onboarding/configuration roles -> `实施`
- Solutions Architect, Solutions Engineer, Sales Engineer -> `解决方案` unless the work is mainly post-sales support, then `技术支持`
- Recruiter, Talent Acquisition, People Operations -> `HR`
- Procurement, Sourcing, Supply Chain, Logistics -> `供应链`
- Account Executive, Sales Manager, Business Development -> `销售`

If a job fits multiple categories, choose the primary daily work content and mention the secondary angle in `适合谁` or `注意事项`.

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

For `公司 / 平台`, write the employer name first. Add the hiring platform only when it helps readers identify the application path, for example `Company / Greenhouse`, `Company / Ashby`, or `Company / Remote.co`. Do not discuss hiring-platform mechanics or verification behavior in public output.

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
