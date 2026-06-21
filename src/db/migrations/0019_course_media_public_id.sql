-- Migration 0019: course_media_public_id
-- Stores the Cloudinary public_id of course thumbnails and lesson videos so
-- replace/cleanup can destroy the old asset by id (no URL parsing) and a
-- DB-write failure after upload can compensate-delete the orphaned asset.
-- Hand-written (matches 0010-0018 pattern). Applied automatically by the
-- manual-SQL pass in `npm run db:migrate` (tracked in _manual_migrations);
-- idempotent so a prior manual `psql -f` run is also safe.

ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "thumbnail_public_id" varchar(512);
ALTER TABLE "course_lessons" ADD COLUMN IF NOT EXISTS "cloudinary_video_public_id" varchar(512);
