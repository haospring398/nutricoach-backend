import {
  boolean,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const foodTypeEnum = pgEnum('food_type', ['INGREDIENT', 'DISH']);

export const foodDataCompletenessEnum = pgEnum('food_data_completeness', [
  'FULL',
  'PARTIAL',
  'CALORIES_ONLY',
]);

export const foodItems = pgTable('food_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  externalId: varchar('external_id', { length: 32 }).notNull().unique(),
  source: varchar('source', { length: 32 }).notNull().default('VN_NIN'),
  type: foodTypeEnum('type').notNull(),
  nameVi: varchar('name_vi', { length: 255 }).notNull(),
  nameEn: varchar('name_en', { length: 255 }),
  category: varchar('category', { length: 255 }).notNull(),
  caloriesKcal: numeric('calories_kcal', { precision: 7, scale: 2 }).notNull(),
  proteinG: numeric('protein_g', { precision: 6, scale: 2 }),
  totalFatG: numeric('total_fat_g', { precision: 6, scale: 2 }),
  carbohydrateG: numeric('carbohydrate_g', { precision: 6, scale: 2 }),
  sugarG: numeric('sugar_g', { precision: 6, scale: 2 }),
  calciumMg: numeric('calcium_mg', { precision: 8, scale: 2 }),
  ironMg: numeric('iron_mg', { precision: 6, scale: 2 }),
  sodiumMg: numeric('sodium_mg', { precision: 8, scale: 2 }),
  potassiumMg: numeric('potassium_mg', { precision: 8, scale: 2 }),
  vitaminCMg: numeric('vitamin_c_mg', { precision: 6, scale: 2 }),
  vitaminAIu: numeric('vitamin_a_iu', { precision: 8, scale: 2 }),
  micronutrients: jsonb('micronutrients'),
  dataCompleteness: foodDataCompletenessEnum('data_completeness').notNull(),
  isVerified: boolean('is_verified').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type FoodItem = typeof foodItems.$inferSelect;
export type NewFoodItem = typeof foodItems.$inferInsert;
