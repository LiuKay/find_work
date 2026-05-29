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

function slugifyHeading(value) {
  const jobMatch = value.match(/^(\d+)\.\s*岗位名称[：:]/);
  if (jobMatch) return `job-${jobMatch[1]}`;
  return "";
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
      const id = slugifyHeading(heading[2]);
      const idAttribute = id ? ` id="${escapeHtml(id)}"` : "";
      html.push(`<h${level}${idAttribute}>${inlineMarkdown(heading[2])}</h${level}>`);
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

function plainMarkdown(value) {
  return (value || "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 $2")
    .replace(/[*_`]/g, "")
    .trim();
}

function extractMarkdownUrl(value) {
  const markdownLink = (value || "").match(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/);
  if (markdownLink) return markdownLink[1];
  const bareUrl = (value || "").match(/https?:\/\/\S+/);
  return bareUrl ? bareUrl[0] : "";
}

function parseJobBlock(block, pick, index) {
  const heading = block.heading.trim();
  const titleMatch = heading.match(/岗位名称[：:]\s*(.+)$/);
  const fields = {};

  for (const line of block.lines) {
    const match = line.match(/^([^：:]+)[：:]\s*(.*)$/);
    if (!match) continue;
    fields[match[1].trim()] = match[2].trim();
  }

  const title = titleMatch ? titleMatch[1].trim() : heading.replace(/^\d+\.\s*/, "");
  const company = plainMarkdown(fields["公司 / 平台"] || "");
  const direction = plainMarkdown(fields["岗位方向"] || "");
  const workMode = plainMarkdown(fields["工作方式"] || "");
  const experience = plainMarkdown(fields["经验要求"] || "");
  const language = plainMarkdown(fields["语言要求"] || "");
  const confidence = plainMarkdown(fields["中国可投把握"] || "");
  const threshold = plainMarkdown(fields["申请门槛"] || "");
  const fit = plainMarkdown(fields["适合谁"] || "");
  const notes = plainMarkdown(fields["注意事项"] || "");
  const link = extractMarkdownUrl(fields["链接"] || "");

  return {
    id: `${pick.slug}-${index + 1}`,
    issueSlug: pick.slug,
    issueTitle: pick.title,
    issueUrl: `/picks/${pick.slug}/#job-${index + 1}`,
    date: pick.date,
    number: index + 1,
    title,
    company,
    direction,
    workMode,
    experience,
    language,
    confidence,
    threshold,
    fit,
    notes,
    link,
    searchText: [
      pick.date,
      pick.title,
      title,
      company,
      direction,
      workMode,
      experience,
      language,
      confidence,
      threshold,
      fit,
      notes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

function extractJobs(pick) {
  const lines = pick.markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = line.match(/^###\s+\d+\.\s+岗位名称[：:]\s*(.+)$/);
    if (heading) {
      if (current) blocks.push(current);
      current = { heading: line.replace(/^###\s+/, ""), lines: [] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) blocks.push(current);
  return blocks.map((block, index) => parseJobBlock(block, pick, index));
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

function pageTemplate({ title, description, body, canonicalPath = "/", scripts = [] }) {
  const scriptTags = scripts
    .map((script) => `<script src="${escapeHtml(script)}" defer></script>`)
    .join("\n  ");

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
  ${scriptTags}
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
  <section class="job-filter" aria-labelledby="job-filter-title">
    <div class="filter-heading">
      <div>
        <h2 id="job-filter-title">岗位筛选</h2>
        <p>按发布时间和岗位关键词检索历史发布记录。</p>
      </div>
      <span class="job-count" data-job-count>读取中</span>
    </div>
    <form class="filter-controls" data-job-filter>
      <label>
        <span>关键词</span>
        <input type="search" name="query" placeholder="岗位、公司、方向" autocomplete="off">
      </label>
      <label>
        <span>开始日期</span>
        <input type="date" name="startDate">
      </label>
      <label>
        <span>结束日期</span>
        <input type="date" name="endDate">
      </label>
      <label>
        <span>英文要求</span>
        <select name="language" data-filter-options="language">
          <option value="">不限</option>
        </select>
      </label>
      <label>
        <span>工作方式</span>
        <select name="workMode" data-filter-options="workMode">
          <option value="">不限</option>
        </select>
      </label>
      <label>
        <span>申请门槛</span>
        <select name="threshold" data-filter-options="threshold">
          <option value="">不限</option>
        </select>
      </label>
      <label>
        <span>可投把握</span>
        <select name="confidence" data-filter-options="confidence">
          <option value="">不限</option>
        </select>
      </label>
      <label>
        <span>经验要求</span>
        <select name="experience" data-filter-options="experience">
          <option value="">不限</option>
        </select>
      </label>
      <label>
        <span>岗位方向</span>
        <select name="direction" data-filter-options="direction">
          <option value="">不限</option>
        </select>
      </label>
      <button type="reset">清空</button>
    </form>
    <div class="job-results" data-job-results aria-live="polite"></div>
    <p class="filter-empty" data-job-empty hidden>没有匹配的岗位，试试放宽日期或关键词。</p>
  </section>
  <section class="issue-archive" aria-labelledby="issue-archive-title">
  <h2 id="issue-archive-title">每日归档</h2>
  <ol class="full-archive-list">${items}</ol>
  </section>
</main>`,
    scripts: [`/assets/archive.js`],
  });
}

function copyAssets() {
  ensureDir(path.join(DIST_DIR, "assets"));
  fs.copyFileSync(path.join(SITE_DIR, "styles.css"), path.join(DIST_DIR, "assets", "styles.css"));
  fs.copyFileSync(path.join(SITE_DIR, "archive.js"), path.join(DIST_DIR, "assets", "archive.js"));
}

function main() {
  emptyDir(DIST_DIR);
  copyAssets();

  const picks = getPickFiles().map(readPick);
  const jobs = picks.flatMap(extractJobs);
  writePage("index.html", renderIndex(picks));
  writePage(path.join("archive", "index.html"), renderArchive(picks));
  fs.writeFileSync(path.join(DIST_DIR, "assets", "jobs.json"), `${JSON.stringify(jobs, null, 2)}\n`);

  for (const pick of picks) {
    writePage(path.join("picks", pick.slug, "index.html"), renderPickPage(pick));
  }

  fs.writeFileSync(path.join(DIST_DIR, "robots.txt"), "User-agent: *\nDisallow: /\n");
  fs.writeFileSync(
    path.join(DIST_DIR, "_headers"),
    "/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n"
  );

  console.log(`Built ${picks.length} job pick page(s) and ${jobs.length} job record(s) into dist/`);
}

main();
