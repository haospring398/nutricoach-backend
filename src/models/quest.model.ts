import {
  boolean,
  date,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './user.model';

// ── Quest catalog (seeded; 7 static quests for v1) ────────────
// PK is a slug (e.g. 'DAILY_LOGIN') — not a uuid — so mobile can bundle
// quest assets/icons by id, same pattern as the exercises table.
export const quests = pgTable('quests', {
  id: varchar('id', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description').notNull(),
  pointsPerCompletion: integer('points_per_completion').notNull(),
  maxCompletionsPerDay: integer('max_completions_per_day')
    .notNull()
    .default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// ── Per-user per-day completion log ───────────────────────────
// One row per (user, quest, VN calendar date). completedCount accumulates
// within the day up to quests.maxCompletionsPerDay.
export const dailyMissionLogs = pgTable(
  'daily_mission_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questId: varchar('quest_id', { length: 64 })
      .notNull()
      .references(() => quests.id, { onDelete: 'restrict' }),
    date: date('date').notNull(), // VN calendar date 'YYYY-MM-DD'
    completedCount: integer('completed_count').notNull().default(0),
    pointsEarned: integer('points_earned').notNull().default(0),
    referenceId: varchar('reference_id', { length: 64 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    uniqueUserQuestDate: unique(
      'daily_mission_logs_user_quest_date_uq',
    ).on(table.userId, table.questId, table.date),
  }),
);

// ── User points ledger ────────────────────────────────────────
// Separate from `users` so gamification writes stay off the auth hot-path
// (the auth middleware reads `users` on every request). userId is the PK —
// one row per user, upserted on each award.
export const userPoints = pgTable('user_points', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  totalPoints: integer('total_points').notNull().default(0),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type Quest = typeof quests.$inferSelect;
export type NewQuest = typeof quests.$inferInsert;
export type DailyMissionLog = typeof dailyMissionLogs.$inferSelect;
export type NewDailyMissionLog = typeof dailyMissionLogs.$inferInsert;
export type UserPoints = typeof userPoints.$inferSelect;
export type NewUserPoints = typeof userPoints.$inferInsert;
