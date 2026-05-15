import {
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './user.model';

export const genderEnum = pgEnum('gender', ['MALE', 'FEMALE']);

export const activityLevelEnum = pgEnum('activity_level', [
  'SEDENTARY',
  'LIGHT',
  'MODERATE',
  'ACTIVE',
  'VERY_ACTIVE',
]);

export const goalEnum = pgEnum('goal', [
  'LOSE_WEIGHT',
  'MAINTAIN',
  'GAIN_WEIGHT',
  'GAIN_MUSCLE',
]);

export const userMetrics = pgTable('user_metrics', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  gender: genderEnum('gender').notNull(),
  dateOfBirth: date('date_of_birth').notNull(),
  heightCm: integer('height_cm').notNull(),
  weightKg: numeric('weight_kg', { precision: 5, scale: 2 }).notNull(),
  activityLevel: activityLevelEnum('activity_level').notNull(),
  goal: goalEnum('goal').notNull(),
  targetWeightKg: numeric('target_weight_kg', { precision: 5, scale: 2 }),
  dietaryRestrictions: text('dietary_restrictions')
    .array()
    .notNull()
    .default([]),
  allergies: text('allergies').array().notNull().default([]),
  bmr: integer('bmr').notNull(),
  tdee: integer('tdee').notNull(),
  dailyCalorieTarget: integer('daily_calorie_target').notNull(),
  proteinG: integer('protein_g').notNull(),
  carbsG: integer('carbs_g').notNull(),
  fatG: integer('fat_g').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type UserMetrics = typeof userMetrics.$inferSelect;
export type NewUserMetrics = typeof userMetrics.$inferInsert;
