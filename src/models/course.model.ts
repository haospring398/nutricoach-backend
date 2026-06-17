import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './user.model';
import { transactions } from './payment.model';

// Lowercase in DB, uppercase in API — same convention as payment/pt enums.
export const courseStatusEnum = pgEnum('course_status', [
  'draft',
  'published',
  'archived',
]);
export const enrollmentStatusEnum = pgEnum('enrollment_status', [
  'active',
  'completed',
  'refunded',
]);

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ptId: uuid('pt_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    // Out-of-band placeholder or future S3 key — same convention as Phase 1.
    thumbnailUrl: varchar('thumbnail_url', { length: 512 }),
    priceVnd: integer('price_vnd').notNull(),
    durationDays: integer('duration_days').notNull(),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: courseStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    totalLessons: integer('total_lessons').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    ptIdIdx: index('courses_pt_id_idx').on(t.ptId),
    statusIdx: index('courses_status_idx').on(t.status),
    // The pg_trgm GIN index on title is added in the migration SQL.
    // The price/duration/title CHECK constraints are added in the migration SQL.
  }),
);

export const courseModules = pgTable(
  'course_modules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    courseIdIdx: index('course_modules_course_id_idx').on(t.courseId),
    uniqueOrder: unique('course_modules_course_order_uq').on(
      t.courseId,
      t.displayOrder,
    ),
  }),
);

export const courseLessons = pgTable(
  'course_lessons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => courseModules.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    // Nullable until publish; the publish handler enforces non-null on all
    // lessons before flipping status.
    youtubeVideoId: varchar('youtube_video_id', { length: 32 }),
    // Alternative to youtubeVideoId: a Cloudinary-hosted video. A lesson is
    // publishable if it has either one (see publishCourse).
    cloudinaryVideoUrl: varchar('cloudinary_video_url', { length: 512 }),
    durationMin: integer('duration_min').notNull().default(0),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    moduleIdIdx: index('course_lessons_module_id_idx').on(t.moduleId),
    uniqueOrder: unique('course_lessons_module_order_uq').on(
      t.moduleId,
      t.displayOrder,
    ),
  }),
);

// Phase-3-owned table, ships in Phase 2 because the payment webhook writes
// into it. Phase 3 will add the PT-facing student management endpoints.
export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    // Denormalized for fast PT-side lookups in Phase 3.
    ptId: uuid('pt_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'restrict' }),
    status: enrollmentStatusEnum('status').notNull().default('active'),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdIdx: index('enrollments_user_id_idx').on(t.userId),
    ptIdIdx: index('enrollments_pt_id_idx').on(t.ptId),
    courseIdIdx: index('enrollments_course_id_idx').on(t.courseId),
    // One enrollment per paid transaction (webhook idempotency).
    transactionUq: unique('enrollments_transaction_uq').on(t.transactionId),
    // The partial unique "no double active enrollment" is in the migration SQL.
  }),
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type CourseModule = typeof courseModules.$inferSelect;
export type NewCourseModule = typeof courseModules.$inferInsert;
export type CourseLesson = typeof courseLessons.$inferSelect;
export type NewCourseLesson = typeof courseLessons.$inferInsert;
export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
