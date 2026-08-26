const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  CHANNELS,
  buildIssuePageJobs,
  buildPublicChannels,
  buildPublicIssues,
  buildPublicJobs,
  matchesChannel,
  readRecruiting,
  renderRecruiting,
  validateActiveJobDetails,
} = require("../scripts/build-site");
const { recommendSurveyChannels } = require("../site/survey");

const ROOT = path.resolve(__dirname, "..");
const curated = fs
  .readFileSync(path.join(ROOT, "data", "curated", "jobs.ndjson"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map(JSON.parse);
const issues = fs
  .readdirSync(path.join(ROOT, "data", "issues"))
  .filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", "issues", file), "utf8")));

const publicJobs = buildPublicJobs(curated, issues);
const issuePageJobs = buildIssuePageJobs(curated, issues);
const publicIssues = buildPublicIssues(issues, publicJobs);
const publicChannels = buildPublicChannels(publicJobs, "2026-08-05");
const publicIds = new Set(publicJobs.map((job) => job.id));
const expectedPublicIds = new Set(
  curated
    .filter(
      (job) =>
        job.status === "active" &&
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
        ].every((field) => String(job[field] || "").trim()) &&
        Array.isArray(job.featured_issue_ids) &&
        job.featured_issue_ids.length > 0 &&
        /^j_[a-f0-9]{12,}$/.test(job.job_id)
    )
    .map((job) => job.job_id)
);

assert.equal(CHANNELS.length, 6);
assert.deepEqual(
  CHANNELS.map((channel) => channel.id),
  ["low-english", "ops-cs", "support-tech", "remote-apac", "entry", "china-strong"]
);
const surveyCases = {
  "low-english": { englishLevel: "尽量低英文" },
  "ops-cs": { jobCategories: ["客户成功"] },
  "support-tech": { jobCategories: ["QA / 测试"] },
  "remote-apac": { workModes: ["APAC 远程"] },
  entry: { experienceLevels: ["入门"] },
  "china-strong": { workModes: ["中国本地办公"] },
};
for (const [channelId, payload] of Object.entries(surveyCases)) {
  assert.ok(recommendSurveyChannels(payload).includes(channelId), `survey mapping missing ${channelId}`);
}
assert.ok(publicJobs.length > 0);
assert.ok(issuePageJobs.some((job) => !publicIds.has(job.id)));
assert.ok(issues.every((issue) => issue.job_ids.every((jobId) => issuePageJobs.some((job) => job.id === jobId))));
assert.ok(publicJobs.every((job) => job.detailUrl === `/jobs/${job.id}/`));
assert.ok(publicJobs.every((job) => job.chinaApplicabilityNote && job.applicationBarrierNote));
assert.equal(new Set(publicJobs.map((job) => job.detailUrl)).size, publicJobs.length);
const validActive = curated.find((job) => job.status === "active");
assert.throws(() => validateActiveJobDetails([validActive, { ...validActive }]), /duplicate job_id/);
assert.throws(
  () => validateActiveJobDetails([{ ...validActive, job_id: "j_123456789abc", url: "javascript:alert(1)" }]),
  /url format/
);
const recruitingItem = {
  title: "Example <script>",
  organization: "Example",
  channel: "Expert platform",
  depositRequired: "否",
  intermediary: "否",
  requirements: "Three years",
  workContent: "Evaluation",
  compensationAndWorkMode: "Remote",
  notes: "Verify terms",
  image: "/assets/example.png",
  imageAlt: "Example screenshot",
  imageWidth: 1200,
  imageHeight: 600,
  url: "https://example.com/ref",
  promoted: true,
};
const recruitingPreview = renderRecruiting([recruitingItem]);
assert.match(recruitingPreview, /推广链接/);
assert.match(recruitingPreview, /rel="noopener noreferrer sponsored"/);
assert.match(recruitingPreview, /<img[^>]+width="1200"[^>]+height="600"/);
assert.match(recruitingPreview, /是否交保证金/);
assert.doesNotMatch(recruitingPreview, /Example <script>/);
const invalidRecruitingFile = path.join(require("os").tmpdir(), `find-work-recruiting-${process.pid}.json`);
fs.writeFileSync(invalidRecruitingFile, JSON.stringify([{ ...recruitingItem, url: "javascript:alert(1)" }]));
assert.throws(() => readRecruiting(invalidRecruitingFile), /url must use http or https/);
fs.unlinkSync(invalidRecruitingFile);
assert.deepEqual(publicIds, expectedPublicIds);
assert.ok(publicJobs.every((job) => curated.find((item) => item.job_id === job.id).status === "active"));
assert.ok(
  curated
    .filter((job) => ["expired", "closed"].includes(job.status))
    .every((job) => !publicIds.has(job.job_id))
);
assert.ok(publicIssues.every((issue) => issue.job_ids.every((jobId) => publicIds.has(jobId))));
assert.ok(publicIssues.every((issue) => issue.stats.count === issue.job_ids.length));
assert.ok(
  publicJobs.every(
    (job) =>
      !Object.hasOwn(job, "reviewer") &&
      !Object.hasOwn(job, "screen_reason") &&
      !Object.hasOwn(job, "verification_failures")
  )
);

const rank = { 高: 3, 中: 2, 待确认: 1, 低: 0, 不明确: 0 };
for (let index = 1; index < publicJobs.length; index += 1) {
  const previous = publicJobs[index - 1];
  const current = publicJobs[index];
  assert.ok(
    rank[previous.chinaApplicability] > rank[current.chinaApplicability] ||
      (rank[previous.chinaApplicability] === rank[current.chinaApplicability] &&
        previous.lastFeaturedDate >= current.lastFeaturedDate)
  );
}

for (const channel of publicChannels) {
  const matching = publicJobs.filter((job) => matchesChannel(job, channel.id));
  assert.equal(channel.count, matching.length);
}

execFileSync(process.execPath, ["scripts/build-site.js"], {
  cwd: ROOT,
  env: { ...process.env, POOL_AS_OF_DATE: "2026-08-05" },
  stdio: "pipe",
});

for (const file of [
  "index.html",
  "pool/index.html",
  "me/index.html",
  "recruiting/index.html",
  "assets/recruiting-originwise.png",
  "assets/mobile-redesign.css",
  "assets/app.js",
  "assets/storage.js",
  "assets/bookmarks.js",
  "assets/recent.js",
  "assets/jobs.json",
  "assets/issues.json",
  "assets/channels.json",
]) {
  assert.ok(fs.existsSync(path.join(ROOT, "dist", file)), `missing dist/${file}`);
}
for (const channel of CHANNELS) {
  const html = fs.readFileSync(path.join(ROOT, "dist", "channels", channel.id, "index.html"), "utf8");
  assert.match(html, new RegExp(`data-default-channel="${channel.id}"`));
  assert.match(html, /没有匹配的岗位/);
}

const builtJobs = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "assets", "jobs.json"), "utf8"));
const builtIssues = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "assets", "issues.json"), "utf8"));
const builtChannels = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "assets", "channels.json"), "utf8"));
assert.deepEqual(builtJobs, publicJobs);
assert.deepEqual(builtIssues, publicIssues);
assert.deepEqual(builtChannels, publicChannels);

