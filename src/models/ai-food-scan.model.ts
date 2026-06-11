import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './user.model';

// ── AI food scans ─────────────────────────────────────────────
// One row per scan. We persist the SHA-256 hash of the image (never the raw
// base64 — see CODEBASE_CONTEXT Decision B / privacy) plus the Gemini
// extraction, the matched dataset rows, and the Vietnamese free-text answer.
// created_at is timestamptz to match the payment/course/pt majority (quest's
// plain timestamp is the exception, not the rule).
export const aiFoodScans = pgTable(
  'ai_food_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    imageHash: varchar('image_hash', { length: 64 }).notNull(), // SHA-256 hex
    extraction: jsonb('extraction').notNull(),
    matchedRows: jsonb('matched_rows').notNull().default(sql`'[]'::jsonb`),
    finalAnswer: text('final_answer'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userCreatedIdx: index('ai_food_scans_user_created_idx').on(
      t.userId,
      t.createdAt,
    ),
    userHashIdx: index('ai_food_scans_user_hash_idx').on(t.userId, t.imageHash),
  }),
);

export type AiFoodScan = typeof aiFoodScans.$inferSelect;
export type NewAiFoodScan = typeof aiFoodScans.$inferInsert;
