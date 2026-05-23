import {
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './user.model';
import { enrollments } from './course.model';

// Phase 3: only meal_plan and exercise_addition. The note-only assignment
// type (from the roadmap) is reserved for a future messaging phase.
export const ptAssignmentTypeEnum = pgEnum('pt_assignment_type', [
  'meal_plan',
  'exercise_addition',
]);

export const ptAssignments = pgTable(
  'pt_assignments',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    ptId: uuid('pt_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'cascade' }),

    type: ptAssignmentTypeEnum('type').notNull(),
    // Shape varies by `type` and is validated at the Zod layer. CHECK in the
    // migration only enforces `jsonb_typeof(payload) = 'object'`.
    payload: jsonb('payload').notNull(),

    // For meal_plan: set when a newer plan replaces this one. For
    // exercise_addition: always NULL (additions accumulate). Self-pointer
    // is intentionally not constrained as an FK — see migration comment.
    supersededBy: uuid('superseded_by'),

    // Reserved for a future "mark as read" feature; never written in Phase 3.
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),

    scheduledFor: date('scheduled_for'),
    note: text('note'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    ptStudentIdx: index('pt_assignments_pt_student_idx').on(
      t.ptId,
      t.studentId,
    ),
    studentCreatedIdx: index('pt_assignments_student_created_idx').on(
      t.studentId,
      t.createdAt,
    ),
    enrollmentTypeIdx: index('pt_assignments_enrollment_type_idx').on(
      t.enrollmentId,
      t.type,
    ),
    // Partial unique "one active meal plan per enrollment" lives in the
    // migration SQL (drizzle-kit 0.20 can't express partial unique indexes).
    // CHECK constraints also live in migration SQL.
  }),
);

export type PtAssignment = typeof ptAssignments.$inferSelect;
export type NewPtAssignment = typeof ptAssignments.$inferInsert;
