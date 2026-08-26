(function () {
  "use strict";

  if (typeof document === "undefined" || !globalThis.FindWorkStorage) return;

  const storage = globalThis.FindWorkStorage;

  function syncButtons(state = storage.readState()) {
    const selected = new Set(state.bookmarkedJobIds);
    document.querySelectorAll("[data-bookmark-job]").forEach((button) => {
      const active = selected.has(button.dataset.bookmarkJob);
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-bookmarked", active);
    });
    const count = document.querySelector("[data-bookmark-count]");
    if (count) count.textContent = String(selected.size);
  }

  function compactJob(job) {
    const item = document.createElement("article");
    item.className = "compact-job-item";
    const link = document.createElement("a");
    link.href = job.detailUrl;
    const title = document.createElement("strong");
    title.textContent = job.title;
    const meta = document.createElement("span");
    meta.textContent = `${job.company} · ${job.workMode}`;
    link.append(title, meta);
    const button = document.createElement("button");
    button.className = "bookmark-button";
    button.type = "button";
    button.dataset.bookmarkJob = job.id;
    button.setAttribute("aria-label", `取消收藏 ${job.title}`);
    button.setAttribute("aria-pressed", "true");
    const icon = document.createElement("img");
    icon.className = "app-icon icon-bookmark bookmark-icon";
    icon.src = "/assets/icons/bookmark.svg";
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    button.append(icon);
    item.append(link, button);
    return item;
  }

  async function renderBookmarkList() {
    const list = document.querySelector("[data-bookmark-list]");
    if (!list) return;
    const state = storage.readState();
    if (!state.bookmarkedJobIds.length) {
      const count = document.querySelector("[data-bookmark-count]");
      if (count) count.textContent = "0";
      list.innerHTML = '<p class="me-empty">在岗位卡右上角点收藏，稍后可从这里继续看。</p>';
      return;
    }
    try {
      const response = await fetch("/assets/jobs.json");
      if (!response.ok) throw new Error("jobs index unavailable");
      const jobs = await response.json();
      const jobsById = new Map(jobs.map((job) => [job.id, job]));
      const selected = state.bookmarkedJobIds.map((id) => jobsById.get(id)).filter(Boolean);
      const count = document.querySelector("[data-bookmark-count]");
      if (count) count.textContent = String(selected.length);
      if (selected.length) list.replaceChildren(...selected.map(compactJob));
      else list.innerHTML = '<p class="me-empty">收藏中的岗位已不在 active 可投库。</p>';
    } catch {
      list.innerHTML = '<p class="me-empty">收藏已保存，但岗位索引暂时无法读取。</p>';
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bookmark-job]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const state = storage.toggleBookmark(button.dataset.bookmarkJob);
    syncButtons(state);
    globalThis.dispatchEvent(new CustomEvent("findwork:statechange", { detail: state }));
    if (document.querySelector("[data-bookmark-list]")) renderBookmarkList();
  });

  syncButtons();
  renderBookmarkList();
  globalThis.addEventListener("storage", () => syncButtons());
  globalThis.addEventListener("findwork:statechange", (event) => syncButtons(event.detail));
})();
