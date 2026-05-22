import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './user.model';

export const muscleGroupEnum = pgEnum('muscle_group', [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'legs',
  'glutes',
  'core',
  'cardio',
  'full_body',
]);

export const equipmentEnum = pgEnum('equipment', [
  'bodyweight',
  'dumbbell',
  'barbell',
  'machine',
  'kettlebell',
  'band',
  'cable',
  'other',
]);

export const difficultyEnum = pgEnum('difficulty', [
  'beginner',
  'intermediate',
  'advanced',
]);

// Static, seeded content. Slug as PK (mobile bundles assets by slug).
export const exercises = pgTable(
  'exercises',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    nameVi: varchar('name_vi', { length: 200 }).notNull(),
    nameEn: varchar('name_en', { length: 200 }).notNull(),
    muscleGroups: muscleGroupEnum('muscle_groups').array().notNull(),
    equipment: equipmentEnum('equipment').notNull(),
    difficulty: difficultyEnum('difficulty').notNull(),
    caloriesPerMinute: numeric('calories_per_minute', {
      precision: 5,
      scale: 2,
    }).notNull(),
    thumbnailUrl: varchar('thumbnail_url', { length: 512 }),
    animation2dUrl: varchar('animation_2d_url', { length: 512 }),
    youtubeVideoId: varchar('youtube_video_id', { length: 32 }),
    instructions: jsonb('instructions').$type<string[]>(),
    commonMistakes: jsonb('common_mistakes').$type<string[]>(),
    variations: jsonb('variations').$type<{ id: string; name: string }[]>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    equipmentIdx: index('exercises_equipment_idx').on(t.equipment),
    difficultyIdx: index('exercises_difficulty_idx').on(t.difficulty),
    // GIN index on muscle_groups + trigram indexes on names are added as
    // raw SQL in the migration (drizzle-kit 0.20's DSL can't express them).
  }),
);

export const workoutSessions = pgTable(
  'workout_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    performedAt: timestamp('performed_at', { withTimezone: true }).notNull(),
    durationSec: integer('duration_sec').notNull().default(0),
    estimatedCaloriesBurned: integer('estimated_calories_burned')
      .notNull()
      .default(0),
    caloriesBurned: integer('calories_burned').notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userPerformedIdx: index('workout_sessions_user_performed_idx').on(
      t.userId,
      t.performedAt,
    ),
  }),
);

// One row per set (weight-training) or cardio block within a session.
export const sessionExerciseLogs = pgTable(
  'session_exercise_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    exerciseId: varchar('exercise_id', { length: 64 })
      .notNull()
      .references(() => exercises.id, { onDelete: 'restrict' }),
    exerciseNameSnapshot: varchar('exercise_name_snapshot', {
      length: 200,
    }).notNull(),
    orderIndex: integer('order_index').notNull(),
    setNumber: integer('set_number').notNull(),
    reps: integer('reps'),
    weightKg: numeric('weight_kg', { precision: 6, scale: 2 }),
    durationSec: integer('duration_sec'),
    restSec: integer('rest_sec').notNull().default(0),
    rpe: integer('rpe'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    sessionIdx: index('session_exercise_logs_session_idx').on(t.sessionId),
  }),
);

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type NewWorkoutSession = typeof workoutSessions.$inferInsert;
export type SessionExerciseLog = typeof sessionExerciseLogs.$inferSelect;
export type NewSessionExerciseLog = typeof sessionExerciseLogs.$inferInsert;
