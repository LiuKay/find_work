(function () {
  "use strict";

  if (typeof document === "undefined") return;

  const filterForm = document.querySelector("[data-job-filter]");
  if (filterForm) {
    const params = new URLSearchParams(window.location.search);
    const pendingSelects = [];
    for (const name of [
      "query",
      "startDate",
      "endDate",
      "language",
      "workMode",
      "threshold",
      "confidence",
      "experience",
      "direction",
      "sort",
    ]) {
      const field = filterForm.elements[name];
      if (!params.has(name) || !field) continue;
      const value = params.get(name);
      if (field.tagName === "SELECT" && !Array.from(field.options).some((option) => option.value === value)) {
        pendingSelects.push({ field, value });
      } else {
        field.value = value;
      }
    }
    if (pendingSelects.length && typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(() => {
        let applied = false;
        for (let index = pendingSelects.length - 1; index >= 0; index -= 1) {
          const { field, value } = pendingSelects[index];
          if (!Array.from(field.options).some((option) => option.value === value)) continue;
          field.value = value;
          pendingSelects.splice(index, 1);
          applied = true;
        }
        if (applied) filterForm.dispatchEvent(new Event("input", { bubbles: true }));
        if (!pendingSelects.length) observer.disconnect();
      });
      observer.observe(filterForm, { childList: true, subtree: true });
      window.setTimeout(() => observer.disconnect(), 5000);
    }

    filterForm.addEventListener("input", () => {
      const next = new URLSearchParams();
      const data = new FormData(filterForm);
      for (const [name, rawValue] of data.entries()) {
        const value = String(rawValue || "").trim();
        if (!value || (name === "sort" && value === "latest")) continue;
        next.set(name, value);
      }
      const query = next.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    });
  }

  const shareButtons = document.querySelectorAll("[data-share-page]");
  const status = document.querySelector("[data-share-status]");

  function setStatus(message) {
    if (!status) return;
    status.textContent = message;
    window.setTimeout(() => {
      if (status.textContent === message) status.textContent = "";
    }, 2400);
  }

  async function sharePage(button) {
    const title = button.dataset.shareTitle || document.title;
    const payload = { title, text: `${title} · Find Work`, url: window.location.href };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        setStatus("分享面板已打开");
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        setStatus("岗位链接已复制");
        return;
      }
      setStatus("请复制浏览器地址分享");
    } catch (error) {
      if (error && error.name === "AbortError") return;
      setStatus("暂时无法分享，请复制浏览器地址");
    }
  }

  shareButtons.forEach((button) => button.addEventListener("click", () => sharePage(button)));

  const pickFilters = document.querySelectorAll("[data-pick-filter]");
  if (pickFilters.length) {
    pickFilters.forEach((button) => button.addEventListener("click", () => {
      const direction = button.dataset.pickFilter;
      pickFilters.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      document.querySelectorAll("[data-pick-direction]").forEach((card) => {
        card.hidden = Boolean(direction && card.dataset.pickDirection !== direction);
      });
    }));
  }
})();
