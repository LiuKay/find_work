const assert = require("assert");
const { buildPoolJobs, normalizeJobUrl, poolCutoffDate } = require("../scripts/build-site");

function pick(date, slug, jobs) {
  return {
    date,
    slug,
    title: slug,
    structuredJobs: [],
    markdown: jobs
      .map(
        (job, index) => `### ${index + 1}. 岗位名称：${job.title}
公司 / 平台：${job.company || "Example"}
岗位方向：客服
工作方式：APAC 远程
经验要求：入门
语言要求：英文
中国可投把握：${job.confidence === undefined ? "高" : job.confidence}
申请门槛：${job.threshold === undefined ? "低" : job.threshold}
适合谁：${job.fit === undefined ? "适合中国申请者" : job.fit}
链接：[申请](${job.url})`
      )
      .join("\n\n"),
  };
}

assert.equal(poolCutoffDate("2026-07-23"), "2026-07-10");
assert.throws(() => poolCutoffDate("2026-02-31"), /Invalid POOL_AS_OF_DATE/);
assert.equal(
  normalizeJobUrl("https://example.com/jobs/1/?utm_source=x#apply"),
  "https://example.com/jobs/1"
);

const jobs = buildPoolJobs(
  [
    pick("2026-07-22", "latest", [{ title: "Support", url: "https://example.com/jobs/1?utm_source=new" }]),
    pick("2026-07-20", "earlier", [{ title: "Support", url: "https://example.com/jobs/1" }]),
    pick("2026-07-01", "first", [{ title: "Support", url: "https://example.com/jobs/1" }]),
    pick("2026-07-09", "expired", [{ title: "Old", url: "https://example.com/jobs/old" }]),
    pick("2026-07-23", "incomplete", [{ title: "Missing review", url: "https://example.com/jobs/2", fit: "" }]),
    {
      ...pick("2026-07-23", "mismatch", [
        { title: "Must not borrow review", url: "https://example.com/jobs/3", confidence: "" },
      ]),
      structuredJobs: [{ title: "Another role", china_applicability: "高", application_barrier: "低" }],
    },
  ],
  "2026-07-23"
);

assert.equal(jobs.length, 1);
assert.equal(jobs[0].firstSeenDate, "2026-07-01");
assert.equal(jobs[0].lastFeaturedDate, "2026-07-22");
assert.equal(jobs[0].applicationBarrier, "低");
assert.equal(jobs[0].chinaApplicability, "高");
assert.match(jobs[0].id, /^j_[a-f0-9]{12}$/);
assert.deepEqual(jobs[0].featuredIssueSlugs, ["latest", "earlier", "first"]);
console.log("pool self-check passed");
