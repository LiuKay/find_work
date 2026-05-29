# Find Work Pages

把 `job-picks/*.md` 生成为可部署到 Cloudflare Pages 的静态网站。

## 本地使用

```bash
npm run build
npm run dev
```

构建输出目录是 `dist/`。本地预览默认地址是 `http://localhost:4173`。

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
