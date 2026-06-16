import {
  boolean,
  date,
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

// ── Reward Redemption (migration 0016) ────────────────────────
// Points become spendable: users redeem catalog rewards, points are deducted
// atomically, and a reward_redemptions row tracks fulfillment. Reward "tier"
// (SMALL/LARGE) is DERIVED from points_required in the service, never stored.

export const redemptionStatusEnum = pgEnum('redemption_status', [
  'pending',
  'fulfilled',
  'rejected',
]);

export const rewards = pgTable('rewards', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description').notNull(),
  pointsRequired: integer('points_required').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rewardRedemptions = pgTable(
  'reward_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rewardId: uuid('reward_id')
      .notNull()
      .references(() => rewards.id, { onDelete: 'restrict' }),
    rewardName: varchar('reward_name', { length: 200 }).notNull(), // snapshot
    pointsCost: integer('points_cost').notNull(), // snapshot
    deliveryAddress: text('delivery_address').notNull(),
    phone: varchar('phone', { length: 20 }).notNull(),
    status: redemptionStatusEnum('status').notNull().default('pending'),
    voucherCode: varchar('voucher_code', { length: 32 }), // SMALL rewards only
    adminNote: text('admin_note'), // reject reason / fulfill note
    redeemedAt: timestamp('redeemed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }), // set on fulfill OR reject
    fulfilledByAdminId: uuid('fulfilled_by_admin_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),
  },
  (t) => ({
    userRedeemedIdx: index('reward_redemptions_user_redeemed_idx').on(
      t.userId,
      t.redeemedAt,
    ),
    statusRedeemedIdx: index('reward_redemptions_status_redeemed_idx').on(
      t.status,
      t.redeemedAt,
    ),
  }),
);

export type Reward = typeof rewards.$inferSelect;
export type NewReward = typeof rewards.$inferInsert;
export type RewardRedemption = typeof rewardRedemptions.$inferSelect;
export type NewRewardRedemption = typeof rewardRedemptions.$inferInsert;
