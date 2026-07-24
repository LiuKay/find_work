function recommendSurveyChannels(payload) {
  const categories = (payload.jobCategories || []).join(" ");
  const workModes = (payload.workModes || []).join(" ");
  const experience = (payload.experienceLevels || []).join(" ");
  const recommendations = [];
  if (/客服|客户成功|运营|销售|市场/.test(categories)) recommendations.push("ops-cs");
  if (/技术|开发|QA|测试|需求分析|系统分析|产品经理/.test(categories)) recommendations.push("support-tech");
  if (/远程/.test(workModes)) recommendations.push("remote-apac");
  if (/尽量低英文/.test(payload.englishLevel || "")) recommendations.push("low-english");
  if (/入门/.test(experience) || /低门槛/.test(payload.difficultyLevel || "")) recommendations.push("entry");
  if (/中国远程|中国本地办公/.test(workModes)) recommendations.push("china-strong");
  if (!recommendations.length) recommendations.push("china-strong");
  return Array.from(new Set(recommendations));
}

(function () {
  if (typeof document === "undefined") return;
  const OPTIONS = {
    jobCategories: [
      "客服",
      "客户成功",
      "本地化",
      "AI Trainer / 数据标注",
      "内容 / 新媒体",
      "产品经理",
      "需求分析 / 系统分析",
      "项目经理",
      "技术 / 开发",
      "QA / 测试",
      "数据分析",
      "销售 / BD",
      "市场 / 增长",
      "医药 / 临床",
      "科研 / 教育",
      "运营",
      "其他",
    ],
    workModes: ["全球远程", "APAC 远程", "中国远程", "中国本地办公", "都可以"],
    englishLevel: ["尽量低英文", "能读写英文", "能英文会议沟通", "都可以"],
    experienceLevels: ["入门", "1-3 年", "3-5 年", "高级", "都可以"],
    difficultyLevel: ["低门槛优先", "中等门槛可以", "高门槛也可以", "都可以"],
  };

  const form = document.querySelector("[data-survey-form]");
  const status = document.querySelector("[data-survey-status]");
  const recommendationBox = document.querySelector("[data-channel-recommendations]");
  const turnstileBox = document.querySelector("[data-turnstile-box]");
  const submitButton = document.querySelector("[data-submit-survey]");

  if (!form || !status || !submitButton) return;

  const voterKey = "fwSurveyVoterId";
  const nameKey = "fwSurveyVoterName";
  let turnstileToken = "";
  let turnstileWidgetId = null;

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

  function renderChannelRecommendations(payload) {
    if (!recommendationBox || !payload) return;
    const labels = {
      "low-english": "低英文友好",
      "ops-cs": "运营 / 客服 / 客户成功",
      "support-tech": "技术支持 / IT",
      "remote-apac": "时区友好远程",
      entry: "入门 / 低门槛",
      "china-strong": "中国可投高把握",
    };
    const channels = recommendSurveyChannels(payload);
    recommendationBox.hidden = false;
    recommendationBox.innerHTML = `<strong>按你的选择，可以先看：</strong><div>${channels
      .map(
        (channel) =>
          `<a href="/channels/${escapeHtml(channel)}/">${escapeHtml(labels[channel])}</a>`
      )
      .join("")}</div>`;
  }

  function getVoterId() {
    const existing = window.localStorage.getItem(voterKey);
    if (existing) return existing;

    const id =
      window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : `voter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    window.localStorage.setItem(voterKey, id);
    return id;
  }

  function renderOptions() {
    for (const [name, values] of Object.entries(OPTIONS)) {
      const container = document.querySelector(`[data-options="${name}"]`);
      if (!container) continue;
      const type = name === "englishLevel" || name === "difficultyLevel" ? "radio" : "checkbox";

      container.innerHTML = values
        .map(
          (value, index) => `<label class="choice">
            <input type="${type}" name="${escapeHtml(name)}" value="${escapeHtml(value)}"${type === "radio" && index === 0 ? " required" : ""}>
            <span>${escapeHtml(value)}</span>
          </label>`
        )
        .join("");
    }
  }

  function renderSelectOptions() {
    for (const select of form.querySelectorAll("[data-select-options]")) {
      const values = OPTIONS[select.dataset.selectOptions] || [];
      const firstLabel = select.dataset.optionalLabel || "请选择";
      select.innerHTML = [
        `<option value="">${escapeHtml(firstLabel)}</option>`,
        ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`),
      ].join("");
    }
  }

  function selectedValues(names) {
    const values = names
      .map((name) => form.elements[name] && form.elements[name].value)
      .filter(Boolean);
    return Array.from(new Set(values));
  }

  function setSelectValue(name, value) {
    if (form.elements[name]) {
      form.elements[name].value = value || "";
    }
  }

  function buildPayload() {
    return {
      voterId: getVoterId(),
      voterName: form.elements.voterName.value.trim(),
      inviteCode: form.elements.inviteCode.value,
      turnstileToken,
      jobCategories: selectedValues(["primaryJobCategory", "secondaryJobCategory"]),
      workModes: selectedValues(["workMode"]),
      englishLevel: form.elements.englishLevel.value,
      experienceLevels: selectedValues(["experienceLevel"]),
      difficultyLevel: form.elements.difficultyLevel.value,
      otherKeywords: form.elements.otherKeywords.value.trim(),
    };
  }

  function validatePayload(payload) {
    if (!payload.voterName) return "请填写昵称。";
    if (!payload.inviteCode) return "请填写邀请码。";
    if (!payload.jobCategories.length) return "请选择至少一个岗位方向。";
    if (!payload.workModes.length) return "请选择至少一种工作方式。";
    if (!payload.englishLevel) return "请选择英文要求。";
    if (!payload.experienceLevels.length) return "请选择至少一个经验阶段。";
    if (!payload.difficultyLevel) return "请选择申请门槛。";
    if (!payload.turnstileToken) return "请完成人机验证。";
    return "";
  }

  function applyResponse(response) {
    if (!response) return;
    form.elements.voterName.value = response.voterName || "";
    const jobCategories = Array.isArray(response.jobCategories) ? response.jobCategories : [];
    setSelectValue("primaryJobCategory", jobCategories[0]);
    setSelectValue("secondaryJobCategory", jobCategories[1]);
    setSelectValue("workMode", Array.isArray(response.workModes) ? response.workModes[0] : "");
    setSelectValue("englishLevel", response.englishLevel);
    setSelectValue("experienceLevel", Array.isArray(response.experienceLevels) ? response.experienceLevels[0] : "");
    setSelectValue("difficultyLevel", response.difficultyLevel);
    form.elements.otherKeywords.value = response.otherKeywords || "";
  }

  function renderCurrentSelection(payload) {
    const summary = [
      ["岗位方向", payload.jobCategories.join(" / ")],
      ["工作方式", payload.workModes.join(" / ")],
      ["英文要求", payload.englishLevel],
      ["经验阶段", payload.experienceLevels.join(" / ")],
      ["申请门槛", payload.difficultyLevel],
      ["补充关键词", payload.otherKeywords || "无"],
    ]
      .map(([label, value]) => `${label}：${value}`)
      .join("；");
    showStatus(`已保存。你当前的选择是：${summary}`, "success");
  }

  function resetTurnstile() {
    turnstileToken = "";
    if (window.turnstile && turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
    }
  }

  function initTurnstile() {
    const siteKey = form.dataset.turnstileSiteKey;
    if (!siteKey) {
      const isLocalPreview = ["127.0.0.1", "localhost"].includes(window.location.hostname);
      showStatus(
        isLocalPreview
          ? "本地预览已跳过人机验证；线上页面会显示 Cloudflare 验证后再提交。"
          : "问卷需要配置 TURNSTILE_SITE_KEY 后才能提交。",
        isLocalPreview ? "info" : "error"
      );
      submitButton.disabled = true;
      return;
    }

    if (!window.turnstile || !turnstileBox) {
      showStatus("人机验证加载失败，请刷新页面重试。", "error");
      submitButton.disabled = true;
      return;
    }

    turnstileWidgetId = window.turnstile.render(turnstileBox, {
      sitekey: siteKey,
      callback(token) {
        turnstileToken = token;
      },
      "expired-callback"() {
        turnstileToken = "";
      },
      "error-callback"() {
        turnstileToken = "";
        showStatus("人机验证失败，请刷新后重试。", "error");
      },
    });
  }

  async function loadExistingResponse() {
    const voterId = getVoterId();
    const savedName = window.localStorage.getItem(nameKey);
    if (savedName) form.elements.voterName.value = savedName;

    try {
      const response = await fetch(`/api/survey?voterId=${encodeURIComponent(voterId)}`);
      if (response.status === 404) return;
      if (!response.ok) throw new Error("load failed");
      const data = await response.json();
      applyResponse(data.response);
      if (data.response) {
        showStatus("已载入你之前提交的问卷，可以直接修改后重新提交。", "info");
        renderChannelRecommendations(data.response);
      }
    } catch (error) {
      showStatus("暂时无法读取已提交问卷；你仍然可以填写并提交。", "info");
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = buildPayload();
    const validationError = validatePayload(payload);
    if (validationError) {
      showStatus(validationError, "error");
      return;
    }

    submitButton.disabled = true;
    showStatus("正在提交...", "info");

    try {
      const response = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "提交失败");

      window.localStorage.setItem(nameKey, payload.voterName);
      renderCurrentSelection(payload);
      renderChannelRecommendations(payload);
      resetTurnstile();
    } catch (error) {
      showStatus(error.message || "提交失败，请稍后重试。", "error");
      resetTurnstile();
    } finally {
      submitButton.disabled = false;
    }
  });

  renderOptions();
  renderSelectOptions();
  loadExistingResponse();
  window.addEventListener("load", initTurnstile);
})();

if (typeof module !== "undefined") module.exports = { recommendSurveyChannels };
