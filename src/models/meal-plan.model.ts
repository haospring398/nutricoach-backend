import { jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './user.model';

// ── Meal plans ────────────────────────────────────────────────
// One row per user (user_id UNIQUE) holding the latest AI-generated meal +
// exercise plan as raw jsonb. generateMealPlan upserts on user_id; the mobile
// app reads it back via GET /nutrition/meal-plans. created_at/updated_at are
// timestamptz to match the payment/course/scan majority.
export const mealPlans = pgTable('meal_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MealPlan = typeof mealPlans.$inferSelect;
export type NewMealPlan = typeof mealPlans.$inferInsert;
