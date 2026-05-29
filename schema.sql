CREATE TABLE IF NOT EXISTS survey_responses (
  voter_id TEXT PRIMARY KEY,
  voter_name TEXT NOT NULL,
  job_categories TEXT NOT NULL,
  work_modes TEXT NOT NULL,
  english_level TEXT NOT NULL,
  experience_levels TEXT NOT NULL,
  difficulty_level TEXT NOT NULL,
  other_keywords TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_updated_at
  ON survey_responses (updated_at);

CREATE TABLE IF NOT EXISTS survey_rate_limits (
  ip_hash TEXT NOT NULL,
  bucket TEXT NOT NULL,
  hits INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (ip_hash, bucket)
);

CREATE INDEX IF NOT EXISTS idx_survey_rate_limits_updated_at
  ON survey_rate_limits (updated_at);
