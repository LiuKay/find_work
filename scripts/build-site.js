const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PICKS_DIR = path.join(ROOT, "job-picks");
const ABOUT_FILE = path.join(ROOT, "about.md");
const DIST_DIR = path.join(ROOT, "dist");
const SITE_DIR = path.join(ROOT, "site");
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "";
const ASSET_VERSION = process.env.CF_PAGES_COMMIT_SHA || "local";

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

    const image = /^!\[([^\]]*)\]\((\/[^)\s]+)\)$/.exec(line.trim());
    if (image) {
      closeParagraph();
      closeList();
      html.push(`<figure class="markdown-image"><img src="${escapeHtml(image[2])}" alt="${escapeHtml(image[1])}" width="180" loading="lazy"></figure>`);
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

function readStructuredJobs(slug) {
  const filePath = path.join(PICKS_DIR, `${slug}-final-jobs.json`);
  if (!fs.existsSync(filePath)) return [];

  const source = fs.readFileSync(filePath, "utf8").trim();
  try {
    const jobs = JSON.parse(source);
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return source.split("\n").filter(Boolean).map(JSON.parse);
  }
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
  const timezone = plainMarkdown(fields["时差判断"] || "");
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
    timezone,
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
  return blocks.map((block, index) => {
    const job = parseJobBlock(block, pick, index);
    const structured = pick.structuredJobs.find((item) => item.title === job.title) || pick.structuredJobs[index] || {};
    return {
      ...job,
      applicationBarrier: plainMarkdown(structured.application_barrier || ""),
      chinaApplicability: plainMarkdown(structured.china_applicability || ""),
    };
  });
}

function getPickFiles() {
  if (!fs.existsSync(PICKS_DIR)) return [];
  return fs
    .readdirSync(PICKS_DIR)
    // Accept date-based markdown files whose optional suffix may contain
    // non-ASCII labels such as Chinese topic names.
    .filter((file) => /^\d{4}-\d{2}-\d{2}(?:-[^.]+)?\.md$/.test(file))
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
    structuredJobs: readStructuredJobs(slug),
  };
}

