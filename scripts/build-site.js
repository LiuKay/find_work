const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CURATED_FILE = path.join(ROOT, "data", "curated", "jobs.ndjson");
const TAXONOMY_FILE = path.join(ROOT, "data", "schema", "job-taxonomy.json");
const ISSUES_DIR = path.join(ROOT, "data", "issues");
const RECRUITING_FILE = path.join(ROOT, "data", "recruiting.json");
const ABOUT_FILE = path.join(ROOT, "about.md");
const DIST_DIR = path.join(ROOT, "dist");
const SITE_DIR = path.join(ROOT, "site");
const TURNSTILE_SITE_KEY = process.env.TURNSTILE_SITE_KEY || "";
const ASSET_VERSION = process.env.CF_PAGES_COMMIT_SHA || "local";
const POOL_DAYS = 14;
const TAXONOMY = JSON.parse(fs.readFileSync(TAXONOMY_FILE, "utf8"));
const FILTER_FIELD_MAP = {
  direction: "job_direction",
  workMode: "work_mode",
  experience: "experience",
  language: "language",
  threshold: "application_barrier",
  confidence: "china_applicability",
};
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

function buildFilterOptions(taxonomy = TAXONOMY) {
  const fields = taxonomy && taxonomy.fields;
  if (!fields) throw new Error("Job taxonomy must contain fields.");
  return Object.fromEntries(
    Object.entries(FILTER_FIELD_MAP).map(([publicField, sourceField]) => {
      const values = fields[sourceField] && fields[sourceField].values;
      if (!Array.isArray(values) || !values.length || new Set(values).size !== values.length) {
        throw new Error(`Job taxonomy field ${sourceField} must contain unique values.`);
      }
      return [publicField, values];
    })
  );
}

const FILTER_OPTIONS = buildFilterOptions();

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

    const linkedImage = /^\[!\[([^\]]*)\]\((\/[^)\s]+)\)\]\((https?:\/\/[^)\s]+)\)$/.exec(line.trim());
    if (linkedImage) {
      closeParagraph();
      closeList();
      html.push(`<figure class="markdown-image markdown-image-wide"><a href="${escapeHtml(linkedImage[3])}" rel="noopener noreferrer" target="_blank"><img src="${escapeHtml(linkedImage[2])}" alt="${escapeHtml(linkedImage[1])}" loading="lazy"></a></figure>`);
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

function picksFromIssues(issues) {
  return issues
    .map((issue) => ({ slug: issue.issue_id, title: issue.title, date: issue.date }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug));
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
    [
      "job_id",
      "title",
      "company",
      "url",
      "china_applicability",
      "china_applicability_note",
      "application_barrier",
      "application_barrier_note",
      "best_for",
      "notes",
      "timezone_judgment",
      "last_featured_date",
    ].every(
      (field) => String(job[field] || "").trim()
    ) &&
    Array.isArray(job.featured_issue_ids) &&
    job.featured_issue_ids.length > 0 &&
    /^j_[a-f0-9]{12,}$/.test(job.job_id)
  );
}

