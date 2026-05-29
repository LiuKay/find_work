export const OPTIONS = {
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

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeResponse(row) {
  if (!row) return null;
  return {
    voterId: row.voter_id,
    voterName: row.voter_name,
    jobCategories: parseJsonArray(row.job_categories),
    workModes: parseJsonArray(row.work_modes),
    englishLevel: row.english_level,
    experienceLevels: parseJsonArray(row.experience_levels),
    difficultyLevel: row.difficulty_level,
    otherKeywords: row.other_keywords || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateSurveyPayload(payload) {
  const voterId = String(payload.voterId || "").trim();
  const voterName = String(payload.voterName || "").trim();
  const otherKeywords = String(payload.otherKeywords || "").trim();
  const jobCategories = normalizeList(payload.jobCategories);
  const workModes = normalizeList(payload.workModes);
  const englishLevel = String(payload.englishLevel || "").trim();
  const experienceLevels = normalizeList(payload.experienceLevels);
  const difficultyLevel = String(payload.difficultyLevel || "").trim();

  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(voterId)) return { error: "投票身份无效，请刷新页面重试。" };
  if (!voterName || voterName.length > 40) return { error: "昵称需要填写，且不能超过 40 个字符。" };
  if (otherKeywords.length > 600) return { error: "补充关键词不能超过 600 个字符。" };
  if (!isValidMultiChoice(jobCategories, OPTIONS.jobCategories, 1, 8)) return { error: "请选择 1 到 8 个岗位方向。" };
  if (!isValidMultiChoice(workModes, OPTIONS.workModes, 1, 5)) return { error: "请选择至少一种工作方式。" };
  if (!OPTIONS.englishLevel.includes(englishLevel)) return { error: "请选择有效的英文要求。" };
  if (!isValidMultiChoice(experienceLevels, OPTIONS.experienceLevels, 1, 5)) return { error: "请选择至少一个经验阶段。" };
  if (!OPTIONS.difficultyLevel.includes(difficultyLevel)) return { error: "请选择有效的申请门槛。" };

  return {
    value: {
      voterId,
      voterName,
      jobCategories,
      workModes,
      englishLevel,
      experienceLevels,
      difficultyLevel,
      otherKeywords,
    },
  };
}

export function tallyResponses(responses) {
  const counts = {
    jobCategories: countList(responses, "jobCategories"),
    workModes: countList(responses, "workModes"),
    englishLevel: countScalar(responses, "englishLevel"),
    experienceLevels: countList(responses, "experienceLevels"),
    difficultyLevel: countScalar(responses, "difficultyLevel"),
  };

  return {
    totalResponses: responses.length,
    lastUpdated: responses.map((response) => response.updatedAt).filter(Boolean).sort().reverse()[0] || "",
    counts,
    keywords: responses
      .filter((response) => response.otherKeywords)
      .map((response) => ({
        voterName: response.voterName,
        otherKeywords: response.otherKeywords,
        updatedAt: response.updatedAt,
      }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
  };
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
}

function isValidMultiChoice(values, allowed, min, max) {
  return values.length >= min && values.length <= max && values.every((value) => allowed.includes(value));
}

function countList(responses, field) {
  const counts = new Map();
  for (const response of responses) {
    for (const value of response[field] || []) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return sortCounts(counts);
}

function countScalar(responses, field) {
  const counts = new Map();
  for (const response of responses) {
    if (response[field]) counts.set(response[field], (counts.get(response[field]) || 0) + 1);
  }
  return sortCounts(counts);
}

function sortCounts(counts) {
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
}