function readAboutPage() {
  const fallbackMarkdown = "# 关于 Find Work\n\nFind Work 是一个面向中国申请者的岗位筛选网站。";
  const markdown = fs.existsSync(ABOUT_FILE) ? fs.readFileSync(ABOUT_FILE, "utf8") : fallbackMarkdown;
  const firstHeading = markdown.match(/^#\s+(.+)$/m);
  const title = firstHeading ? firstHeading[1].trim() : "关于 Find Work";

  return {
    title,
    markdown,
    html: markdownToHtml(markdown),
  };
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function issueTag(title) {
  if (/低英文|英文门槛/.test(title)) return "低英文";
  if (/产品|项目|PM|Pmo|PMO/i.test(title)) return "产品/项目";
  if (/IT|技术|开发|需求分析|系统分析/i.test(title)) return "IT/系统";
  if (/大数据|数据/.test(title)) return "数据";
  return "公共精选";
}

function renderIssueMeta(pick, className = "issue-meta") {
  return `<span class="${className}">${escapeHtml(issueTag(pick.title))}</span>`;
}

function latestIssueSummary(jobs) {
  if (!jobs.length) {
    return {
      countText: "本期岗位正在整理",
      directions: ["外企", "APAC", "远程"],
      fitText: "适合先看最新更新，再按方向回到归档筛选。",
    };
  }

  const directions = uniqueValues(jobs.map((job) => job.direction)).slice(0, 4);
  const workModes = uniqueValues(jobs.map((job) => job.workMode)).slice(0, 2);
  const lowBarrier = jobs.some((job) => /低|入门/.test(`${job.threshold} ${job.experience}`));
  const fitText = [
    workModes.length ? `工作方式包含 ${workModes.join(" / ")}` : "",
    lowBarrier ? "有低门槛或入门可看的岗位" : "适合按方向快速挑选",
  ]
    .filter(Boolean)
    .join("，");

  return {
    countText: `本期 ${jobs.length} 个岗位`,
    directions: directions.length ? directions : ["外企", "APAC", "远程"],
    fitText: fitText || "申请前仍需以原岗位页面为准。",
  };
}

function extractPickIntro(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const firstJobIndex = lines.findIndex((line) => /^###\s+\d+\.\s+岗位名称[：:]\s*/.test(line));
  const introLines = firstJobIndex === -1 ? lines : lines.slice(0, firstJobIndex);
  const contentLines = introLines.filter((line, index) => !(index === 0 && /^#\s+/.test(line)));
  return markdownToHtml(contentLines.join("\n").trim());
}

function summarizePickJobs(jobs) {
  if (!jobs.length) {
    return {
      countText: "本期岗位整理中",
      fitText: "岗位结构化信息暂未生成，请直接阅读正文。",
      directions: [],
      workModes: [],
      confidence: [],
    };
  }

  const directions = uniqueValues(jobs.map((job) => job.direction)).slice(0, 4);
  const workModes = uniqueValues(jobs.map((job) => job.workMode)).slice(0, 3);
  const confidence = uniqueValues(
    jobs
      .map((job) => {
        const match = `${job.confidence}`.match(/^(高|中|低|不明确)/);
        return match ? match[1] : "";
      })
      .filter(Boolean)
  ).slice(0, 3);
  const lowerBarrierCount = jobs.filter((job) => /低|入门|1-3/.test(`${job.threshold} ${job.experience}`)).length;
  const fitText = [
    workModes.length ? `工作方式覆盖 ${workModes.join(" / ")}` : "",
    confidence.length ? `中国可投把握以 ${confidence.join(" / ")} 为主` : "",
    lowerBarrierCount ? `其中 ${lowerBarrierCount} 个岗位更适合先投先看` : "整体更适合按方向快速筛选",
  ]
    .filter(Boolean)
    .join("，");

  return {
    countText: `本期 ${jobs.length} 个岗位`,
    fitText: fitText || "先看摘要，再进入适合自己的岗位区块。",
    directions,
    workModes,
    confidence,
  };
}

function renderJobPills(items) {
  return items
    .filter(Boolean)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");
}

function renderSummaryItem(label, value) {
  if (!value) return "";
  return `<div class="job-summary-item"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderDetailRow(label, value, className = "") {
  if (!value) return "";
  const extraClass = className ? ` ${className}` : "";
  return `<div class="job-detail-row${extraClass}"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function renderJumpLink(job) {
  return `<a href="#job-${job.number}"><span>${escapeHtml(String(job.number).padStart(2, "0"))}</span>${escapeHtml(job.title)}</a>`;
}

function renderJobSection(job) {
  const companyLine = job.company;
  const directLink = job.link
    ? `<a class="job-apply-link" href="${escapeHtml(job.link)}" rel="noopener noreferrer" target="_blank">查看原岗位</a>`
    : "";
  const metaRow =
    companyLine || directLink
      ? `<div class="job-company-row">
        ${
          companyLine
            ? `<p class="job-company-line"><span class="job-company-label">平台/公司</span><span class="job-company-value">${escapeHtml(companyLine)}</span></p>`
            : ""
        }
        ${directLink ? `<div class="job-section-actions">${directLink}</div>` : ""}
      </div>`
      : "";

  return `<section class="job-section" id="job-${job.number}" aria-labelledby="${escapeHtml(job.id)}-title">
    <div class="job-section-head">
      <div class="job-section-title">
        <div class="job-number">岗位 ${escapeHtml(String(job.number).padStart(2, "0"))}</div>
        <h2 id="${escapeHtml(job.id)}-title">${escapeHtml(job.title)}</h2>
        ${metaRow}
      </div>
    </div>
    <dl class="job-summary-grid" aria-label="岗位速览">
      ${renderSummaryItem("岗位方向", job.direction)}
      ${renderSummaryItem("工作方式", job.workMode)}
      ${renderSummaryItem("经验要求", job.experience)}
      ${renderSummaryItem("语言要求", job.language)}
    </dl>
    <dl class="job-judgement-grid" aria-label="投递判断">
      ${renderDetailRow("申请门槛", job.threshold, "job-detail-emphasis")}
      ${renderDetailRow("中国可投把握", job.confidence, "job-detail-strong")}
    </dl>
    <dl class="job-detail-stack" aria-label="补充说明">
      ${renderDetailRow("适合谁", job.fit)}
      ${renderDetailRow("注意事项", job.notes)}
      ${renderDetailRow("时差判断", job.timezone)}
    </dl>
  </section>`;
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
  <link rel="stylesheet" href="/assets/styles.css?v=${escapeHtml(ASSET_VERSION)}">
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
      <a href="/survey/">问卷</a>
      <a href="/about/">关于</a>
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
  const jobs = extractJobs(pick).map((job) => ({ ...job, issueTag: issueTag(pick.title) }));
  const introHtml = extractPickIntro(pick.markdown);
  const summary = summarizePickJobs(jobs);
  const jumpLinks = jobs.slice(0, 12).map(renderJumpLink).join("");
  const summaryTags = renderJobPills(summary.directions);
  const modeTags = renderJobPills(summary.workModes);
  const confidenceTags = renderJobPills(summary.confidence);

  if (!jobs.length) {
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

  return pageTemplate({
    title: `${pick.title} | Find Work`,
    description: `${pick.date} 的外企和海外远程岗位精选。`,
    canonicalPath: `/picks/${pick.slug}/`,
    body: `<main class="reading-layout detail-layout">
  <a class="back-link" href="/archive/">← 查看全部归档</a>
  <section class="pick-overview" aria-labelledby="pick-title">
    <div class="pick-overview-main">
      <div class="section-kicker">每日精选</div>
      <h1 id="pick-title">${escapeHtml(pick.title)}</h1>
      <div class="pick-overview-meta">
        <strong>${escapeHtml(summary.countText)}</strong>
        <span>${escapeHtml(pick.date)}</span>
      </div>
      <p class="pick-overview-note">${escapeHtml(summary.fitText)}</p>
      ${summaryTags ? `<div class="pick-overview-pills" aria-label="主要方向">${summaryTags}</div>` : ""}
      ${introHtml ? `<div class="pick-overview-intro">${introHtml}</div>` : ""}
    </div>
    <aside class="pick-overview-side" aria-label="本期摘要">
      <div class="pick-overview-panel">
        <h2>先看这一期有什么</h2>
        ${modeTags ? `<div class="pick-overview-group"><span>工作方式</span><div class="pick-overview-pills">${modeTags}</div></div>` : ""}
        ${confidenceTags ? `<div class="pick-overview-group"><span>可投把握</span><div class="pick-overview-pills">${confidenceTags}</div></div>` : ""}
        <p class="trust-note">申请前请以原岗位页面为准，尤其注意地域、语言和年限要求是否发生更新。</p>
      </div>
      <nav class="pick-jump-nav" aria-label="跳转到岗位">
        <h2>快速跳转</h2>
        <div class="pick-jump-list">
          ${jumpLinks}
        </div>
      </nav>
    </aside>
  </section>
  <article class="pick-detail-list" aria-label="岗位详情">
    ${jobs.map(renderJobSection).join("\n")}
  </article>
</main>`,
  });
}

function renderIndex(picks) {
  const latest = picks[0];
  const latestJobs = latest ? extractJobs(latest) : [];
  const latestSummary = latestIssueSummary(latestJobs);
  const archiveItems = picks
    .slice(0, 8)
    .map(
      (pick) => `<li>
        <a href="/picks/${pick.slug}/">
          ${renderIssueMeta(pick)}
          <span>${escapeHtml(pick.title)}</span>
          <time>${escapeHtml(pick.date)}</time>
        </a>
      </li>`
    )
    .join("\n");

  const latestBlock = latest
    ? `<aside class="latest-panel" aria-label="最新精选">
        <div class="section-kicker">最新一期</div>
        <h2>${escapeHtml(latest.title)}</h2>
        <div class="latest-summary" aria-label="本期岗位摘要">
          <strong>${escapeHtml(latestSummary.countText)}</strong>
          <span>${escapeHtml(latestSummary.fitText)}</span>
          <div class="summary-tags">
            ${latestSummary.directions
              .map((direction) => `<span>${escapeHtml(direction)}</span>`)
              .join("")}
          </div>
        </div>
        <div class="home-actions">
          <a class="primary-link" href="/picks/${latest.slug}/">打开最新精选</a>
        </div>
        <p class="trust-note">申请前请以原岗位页面为准。</p>
      </aside>`
    : `<aside class="latest-panel"><h2>还没有岗位精选</h2><p>把 Markdown 文件放入 job-picks 后重新构建。</p></aside>`;

  return pageTemplate({
    title: "Find Work 外企/远程岗位精选",
    description: "面向朋友分享的外企、APAC 和海外远程岗位精选归档。",
    body: `<main>
  <section class="home-hero" aria-labelledby="home-hero-title">
    <div class="hero-copy">
      <div class="section-kicker">社群筛选笔记</div>
      <h1 id="home-hero-title">外企 / 远程岗位筛选台</h1>
      <p>每天把适合中国申请者的外企、APAC 和海外远程岗位拆成可筛选的方向、语言、门槛和可投把握。</p>
      <div class="fit-dimensions hero-dimensions" aria-label="可筛选条件">
        <span>岗位方向</span>
        <span>工作方式</span>
        <span>英文要求</span>
        <span>经验阶段</span>
        <span>申请门槛</span>
        <span>中国可投把握</span>
      </div>
      <div class="home-actions">
        <a class="primary-link hero-primary" href="/archive/">进入岗位筛选</a>
        ${latest ? `<a class="text-link hero-secondary" href="/picks/${latest.slug}/">看最新一期</a>` : ""}
      </div>
    </div>
    ${latestBlock}
  </section>
  <section class="home-grid">
    <aside class="archive-panel" aria-label="近期归档">
      <h2>近期更新</h2>
      <ol class="archive-list">${archiveItems}</ol>
      <a class="secondary-link" href="/archive/">查看全部</a>
    </aside>
    <section class="fit-entry" aria-labelledby="fit-entry-title">
      <h2 id="fit-entry-title">找适合我的岗位</h2>
      <p>归档页可以按发布时间、关键词、英文要求、工作方式、申请门槛、可投把握、经验要求和岗位方向筛选。</p>
      <a class="primary-link" href="/archive/">进入岗位筛选</a>
    </section>
  </section>
</main>`,
  });
}

function renderAbout(about) {
  return pageTemplate({
    title: `${about.title} | Find Work`,
    description: "Find Work 岗位筛选网站说明、适合人群、筛选判断方式和个人说明。",
    canonicalPath: "/about/",
    body: `<main class="reading-layout">
  <article class="pick-article">
    ${about.html}
  </article>
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

function renderSurvey() {
  return pageTemplate({
    title: "岗位需求问卷 | Find Work",
    description: "收集朋友们的岗位方向、远程方式、英文要求和经验阶段偏好。",
    canonicalPath: "/survey/",
    body: `<main class="survey-layout">
  <section class="survey-hero">
    <div class="section-kicker">Survey</div>
    <h1>岗位需求问卷</h1>
    <p>告诉我你现在最想看的岗位类型。每个人保留一份问卷，同一浏览器再次提交会更新之前的选择。</p>
  </section>
  <section class="survey-panel" aria-labelledby="survey-form-title">
    <div class="survey-status" data-survey-status hidden></div>
    <form class="survey-form" data-survey-form data-turnstile-site-key="${escapeHtml(TURNSTILE_SITE_KEY)}">
      <div class="form-section">
        <h2 id="survey-form-title">你的基本信息</h2>
        <div class="form-row">
          <label class="field">
            <span>昵称</span>
            <input type="text" name="voterName" maxlength="40" required autocomplete="nickname" placeholder="方便我知道是谁投的">
          </label>
          <label class="field">
            <span>邀请码</span>
            <input type="password" name="inviteCode" maxlength="80" required autocomplete="off" placeholder="我分享给你的口令">
          </label>
        </div>
      </div>
      <div class="form-section">
        <h2>主要偏好</h2>
        <div class="form-row">
          <label class="field">
            <span>最想看的岗位方向</span>
            <select name="primaryJobCategory" required data-select-options="jobCategories"></select>
          </label>
          <label class="field">
            <span>第二选择</span>
            <select name="secondaryJobCategory" data-select-options="jobCategories" data-optional-label="暂时没有"></select>
          </label>
        </div>
        <div class="form-row three-columns">
          <label class="field">
            <span>工作方式</span>
            <select name="workMode" required data-select-options="workModes"></select>
          </label>
          <label class="field">
            <span>英文要求</span>
            <select name="englishLevel" required data-select-options="englishLevel"></select>
          </label>
          <label class="field">
            <span>申请门槛</span>
            <select name="difficultyLevel" required data-select-options="difficultyLevel"></select>
          </label>
        </div>
      </div>
      <div class="form-section">
        <h2>补充信息</h2>
        <label class="field">
          <span>经验阶段</span>
          <select name="experienceLevel" required data-select-options="experienceLevels"></select>
        </label>
        <label class="field">
          <span>其他方向 / 关键词</span>
          <textarea name="otherKeywords" maxlength="600" rows="4" placeholder="比如：日语客服、游戏本地化、跨境电商运营"></textarea>
        </label>
      </div>
      <div class="turnstile-box" data-turnstile-box></div>
      <div class="form-actions">
        <button type="submit" data-submit-survey>提交问卷</button>
      </div>
    </form>
  </section>
</main>`,
    scripts: [
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
      "/assets/survey.js",
    ],
  });
}

function renderSurveyAdmin() {
  return pageTemplate({
    title: "问卷统计 | Find Work",
    description: "查看岗位需求问卷的私有统计结果。",
    canonicalPath: "/survey-admin/",
    body: `<main class="survey-layout admin-layout">
  <section class="survey-hero">
    <div class="section-kicker">Admin</div>
    <h1>问卷统计</h1>
    <p>输入管理密码查看聚合结果。这个页面不会公开显示给朋友。</p>
  </section>
  <section class="survey-panel">
    <form class="admin-login" data-admin-form>
      <label class="field">
        <span>管理密码</span>
        <input type="password" name="adminPassword" required autocomplete="current-password">
      </label>
      <button type="submit">查看统计</button>
    </form>
    <div class="survey-status" data-admin-status hidden></div>
    <div class="stats-dashboard" data-stats-dashboard hidden>
      <div class="stats-summary">
        <div>
          <strong data-total-responses>0</strong>
          <span>有效问卷</span>
        </div>
        <div>
          <strong data-last-updated>暂无</strong>
          <span>最近更新</span>
        </div>
      </div>
      <div class="stats-grid">
        <section class="stats-card">
          <h2>岗位方向</h2>
          <div data-chart="jobCategories"></div>
        </section>
        <section class="stats-card">
          <h2>工作方式</h2>
          <div data-chart="workModes"></div>
        </section>
        <section class="stats-card">
          <h2>英文要求</h2>
          <div data-chart="englishLevel"></div>
        </section>
        <section class="stats-card">
          <h2>经验阶段</h2>
          <div data-chart="experienceLevels"></div>
        </section>
        <section class="stats-card">
          <h2>申请门槛</h2>
          <div data-chart="difficultyLevel"></div>
        </section>
        <section class="stats-card keywords-card">
          <h2>补充关键词</h2>
          <div data-keywords></div>
        </section>
      </div>
    </div>
  </section>
</main>`,
    scripts: ["/assets/survey-admin.js"],
  });
}

function copyAssets() {
  ensureDir(path.join(DIST_DIR, "assets"));
  fs.copyFileSync(path.join(SITE_DIR, "styles.css"), path.join(DIST_DIR, "assets", "styles.css"));
  fs.copyFileSync(path.join(SITE_DIR, "archive.js"), path.join(DIST_DIR, "assets", "archive.js"));
  fs.copyFileSync(path.join(SITE_DIR, "survey.js"), path.join(DIST_DIR, "assets", "survey.js"));
  fs.copyFileSync(path.join(SITE_DIR, "survey-admin.js"), path.join(DIST_DIR, "assets", "survey-admin.js"));
  fs.copyFileSync(path.join(SITE_DIR, "wechat_qr.jpg"), path.join(DIST_DIR, "assets", "wechat_qr.jpg"));
}

function main() {
  emptyDir(DIST_DIR);
  copyAssets();

  const picks = getPickFiles().map(readPick);
  const jobs = picks.flatMap(extractJobs);
  writePage("index.html", renderIndex(picks));
  writePage(path.join("about", "index.html"), renderAbout(readAboutPage()));
  writePage(path.join("archive", "index.html"), renderArchive(picks));
  writePage(path.join("survey", "index.html"), renderSurvey());
  writePage(path.join("survey-admin", "index.html"), renderSurveyAdmin());
  fs.writeFileSync(path.join(DIST_DIR, "assets", "jobs.json"), `${JSON.stringify(jobs, null, 2)}\n`);

  for (const pick of picks) {
    writePage(path.join("picks", pick.slug, "index.html"), renderPickPage(pick));
  }

  fs.writeFileSync(path.join(DIST_DIR, "robots.txt"), "User-agent: *\nDisallow: /\n");
  fs.writeFileSync(
    path.join(DIST_DIR, "_headers"),
    "/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n"
  );
  fs.writeFileSync(
    path.join(DIST_DIR, "_routes.json"),
    `${JSON.stringify({ version: 1, include: ["/api/*"], exclude: [] }, null, 2)}\n`
  );

  console.log(`Built ${picks.length} job pick page(s) and ${jobs.length} job record(s) into dist/`);
}

main();