const home = fs.readFileSync(path.join(ROOT, "dist", "index.html"), "utf8");
const latestIssueAtBaseline = builtIssues.find((issue) => issue.date <= "2026-08-05");
const expectedHomeIds = latestIssueAtBaseline.job_ids.slice(0, 3);
const renderedHomeIds = Array.from(home.matchAll(/data-job-id="(j_[a-f0-9]{12})"/g), (match) => match[1]);
assert.deepEqual(renderedHomeIds, expectedHomeIds);
assert.ok(renderedHomeIds.length <= 3);
assert.match(home, /Daily Brief/);
assert.match(home, /remote-work-hero\.jpg/);
assert.match(home, /class="app-icon icon-search"/);
assert.match(home, /<a class="notification-button" href="\/me\/"/);
assert.doesNotMatch(home, /<button class="notification-button"/);
assert.match(home, /name="query"/);
assert.equal((home.match(/class="quick-filter-grid"/g) || []).length, 1);
const quickFilterMarkup = home.split('class="quick-filter-grid"')[1].split("</div>")[0];
assert.equal((quickFilterMarkup.match(/<a href=/g) || []).length, 6);
assert.doesNotMatch(quickFilterMarkup, /filter-chevron|nav-arrow-down/);
assert.match(home, /<nav class="mobile-tabbar" aria-label="移动端主导航">/);
for (const href of ["/", "/pool/", "/archive/", "/me/"]) {
  assert.match(home, new RegExp(`<a href="${href.replace(/\//g, "\\/")}"`));
}
assert.match(home, /<a href="\/" aria-current="page">/);
assert.equal((home.match(/data-bookmark-job=/g) || []).length, expectedHomeIds.length);
const homeCards = Array.from(home.matchAll(/<article class="mobile-job-card"[\s\S]*?<\/article>/g), (match) => match[0]);
assert.equal(homeCards.length, expectedHomeIds.length);
for (const card of homeCards) {
  assert.equal((card.match(/<a /g) || []).length, 1);
  assert.match(card, /<a class="mobile-job-card-link" href="\/jobs\/j_[a-f0-9]{12}\//);
  assert.doesNotMatch(card, /target="_blank"/);
}
for (const jobId of expectedHomeIds) {
  assert.match(home, new RegExp(`href="/jobs/${jobId}/"`));
}

const sampleIssue = builtIssues.find((issue) => issue.job_ids.length > 0);
const samplePickPage = fs.readFileSync(path.join(ROOT, "dist", "picks", sampleIssue.issue_id, "index.html"), "utf8");
assert.match(samplePickPage, /class="pick-list-page"/);
assert.match(samplePickPage, /data-pick-filter="" aria-pressed="true"/);
assert.equal((samplePickPage.match(/class="pick-job-card"/g) || []).length, sampleIssue.job_ids.length);
for (const jobId of sampleIssue.job_ids) assert.match(samplePickPage, new RegExp(`href="/jobs/${jobId}/"`));
assert.doesNotMatch(samplePickPage, /class="job-direct-link"/);

const statusById = new Map(curated.map((job) => [job.job_id, job.status]));
const historicalIssue = issues.find((issue) => issue.job_ids.some((jobId) => statusById.get(jobId) !== "active"));
const historicalPickPage = fs.readFileSync(path.join(ROOT, "dist", "picks", historicalIssue.issue_id, "index.html"), "utf8");
assert.equal((historicalPickPage.match(/class="pick-job-card"/g) || []).length, historicalIssue.job_ids.length);

const jobPageDirectories = fs
  .readdirSync(path.join(ROOT, "dist", "jobs"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory());
assert.equal(jobPageDirectories.length, issuePageJobs.length);
const sampleJob = publicJobs[0];
const sampleJobPage = fs.readFileSync(path.join(ROOT, "dist", "jobs", sampleJob.id, "index.html"), "utf8");
const sampleJobMain = sampleJobPage.split('<main class="job-detail-page"')[1];
for (const text of ["投递判断", "申请门槛", "适合谁", "注意事项", "时差判断", "所属精选", "原岗位"]) {
  assert.match(sampleJobMain, new RegExp(text));
}
const detailOrder = ["投递判断", "申请门槛", "适合谁", "注意事项", "时差判断", "所属精选", "原岗位"].map(
  (text) => sampleJobMain.indexOf(text)
);
assert.ok(detailOrder.every((position) => position >= 0));
assert.deepEqual([...detailOrder].sort((a, b) => a - b), detailOrder);
assert.match(sampleJobPage, /class="sticky-apply"/);
assert.match(sampleJobPage, /target="_blank" rel="noopener noreferrer"/);
assert.doesNotMatch(sampleJobPage, /mobile-tabbar[^]*aria-current="page"/);

const poolPage = fs.readFileSync(path.join(ROOT, "dist", "pool", "index.html"), "utf8");
assert.match(poolPage, /<option value="latest">最新发布<\/option>/);
assert.match(poolPage, /<option value="confidence">中国可投优先<\/option>/);
assert.match(poolPage, /<option value="barrier">低门槛优先<\/option>/);
assert.match(poolPage, /<select name="language" data-filter-options="language"><option value="">英文要求<\/option><\/select>/);
assert.equal((poolPage.match(/name="language"/g) || []).length, 1);
assert.doesNotMatch(poolPage, /data-quick-preset/);
assert.doesNotMatch(poolPage, /data-sort-shortcut/);
assert.match(poolPage, /data-filter-toggle/);
const archivePage = fs.readFileSync(path.join(ROOT, "dist", "archive", "index.html"), "utf8");
assert.match(archivePage, /class="archive-segments"/);
assert.match(archivePage, /data-archive-search/);
for (const asset of ["home-simple.svg", "search.svg", "bookmark.svg", "filter.svg"]) {
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "assets", "icons", asset)), `missing icon asset: ${asset}`);
}
assert.ok(
  fs.readdirSync(path.join(ROOT, "dist", "assets", "icons")).every((asset) => asset.endsWith(".svg") || asset === "LICENSE-iconoir.txt")
);

