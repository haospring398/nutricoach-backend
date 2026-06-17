-- Migration 0018: lesson_cloudinary_video
-- Adds a Cloudinary video URL column to course_lessons so PTs can upload
-- lesson videos directly (alternative to youtube_video_id).
-- Hand-written (matches 0010-0017 pattern). Apply with:
--   psql $DATABASE_URL -f src/db/migrations/0018_lesson_cloudinary_video.sql

ALTER TABLE "course_lessons" ADD COLUMN "cloudinary_video_url" varchar(512);
