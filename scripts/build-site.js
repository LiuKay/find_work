const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PICKS_DIR = path.join(ROOT, "job-picks");
const DIST_DIR = path.join(ROOT, "dist");
const SITE_DIR = path.join(ROOT, "site");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function emptyDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(value) {
  const source = value || "";
  let output = "";
  let index = 0;
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let match;

  while ((match = linkPattern.exec(source)) !== null) {
    output += escapeHtml(source.slice(index, match.index));
    output += `<a href="${escapeHtml(match[2])}" rel="noopener noreferrer" target="_blank">${escapeHtml(match[1])}</a>`;
    index = match.index + match[0].length;
  }

  output += escapeHtml(source.slice(index));
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/`([^`]+)`/g, "<code>$1</code>");
  return output;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listOpen = false;
  let codeOpen = false;
  let codeLines = [];

  function closeParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  }

  function closeList() {
    if (!listOpen) return;
    html.push("</ul>");
    listOpen = false;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith("```")) {
      closeParagraph();
      closeList();
      if (codeOpen) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeOpen = false;
        codeLines = [];
      } else {
        codeOpen = true;
      }
      continue;
    }

    if (codeOpen) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const listItem = /^[-*]\s+(.+)$/.exec(line.trim());
    if (listItem) {
      closeParagraph();
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(listItem[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line);
  }

  closeParagraph();
  closeList();
  if (codeOpen) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  return html.join("\n");
}

function getPickFiles() {
  if (!fs.existsSync(PICKS_DIR)) return [];
  return fs
    .readdirSync(PICKS_DIR)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .reverse();
}

function readPick(file) {
  const filePath = path.join(PICKS_DIR, file);
  const markdown = fs.readFileSync(filePath, "utf8");
  const slug = file.replace(/\.md$/, "");
  const firstHeading = markdown.match(/^#\s+(.+)$/m);
  const dateMatch = slug.match(/^(\d{4}-\d{2}-\d{2})/);
  return {
    file,
    slug,
    title: firstHeading ? firstHeading[1].trim() : slug,
    date: dateMatch ? dateMatch[1] : "未标日期",
    markdown,
    html: markdownToHtml(markdown),
  };
}

function pageTemplate({ title, description, body, canonicalPath = "/" }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/assets/styles.css">
  <link rel="canonical" href="${escapeHtml(canonicalPath)}">
</head>
<body>
  <header class="site-header">
    <a class="brand" href="/" aria-label="回到首页">
      <span class="brand-mark">FW</span>
      <span>
        <strong>Find Work</strong>
        <small>外企 / 远程岗位精选</small>
      </span>
    </a>
    <nav class="site-nav" aria-label="主导航">
      <a href="/">最新</a>
      <a href="/archive/">归档</a>
    </nav>
  </header>
  ${body}
  <footer class="site-footer">
    <p>岗位信息随时变化，申请前请以原岗位页面为准。</p>
  </footer>
</body>
</html>`;
}

function writePage(relativePath, html) {
  const target = path.join(DIST_DIR, relativePath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, html);
}

function renderPickPage(pick) {
  return pageTemplate({
    title: `${pick.title} | Find Work`,
    description: `${pick.date} 的外企和海外远程岗位精选。`,
    canonicalPath: `/picks/${pick.slug}/`,
    body: `<main class="reading-layout">
  <a class="back-link" href="/archive/">← 查看全部归档</a>
  <article class="pick-article">
    ${pick.html}
  </article>
</main>`,
  });
}

function renderIndex(picks) {
  const latest = picks[0];
  const archiveItems = picks
    .slice(0, 8)
    .map(
      (pick) => `<li>
        <a href="/picks/${pick.slug}/">
          <span>${escapeHtml(pick.title)}</span>
          <time>${escapeHtml(pick.date)}</time>
        </a>
      </li>`
    )
    .join("\n");

  const latestBlock = latest
    ? `<section class="latest-panel">
        <div class="section-kicker">Latest Pick</div>
        <h1>${escapeHtml(latest.title)}</h1>
        <p>每天把适合中国申请者的外企、APAC 和海外远程岗位整理成一份可直接转发的网页。</p>
        <a class="primary-link" href="/picks/${latest.slug}/">打开最新精选</a>
      </section>`
    : `<section class="latest-panel"><h1>还没有岗位精选</h1><p>把 Markdown 文件放入 job-picks 后重新构建。</p></section>`;

  return pageTemplate({
    title: "Find Work 外企/远程岗位精选",
    description: "面向朋友分享的外企、APAC 和海外远程岗位精选归档。",
    body: `<main>
  <section class="home-grid">
    ${latestBlock}
    <aside class="archive-panel" aria-label="近期归档">
      <div class="section-kicker">Archive</div>
      <h2>近期更新</h2>
      <ol class="archive-list">${archiveItems}</ol>
      <a class="secondary-link" href="/archive/">查看全部</a>
    </aside>
  </section>
</main>`,
  });
}

function renderArchive(picks) {
  const items = picks
    .map(
      (pick) => `<li>
        <a href="/picks/${pick.slug}/">
          <time>${escapeHtml(pick.date)}</time>
          <span>${escapeHtml(pick.title)}</span>
        </a>
      </li>`
    )
    .join("\n");

  return pageTemplate({
    title: "岗位精选归档 | Find Work",
    description: "按日期倒序排列的岗位精选历史记录。",
    canonicalPath: "/archive/",
    body: `<main class="archive-layout">
  <div class="section-kicker">All Issues</div>
  <h1>岗位精选归档</h1>
  <ol class="full-archive-list">${items}</ol>
</main>`,
  });
}

function copyAssets() {
  ensureDir(path.join(DIST_DIR, "assets"));
  fs.copyFileSync(path.join(SITE_DIR, "styles.css"), path.join(DIST_DIR, "assets", "styles.css"));
}

function main() {
  emptyDir(DIST_DIR);
  copyAssets();

  const picks = getPickFiles().map(readPick);
  writePage("index.html", renderIndex(picks));
  writePage(path.join("archive", "index.html"), renderArchive(picks));

  for (const pick of picks) {
    writePage(path.join("picks", pick.slug, "index.html"), renderPickPage(pick));
  }

  fs.writeFileSync(path.join(DIST_DIR, "robots.txt"), "User-agent: *\nDisallow: /\n");
  fs.writeFileSync(
    path.join(DIST_DIR, "_headers"),
    "/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n"
  );

  console.log(`Built ${picks.length} job pick page(s) into dist/`);
}

main();