execFileSync(process.execPath, ["scripts/build-site.js"], {
  cwd: ROOT,
  env: { ...process.env, POOL_AS_OF_DATE: "2026-08-06" },
  stdio: "pipe",
});
const nextDayHome = fs.readFileSync(path.join(ROOT, "dist", "index.html"), "utf8");
const nextDayLatestDate = publicIssues.find((issue) => issue.date <= "2026-08-06").date;
const nextDayIssue = publicIssues.find((issue) => issue.date === nextDayLatestDate);
assert.match(nextDayHome, new RegExp(`datetime="${nextDayLatestDate}"`));
assert.deepEqual(
  Array.from(nextDayHome.matchAll(/data-job-id="(j_[a-f0-9]{12})"/g), (match) => match[1]),
  nextDayIssue.job_ids.slice(0, 3)
);

const publicAssets = [
  fs.readFileSync(path.join(ROOT, "dist", "assets", "jobs.json"), "utf8"),
  fs.readFileSync(path.join(ROOT, "dist", "assets", "issues.json"), "utf8"),
  fs.readFileSync(path.join(ROOT, "dist", "assets", "channels.json"), "utf8"),
].join("\n");
assert.doesNotMatch(publicAssets, /candidate_id|pipeline_status|screen_reason|"reviewer"/);
const siteStyles = fs.readFileSync(path.join(ROOT, "site", "styles.css"), "utf8");
assert.doesNotMatch(siteStyles, /\.archive-layout h1\s*\{[^}]*max-width:\s*1[02]ch/s);
const mobileStyles = fs.readFileSync(path.join(ROOT, "site", "styles", "mobile-redesign.css"), "utf8");
assert.match(mobileStyles, /--app-topbar-height:\s*56px/);
assert.match(mobileStyles, /env\(safe-area-inset-bottom\)/);
assert.match(mobileStyles, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(mobileStyles, /:focus-visible/);
assert.doesNotMatch(mobileStyles, /transition:\s*all/);
assert.match(mobileStyles, /\.quick-filter-grid strong\s*\{[^}]*align-self:\s*center/s);
assert.match(mobileStyles, /\.latest-note-actions a\s*\{[^}]*margin:\s*0/s);
const previewServer = fs.readFileSync(path.join(ROOT, "scripts", "serve-site.js"), "utf8");
assert.match(previewServer, /"\.svg":\s*"image\/svg\+xml; charset=utf-8"/);
console.log("site v2 self-check passed");
