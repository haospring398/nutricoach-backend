-- Migration 0019: course_media_public_id
-- Stores the Cloudinary public_id of course thumbnails and lesson videos so
-- replace/cleanup can destroy the old asset by id (no URL parsing) and a
-- DB-write failure after upload can compensate-delete the orphaned asset.
-- Hand-written (matches 0010-0018 pattern). Apply with:
--   psql $DATABASE_URL -f src/db/migrations/0019_course_media_public_id.sql

ALTER TABLE "courses" ADD COLUMN "thumbnail_public_id" varchar(512);
ALTER TABLE "course_lessons" ADD COLUMN "cloudinary_video_public_id" varchar(512);
