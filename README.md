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
