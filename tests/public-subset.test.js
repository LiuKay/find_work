const assert = require("assert");
const {
  buildPublicIssues,
  buildPublicJobs,
  issuePublicJobIds,
  jobsInPoolWindow,
} = require("../scripts/build-site");

function reviewedJob(jobId, extras = {}) {
  return {
    job_id: jobId,
    status: "active",
    title: `Role ${jobId}`,
    company: "Example",
    url: `https://example.com/jobs/${jobId}`,
    china_applicability: "高",
    china_applicability_note: "中国团队招聘",
    application_barrier: "中",
    application_barrier_note: "需要基础经验",
    best_for: "适合有基础经验的人",
    notes: "申请前确认合同形式",
    timezone_judgment: "APAC 工作时段与北京时间匹配",
    last_featured_date: "2026-09-12",
    featured_issue_ids: ["2026-09-12"],
    job_direction: "运营与客户服务",
    work_mode: "APAC 远程",
    experience: "1-3 年",
    language: "双语",
    channels: ["ops-cs"],
    ...extras,
  };
}

assert.deepEqual(issuePublicJobIds({ job_ids: ["j_1", "j_2", "j_3"] }), ["j_1", "j_2", "j_3"]);
assert.deepEqual(
  issuePublicJobIds({
    job_ids: Array.from({ length: 12 }, (_, index) => `j_${index + 1}`),
  }),
  Array.from({ length: 10 }, (_, index) => `j_${index + 1}`)
);
assert.deepEqual(
  issuePublicJobIds({
    job_ids: Array.from({ length: 12 }, (_, index) => `j_${index + 1}`),
    public_job_ids: Array.from({ length: 12 }, (_, index) => `j_${index + 1}`),
  }),
  Array.from({ length: 10 }, (_, index) => `j_${index + 1}`)
);
assert.deepEqual(
  issuePublicJobIds({
    job_ids: ["j_keep", "j_skip", "j_extra"],
    public_job_ids: ["j_keep", "j_missing"],
  }),
  ["j_keep"]
);

const siteJob = reviewedJob("j_aaaaaaaaaaaa");
const feishuOnly = reviewedJob("j_bbbbbbbbbbbb", {
  url: "https://example.com/jobs/feishu-only",
  featured_issue_ids: ["2026-09-12"],
});
const subsetIssue = {
  issue_id: "2026-09-12",
  title: "subset",
  mode: "public",
  date: "2026-09-12",
  job_ids: [siteJob.job_id, feishuOnly.job_id],
  public_job_ids: [siteJob.job_id],
};
const subsetJobs = buildPublicJobs([siteJob, feishuOnly], [subsetIssue]);
assert.deepEqual(
  subsetJobs.map((job) => job.id),
  [siteJob.job_id]
);
assert.deepEqual(buildPublicIssues([subsetIssue], subsetJobs)[0].job_ids, [siteJob.job_id]);

const legacyJobs = buildPublicJobs([siteJob, feishuOnly], [
  {
    issue_id: "2026-09-12",
    title: "legacy",
    mode: "public",
    date: "2026-09-12",
    job_ids: [siteJob.job_id, feishuOnly.job_id],
  },
]);
assert.deepEqual(
  new Set(legacyJobs.map((job) => job.id)),
  new Set([siteJob.job_id, feishuOnly.job_id])
);

const stale = reviewedJob("j_cccccccccccc", {
  last_featured_date: "2026-08-01",
  featured_issue_ids: ["2026-08-01"],
});
const rolled = jobsInPoolWindow(
  buildPublicJobs(
    [siteJob, stale],
    [
      {
        issue_id: "2026-09-12",
        title: "today",
        mode: "public",
        date: "2026-09-12",
        job_ids: [siteJob.job_id],
        public_job_ids: [siteJob.job_id],
      },
      {
        issue_id: "2026-08-01",
        title: "stale",
        mode: "public",
        date: "2026-08-01",
        job_ids: [stale.job_id],
        public_job_ids: [stale.job_id],
      },
    ]
  ),
  "2026-09-12"
);
assert.deepEqual(
  rolled.map((job) => job.id),
  [siteJob.job_id]
);

console.log("public subset self-check passed");
