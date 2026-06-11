-- Migration 0015: ai_food_scans
-- AI food-scan module. Persists the SHA-256 hash of the scanned image (never
-- the raw base64) plus the Gemini extraction, matched dataset rows, and the
-- Vietnamese free-text answer. created_at is timestamptz (payment/course/pt
-- majority style). Resolves the AI_SCAN quest TODO: scan ids become the
-- server-verified referenceId in daily_mission_logs.

CREATE TABLE IF NOT EXISTS "ai_food_scans" (
  "id"           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"      uuid        NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "image_hash"   varchar(64) NOT NULL,
  "extraction"   jsonb       NOT NULL,
  "matched_rows" jsonb       NOT NULL DEFAULT '[]'::jsonb,
  "final_answer" text,
  "created_at"   timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_food_scans_user_created_idx" ON "ai_food_scans" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_food_scans_user_hash_idx" ON "ai_food_scans" ("user_id", "image_hash");
