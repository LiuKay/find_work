const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const PICKS_DIR = path.join(ROOT, "job-picks");
const CURATED_FILE = path.join(ROOT, "data", "curated", "jobs.ndjson");
const ISSUES_DIR = path.join(ROOT, "data", "issues");
const RECRUITING_FILE = path.join(ROOT, "data", "recruiting.json");
const ABOUT_FILE = path.join(ROOT, "about.md");
const DIST_DIR = path.join(ROOT, "dist");
const SITE_DIR = path.join(ROOT, "site");
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "";
const ASSET_VERSION = process.env.CF_PAGES_COMMIT_SHA || "local";
const POOL_DAYS = 14;
const CHANNELS = [
  { id: "low-english", name: "低英文友好", description: "中文、双语或明确低英文门槛的岗位。" },
  { id: "ops-cs", name: "运营 / 客服 / 客户成功", description: "偏运营、客服与客户成功的岗位。" },
  { id: "support-tech", name: "技术支持 / IT", description: "技术支持、IT 运营与 QA 岗位。" },
  { id: "remote-apac", name: "时区友好远程", description: "远程且与中国或 APAC 工作时段较友好的岗位。" },
  { id: "entry", name: "入门 / 低门槛", description: "入门阶段或申请门槛较低的岗位。" },
  { id: "china-strong", name: "中国可投高把握", description: "中国可投把握为高的岗位。" },
];

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

function normalizeJobUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|gh_src$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim();
  }
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
    const jobUrl = normalizeJobUrl(job.link);
    const structured =
      pick.structuredJobs.find((item) => jobUrl && normalizeJobUrl(item.url) === jobUrl) ||
      pick.structuredJobs.find((item) => item.title === job.title) ||
      {};
    return {
      ...job,
      applicationBarrier: plainMarkdown(structured.application_barrier || job.threshold),
      chinaApplicability: plainMarkdown(structured.china_applicability || job.confidence),
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

function poolAsOfDate() {
  return (
    process.env.POOL_AS_OF_DATE ||
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date())
  );
}

