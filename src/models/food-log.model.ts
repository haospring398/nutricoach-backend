import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './user.model';
import { foodItems } from './food-item.model';

export const mealTypeEnum = pgEnum('meal_type', [
  'BREAKFAST',
  'LUNCH',
  'DINNER',
  'SNACK',
]);

export const foodLogSourceEnum = pgEnum('food_log_source', [
  'MANUAL',
  'SCAN',
]);

export const foodLogs = pgTable('food_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  foodItemId: uuid('food_item_id').references(() => foodItems.id, {
    onDelete: 'set null',
  }),
  foodName: varchar('food_name', { length: 200 }).notNull(),
  calories: integer('calories').notNull(),
  // Macros are nullable: Mode A snapshots from a catalog item with PARTIAL
  // data leave the missing macros null. Mode B always provides all three.
  proteinG: numeric('protein_g', { precision: 6, scale: 2 }).default('0'),
  carbsG: numeric('carbs_g', { precision: 6, scale: 2 }).default('0'),
  fatG: numeric('fat_g', { precision: 6, scale: 2 }).default('0'),
  portion: numeric('portion', { precision: 4, scale: 2 })
    .notNull()
    .default('1'),
  mealType: mealTypeEnum('meal_type').notNull(),
  consumedAt: timestamp('consumed_at').notNull(),
  sourceType: foodLogSourceEnum('source_type').notNull().default('MANUAL'),
  scanId: varchar('scan_id', { length: 100 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userConsumedIdx: index('food_logs_user_consumed_idx').on(
    table.userId,
    table.consumedAt,
  ),
}));

export type FoodLog = typeof foodLogs.$inferSelect;
export type NewFoodLog = typeof foodLogs.$inferInsert;
