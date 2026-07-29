const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  CHANNELS,
  buildPublicChannels,
  buildPublicIssues,
  buildPublicJobs,
  matchesChannel,
  readRecruiting,
  renderRecruiting,
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
const publicIssues = buildPublicIssues(issues, publicJobs);
const publicChannels = buildPublicChannels(publicJobs, "2026-07-29");
const publicIds = new Set(publicJobs.map((job) => job.id));
const expectedPublicIds = new Set(
  curated
    .filter(
      (job) =>
        job.status === "active" &&
        ["title", "company", "url", "china_applicability", "application_barrier", "best_for"].every(
          (field) => String(job[field] || "").trim()
        )
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
  env: { ...process.env, POOL_AS_OF_DATE: "2026-07-29" },
  stdio: "pipe",
});

for (const file of [
  "index.html",
  "pool/index.html",
  "recruiting/index.html",
  "assets/recruiting-originwise.png",
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

const todayIds = new Set(
  builtIssues.filter((issue) => issue.date === "2026-07-29").flatMap((issue) => issue.job_ids)
);
const home = fs.readFileSync(path.join(ROOT, "dist", "index.html"), "utf8");
const todaySection = home.split('id="today-jobs"')[1].split('aria-labelledby="channels-title"')[0];
const renderedTodayIds = new Set(
  Array.from(todaySection.matchAll(/data-job-id="(j_[a-f0-9]{12})"/g), (match) => match[1])
);
assert.deepEqual(renderedTodayIds, todayIds);

execFileSync(process.execPath, ["scripts/build-site.js"], {
  cwd: ROOT,
  env: { ...process.env, POOL_AS_OF_DATE: "2026-07-30" },
  stdio: "pipe",
});
const nextDayHome = fs.readFileSync(path.join(ROOT, "dist", "index.html"), "utf8");
const nextDaySection = nextDayHome.split('id="today-jobs"')[1].split('aria-labelledby="channels-title"')[0];
assert.match(nextDaySection, /最新更新 <small>2026-07-29<\/small>/);
assert.deepEqual(
  new Set(Array.from(nextDaySection.matchAll(/data-job-id="(j_[a-f0-9]{12})"/g), (match) => match[1])),
  todayIds
);

const publicAssets = [
  fs.readFileSync(path.join(ROOT, "dist", "assets", "jobs.json"), "utf8"),
  fs.readFileSync(path.join(ROOT, "dist", "assets", "issues.json"), "utf8"),
  fs.readFileSync(path.join(ROOT, "dist", "assets", "channels.json"), "utf8"),
].join("\n");
assert.doesNotMatch(publicAssets, /candidate_id|pipeline_status|screen_reason|"reviewer"/);
const siteStyles = fs.readFileSync(path.join(ROOT, "site", "styles.css"), "utf8");
assert.doesNotMatch(siteStyles, /\.archive-layout h1\s*\{[^}]*max-width:\s*1[02]ch/s);
console.log("site v2 self-check passed");
