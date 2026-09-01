# Find Work Pages

把终审岗位库存和每日精选笔记生成为可部署到 Cloudflare Pages 的静态网站。

## 数据流

```text
data/candidates/YYYY-MM-DD.ndjson  内部发现与筛选记录，不进入 dist
                  │ promoted
                  ▼
data/curated/jobs.ndjson           一行一岗的唯一权威库存
                  │ issue job_ids
                  ├──────────────► data/issues/<完整期次 slug>.json
                  │
                  └── active + 公开字段完整 ──► dist/assets/jobs.json
                                               /pool/
                                               /channels/<id>/

job-picks/<完整期次 slug>.md        仅作为社群可读的导出物，不参与网站构建
```

公开构建只接受 `status=active` 且 `title`、`company`、`url`、
`china_applicability`、`application_barrier`、`best_for` 完整的终审岗位。
`candidates`、筛掉原因、内部 reviewer、`expired` 和 `closed` 均不会写入
`dist/`。

## 本地使用

```bash
npm run build
npm run dev
```

构建输出目录是 `dist/`。本地预览默认地址是 `http://127.0.0.1:4173`。

构建会生成 `/pool/`、6 个画像频道以及 `jobs.json`、`issues.json`、
`channels.json`。所有日期边界使用 `Asia/Shanghai`；需要复现历史构建时
可临时设置 `POOL_AS_OF_DATE=YYYY-MM-DD`。

## 每日自动岗位精选

`.github/workflows/daily-job-picks.yml` 每天北京时间 08:15 运行，也可以手动触发。
默认使用 OpenAI Responses API；要切换到 OpenAI-compatible Chat Completions 服务商，
在 GitHub repository variables 设置：

```text
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_API_MODE=chat_completions
OPENAI_MODEL=<服务商提供的模型名>
```

API key 仍放在 repository secret `OPENAI_API_KEY`，值可以是 DeepSeek 或其他兼容服务商的 key。
`responses` 模式提供 OpenAI `web_search` 和严格 JSON Schema；`chat_completions` 模式使用通用
JSON object，本地仍会执行字段、去重、坏链和报告校验，但不会注入 OpenAI 专属的 `web_search` 工具。

## Curated CLI

首次迁移或重新验证历史迁移的确定性：

```bash
python3 scripts/curated_jobs.py migrate --picks-dir job-picks --as-of 2026-07-23 --output data/curated/jobs.ndjson --issues-dir data/issues
python3 scripts/curated_jobs.py check --output data/curated/jobs.ndjson --issues-dir data/issues
```

终审输出一次生成 Markdown、upsert curated 并写入完整 slug 的 issue：

```bash
python3 .agents/skills/daily-job-picks/scripts/format_daily_picks.py \
  --input job-picks/2026-07-23-final-jobs.json \
  --date 2026-07-23 \
  --mode 公共精选 \
  --output job-picks/2026-07-23.md \
  --curated-output data/curated/jobs.ndjson \
  --issues-dir data/issues
```

复验与过期：

```bash
python3 scripts/curated_jobs.py verify --output data/curated/jobs.ndjson --as-of 2026-07-23 --job-id j_xxxxxxxxxxxx --outcome open
python3 scripts/curated_jobs.py verify --output data/curated/jobs.ndjson --as-of 2026-07-23 --job-id j_xxxxxxxxxxxx --outcome closed --reason "position filled"
python3 scripts/curated_jobs.py expire --output data/curated/jobs.ndjson --as-of 2026-07-23
python3 scripts/curated_jobs.py stats --date 2026-07-23
```

`verify --input <json-or-ndjson>` 可批量读取包含 `job_id`、`outcome`、
`checked_at`、`check_id` 和可选 `reason` 的结果。明确关闭可以立即进入
`closed`；单次网络错误、403、限流或超时只标记 `suspect`，两个不同
`check_id` 的独立失败才关闭岗位。

## 生命周期与 TTL

- 默认 TTL：14 天。
- 中国可投为高且属于外企中国岗位：21 天。
- 合同工、兼职、AI Trainer、数据标注或中国可投待确认：7 天。
- 被再次精选只更新 `last_featured_date`，不自动延长 TTL。
- `active → expired`：到期仍未复验。
- `active → closed`：明确关闭，或连续两次独立复验失败。
- `expired → active`：复验确认仍可投，并从复验日重新计算 TTL。

## 一日 Checklist

1. 校验 daily-job-picks source config。
2. 将当天发现结果原子写入 `data/candidates/YYYY-MM-DD.ndjson`。
3. 按 stable `job_id` 检查 `seen-jobs.tsv` 与 `bad-links.tsv`。
4. 对入选岗位逐个完成终审和直达链接检查。
5. 用上面的 `format_daily_picks.py` 单命令写 Markdown、curated 和 issue。
6. 对临期或超过 3 天未验的 active 岗位执行 `verify`。
7. 执行 `expire`、`check` 和 `stats`。
8. 运行完整验证：

```bash
python3 -m unittest discover -s tests -p 'test_curated_jobs.py'
npm test
POOL_AS_OF_DATE=2026-07-23 npm run build
```

9. 本地检查首页、可投库、6 个频道、问卷推荐及移动端布局。

## 故障恢复

- NDJSON 写入会先全量校验，再写同目录临时文件并原子替换；命令失败时旧库存保持不变。
- `check` 失败时不要构建或手工删除冲突记录，先按报错的 `job_id` /
  `issue_id` 修复源文件后重跑。
- 单次网络异常保持岗位 active 并标记 suspect，人工复核后再提交下一次独立结果。
- 历史迁移可重复执行；同一输入应生成字节一致的 curated 和 issues。
- 构建失败时先恢复到最后一次通过 `check` 的库存，再重新运行测试和构建。

## Cloudflare Pages 设置

- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: `16` 或更高

如果要绑定自己的域名，在 Cloudflare Pages 项目里添加 Custom domain。网站默认写入 `robots` 和 `X-Robots-Tag`，搜索引擎不会主动收录，朋友仍然可以通过链接访问。

## 岗位需求问卷

网站包含一个岗位需求问卷：

- `/survey/`：朋友填写岗位偏好。同一浏览器会保留同一个投票身份，再次提交会更新原问卷。
- `/survey-admin/`：输入管理密码后查看聚合统计。

问卷使用 Cloudflare Pages Functions、D1 和 Turnstile。按当前一两百人使用规模，均可运行在 Cloudflare 免费额度内。

### Cloudflare 资源

1. 创建 D1 数据库，例如 `find-work-survey`。
2. 执行 schema：

```bash
npx wrangler d1 execute find-work-survey --file=./schema.sql --remote
```

3. 在 Cloudflare Pages 项目里添加 D1 binding：

```text
Variable name: DB
D1 database: find-work-survey
```

4. 创建 Turnstile widget，并把 site key / secret 分别配置到 Pages。

### Pages 环境变量

构建时变量：

```text
TURNSTILE_SITE_KEY
```

Functions 运行时变量：

```text
TURNSTILE_SECRET_KEY
SURVEY_INVITE_CODE
ADMIN_PASSWORD
RATE_LIMIT_SALT
```

`SURVEY_INVITE_CODE` 是给朋友填写问卷时使用的邀请码。`ADMIN_PASSWORD` 只用于 `/survey-admin/` 查看统计。`RATE_LIMIT_SALT` 用于把访问 IP 做 hash 后限流，不要公开。

### 本地说明

`npm run dev` 只预览静态页面，不会运行 Pages Functions，因此问卷提交和管理统计需要部署到 Cloudflare Pages，或使用 Wrangler Pages 本地开发模式调试。
