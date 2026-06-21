-- Migration 0020: course_lesson_is_preview
-- Adds a per-lesson preview flag so a PT can mark individual lesson videos as
-- publicly viewable (xem thử) vs paid. The public course detail exposes a
-- lesson's cloudinaryVideoUrl only when is_preview = true; paid lessons stay
-- hidden. Default false → every existing lesson remains paid (no behavior change).
-- Hand-written (matches 0010-0019 pattern). Applied automatically by the
-- manual-SQL pass in `npm run db:migrate` (tracked in _manual_migrations);
-- idempotent so a prior manual `psql -f` run is also safe.

ALTER TABLE "course_lessons" ADD COLUMN IF NOT EXISTS "is_preview" boolean NOT NULL DEFAULT false;
