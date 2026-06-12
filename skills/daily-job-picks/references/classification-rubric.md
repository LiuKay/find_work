# Classification Rubric

## Purpose

Use this rubric when converting finalist jobs into the final jobs JSON. These labels are not writing style choices. They are normalized outputs intended for later script validation.

## General Rules

- Pick labels from the allowed enums only.
- Base labels on visible JD evidence, not on source defaults.
- When a role could fit two labels, choose the primary daily work content.
- Use a short note after the normalized label, not a substitute label.
- If the page lacks enough evidence, prefer a conservative label or reject the job upstream.

## 岗位归类

Allowed values:

- `外企中国岗位`
- `外企 APAC 岗位`
- `海外远程岗位`
- `中国可投待确认`

### `外企中国岗位`

- Use when the foreign company is hiring in mainland China or for a clearly China-based office/team.
- Accept office, hybrid, or China-based remote setups.
- Common misread: “Chinese language required” is not enough.
- Do not use when the page is only APAC-wide with no China-specific signal.

### `外企 APAC 岗位`

- Use when the role clearly targets APAC, Asia, Hong Kong, Singapore, or another regional Asia scope.
- Suitable when regional collaboration is explicit and China is plausible but not necessarily confirmed as a local entity.
- Common misread: nearby APAC countries do not automatically include China hiring rights.
- Do not use when the role explicitly excludes China or fixes far-away hours.

### `海外远程岗位`

- Use when the role is explicitly remote and cross-border collaboration is visible.
- Best for worldwide remote or APAC-friendly remote roles with strong evidence.
- Common misread: “remote” without geography or collaboration signal can still be too weak.
- Do not use when the page is ambiguous enough that only `中国可投待确认` is defensible.

### `中国可投待确认`

- Use when the role looks plausibly China-applicable but contract, tax, legal entity, or geographic wording is still unclear.
- The uncertainty must be practical and applicant-facing.
- Common misread: do not use this label to rescue clearly excluded roles.
- Do not use when the page says US-only, EU-only, local residence required, or similar hard exclusions.

## 岗位方向

Allowed values:

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

### Direction Rules

- `客服`: customer support, customer success, trust-and-safety queue work
- `运营`: operations, marketplace operations, community operations, product operations where execution dominates
- `内容`: content writing, editing, content marketing
- `本地化`: localization, translation, linguistic QA
- `销售支持`: SDR support, account coordination, sales enablement support
- `技术`: software engineering, data engineering, infrastructure, analytics engineering
- `技术支持`: post-sales technical support, support engineering
- `QA`: test, QA analyst, quality engineering where testing dominates
- `数据`: analyst, BI, reporting, data operations
- `AI Trainer`: trainer, evaluator, rater, annotation, RLHF-style language/data roles
- `产品`: PM, growth PM, product owner, product design leadership where product ownership dominates
- `项目管理`: project/program/delivery/PMO execution
- `需求分析`: business analysis centered on requirements capture and documentation
- `系统分析`: systems/integration analysis centered on technical specifications
- `实施`: onboarding, implementation consultant, configuration specialist
- `解决方案`: solutions architect, solutions engineer, sales engineer with solution design as core work
- `HR`: recruiting, TA, people operations
- `供应链`: procurement, sourcing, logistics, supply chain ops
- `销售`: AE, AM, business development
- `合同工`: explicit contractor role where contract structure matters more than function
- `兼职`: explicit part-time role
- `其他`: only when none of the above fits after reading the JD

### Common Misreads

- Do not map every technical-adjacent role to `技术`.
- Do not map every product-ops or data-ops role to `运营` without checking the core daily work.
- `AI Trainer` is a direction, not evidence of China applicability.

## 工作方式

Allowed values:

- `中国本地办公`
- `混合办公`
- `全球远程`
- `APAC 远程`
- `中国可投待确认`

### Rules

- `中国本地办公`: China office or local in-person expectation
- `混合办公`: explicitly hybrid
- `全球远程`: worldwide / remote anywhere / work from anywhere
- `APAC 远程`: remote but regionally constrained to APAC/Asia or nearby time zones
- `中国可投待确认`: work mode or hiring geography leaves China applicability unresolved

### Prohibited Combinations

- `海外远程岗位` with `中国本地办公`
- `外企中国岗位` with `全球远程` unless the page clearly says China-based remote

## 申请门槛

Allowed base labels:

- `低`
- `中`
- `高`

### `低`

- Entry or junior work
- Limited years-of-experience requirements
- No deep specialization, no heavy portfolio, no narrow region constraint

### `中`

- Some relevant experience required
- Normal business English or functional expertise required
- Not a principal/staff/lead-only or heavily regulated role

### `高`

- Senior, lead, manager-plus, or domain-heavy specialist
- Strong portfolio, deep technical stack, regulated expertise, or difficult regional constraint

### Common Misreads

- English requirement alone does not automatically make the barrier `高`.
- Unclear requirements should not be punished into `高`; use `中` or `不明确` upstream when justified.

## 中国可投把握

Allowed base labels:

- `高`
- `中`
- `待确认`

### `高`

- Use only when the page clearly supports China-based applicants, China hiring, China office hiring, or APAC remote with explicit China acceptance.
- Common misread: “APAC remote” without China mention is not automatically `高`.

### `中`

- Use when the role looks plausibly China-applicable with decent evidence, but one structural detail is not fully explicit.
- Typical cases: APAC remote, flexible remote, nearby time zones, visible employer identity, no exclusion.

### `待确认`

- Use when the role is promising but the applicant still needs to confirm China contracting, legal entity, tax, or exact location acceptance.
- The note must be applicant-facing, not internal process language.

### AI Trainer Restriction

- For `AI Trainer`, `data annotation`, `rater`, `evaluator`, and similar language-model training roles:
  - Do not use `高` unless the page explicitly says China / mainland China is accepted.
  - If the only China-related signal is Mandarin / Chinese language ability, reject upstream instead of using `待确认`.

## Notes Style

For `申请门槛` and `中国可投把握`:

- Keep the normalized base label separate.
- Add one short reader-facing explanation.
- Do not dump multiple JD details into the note.
- Do not mention internal verification mechanics.
