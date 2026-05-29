import { jsonResponse, normalizeResponse, validateSurveyPayload } from "../_shared/survey.js";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

export async function onRequestGet({ env, request }) {
  if (!env.DB) return jsonResponse({ error: "D1 database binding DB is not configured." }, 500);

  const url = new URL(request.url);
  const voterId = String(url.searchParams.get("voterId") || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,120}$/.test(voterId)) return jsonResponse({ error: "Invalid voterId." }, 400);

  const row = await env.DB.prepare(
    `SELECT voter_id, voter_name, job_categories, work_modes, english_level, experience_levels,
      difficulty_level, other_keywords, created_at, updated_at
     FROM survey_responses
     WHERE voter_id = ?1`
  )
    .bind(voterId)
    .first();

  if (!row) return jsonResponse({ error: "Not found." }, 404);
  return jsonResponse({ response: normalizeResponse(row) });
}

export async function onRequestPost({ env, request }) {
  const configError = requireConfig(env);
  if (configError) return jsonResponse({ error: configError }, 500);

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 12000) return jsonResponse({ error: "Request body is too large." }, 413);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  if (String(payload.inviteCode || "") !== env.SURVEY_INVITE_CODE) {
    return jsonResponse({ error: "邀请码不正确。" }, 403);
  }

  const validation = validateSurveyPayload(payload);
  if (validation.error) return jsonResponse({ error: validation.error }, 400);

  const remoteIp = request.headers.get("CF-Connecting-IP") || "unknown";
  const turnstileResult = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, payload.turnstileToken, remoteIp);
  if (!turnstileResult.success) return jsonResponse({ error: "人机验证失败，请刷新后重试。" }, 403);

  const limited = await isRateLimited(env, remoteIp);
  if (limited) return jsonResponse({ error: "提交过于频繁，请稍后再试。" }, 429);

  const now = new Date().toISOString();
  const response = validation.value;
  await env.DB.prepare(
    `INSERT INTO survey_responses (
      voter_id, voter_name, job_categories, work_modes, english_level, experience_levels,
      difficulty_level, other_keywords, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    ON CONFLICT(voter_id) DO UPDATE SET
      voter_name = excluded.voter_name,
      job_categories = excluded.job_categories,
      work_modes = excluded.work_modes,
      english_level = excluded.english_level,
      experience_levels = excluded.experience_levels,
      difficulty_level = excluded.difficulty_level,
      other_keywords = excluded.other_keywords,
      updated_at = excluded.updated_at`
  )
    .bind(
      response.voterId,
      response.voterName,
      JSON.stringify(response.jobCategories),
      JSON.stringify(response.workModes),
      response.englishLevel,
      JSON.stringify(response.experienceLevels),
      response.difficultyLevel,
      response.otherKeywords,
      now,
      now
    )
    .run();

  return jsonResponse({ ok: true, updatedAt: now });
}

function requireConfig(env) {
  if (!env.DB) return "D1 database binding DB is not configured.";
  if (!env.TURNSTILE_SECRET_KEY) return "TURNSTILE_SECRET_KEY is not configured.";
  if (!env.SURVEY_INVITE_CODE) return "SURVEY_INVITE_CODE is not configured.";
  if (!env.RATE_LIMIT_SALT) return "RATE_LIMIT_SALT is not configured.";
  return "";
}

async function verifyTurnstile(secret, token, remoteIp) {
  if (!token) return { success: false };

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  if (remoteIp && remoteIp !== "unknown") formData.append("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) return { success: false };
  return response.json();
}

async function isRateLimited(env, remoteIp) {
  const bucket = String(Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS));
  const ipHash = await sha256(`${env.RATE_LIMIT_SALT}:${remoteIp}`);
  const existing = await env.DB.prepare(
    "SELECT hits FROM survey_rate_limits WHERE ip_hash = ?1 AND bucket = ?2"
  )
    .bind(ipHash, bucket)
    .first();

  if (existing && existing.hits >= RATE_LIMIT_MAX) return true;

  if (existing) {
    await env.DB.prepare(
      "UPDATE survey_rate_limits SET hits = hits + 1, updated_at = ?3 WHERE ip_hash = ?1 AND bucket = ?2"
    )
      .bind(ipHash, bucket, new Date().toISOString())
      .run();
  } else {
    await env.DB.prepare(
      "INSERT INTO survey_rate_limits (ip_hash, bucket, hits, updated_at) VALUES (?1, ?2, 1, ?3)"
    )
      .bind(ipHash, bucket, new Date().toISOString())
      .run();
  }

  return false;
}

async function sha256(value) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