function isDisplayableCuratedJob(job) {
  try {
    const url = new URL(String(job && job.url ? job.url : ""));
    return (
      /^j_[a-f0-9]{12,}$/.test(String(job.job_id || "")) &&
      Boolean(String(job.title || "").trim()) &&
      Boolean(String(job.company || "").trim()) &&
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

function validateActiveJobDetails(curatedJobs) {
  const activeJobs = curatedJobs.filter((job) => job && job.status === "active");
  const invalid = activeJobs.filter((job) => !isPublicCuratedJob(job));
  const idCounts = new Map();
  for (const job of activeJobs) idCounts.set(job.job_id, (idCounts.get(job.job_id) || 0) + 1);
  const duplicateIds = Array.from(idCounts.values()).filter((count) => count > 1).length;
  const invalidTaxonomy = activeJobs.flatMap((job) =>
    Object.values(FILTER_FIELD_MAP).flatMap((field) => {
      const values = TAXONOMY.fields[field].values;
      return values.includes(job[field]) ? [] : [`${job.job_id}:${field}=${job[field] || "<blank>"}`];
    })
  );
  if (!invalid.length && !duplicateIds && !invalidTaxonomy.length) return;

  const requiredFields = [
    "job_id",
    "title",
    "company",
    "url",
    "china_applicability",
    "china_applicability_note",
    "application_barrier",
    "application_barrier_note",
    "best_for",
    "notes",
    "timezone_judgment",
    "featured_issue_ids",
    "last_featured_date",
  ];
  const missing = requiredFields
    .map((field) => {
      const count = invalid.filter((job) =>
        field === "featured_issue_ids"
          ? !Array.isArray(job[field]) || job[field].length === 0
          : !String(job[field] || "").trim()
      ).length;
      return count ? `${field}: ${count}` : "";
    })
    .filter(Boolean);
  const invalidIds = invalid.filter((job) => !/^j_[a-f0-9]{12,}$/.test(String(job.job_id || ""))).length;
  if (invalidIds && !missing.some((item) => item.startsWith("job_id:"))) {
    missing.push(`job_id format: ${invalidIds}`);
  }
  const invalidUrls = invalid.filter((job) => {
    try {
      const url = new URL(String(job.url || ""));
      return !["http:", "https:"].includes(url.protocol) || !url.hostname;
    } catch {
      return true;
    }
  }).length;
  if (invalidUrls && !missing.some((item) => item.startsWith("url:"))) missing.push(`url format: ${invalidUrls}`);
  if (duplicateIds) missing.push(`duplicate job_id: ${duplicateIds}`);
  if (invalidTaxonomy.length) missing.push(`invalid taxonomy: ${invalidTaxonomy.join(", ")}`);
  throw new Error(`Active curated jobs are missing detail fields (${missing.join(", ")}).`);
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
    job.china_applicability_note,
    job.application_barrier,
    job.application_barrier_note,
    job.best_for,
    job.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    id: job.job_id,
    detailUrl: `/jobs/${job.job_id}/`,
    date: job.last_featured_date || "",
    updatedAt: job.last_featured_date || "",
    firstSeenDate: job.first_seen_date || "",
    lastFeaturedDate: job.last_featured_date || "",
    featuredIssueSlugs,
    issueSlug,
    issueTitle: issue.title || issueSlug,
    issueUrl: issueSlug ? `/picks/${issueSlug}/` : "/archive/",
    title: job.title || "",
    company: job.company || "",
    companyPlatform: job.company_platform || job.company || "",
    direction: job.job_direction || "",
    workMode: job.work_mode || "",
    experience: job.experience || "",
    language: job.language || "",
    applicationBarrier: job.application_barrier || "",
    applicationBarrierNote: job.application_barrier_note || "",
    chinaApplicability: job.china_applicability || "",
    chinaApplicabilityNote: job.china_applicability_note || "",
    threshold: job.application_barrier_note || job.application_barrier || "",
    confidence: [job.china_applicability, job.china_applicability_note].filter(Boolean).join("，"),
    timezone: job.timezone_judgment || "",
    timezoneFriendly: Boolean(job.timezone_friendly),
    fit: job.best_for || "",
    notes: job.notes || "",
    link: job.url || "",
    channels: Array.isArray(job.channels) ? job.channels : [],
    searchText,
  };
}

function buildIssuePageJobs(curatedJobs, issues) {
  const referencedIds = new Set(issues.flatMap((issue) => issue.job_ids || []));
  const issueById = new Map(issues.map((issue) => [issue.issue_id, issue]));
  return curatedJobs
    .filter((job) => referencedIds.has(job.job_id) && isDisplayableCuratedJob(job))
    .map((job) => publicJobFromCurated(job, issueById));
}

function buildPublicJobs(curatedJobs, issues) {
  validateActiveJobDetails(curatedJobs);
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

function confidencePresentation(value) {
  if (value === "高") return { className: "confidence-high", icon: "✓", label: "中国可投把握高" };
  if (value === "中") return { className: "confidence-medium", icon: "!", label: "中国可投把握中" };
  if (value === "低") return { className: "confidence-low", icon: "△", label: "中国可投把握低" };
  return { className: "confidence-unknown", icon: "?", label: "需要自行确认" };
}

function companyInitial(company) {
  const match = String(company || "").trim().match(/[a-zA-Z0-9\u4e00-\u9fff]/u);
  return match ? match[0].toUpperCase() : "FW";
}

function appIcon(name, className = "") {
  const extraClass = className ? ` ${className}` : "";
  return `<img class="app-icon icon-${escapeHtml(name)}${extraClass}" src="/assets/icons/${escapeHtml(name)}.svg" alt="" aria-hidden="true">`;
}

function renderJobCard(job) {
  const confidence = confidencePresentation(job.chinaApplicability);
  const tags = [job.direction, job.workMode, job.language, job.experience || job.applicationBarrier]
    .filter(Boolean)
    .slice(0, 4)
    .map((tag) => `<span>${escapeHtml(tag)}</span>`)
    .join("");
  return `<article class="mobile-job-card" data-job-card data-job-id="${escapeHtml(job.id)}">
    <button class="bookmark-button" type="button" data-bookmark-job="${escapeHtml(job.id)}" aria-label="收藏 ${escapeHtml(job.title)}" aria-pressed="false">
      ${appIcon("bookmark", "bookmark-icon")}
    </button>
    <a class="mobile-job-card-link" href="${escapeHtml(job.detailUrl)}" aria-label="查看 ${escapeHtml(job.title)} 的岗位详情">
      <span class="company-initial" aria-hidden="true">${escapeHtml(companyInitial(job.company))}</span>
      <span class="mobile-job-card-content">
        <strong class="mobile-job-card-title">${escapeHtml(job.title)}</strong>
        <span class="mobile-job-card-company">${escapeHtml(job.company)} · ${escapeHtml(job.workMode)}</span>
        <span class="mobile-job-card-tags" aria-label="岗位标签">${tags}</span>
        <span class="job-card-confidence ${confidence.className}">${appIcon("stats-up-square")}<strong>${confidence.label}</strong></span>
        <span class="mobile-job-card-note">${escapeHtml(job.fit)}</span>
        <time datetime="${escapeHtml(job.updatedAt)}">${escapeHtml(job.updatedAt)} 更新</time>
      </span>
    </a>
  </article>`;
}

function inferActiveTab(canonicalPath) {
  if (canonicalPath === "/") return "home";
  if (canonicalPath.startsWith("/pool/") || canonicalPath.startsWith("/channels/")) return "pool";
  if (canonicalPath.startsWith("/archive/") || canonicalPath.startsWith("/picks/")) return "archive";
  if (canonicalPath.startsWith("/me/")) return "me";
  return "";
}

function navigationLink(pathname, label, tab, activeTab, icon = "") {
  const current = activeTab === tab ? ' aria-current="page"' : "";
  return `<a href="${pathname}"${current}>${icon ? appIcon(icon) : ""}<span>${label}</span></a>`;
}

function pageTemplate({
  title,
  description,
  body,
  canonicalPath = "/",
  scripts = [],
  activeTab,
  pageKind = "default",
  mobileTitle = "Find Work",
  mobileSubtitle = "外企 / 远程岗位精选",
}) {
  const resolvedActiveTab = activeTab === undefined ? inferActiveTab(canonicalPath) : activeTab;
  const baseScripts = ["/assets/storage.js", "/assets/app.js", "/assets/bookmarks.js", "/assets/recent.js"];
  const scriptTags = Array.from(new Set([...baseScripts, ...scripts]))
    .map((script) => `<script src="${escapeHtml(script)}" defer></script>`)
    .join("\n  ");
  const mobileTabs = pageKind === "job" ? "" : `<nav class="mobile-tabbar" aria-label="移动端主导航">
    ${navigationLink("/", "首页", "home", resolvedActiveTab, "home-simple")}
    ${navigationLink("/pool/", "可投库", "pool", resolvedActiveTab, "suitcase")}
    ${navigationLink("/archive/", "归档", "archive", resolvedActiveTab, "archive")}
    ${navigationLink("/me/", "我的", "me", resolvedActiveTab, "user")}
  </nav>`;
  const desktopNavigation = [
    navigationLink("/", "首页", "home", resolvedActiveTab),
    navigationLink("/pool/", "可投库", "pool", resolvedActiveTab),
    navigationLink("/archive/", "归档", "archive", resolvedActiveTab),
    navigationLink("/me/", "我的", "me", resolvedActiveTab),
    '<a href="/recruiting/"><span>招募</span></a>',
    '<a href="/survey/"><span>问卷</span></a>',
    '<a href="/about/"><span>关于</span></a>',
  ].join("");
  const mobileTopbar = ["job", "pick"].includes(pageKind) ? "" : `<header class="app-topbar">
    <a class="app-topbar-copy" href="${canonicalPath === "/" ? "/" : escapeHtml(canonicalPath)}" aria-label="${escapeHtml(mobileTitle)}">
      <strong>${escapeHtml(mobileTitle)}</strong>
      <span>${escapeHtml(mobileSubtitle)}</span>
    </a>
    <a class="notification-button" href="/me/" aria-label="查看收藏与最近浏览">${appIcon("bell-notification")}<span aria-hidden="true"></span></a>
  </header>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/assets/styles.css?v=${escapeHtml(ASSET_VERSION)}">
  <link rel="stylesheet" href="/assets/mobile-redesign.css?v=${escapeHtml(ASSET_VERSION)}">
  <link rel="canonical" href="${escapeHtml(canonicalPath)}">
  ${scriptTags}
</head>
<body class="page-${escapeHtml(pageKind)}${mobileTabs ? " has-mobile-tabs" : ""}">
  ${mobileTopbar}
  <header class="site-header desktop-site-header">
    <a class="brand" href="/" aria-label="回到首页">
      <span class="brand-mark">FW</span>
      <span>
        <strong>Find Work</strong>
        <small>外企 / 远程岗位精选</small>
      </span>
    </a>
    <nav class="site-nav" aria-label="主导航">
      ${desktopNavigation}
    </nav>
  </header>
  ${body}
  <footer class="site-footer">
    <p>岗位信息随时变化，申请前请以原岗位页面为准。</p>
  </footer>
  ${mobileTabs}
</body>
</html>`;
}

function writePage(relativePath, html) {
  const target = path.join(DIST_DIR, relativePath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, html);
}

function renderPickJobCard(job, index) {
  const confidence = confidencePresentation(job.chinaApplicability);
  const detailSections = [
    ["申请门槛", job.applicationBarrierNote],
    ["适合谁", job.fit],
    ["注意事项", job.notes],
    ["时差判断", job.timezone],
  ];
  return `<article class="pick-job-card" data-job-card data-job-id="${escapeHtml(job.id)}" data-pick-direction="${escapeHtml(job.direction)}">
    <header class="pick-job-card-header">
      <div class="pick-job-card-topline">
        <span class="pick-job-index">岗位 ${String(index + 1).padStart(2, "0")}</span>
        <span class="pick-job-actions">
          <button class="bookmark-button" type="button" data-bookmark-job="${escapeHtml(job.id)}" aria-label="收藏 ${escapeHtml(job.title)}" aria-pressed="false">${appIcon("bookmark", "bookmark-icon")}</button>
          <a class="job-direct-link" href="${escapeHtml(job.link)}" target="_blank" rel="noopener noreferrer">查看原岗位</a>
        </span>
      </div>
      <h2><a href="${escapeHtml(job.detailUrl)}">${escapeHtml(job.title)}</a></h2>
      <p>${escapeHtml(job.companyPlatform)}</p>
    </header>
    <div class="pick-job-facts" aria-label="岗位基本信息">
      <span>${escapeHtml(job.direction)}</span>
      <span>${escapeHtml(job.workMode)}</span>
      <span>${escapeHtml(job.experience)}</span>
      <span>${escapeHtml(job.language)}</span>
    </div>
    <div class="pick-job-confidence ${confidence.className}">
      <strong>可投把握 ${escapeHtml(job.chinaApplicability)}</strong>
      <span>· ${escapeHtml(job.chinaApplicabilityNote)}</span>
    </div>
    <div class="pick-job-details">
      ${detailSections.map(([title, content]) => `<section><h3>${title}</h3><p>${escapeHtml(content || "岗位页面未披露")}</p></section>`).join("")}
    </div>
  </article>`;
}

function renderPickPage(pick, poolJobs = [], issue = null) {
  const jobsById = new Map(poolJobs.map((job) => [job.id, job]));
  const issueJobs = (issue?.job_ids || []).map((jobId) => jobsById.get(jobId)).filter(Boolean);

  return pageTemplate({
    title: `${pick.title} | Find Work`,
    description: `${pick.date} 的外企和海外远程岗位精选。`,
    canonicalPath: `/picks/${pick.slug}/`,
    activeTab: "archive",
    pageKind: "pick",
    scripts: ["/assets/pick-cards.js"],
    body: `<main class="pick-list-page" id="main-content">
  <nav class="pick-list-topbar" aria-label="期次操作">
    <a href="/archive/" aria-label="返回归档">${appIcon("nav-arrow-left")}</a>
    <time datetime="${escapeHtml(pick.date)}">${escapeHtml(pick.date)}</time>
    <button type="button" data-share-page data-share-title="${escapeHtml(pick.title)}" aria-label="分享本期精选">${appIcon("share-ios")}</button>
  </nav>
  <header class="pick-list-heading">
    <div>
      <h1>${escapeHtml(pick.title.replace(/^\d{4}-\d{2}-\d{2}\s*/, ""))}</h1>
      <p>本期 ${issueJobs.length} 个岗位 · 每日更新</p>
    </div>
    <button type="button" class="pick-card-download" data-download-pick-cards data-pick-date="${escapeHtml(pick.date)}" aria-label="下载当日岗位卡片">
      ${appIcon("download")}
    </button>
  </header>
  <nav class="pick-direction-tabs" aria-label="按岗位方向筛选">
    <button type="button" data-pick-filter="" aria-pressed="true">全部 <span>${issueJobs.length}</span></button>
    ${Array.from(new Set(issueJobs.map((job) => job.direction).filter(Boolean))).map((direction) => `<button type="button" data-pick-filter="${escapeHtml(direction)}" aria-pressed="false">${escapeHtml(direction)} <span>${issueJobs.filter((job) => job.direction === direction).length}</span></button>`).join("")}
  </nav>
  <section class="pick-job-list" aria-label="本期岗位">
    ${issueJobs.map(renderPickJobCard).join("\n") || '<p class="home-empty">本期岗位已不在当前可投库。</p>'}
  </section>
  <aside class="pick-list-disclaimer">${appIcon("warning-circle")}<span>岗位信息可能发生变化，申请前请以原岗位页面为准</span></aside>
  <p class="share-status" data-share-status role="status" aria-live="polite"></p>
</main>`,
  });
}

function renderIndex(picks, poolJobs, publicIssues, channels, asOfDate) {
  const visibleIssues = publicIssues.filter((issue) => issue.date <= asOfDate);
  const latestIssue = visibleIssues[0] || null;
  const latestPick = latestIssue
    ? picks.find((pick) => pick.slug === latestIssue.issue_id)
    : picks.find((pick) => pick.date <= asOfDate);
  const jobsById = new Map(poolJobs.map((job) => [job.id, job]));
  const latestJobs = latestIssue
    ? latestIssue.job_ids.map((jobId) => jobsById.get(jobId)).filter(Boolean)
    : [];
  const representativeJobs = latestJobs.slice(0, 3);
  const todayJobIds = new Set(
    visibleIssues.filter((issue) => issue.date === asOfDate).flatMap((issue) => issue.job_ids)
  );
  const latestSummary = latestIssueSummary(latestJobs);
  const latestUpdateDate = latestIssue?.date || latestPick?.date || asOfDate;
  const quickFilters = [
    { label: "岗位方向", icon: "suitcase", href: "/pool/?channel=ops-cs" },
    { label: "工作方式", icon: "globe", href: "/pool/?workMode=APAC%20%E8%BF%9C%E7%A8%8B" },
    { label: "英文要求", icon: "language", href: "/pool/?channel=low-english" },
    { label: "经验阶段", icon: "stats-up-square", href: "/pool/?experience=%E5%85%A5%E9%97%A8" },
    { label: "申请门槛", icon: "shield-check", href: "/pool/?threshold=%E4%BD%8E" },
    { label: "中国可投把握", icon: "check-circle", href: "/pool/?confidence=%E9%AB%98" },
  ];

  return pageTemplate({
    title: "Find Work 外企/远程岗位精选",
    description: "今日 Daily Brief、最新精选和适合中国申请者继续判断的外企与远程岗位。",
    canonicalPath: "/",
    activeTab: "home",
    pageKind: "home",
    mobileTitle: "Find Work",
    mobileSubtitle: "外企 / 远程岗位精选",
    body: `<main class="mobile-home" id="main-content">
  <section class="daily-brief" aria-labelledby="daily-brief-title">
    <div class="daily-brief-copy">
      <span class="daily-brief-status">早上好！ <small>Daily Brief</small></span>
      <h1 id="daily-brief-title">今天适合你的<br>远程岗位</h1>
      <p>为中国申请者精选外企与 APAC 远程岗位，每天更好一点点。</p>
      <span class="daily-brief-meta"><time datetime="${escapeHtml(asOfDate)}">${escapeHtml(asOfDate)}</time> · 今日新增 ${todayJobIds.size}</span>
    </div>
    <img src="/assets/remote-work-hero.jpg" width="640" height="426" fetchpriority="high" alt="地球、定位标记和笔记本电脑组成的远程工作插画">
  </section>

  <form class="home-search" action="/pool/" method="get" role="search">
    ${appIcon("search")}
    <label class="visually-hidden" for="home-search-query">搜索岗位</label>
    <input id="home-search-query" type="search" name="query" placeholder="搜索职位 / 公司 / 技能关键词" autocomplete="off">
    <a href="/pool/" class="home-filter-link">${appIcon("filter")}<span>筛选</span></a>
  </form>

  <section class="quick-filter-section" aria-labelledby="quick-filter-title">
    <h2 class="visually-hidden" id="quick-filter-title">快速筛选</h2>
    <div class="quick-filter-grid">
      ${quickFilters.map((filter) => `<a href="${filter.href}">${appIcon(filter.icon)}<strong>${filter.label}</strong></a>`).join("")}
    </div>
  </section>

  <section class="latest-job-section" id="today-jobs" aria-labelledby="latest-job-title">
    <header class="latest-issue-heading">
      <div>${appIcon("calendar")}<span><strong id="latest-job-title">最新一期</strong><small>${escapeHtml(latestUpdateDate)} · 本期 <b>${latestJobs.length}</b> 个岗位</small></span></div>
      <span class="latest-issue-tags"><i>全球远程</i><i>APAC 远程</i></span>
      ${latestIssue || latestPick ? `<a href="/picks/${escapeHtml(latestIssue?.issue_id || latestPick.slug)}/" aria-label="阅读最新一期">${appIcon("nav-arrow-right")}</a>` : ""}
    </header>
    <div class="mobile-job-list">
      ${representativeJobs.map(renderJobCard).join("\n") || '<p class="home-empty">今天暂时没有新的终审岗位，可以先查看滚动可投库。</p>'}
    </div>
    <div class="latest-note-actions">
      ${latestIssue || latestPick ? `<a class="secondary-link" href="/picks/${escapeHtml(latestIssue?.issue_id || latestPick.slug)}/">${appIcon("calendar")}<span>看最新一期</span></a>` : ""}
      <a class="primary-link" href="/pool/">${appIcon("filter")}<span>进入岗位筛选</span></a>
    </div>
  </section>
</main>`,
  });
}

function renderJobPage(job) {
  const confidence = confidencePresentation(job.chinaApplicability);
  const tags = [job.direction, job.workMode, job.language, job.experience]
    .filter(Boolean)
    .map((tag) => `<span>${escapeHtml(tag)}</span>`)
    .join("");
  return pageTemplate({
    title: `${job.title} · ${job.company} | Find Work`,
    description: `${job.company} 的 ${job.title} 岗位判断、门槛、适合人群和原岗位入口。`,
    canonicalPath: job.detailUrl,
    activeTab: "",
    pageKind: "job",
    mobileTitle: "岗位详情",
    body: `<main class="job-detail-page" id="main-content" data-current-job-id="${escapeHtml(job.id)}">
  <nav class="job-detail-actions" aria-label="岗位操作">
    <a href="/" class="detail-back-link" aria-label="返回首页">${appIcon("nav-arrow-left")}</a>
    <strong>岗位详情</strong>
    <div>
      <button type="button" class="detail-icon-button" data-bookmark-job="${escapeHtml(job.id)}" aria-label="收藏 ${escapeHtml(job.title)}" aria-pressed="false">${appIcon("bookmark", "bookmark-icon")}</button>
      <button type="button" class="detail-icon-button" data-share-page data-share-title="${escapeHtml(job.title)}" aria-label="分享 ${escapeHtml(job.title)}">${appIcon("share-ios")}</button>
    </div>
  </nav>

  <article class="job-detail-article">
    <header class="job-detail-hero">
      <span class="company-initial job-detail-initial" aria-hidden="true">${escapeHtml(companyInitial(job.company))}</span>
      <div>
        <p>${escapeHtml(job.company)}</p>
        <h1>${escapeHtml(job.title)}</h1>
        <div class="job-detail-tags" aria-label="岗位标签">${tags}</div>
      </div>
    </header>

    <section class="confidence-panel ${confidence.className}" aria-labelledby="confidence-title">
      ${appIcon("stats-up-square", "confidence-icon")}
      <div><span class="visually-hidden">投递判断：</span><h2 id="confidence-title">${confidence.label}</h2><p>${escapeHtml(job.chinaApplicabilityNote)}</p></div>
      ${appIcon("nav-arrow-right", "confidence-arrow")}
    </section>

    <div class="job-detail-stack-v2">
      <section aria-labelledby="barrier-title">${appIcon("shield-check", "detail-section-icon")}<div><h2 id="barrier-title">申请门槛 · ${escapeHtml(job.applicationBarrier)}</h2><p>${escapeHtml(job.applicationBarrierNote)}</p></div></section>
      <section aria-labelledby="fit-title">${appIcon("community", "detail-section-icon")}<div><h2 id="fit-title">适合谁</h2><p>${escapeHtml(job.fit)}</p></div></section>
      <section aria-labelledby="notes-title">${appIcon("warning-circle", "detail-section-icon")}<div><h2 id="notes-title">注意事项</h2><p>${escapeHtml(job.notes)}</p></div></section>
      <section class="timezone-section" aria-labelledby="timezone-title">${appIcon("clock", "detail-section-icon")}<div><h2 id="timezone-title">时差判断</h2><p>${escapeHtml(job.timezone)}</p></div></section>
      <section aria-labelledby="issue-title">${appIcon("calendar", "detail-section-icon")}<div><h2 id="issue-title">所属精选</h2><p><a href="${escapeHtml(job.issueUrl)}">${escapeHtml(job.issueTitle || job.issueSlug)}</a></p></div></section>
      <section class="original-section" aria-labelledby="original-title">${appIcon("link", "detail-section-icon")}<div><h2 id="original-title">原岗位链接</h2><p>查看 ${escapeHtml(job.company)} 官方原岗位信息与申请方式</p></div><a class="original-job-link" href="${escapeHtml(job.link)}" target="_blank" rel="noopener noreferrer" aria-label="查看原岗位，将在新窗口打开">${appIcon("nav-arrow-right")}</a></section>
    </div>
  </article>

  <aside class="sticky-apply" aria-label="申请操作">
    <button type="button" class="sticky-bookmark" data-bookmark-job="${escapeHtml(job.id)}" aria-label="收藏 ${escapeHtml(job.title)}" aria-pressed="false">${appIcon("bookmark", "bookmark-icon")}<span>收藏</span></button>
    <a href="${escapeHtml(job.link)}" target="_blank" rel="noopener noreferrer">${appIcon("share-ios")}<span>查看原岗位</span><span class="visually-hidden">将在新窗口打开</span></a>
  </aside>
  <p class="share-status" data-share-status role="status" aria-live="polite"></p>
</main>`,
  });
}

function renderMe() {
  return pageTemplate({
    title: "我的收藏与最近浏览 | Find Work",
    description: "保存在当前浏览器中的收藏岗位和最近浏览记录。",
    canonicalPath: "/me/",
    activeTab: "me",
    pageKind: "me",
    mobileTitle: "我的",
    body: `<main class="me-layout" id="main-content">
  <header class="me-heading"><span>只保存在这台设备</span><h1>我的岗位笔记</h1><p>无需登录。收藏与最近浏览只保存在当前浏览器，可随时清理。</p></header>
  <section class="me-list-section" aria-labelledby="bookmarks-title">
    <div class="mobile-section-heading"><div><span>Bookmarked</span><h2 id="bookmarks-title">收藏岗位</h2></div><strong data-bookmark-count>0</strong></div>
    <div class="compact-job-list" data-bookmark-list><p class="me-empty">在岗位卡右上角点收藏，稍后可从这里继续看。</p></div>
  </section>
  <section class="me-list-section" aria-labelledby="recent-title">
    <div class="mobile-section-heading"><div><span>Recent</span><h2 id="recent-title">最近浏览</h2></div><strong>最多 20 条</strong></div>
    <div class="compact-job-list" data-recent-list><p class="me-empty">打开岗位详情后，最近浏览会显示在这里。</p></div>
  </section>
  <nav class="me-support-links" aria-label="更多入口">
    <a href="/survey/"><strong>岗位需求问卷</strong><span>告诉我你想看的方向 →</span></a>
    <a href="/recruiting/"><strong>招募与合作</strong><span>查看社群合作机会 →</span></a>
    <a href="/about/"><strong>关于 Find Work</strong><span>了解筛选原则与边界 →</span></a>
  </nav>
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

function archiveDateParts(dateValue) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "UTC" }).format(date);
  return { year: dateValue.slice(0, 4), monthDay: dateValue.slice(5), weekday };
}

function renderArchive(picks, channels = []) {
  const items = picks
    .map((pick) => {
      const date = archiveDateParts(pick.date);
      return `<li data-archive-item data-archive-search-text="${escapeHtml(`${pick.date} ${pick.title}`.toLowerCase())}">
        <a href="/picks/${pick.slug}/">
          <time datetime="${escapeHtml(pick.date)}"><span>${date.year}</span><strong>${date.monthDay}</strong><small>${date.weekday}</small></time>
          <span class="archive-item-copy"><strong>${escapeHtml(pick.title)}</strong><span><i>${escapeHtml(issueTag(pick.title))}</i><i>外企精选</i></span></span>
          ${appIcon("nav-arrow-right")}
        </a>
      </li>`;
    })
    .join("\n");
  const channelIcons = { "remote-apac": "globe", "ops-cs": "building", "support-tech": "database" };
  const recentChannels = ["support-tech", "china-strong", "remote-apac"]
    .map((id) => channels.find((channel) => channel.id === id))
    .filter(Boolean);

  return pageTemplate({
    title: "岗位精选归档 | Find Work",
    description: "按日期倒序排列的岗位精选历史记录。",
    canonicalPath: "/archive/",
    activeTab: "archive",
    pageKind: "archive",
    mobileTitle: "归档",
    mobileSubtitle: "按日期回看每日精选",
    body: `<main class="archive-page" id="main-content">
  <nav class="archive-segments" aria-label="归档类型"><a href="/archive/" aria-current="page">每日归档</a><a href="/pool/">岗位专选</a></nav>
  <form class="archive-search" role="search" data-archive-form>
    ${appIcon("search")}
    <label class="visually-hidden" for="archive-query">搜索归档</label>
    <input id="archive-query" type="search" placeholder="搜索日期或关键词" autocomplete="off" data-archive-query>
    <label class="archive-date-label">${appIcon("calendar")}<span>选择日期</span><input type="date" data-archive-date></label>
  </form>

  <section class="archive-recent" aria-labelledby="archive-recent-title">
    <header><div>${appIcon("clock")}<h2 id="archive-recent-title">最近常看</h2></div><a href="/pool/">查看全部 ${appIcon("nav-arrow-right")}</a></header>
    <div class="archive-recent-grid">
      ${recentChannels.map((channel) => `<a href="${escapeHtml(channel.pool_path)}">${appIcon(channelIcons[channel.id] || "suitcase")}<strong>${escapeHtml(channel.name)}</strong><span>${escapeHtml(channel.description)}</span><small>${channel.count} 个岗位</small></a>`).join("")}
    </div>
  </section>

  <section class="issue-archive" aria-labelledby="issue-archive-title">
    <header>${appIcon("calendar")}<h2 id="issue-archive-title">归档列表</h2><span data-archive-count>${picks.length} 期</span></header>
    <ol class="full-archive-list">${items}</ol>
    <p class="archive-empty" data-archive-empty hidden>没有匹配的归档，试试其他关键词或日期。</p>
  </section>
</main>`,
    scripts: ["/assets/archive-list.js"],
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
    activeTab: "pool",
    pageKind: "pool",
    mobileTitle: channel ? channel.name : "可投库",
    mobileSubtitle: channel ? channel.description : "按条件找更适合的岗位",
    body: `<main class="pool-page" id="main-content">
  <section class="job-filter" aria-labelledby="job-filter-title">
    <h1 class="visually-hidden" id="job-filter-title">${escapeHtml(pageTitle)}</h1>
    ${channel ? `<p class="channel-intro">${escapeHtml(channel.description)} <a href="/pool/?channel=${escapeHtml(channel.id)}">查看完整筛选</a></p>` : ""}
    <form class="filter-controls" data-job-filter data-default-channel="${channel ? escapeHtml(channel.id) : ""}">
      <input type="hidden" name="channel" value="${channel ? escapeHtml(channel.id) : ""}">
      <div class="pool-search-row">${appIcon("search")}<label class="visually-hidden" for="pool-query">搜索岗位</label><input id="pool-query" type="search" name="query" placeholder="搜索职位 / 公司 / 技能关键词" autocomplete="off"><button type="button" data-filter-toggle aria-controls="advanced-filter-panel" aria-expanded="false">${appIcon("filter")}<span>筛选</span></button></div>
      <div class="active-filter-chips" data-active-filter-chips aria-live="polite"></div>
      <div class="pool-sort-row">
        <label><span class="visually-hidden">排序方式</span><select name="sort"><option value="latest">最新发布</option><option value="confidence">中国可投优先</option><option value="barrier">低门槛优先</option></select>${appIcon("nav-arrow-down")}</label>
        <label><span class="visually-hidden">英文要求</span><select name="language" data-filter-options="language"><option value="">英文要求</option></select>${appIcon("nav-arrow-down")}</label>
        <button type="button" data-filter-toggle aria-controls="advanced-filter-panel" aria-expanded="false">${appIcon("filter")}<span>筛选</span><b data-active-filter-count>0</b></button>
      </div>
      <div class="advanced-filter-panel" id="advanced-filter-panel" data-filter-panel role="dialog" aria-modal="true" aria-labelledby="advanced-filter-title" hidden>
        <div class="advanced-filter-heading"><strong id="advanced-filter-title">调整筛选条件</strong><button type="button" data-filter-close aria-label="关闭筛选">${appIcon("xmark")}</button></div>
        <div class="advanced-filter-grid">
          <label><span>开始日期</span><input type="date" name="startDate"></label>
          <label><span>结束日期</span><input type="date" name="endDate"></label>
          <label><span>工作方式</span><select name="workMode" data-filter-options="workMode"><option value="">不限</option></select></label>
          <label><span>申请门槛</span><select name="threshold" data-filter-options="threshold"><option value="">不限</option></select></label>
          <label><span>可投把握</span><select name="confidence" data-filter-options="confidence"><option value="">不限</option></select></label>
          <label><span>经验要求</span><select name="experience" data-filter-options="experience"><option value="">不限</option></select></label>
          <label><span>岗位方向</span><select name="direction" data-filter-options="direction"><option value="">不限</option></select></label>
        </div>
        <div class="advanced-filter-actions"><button type="reset">清空条件</button><button type="button" data-filter-close>查看结果</button></div>
      </div>
    </form>
    <div class="filter-heading"><span class="job-count" data-job-count>读取中</span><small>截至 ${escapeHtml(asOfDate)}</small></div>
    <div class="job-results" data-job-results aria-live="polite"></div>
    <p class="filter-empty" data-job-empty hidden>没有匹配的岗位，试试放宽条件。</p>
  </section>
  <button class="pool-filter-dock" type="button" data-filter-toggle aria-controls="advanced-filter-panel" aria-expanded="false">${appIcon("filter")}<span><strong>调整筛选条件，找到更合适的岗位</strong><small><b data-active-filter-count>0</b> 个条件已生效 · 点击调整</small></span>${appIcon("nav-arrow-right")}</button>
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
  fs.copyFileSync(
    path.join(SITE_DIR, "styles", "mobile-redesign.css"),
    path.join(DIST_DIR, "assets", "mobile-redesign.css")
  );
  fs.copyFileSync(path.join(SITE_DIR, "archive.js"), path.join(DIST_DIR, "assets", "archive.js"));
  for (const script of ["app.js", "storage.js", "bookmarks.js", "recent.js", "archive-list.js", "pick-cards.js"]) {
    fs.copyFileSync(path.join(SITE_DIR, "js", script), path.join(DIST_DIR, "assets", script));
  }
  fs.copyFileSync(path.join(SITE_DIR, "remote-work-hero.jpg"), path.join(DIST_DIR, "assets", "remote-work-hero.jpg"));
  ensureDir(path.join(DIST_DIR, "assets", "icons"));
  for (const iconFile of fs
    .readdirSync(path.join(SITE_DIR, "icons"))
    .filter((fileName) => fileName.endsWith(".svg") || fileName === "LICENSE-iconoir.txt")) {
    fs.copyFileSync(path.join(SITE_DIR, "icons", iconFile), path.join(DIST_DIR, "assets", "icons", iconFile));
  }
  fs.copyFileSync(path.join(SITE_DIR, "survey.js"), path.join(DIST_DIR, "assets", "survey.js"));
  fs.copyFileSync(path.join(SITE_DIR, "survey-admin.js"), path.join(DIST_DIR, "assets", "survey-admin.js"));
  fs.copyFileSync(path.join(SITE_DIR, "wechat_qr.jpg"), path.join(DIST_DIR, "assets", "wechat_qr.jpg"));
  fs.copyFileSync(path.join(SITE_DIR, "xiaohongshu_qr.jpg"), path.join(DIST_DIR, "assets", "xiaohongshu_qr.jpg"));
  fs.copyFileSync(path.join(SITE_DIR, "xiaohongshu_standard.jpg"), path.join(DIST_DIR, "assets", "xiaohongshu_standard.jpg"));
  for (const image of new Set(recruiting.map((item) => item.image).filter(Boolean))) {
    const fileName = path.basename(image);
    fs.copyFileSync(path.join(SITE_DIR, fileName), path.join(DIST_DIR, "assets", fileName));
  }
}

function main() {
  const recruiting = readRecruiting();
  const asOfDate = poolAsOfDate();
  if (!fs.existsSync(CURATED_FILE)) {
    throw new Error("Missing data/curated/jobs.ndjson; run scripts/curated_jobs.py migrate first.");
  }
  const curatedJobs = readNdjson(CURATED_FILE);
  const issues = readIssues();
  const poolJobs = buildPublicJobs(curatedJobs, issues);
  const issuePageJobs = buildIssuePageJobs(curatedJobs, issues);
  const publicIssues = buildPublicIssues(issues, poolJobs);
  const picks = picksFromIssues(issues);
  const publicChannels = buildPublicChannels(poolJobs, asOfDate);
  const pages = [
    ["index.html", renderIndex(picks, poolJobs, publicIssues, publicChannels, asOfDate)],
    [path.join("about", "index.html"), renderAbout(readAboutPage())],
    [path.join("pool", "index.html"), renderPool(asOfDate)],
    [path.join("recruiting", "index.html"), renderRecruiting(recruiting)],
    [path.join("archive", "index.html"), renderArchive(picks, publicChannels)],
    [path.join("me", "index.html"), renderMe()],
    [path.join("survey", "index.html"), renderSurvey()],
    [path.join("survey-admin", "index.html"), renderSurveyAdmin()],
    ...CHANNELS.map((channel) => [
      path.join("channels", channel.id, "index.html"),
      renderPool(asOfDate, channel),
    ]),
    ...picks.map((pick) => [
      path.join("picks", pick.slug, "index.html"),
      renderPickPage(pick, issuePageJobs, issues.find((issue) => issue.issue_id === pick.slug)),
    ]),
    ...issuePageJobs.map((job) => [path.join("jobs", job.id, "index.html"), renderJobPage(job)]),
  ];

  // Keep the last successful dist intact when source validation or rendering fails.
  emptyDir(DIST_DIR);
  copyAssets(recruiting);
  for (const [relativePath, html] of pages) writePage(relativePath, html);
  fs.writeFileSync(path.join(DIST_DIR, "assets", "jobs.json"), `${JSON.stringify(poolJobs, null, 2)}\n`);
  fs.writeFileSync(path.join(DIST_DIR, "assets", "filter-options.json"), `${JSON.stringify(FILTER_OPTIONS, null, 2)}\n`);
  fs.writeFileSync(path.join(DIST_DIR, "assets", "issues.json"), `${JSON.stringify(publicIssues, null, 2)}\n`);
  fs.writeFileSync(path.join(DIST_DIR, "assets", "channels.json"), `${JSON.stringify(publicChannels, null, 2)}\n`);

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
    `Built ${picks.length} job pick page(s), ${poolJobs.length} active pool job(s), ${issuePageJobs.length} job detail page(s), and ${CHANNELS.length} channel(s) into dist/`
  );
}

if (require.main === module) main();

module.exports = {
  CHANNELS,
  FILTER_OPTIONS,
  buildFilterOptions,
  buildIssuePageJobs,
  buildPublicChannels,
  buildPublicIssues,
  buildPublicJobs,
  isPublicCuratedJob,
  matchesChannel,
  picksFromIssues,
  poolCutoffDate,
  publicJobFromCurated,
  readRecruiting,
  renderJobCard,
  renderJobPage,
  renderRecruiting,
  validateActiveJobDetails,
};
