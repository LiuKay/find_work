(function () {
  "use strict";

  if (typeof document === "undefined" || !globalThis.FindWorkStorage) return;

  const storage = globalThis.FindWorkStorage;
  const current = document.querySelector("[data-current-job-id]");
  if (current) storage.addRecentJob(current.dataset.currentJobId);

  async function renderRecentList() {
    const list = document.querySelector("[data-recent-list]");
    if (!list) return;
    const state = storage.readState();
    if (!state.recentJobs.length) return;
    try {
      const response = await fetch("/assets/jobs.json");
      if (!response.ok) throw new Error("jobs index unavailable");
      const jobs = await response.json();
      const jobsById = new Map(jobs.map((job) => [job.id, job]));
      const items = state.recentJobs
        .map((recent) => ({ recent, job: jobsById.get(recent.id) }))
        .filter((item) => item.job)
        .map(({ recent, job }) => {
          const article = document.createElement("article");
          article.className = "compact-job-item";
          const link = document.createElement("a");
          link.href = job.detailUrl;
          const title = document.createElement("strong");
          title.textContent = job.title;
          const meta = document.createElement("span");
          const viewed = new Date(recent.viewedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
          meta.textContent = `${job.company} · ${viewed} 浏览`;
          link.append(title, meta);
          article.append(link);
          return article;
        });
      if (items.length) list.replaceChildren(...items);
    } catch {
      list.innerHTML = '<p class="me-empty">最近浏览已保存，但岗位索引暂时无法读取。</p>';
    }
  }

  renderRecentList();
})();
