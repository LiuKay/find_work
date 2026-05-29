(function () {
  const form = document.querySelector("[data-job-filter]");
  const results = document.querySelector("[data-job-results]");
  const count = document.querySelector("[data-job-count]");
  const empty = document.querySelector("[data-job-empty]");

  if (!form || !results || !count || !empty) return;

  let jobs = [];

  function normalize(value) {
    return (value || "").trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function matchesFilters(job, filters) {
    if (filters.query && !job.searchText.includes(filters.query)) return false;
    if (filters.startDate && job.date < filters.startDate) return false;
    if (filters.endDate && job.date > filters.endDate) return false;
    if (filters.language && job.language !== filters.language) return false;
    if (filters.workMode && job.workMode !== filters.workMode) return false;
    if (filters.threshold && job.threshold !== filters.threshold) return false;
    if (filters.confidence && job.confidence !== filters.confidence) return false;
    if (filters.experience && job.experience !== filters.experience) return false;
    if (filters.direction && job.direction !== filters.direction) return false;
    return true;
  }

  function field(label, value) {
    if (!value) return "";
    return `<span><strong>${label}</strong>${escapeHtml(value)}</span>`;
  }

  function renderJob(job) {
    const directLink = job.link
      ? `<a class="job-direct-link" href="${escapeHtml(job.link)}" rel="noopener noreferrer">申请链接</a>`
      : "";

    return `<article class="job-result">
      <div class="job-result-main">
        <time>${escapeHtml(job.date)}</time>
        <h3><a href="${escapeHtml(job.issueUrl)}">${escapeHtml(job.title)}</a></h3>
        <p>${escapeHtml(job.company || job.issueTitle)}</p>
      </div>
      <div class="job-meta">
        ${field("方向", job.direction)}
        ${field("方式", job.workMode)}
        ${field("经验", job.experience)}
        ${field("语言", job.language)}
        ${field("门槛", job.threshold)}
        ${field("把握", job.confidence)}
      </div>
      <div class="job-actions">
        <a href="${escapeHtml(job.issueUrl)}">查看归档</a>
        ${directLink}
      </div>
    </article>`;
  }

  function getFilters() {
    const data = new FormData(form);
    return {
      query: normalize(data.get("query")),
      startDate: data.get("startDate") || "",
      endDate: data.get("endDate") || "",
      language: data.get("language") || "",
      workMode: data.get("workMode") || "",
      threshold: data.get("threshold") || "",
      confidence: data.get("confidence") || "",
      experience: data.get("experience") || "",
      direction: data.get("direction") || "",
    };
  }

  function populateOptions(field) {
    const select = form.querySelector(`[data-filter-options="${field}"]`);
    if (!select) return;

    const values = Array.from(new Set(jobs.map((job) => job[field]).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "zh-CN")
    );

    select.insertAdjacentHTML(
      "beforeend",
      values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")
    );
  }

  function render() {
    const filters = getFilters();
    const matched = jobs.filter((job) => matchesFilters(job, filters));
    const visible = matched.slice(0, 80);

    results.innerHTML = visible.map(renderJob).join("");
    empty.hidden = matched.length !== 0;
    count.textContent = matched.length === jobs.length ? `${jobs.length} 个岗位` : `${matched.length} / ${jobs.length} 个岗位`;

    if (matched.length > visible.length) {
      results.insertAdjacentHTML(
        "beforeend",
        `<p class="result-limit">已显示前 ${visible.length} 条结果，请继续缩小筛选条件。</p>`
      );
    }
  }

  fetch("/assets/jobs.json")
    .then((response) => {
      if (!response.ok) throw new Error("Unable to load jobs index");
      return response.json();
    })
    .then((data) => {
      jobs = Array.isArray(data) ? data : [];
      const dates = jobs.map((job) => job.date).filter(Boolean).sort();
      const startDate = form.elements.startDate;
      const endDate = form.elements.endDate;

      if (dates.length && startDate && endDate) {
        startDate.min = dates[0];
        startDate.max = dates[dates.length - 1];
        endDate.min = dates[0];
        endDate.max = dates[dates.length - 1];
      }

      ["language", "workMode", "threshold", "confidence", "experience", "direction"].forEach(populateOptions);
      render();
    })
    .catch(() => {
      count.textContent = "索引不可用";
      empty.hidden = false;
      empty.textContent = "岗位索引加载失败，请重新构建站点。";
    });

  form.addEventListener("input", render);
  form.addEventListener("reset", () => {
    window.setTimeout(render, 0);
  });
})();
