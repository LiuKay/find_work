(function () {
  const form = document.querySelector("[data-admin-form]");
  const status = document.querySelector("[data-admin-status]");
  const dashboard = document.querySelector("[data-stats-dashboard]");

  if (!form || !status || !dashboard) return;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showStatus(message, type) {
    status.hidden = false;
    status.textContent = message;
    status.dataset.statusType = type || "info";
  }

  function renderChart(name, items) {
    const container = document.querySelector(`[data-chart="${name}"]`);
    if (!container) return;
    const total = Math.max(...items.map((item) => item.count), 1);

    if (!items.length) {
      container.innerHTML = `<p class="empty-stat">暂无数据</p>`;
      return;
    }

    container.innerHTML = items
      .map((item) => {
        const width = Math.max(Math.round((item.count / total) * 100), 4);
        return `<div class="stat-row">
          <div class="stat-row-label">
            <span>${escapeHtml(item.label)}</span>
            <strong>${item.count}</strong>
          </div>
          <div class="stat-bar"><span style="width: ${width}%"></span></div>
        </div>`;
      })
      .join("");
  }

  function renderKeywords(keywords) {
    const container = document.querySelector("[data-keywords]");
    if (!container) return;

    if (!keywords.length) {
      container.innerHTML = `<p class="empty-stat">暂无补充关键词</p>`;
      return;
    }

    container.innerHTML = `<ul class="keyword-list">${keywords
      .map(
        (item) => `<li>
          <span>${escapeHtml(item.voterName)}</span>
          <p>${escapeHtml(item.otherKeywords)}</p>
        </li>`
      )
      .join("")}</ul>`;
  }

  function renderStats(data) {
    document.querySelector("[data-total-responses]").textContent = data.totalResponses || 0;
    document.querySelector("[data-last-updated]").textContent = data.lastUpdated || "暂无";

    renderChart("jobCategories", data.counts.jobCategories || []);
    renderChart("workModes", data.counts.workModes || []);
    renderChart("englishLevel", data.counts.englishLevel || []);
    renderChart("experienceLevels", data.counts.experienceLevels || []);
    renderChart("difficultyLevel", data.counts.difficultyLevel || []);
    renderKeywords(data.keywords || []);
    dashboard.hidden = false;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = form.elements.adminPassword.value;
    if (!password) {
      showStatus("请输入管理密码。", "error");
      return;
    }

    showStatus("正在读取统计...", "info");

    try {
      const response = await fetch("/api/survey/stats", {
        headers: { Authorization: `Bearer ${password}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "读取失败");
      renderStats(data);
      showStatus("统计已更新。", "success");
    } catch (error) {
      dashboard.hidden = true;
      showStatus(error.message || "读取失败，请稍后重试。", "error");
    }
  });
})();
