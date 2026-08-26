const assert = require("assert");
const { picksFromIssues, poolCutoffDate } = require("../scripts/build-site");

assert.equal(poolCutoffDate("2026-07-23"), "2026-07-10");
assert.throws(() => poolCutoffDate("2026-02-31"), /Invalid POOL_AS_OF_DATE/);

assert.deepEqual(
  picksFromIssues([
    { issue_id: "2026-07-20-topic", title: "专题", date: "2026-07-20", job_ids: [] },
    { issue_id: "2026-07-22", title: "每日精选", date: "2026-07-22", job_ids: ["j_example"] },
  ]),
  [
    { slug: "2026-07-22", title: "每日精选", date: "2026-07-22" },
    { slug: "2026-07-20-topic", title: "专题", date: "2026-07-20" },
  ]
);
console.log("issue-backed picks self-check passed");
