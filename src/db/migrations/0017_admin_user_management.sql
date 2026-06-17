-- Migration 0017: admin_user_management
-- Adds ban management columns to users table for admin moderation.
-- Hand-written (matches 0010-0016 pattern).
-- Apply with: psql $DATABASE_URL -f src/db/migrations/0017_admin_user_management.sql

ALTER TABLE "users" ADD COLUMN "is_banned" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ban_reason" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_at" timestamptz;
--> statement-breakpoint
CREATE INDEX "users_is_banned_idx" ON "users" ("is_banned");
--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" ("created_at");
