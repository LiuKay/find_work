(function () {
  "use strict";

  const form = document.querySelector("[data-job-filter]");
  const results = document.querySelector("[data-job-results]");
  const count = document.querySelector("[data-job-count]");
  const empty = document.querySelector("[data-job-empty]");

  if (!form || !results || !count || !empty) return;

  let jobs = [];
  const forcedChannel = form.dataset.defaultChannel || "";
  const initialChannel = forcedChannel || new URLSearchParams(window.location.search).get("channel") || "";
  if (form.elements.channel) form.elements.channel.value = initialChannel;
  let panelTrigger = null;

  const filterLabels = {
    language: "英文要求",
    workMode: "工作方式",
    threshold: "申请门槛",
    confidence: "可投把握",
    experience: "经验阶段",
    direction: "岗位方向",
    channel: "岗位专选",
    startDate: "开始日期",
    endDate: "结束日期",
  };

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

  function icon(name, extraClass = "") {
    return `<img class="app-icon icon-${name}${extraClass ? ` ${extraClass}` : ""}" src="/assets/icons/${name}.svg" alt="" aria-hidden="true">`;
  }

  function confidenceLabel(value) {
    if (value === "高") return "可投把握 高";
    if (value === "中") return "可投把握 中";
    if (value === "低") return "可投把握 低";
    return "待确认";
  }

  function matchesFilters(job, filters) {
    if (filters.query && !job.searchText.includes(filters.query)) return false;
    if (filters.startDate && job.date < filters.startDate) return false;
    if (filters.endDate && job.date > filters.endDate) return false;
    if (filters.language && job.language !== filters.language) return false;
    if (filters.workMode && job.workMode !== filters.workMode) return false;
    if (filters.threshold && job.applicationBarrier !== filters.threshold) return false;
    if (filters.confidence && job.chinaApplicability !== filters.confidence) return false;
    if (filters.experience && job.experience !== filters.experience) return false;
    if (filters.direction && job.direction !== filters.direction) return false;
    if (filters.channel && !(Array.isArray(job.channels) && job.channels.includes(filters.channel))) return false;
    return true;
  }

  function isBookmarked(jobId) {
    const state = globalThis.FindWorkStorage?.readState();
    return Boolean(state?.bookmarkedJobIds?.includes(jobId));
  }

  function renderJob(job) {
    const bookmarked = isBookmarked(job.id);
    const tags = [job.direction, job.workMode, job.language, job.experience]
      .filter(Boolean)
      .slice(0, 4)
      .map((tag) => `<span>${escapeHtml(tag)}</span>`)
      .join("");
    const confidenceClass = `confidence-${job.chinaApplicability === "高" ? "high" : job.chinaApplicability === "中" ? "medium" : "unknown"}`;

    return `<article class="pool-job-card" data-job-card data-job-id="${escapeHtml(job.id)}">
      <button class="bookmark-button" type="button" data-bookmark-job="${escapeHtml(job.id)}" aria-label="收藏 ${escapeHtml(job.title)}" aria-pressed="${bookmarked}">${icon("bookmark", "bookmark-icon")}</button>
      <a href="${escapeHtml(job.detailUrl)}" aria-label="查看 ${escapeHtml(job.title)} 的岗位详情">
        <span class="company-initial" aria-hidden="true">${escapeHtml((job.company || "FW").trim().slice(0, 1).toUpperCase())}</span>
        <span class="pool-job-copy">
          <strong>${escapeHtml(job.title)}</strong>
          <span class="pool-job-company">${escapeHtml(job.company)} · ${escapeHtml(job.workMode)}</span>
          <span class="pool-job-tags">${tags}<i class="${confidenceClass}">${icon("stats-up-square")}${escapeHtml(confidenceLabel(job.chinaApplicability))}</i></span>
          <span class="pool-job-note">${escapeHtml(job.fit)}</span>
          <time datetime="${escapeHtml(job.updatedAt)}">${escapeHtml(job.updatedAt)} 更新</time>
        </span>
      </a>
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
      channel: data.get("channel") || "",
      sort: data.get("sort") || "latest",
    };
  }

  function populateOptions(field) {
    const select = form.querySelector(`[data-filter-options="${field}"]`);
    if (!select) return;
    const jobField = field === "threshold" ? "applicationBarrier" : field === "confidence" ? "chinaApplicability" : field;
    const values = Array.from(new Set(jobs.map((job) => job[jobField]).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "zh-CN")
    );
    select.insertAdjacentHTML(
      "beforeend",
      values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")
    );
  }

  function sortJobs(items, sort) {
    const sorted = [...items];
    if (sort === "confidence") {
      const rank = { 高: 0, 中: 1, 低: 2 };
      return sorted.sort((a, b) => (rank[a.chinaApplicability] ?? 3) - (rank[b.chinaApplicability] ?? 3) || b.date.localeCompare(a.date));
    }
    if (sort === "barrier") {
      const rank = { 低: 0, 中: 1, 高: 2 };
      return sorted.sort((a, b) => (rank[a.applicationBarrier] ?? 3) - (rank[b.applicationBarrier] ?? 3) || b.date.localeCompare(a.date));
    }
    return sorted.sort((a, b) => b.date.localeCompare(a.date) || a.company.localeCompare(b.company, "zh-CN"));
  }

  function renderActiveFilters(filters) {
    const container = document.querySelector("[data-active-filter-chips]");
    const activeEntries = Object.entries(filters).filter(([key, value]) => filterLabels[key] && value);
    if (container) {
      container.innerHTML = activeEntries
        .map(([key, value]) => `<button type="button" data-clear-filter="${key}"><span>${escapeHtml(value)}</span>${icon("xmark")}<span class="visually-hidden">清除${escapeHtml(filterLabels[key])}</span></button>`)
        .join("");
      container.hidden = activeEntries.length === 0;
    }
    document.querySelectorAll("[data-active-filter-count]").forEach((element) => {
      element.textContent = String(activeEntries.length);
    });
  }

  function render() {
    const filters = getFilters();
    const matched = sortJobs(jobs.filter((job) => matchesFilters(job, filters)), filters.sort);
    const visible = matched.slice(0, 80);
    results.innerHTML = visible.map(renderJob).join("");
    empty.hidden = matched.length !== 0;
    count.textContent = matched.length === jobs.length ? `${jobs.length} 个岗位` : `筛出 ${matched.length} 个岗位`;
    renderActiveFilters(filters);
    if (matched.length > visible.length) {
      results.insertAdjacentHTML("beforeend", `<p class="result-limit">已显示前 ${visible.length} 条结果，请继续缩小筛选条件。</p>`);
    }
  }

  function setPanel(open, trigger = null) {
    const panel = document.querySelector("[data-filter-panel]");
    if (!panel) return;
    if (open) panelTrigger = trigger || document.activeElement;
    panel.hidden = !open;
    document.body.classList.toggle("filter-panel-open", open);
    document.querySelectorAll("[data-filter-toggle]").forEach((button) => button.setAttribute("aria-expanded", String(open)));
    if (open) panel.querySelector("select, input")?.focus();
    else if (panelTrigger && typeof panelTrigger.focus === "function") {
      panelTrigger.focus();
      panelTrigger = null;
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
    window.setTimeout(() => {
      if (form.elements.channel) form.elements.channel.value = forcedChannel;
      setPanel(false);
      form.dispatchEvent(new Event("input", { bubbles: true }));
    }, 0);
  });
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-filter-toggle]");
    if (toggle) setPanel(toggle.getAttribute("aria-expanded") !== "true", toggle);
    const close = event.target.closest("[data-filter-close]");
    if (close) setPanel(false);
    const chip = event.target.closest("[data-clear-filter]");
    if (chip && form.elements[chip.dataset.clearFilter]) {
      form.elements[chip.dataset.clearFilter].value = "";
      form.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  document.addEventListener("keydown", (event) => {
    const panel = document.querySelector("[data-filter-panel]");
    if (!panel || panel.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setPanel(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(panel.querySelectorAll("button, input, select")).filter(
      (element) => !element.disabled && element.tabIndex !== -1
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  globalThis.addEventListener("findwork:statechange", render);
})();
