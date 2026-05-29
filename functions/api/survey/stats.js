import { jsonResponse, normalizeResponse, tallyResponses } from "../../_shared/survey.js";

export async function onRequestGet({ env, request }) {
  if (!env.DB) return jsonResponse({ error: "D1 database binding DB is not configured." }, 500);
  if (!env.ADMIN_PASSWORD) return jsonResponse({ error: "ADMIN_PASSWORD is not configured." }, 500);

  const authorization = request.headers.get("Authorization") || "";
  if (authorization !== `Bearer ${env.ADMIN_PASSWORD}`) {
    return jsonResponse({ error: "管理密码不正确。" }, 401);
  }

  const rows = await env.DB.prepare(
    `SELECT voter_id, voter_name, job_categories, work_modes, english_level, experience_levels,
      difficulty_level, other_keywords, created_at, updated_at
     FROM survey_responses
     ORDER BY updated_at DESC`
  ).all();

  const responses = (rows.results || []).map(normalizeResponse).filter(Boolean);
  return jsonResponse(tallyResponses(responses));
}
