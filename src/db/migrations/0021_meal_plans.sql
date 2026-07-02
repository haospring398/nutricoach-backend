-- Migration 0021: meal_plans
-- Persists the latest AI-generated meal + exercise plan per user so the mobile
-- app can read it back (GET /nutrition/meal-plans) instead of re-generating.
-- One row per user: user_id is UNIQUE and generateMealPlan upserts on it. The
-- user_id index is redundant with the UNIQUE constraint (which already backs
-- lookups) but kept for parity with the other per-user tables; drop it if the
-- redundancy is unwanted.
-- Hand-written (matches 0010-0020 pattern). Applied automatically by the
-- manual-SQL pass in `npm run db:migrate` (tracked in _manual_migrations);
-- idempotent so a prior manual `psql -f` run — including the table already
-- created by hand on the Test deployment — is also safe.

CREATE TABLE IF NOT EXISTS "meal_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users" ("id") ON DELETE CASCADE,
  "data" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "meal_plans_user_id_idx" ON "meal_plans" ("user_id");