function poolCutoffDate(asOfDate) {
  const date = new Date(`${asOfDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== asOfDate
  ) {
    throw new Error(`Invalid POOL_AS_OF_DATE: ${asOfDate}`);
  }
  date.setUTCDate(date.getUTCDate() - (POOL_DAYS - 1));
  return date.toISOString().slice(0, 10);
}

function buildPoolJobs(picks, asOfDate = poolAsOfDate()) {
  const cutoff = poolCutoffDate(asOfDate);
  const jobsByIdentity = new Map();

  for (const pick of picks.filter((item) => item.date <= asOfDate)) {
    for (const job of extractJobs(pick)) {
      const chinaApplicability = String(job.chinaApplicability).match(/^(高|中|低|待确认|不明确)/)?.[0];
      const applicationBarrier = String(job.applicationBarrier).match(/^(高|中|低)/)?.[0] || "待确认";
      if (!job.title || !job.company || !job.link || !chinaApplicability || !job.applicationBarrier || !job.fit) {
        continue;
      }

      // ponytail: direct-link identity is enough until redirects create measurable duplicate noise.
      const identity = normalizeJobUrl(job.link);
      const jobId = `j_${crypto.createHash("sha256").update(identity).digest("hex").slice(0, 12)}`;
      const existing = jobsByIdentity.get(identity);

      if (existing) {
        existing.firstSeenDate = [existing.firstSeenDate, job.date].sort()[0];
        existing.lastFeaturedDate = [existing.lastFeaturedDate, job.date].sort().reverse()[0];
        if (!existing.featuredIssueSlugs.includes(job.issueSlug)) existing.featuredIssueSlugs.push(job.issueSlug);
        continue;
      }

      jobsByIdentity.set(identity, {
        ...job,
        id: jobId,
        applicationBarrier,
        chinaApplicability,
        firstSeenDate: job.date,
        lastFeaturedDate: job.date,
        featuredIssueSlugs: [job.issueSlug],
      });
    }
  }

  const applicabilityRank = { 高: 3, 中: 2, 低: 1 };
  return Array.from(jobsByIdentity.values())
    .filter((job) => job.lastFeaturedDate >= cutoff)
    .sort((a, b) => {
      const rank = (job) => applicabilityRank[String(job.chinaApplicability).match(/高|中|低/)?.[0]] || 0;
      return rank(b) - rank(a) || b.lastFeaturedDate.localeCompare(a.lastFeaturedDate);
    });
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function readIssues(issuesDir = ISSUES_DIR) {
  if (!fs.existsSync(issuesDir)) return [];
  return fs
    .readdirSync(issuesDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(issuesDir, file), "utf8")));
}

function readRecruiting(filePath = RECRUITING_FILE) {
  const items = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : [];
  if (!Array.isArray(items)) throw new Error("data/recruiting.json must contain an array.");
  return items.map((item, index) => {
    const label = `data/recruiting.json item ${index + 1}`;
    const required = ["title", "organization", "channel", "depositRequired", "intermediary", "requirements", "workContent", "compensationAndWorkMode", "notes", "url"];
    if (required.some((field) => !String(item[field] || "").trim())) {
      throw new Error(`${label} is missing a required field.`);
    }
    const url = new URL(item.url);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error(`${label} url must use http or https.`);
    if (item.image && (!/^\/assets\/[a-zA-Z0-9._-]+$/.test(item.image) || !item.imageAlt || !Number.isInteger(item.imageWidth) || !Number.isInteger(item.imageHeight))) {
      throw new Error(`${label} image requires a safe asset path, alt text, width, and height.`);
    }
    return { ...item, url: url.href };
  });
}

function isPublicCuratedJob(job) {
  let safeUrl = false;
  try {
    const parsed = new URL(String(job && job.url ? job.url : ""));
    safeUrl = ["http:", "https:"].includes(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    safeUrl = false;
  }
  return (
    job &&
    job.status === "active" &&
    safeUrl &&
    ["title", "company", "url", "china_applicability", "application_barrier", "best_for"].every(
      (field) => String(job[field] || "").trim()
    )
  );
}

function publicJobFromCurated(job, issueById) {
  const featuredIssueSlugs = Array.isArray(job.featured_issue_ids) ? job.featured_issue_ids : [];
  const issueSlug = featuredIssueSlugs[featuredIssueSlugs.length - 1] || "";
  const issue = issueById.get(issueSlug) || {};
  const searchText = [
    job.last_featured_date,
    job.title,
    job.company,
    job.job_direction,
    job.work_mode,
    job.experience,
    job.language,
    job.china_applicability,
    job.application_barrier,
    job.best_for,
    job.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    id: job.job_id,
    date: job.last_featured_date,
    firstSeenDate: job.first_seen_date,
    lastFeaturedDate: job.last_featured_date,
    featuredIssueSlugs,
    issueSlug,
    issueTitle: issue.title || issueSlug,
    issueUrl: issueSlug ? `/picks/${issueSlug}/` : "/archive/",
    title: job.title,
    company: job.company,
    direction: job.job_direction || "",
    workMode: job.work_mode || "",
    experience: job.experience || "",
    language: job.language || "",
    applicationBarrier: job.application_barrier,
    chinaApplicability: job.china_applicability,
    threshold: job.application_barrier_note || job.application_barrier,
    confidence: [job.china_applicability, job.china_applicability_note].filter(Boolean).join("，"),
    timezone: job.timezone_judgment || "",
    timezoneFriendly: Boolean(job.timezone_friendly),
    fit: job.best_for,
    notes: job.notes || "",
    link: job.url,
    channels: Array.isArray(job.channels) ? job.channels : [],
    searchText,
  };
}

function buildPublicJobs(curatedJobs, issues) {
  const issueById = new Map(issues.map((issue) => [issue.issue_id, issue]));
  const applicabilityRank = { 高: 3, 中: 2, 待确认: 1, 低: 0, 不明确: 0 };
  return curatedJobs
    .filter(isPublicCuratedJob)
    .map((job) => publicJobFromCurated(job, issueById))
    .sort(
      (a, b) =>
        (applicabilityRank[b.chinaApplicability] || 0) - (applicabilityRank[a.chinaApplicability] || 0) ||
        b.lastFeaturedDate.localeCompare(a.lastFeaturedDate) ||
        a.id.localeCompare(b.id)
    );
}

function matchesChannel(job, channelId) {
  return Array.isArray(job.channels) && job.channels.includes(channelId);
}

function buildPublicIssues(issues, publicJobs) {
  const publicIds = new Set(publicJobs.map((job) => job.id));
  const publicById = new Map(publicJobs.map((job) => [job.id, job]));
  return issues
    .map((issue) => {
      const jobIds = (issue.job_ids || []).filter((jobId) => publicIds.has(jobId));
      return {
        issue_id: issue.issue_id,
        title: issue.title,
        mode: issue.mode,
        date: issue.date,
        job_ids: jobIds,
        stats: {
          count: jobIds.length,
          directions: [...new Set(jobIds.map((jobId) => publicById.get(jobId).direction).filter(Boolean))].sort(),
        },
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.issue_id.localeCompare(a.issue_id));
}

function buildPublicChannels(publicJobs, asOfDate) {
  return CHANNELS.map((channel) => {
    const jobs = publicJobs.filter((job) => matchesChannel(job, channel.id));
    return {
      ...channel,
      count: jobs.length,
      today_count: jobs.filter((job) => job.lastFeaturedDate === asOfDate).length,
      path: `/channels/${channel.id}/`,
      pool_path: `/pool/?channel=${channel.id}`,
    };
  });
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
      <a href="/pool/">可投</a>
      <a href="/recruiting/">招募</a>
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

function renderIndex(picks, poolJobs, publicIssues, channels, asOfDate) {
  const latest = picks[0];
  const latestSummary = latestIssueSummary(latest ? extractJobs(latest) : []);
  const latestUpdateDate = publicIssues[0]?.date || asOfDate;
  const todayIds = new Set(
    publicIssues.filter((issue) => issue.date === latestUpdateDate).flatMap((issue) => issue.job_ids)
  );
  const todayJobs = poolJobs.filter((job) => todayIds.has(job.id));
  const byDirection = new Map();
  for (const job of todayJobs) {
    const direction = job.direction || "其他";
    if (!byDirection.has(direction)) byDirection.set(direction, []);
    byDirection.get(direction).push(job);
  }
  const todayGroups = Array.from(byDirection.entries())
    .map(
      ([direction, jobs]) => `<section class="today-group">
        <h3>${escapeHtml(direction)}</h3>
        <ul>${jobs
          .map(
            (job) => `<li data-job-id="${escapeHtml(job.id)}">
              <a href="${escapeHtml(job.issueUrl)}">${escapeHtml(job.title)}</a>
              <span>${escapeHtml(job.company)}</span>
              <small>${escapeHtml(job.chinaApplicability)} · ${escapeHtml(job.fit)}</small>
            </li>`
          )
          .join("")}</ul>
      </section>`
    )
    .join("");
  const channelCards = channels
    .map(
      (channel) => `<a class="channel-card" href="${escapeHtml(channel.path)}">
        <span>${escapeHtml(channel.name)}</span>
        <strong>${channel.count} 个</strong>
        <small>${escapeHtml(channel.description)}${channel.today_count ? ` 今日 +${channel.today_count}` : ""}</small>
      </a>`
    )
    .join("");
  const recentIssues = publicIssues
    .slice(0, 5)
    .map(
      (issue) => `<li>
        <a href="/picks/${escapeHtml(issue.issue_id)}/">
          <time>${escapeHtml(issue.date)}</time>
          <span>${escapeHtml(issue.title)}</span>
          <small>${issue.job_ids.length} 个仍在库</small>
        </a>
      </li>`
    )
    .join("");

  return pageTemplate({
    title: "Find Work 外企/远程岗位精选",
    description: "今日上新、滚动可投库与按情况整理的外企和远程岗位频道。",
    body: `<main>
  <section class="home-hero" aria-labelledby="home-hero-title">
    <div class="hero-copy">
      <h1 id="home-hero-title">外企 / 远程岗位筛选台</h1>
      <p>先看今天新增，再按你的语言、经验、工作方式和中国可投把握继续筛。</p>
      <div class="fit-dimensions hero-dimensions" aria-label="可筛选条件">
        <span>岗位方向</span>
        <span>工作方式</span>
        <span>英文要求</span>
        <span>经验阶段</span>
        <span>申请门槛</span>
        <span>中国可投把握</span>
      </div>
      <div class="home-actions">
        <a class="primary-link hero-primary" href="/pool/">查看 ${poolJobs.length} 个可投岗位</a>
        <a class="text-link hero-secondary" href="/archive/">阅读精选期次</a>
      </div>
    </div>
    <aside class="latest-panel home-today-summary" aria-label="最新精选">
      <div class="section-kicker">最新一期</div>
      <h2>${latest ? escapeHtml(latest.title) : "还没有岗位精选"}</h2>
      <div class="latest-summary" aria-label="本期岗位摘要">
        <strong>${escapeHtml(latestSummary.countText)}</strong>
        <span>${escapeHtml(latestSummary.fitText)}</span>
        <div class="summary-tags">
          ${latestSummary.directions.map((direction) => `<span>${escapeHtml(direction)}</span>`).join("")}
        </div>
      </div>
      ${latest ? `<a class="secondary-link" href="/picks/${escapeHtml(latest.slug)}/">打开最新精选</a>` : ""}
      <p class="trust-note">申请前请以原岗位页面为准。</p>
    </aside>
  </section>
  <section class="editorial-section" id="today-jobs" aria-labelledby="today-title">
    <div class="editorial-heading"><div><div class="section-kicker">Today</div><h2 id="today-title">最新更新 <small>${escapeHtml(latestUpdateDate)}</small></h2></div><span>${todayJobs.length} 个</span></div>
    <div class="today-groups">${todayGroups || '<p class="home-empty">今天暂时没有新的终审岗位，可以先查看滚动可投库。</p>'}</div>
  </section>
  <section class="editorial-section" aria-labelledby="channels-title">
    <div class="editorial-heading"><div><div class="section-kicker">By Situation</div><h2 id="channels-title">按分类查看</h2></div><a href="/pool/">查看全部可投库</a></div>
    <div class="channel-grid">${channelCards}</div>
  </section>
  <section class="editorial-section" aria-labelledby="recent-issues-title">
    <div class="editorial-heading"><div><div class="section-kicker">Recent Notes</div><h2 id="recent-issues-title">最近更新</h2></div><a href="/archive/">查看归档</a></div>
    <ol class="recent-issue-list">${recentIssues || '<li class="home-empty">还没有可阅读的精选期次。</li>'}</ol>
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
  <p>按日期阅读每天的筛选笔记。想按条件找近期岗位，请前往 <a href="/pool/">可投库</a>。</p>
  <section class="issue-archive" aria-labelledby="issue-archive-title">
  <h2 id="issue-archive-title">每日归档</h2>
  <ol class="full-archive-list">${items}</ol>
  </section>
</main>`,
  });
}

function renderRecruiting(items) {
  const opportunities = items
    .map(
      (item) => `<article class="job-section opportunity-item">
    <div class="job-section-head">
      <div class="job-section-title">
        <div><span class="opportunity-status">${escapeHtml(item.status || "开放中")}</span>${item.promoted ? '<span class="promotion-badge">推广链接</span>' : ""}</div>
        <h2>${escapeHtml(item.title)}</h2>
        <p class="job-company-line"><span class="job-company-label">平台/公司</span><span class="job-company-value">${escapeHtml(item.organization)}</span></p>
      </div>
    </div>
    ${item.image ? `<figure class="opportunity-media">
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt)}" width="${item.imageWidth}" height="${item.imageHeight}" loading="lazy">
      <figcaption>相关招募信息截图</figcaption>
    </figure>` : ""}
    <dl class="job-summary-grid" aria-label="招募速览">
      ${renderSummaryItem("渠道", item.channel)}
      ${renderSummaryItem("是否交保证金", item.depositRequired)}
      ${renderSummaryItem("是否中介", item.intermediary)}
      ${renderSummaryItem("报酬与工作方式", item.compensationAndWorkMode)}
    </dl>
    <dl class="job-detail-stack" aria-label="招募详情">
      ${renderDetailRow("申请门槛", item.requirements)}
      ${renderDetailRow("工作内容", item.workContent)}
      ${renderDetailRow("注意事项", item.notes)}
    </dl>
    <a class="job-apply-link opportunity-link" href="${escapeHtml(item.url)}" rel="noopener noreferrer${item.promoted ? " sponsored" : ""}" target="_blank">平台注册链接 <span aria-hidden="true">↗</span></a>
  </article>`
    )
    .join("\n");

  return pageTemplate({
    title: "招募与合作机会 | Find Work",
    description: "我主动收集或合作推广的招募与合作机会。",
    canonicalPath: "/recruiting/",
    body: `<main class="archive-layout recruiting-layout">
  <div class="section-kicker">Recruiting Board</div>
  <h1>招募与合作机会</h1>
  <p class="recruiting-lead">这里放我主动收集、确认值得关注的机会，也可能包含我的专属推广入口。</p>
  <aside class="promotion-note" aria-labelledby="promotion-note-title">
    <strong id="promotion-note-title">先说明</strong>
    <p>带有「推广链接」标识的入口可能为我带来奖励，但不会增加你的申请成本。请在参与前自行核实招募方、期限和具体条款。</p>
  </aside>
  <section class="opportunity-list pick-detail-list" aria-label="招募机会">
    ${opportunities || '<div class="job-section opportunity-empty"><strong>新的机会正在整理</strong><p>确认信息和参与条件后，我会发布在这里。</p></div>'}
  </section>
</main>`,
  });
}

function renderPool(asOfDate, channel = null) {
  const pageTitle = channel ? channel.name : `近 ${POOL_DAYS} 天可投库`;
  const pageDescription = channel
    ? channel.description
    : `近 ${POOL_DAYS} 天完成筛选、适合中国申请者继续判断的外企和远程岗位。`;
  return pageTemplate({
    title: `${pageTitle} | Find Work`,
    description: pageDescription,
    canonicalPath: channel ? `/channels/${channel.id}/` : "/pool/",
    body: `<main class="archive-layout">
  <div class="section-kicker">${channel ? "Situation Channel" : "Active Pool"}</div>
  <h1>${escapeHtml(pageTitle)}</h1>
  ${channel ? `<p class="channel-intro">${escapeHtml(channel.description)} <a href="/pool/?channel=${escapeHtml(channel.id)}">在完整可投库中查看同一筛选</a></p>` : ""}
  <section class="job-filter" aria-labelledby="job-filter-title">
    <div class="filter-heading">
      <div>
        <h2 id="job-filter-title">岗位筛选</h2>
        <p>截至 ${escapeHtml(asOfDate)}，仅收录判断字段完整的近期岗位；申请前请以原页面为准。</p>
      </div>
      <span class="job-count" data-job-count>读取中</span>
    </div>
    <form class="filter-controls" data-job-filter data-default-channel="${channel ? escapeHtml(channel.id) : ""}">
      <input type="hidden" name="channel" value="${channel ? escapeHtml(channel.id) : ""}">
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
    <p class="filter-empty" data-job-empty hidden>没有匹配的岗位，试试放宽条件。</p>
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
    <aside class="survey-recommendations" data-channel-recommendations hidden aria-live="polite"></aside>
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

function copyAssets(recruiting = []) {
  ensureDir(path.join(DIST_DIR, "assets"));
  fs.copyFileSync(path.join(SITE_DIR, "styles.css"), path.join(DIST_DIR, "assets", "styles.css"));
  fs.copyFileSync(path.join(SITE_DIR, "archive.js"), path.join(DIST_DIR, "assets", "archive.js"));
  fs.copyFileSync(path.join(SITE_DIR, "survey.js"), path.join(DIST_DIR, "assets", "survey.js"));
  fs.copyFileSync(path.join(SITE_DIR, "survey-admin.js"), path.join(DIST_DIR, "assets", "survey-admin.js"));
  fs.copyFileSync(path.join(SITE_DIR, "wechat_qr.jpg"), path.join(DIST_DIR, "assets", "wechat_qr.jpg"));
  for (const image of new Set(recruiting.map((item) => item.image).filter(Boolean))) {
    const fileName = path.basename(image);
    fs.copyFileSync(path.join(SITE_DIR, fileName), path.join(DIST_DIR, "assets", fileName));
  }
}

function main() {
  const recruiting = readRecruiting();
  emptyDir(DIST_DIR);
  copyAssets(recruiting);

  const picks = getPickFiles().map(readPick);
  const asOfDate = poolAsOfDate();
  if (!fs.existsSync(CURATED_FILE)) {
    throw new Error("Missing data/curated/jobs.ndjson; run scripts/curated_jobs.py migrate first.");
  }
  const curatedJobs = readNdjson(CURATED_FILE);
  const issues = readIssues();
  const poolJobs = buildPublicJobs(curatedJobs, issues);
  const publicIssues = buildPublicIssues(issues, poolJobs);
  const publicChannels = buildPublicChannels(poolJobs, asOfDate);
  writePage("index.html", renderIndex(picks, poolJobs, publicIssues, publicChannels, asOfDate));
  writePage(path.join("about", "index.html"), renderAbout(readAboutPage()));
  writePage(path.join("pool", "index.html"), renderPool(asOfDate));
  writePage(path.join("recruiting", "index.html"), renderRecruiting(recruiting));
  writePage(path.join("archive", "index.html"), renderArchive(picks));
  writePage(path.join("survey", "index.html"), renderSurvey());
  writePage(path.join("survey-admin", "index.html"), renderSurveyAdmin());
  fs.writeFileSync(path.join(DIST_DIR, "assets", "jobs.json"), `${JSON.stringify(poolJobs, null, 2)}\n`);
  fs.writeFileSync(path.join(DIST_DIR, "assets", "issues.json"), `${JSON.stringify(publicIssues, null, 2)}\n`);
  fs.writeFileSync(path.join(DIST_DIR, "assets", "channels.json"), `${JSON.stringify(publicChannels, null, 2)}\n`);

  for (const channel of CHANNELS) {
    writePage(path.join("channels", channel.id, "index.html"), renderPool(asOfDate, channel));
  }

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

  console.log(
    `Built ${picks.length} job pick page(s), ${poolJobs.length} active pool job(s), and ${CHANNELS.length} channel(s) into dist/`
  );
}

if (require.main === module) main();

module.exports = {
  CHANNELS,
  buildPoolJobs,
  buildPublicChannels,
  buildPublicIssues,
  buildPublicJobs,
  isPublicCuratedJob,
  matchesChannel,
  normalizeJobUrl,
  poolCutoffDate,
  publicJobFromCurated,
  readRecruiting,
  renderRecruiting,
};
