import { and, eq, sql } from 'drizzle-orm';
import { db } from '../config/db';
import { foodLogs, type FoodLog } from '../models/food-log.model';
import { userMetrics } from '../models/user-metrics.model';
import { ApiError } from '../lib/api-error';
import type {
  CreateFoodLogInput,
  UpdateFoodLogInput,
} from '../validations/nutrition.validation';

export class NutritionError extends ApiError {}

type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

interface Macros {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface FoodLogItem {
  id: string;
  foodName: string;
  calories: number;
  macros: Macros;
  portion: number;
  mealType: MealType;
  consumedAt: Date;
}

export interface CreatedFoodLog {
  foodLogId: string;
  foodName: string;
  calories: number;
  macros: Macros;
  portion: number;
  mealType: MealType;
  consumedAt: Date;
}

export interface FoodLogsByDay {
  date: string;
  meals: {
    breakfast: FoodLogItem[];
    lunch: FoodLogItem[];
    dinner: FoodLogItem[];
    snack: FoodLogItem[];
  };
  totals: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
}

export interface DailySummary {
  date: string;
  target: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null;
  consumed: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  remaining: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null;
  progressPercent: number | null;
  meals: {
    breakfast: number;
    lunch: number;
    dinner: number;
    snack: number;
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

const toItem = (row: FoodLog): FoodLogItem => ({
  id: row.id,
  foodName: row.foodName,
  calories: row.calories,
  macros: {
    proteinG: Number(row.proteinG),
    carbsG: Number(row.carbsG),
    fatG: Number(row.fatG),
  },
  portion: Number(row.portion),
  mealType: row.mealType,
  consumedAt: row.consumedAt,
});

const toCreated = (row: FoodLog): CreatedFoodLog => ({
  foodLogId: row.id,
  foodName: row.foodName,
  calories: row.calories,
  macros: {
    proteinG: Number(row.proteinG),
    carbsG: Number(row.carbsG),
    fatG: Number(row.fatG),
  },
  portion: Number(row.portion),
  mealType: row.mealType,
  consumedAt: row.consumedAt,
});

export const createFoodLog = async (
  userId: string,
  input: CreateFoodLogInput,
): Promise<CreatedFoodLog> => {
  const [row] = await db
    .insert(foodLogs)
    .values({
      userId,
      foodName: input.foodName,
      calories: input.calories,
      proteinG: input.proteinG.toString(),
      carbsG: input.carbsG.toString(),
      fatG: input.fatG.toString(),
      portion: input.portion.toString(),
      mealType: input.mealType,
      consumedAt: input.consumedAt ? new Date(input.consumedAt) : new Date(),
      sourceType: 'MANUAL',
    })
    .returning();

  if (!row) {
    throw new NutritionError(500, 'INTERNAL_ERROR', 'Failed to create food log');
  }

  return toCreated(row);
};

const fetchLogsForDate = async (
  userId: string,
  date: string,
): Promise<FoodLog[]> =>
  db
    .select()
    .from(foodLogs)
    .where(
      and(
        eq(foodLogs.userId, userId),
        sql`${foodLogs.consumedAt}::date = ${date}::date`,
      ),
    )
    .orderBy(foodLogs.consumedAt);

export const listFoodLogsByDate = async (
  userId: string,
  date: string,
): Promise<FoodLogsByDay> => {
  const rows = await fetchLogsForDate(userId, date);

  const meals: FoodLogsByDay['meals'] = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
  const totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

  for (const row of rows) {
    const item = toItem(row);
    totals.calories += item.calories;
    totals.proteinG += item.macros.proteinG;
    totals.carbsG += item.macros.carbsG;
    totals.fatG += item.macros.fatG;

    switch (item.mealType) {
      case 'BREAKFAST':
        meals.breakfast.push(item);
        break;
      case 'LUNCH':
        meals.lunch.push(item);
        break;
      case 'DINNER':
        meals.dinner.push(item);
        break;
      case 'SNACK':
        meals.snack.push(item);
        break;
    }
  }

  return {
    date,
    meals,
    totals: {
      calories: totals.calories,
      proteinG: round2(totals.proteinG),
      carbsG: round2(totals.carbsG),
      fatG: round2(totals.fatG),
    },
  };
};

export const updateFoodLog = async (
  userId: string,
  id: string,
  input: UpdateFoodLogInput,
): Promise<CreatedFoodLog> => {
  const patch: Partial<typeof foodLogs.$inferInsert> = {};
  if (input.foodName !== undefined) patch.foodName = input.foodName;
  if (input.calories !== undefined) patch.calories = input.calories;
  if (input.proteinG !== undefined) patch.proteinG = input.proteinG.toString();
  if (input.carbsG !== undefined) patch.carbsG = input.carbsG.toString();
  if (input.fatG !== undefined) patch.fatG = input.fatG.toString();
  if (input.portion !== undefined) patch.portion = input.portion.toString();
  if (input.mealType !== undefined) patch.mealType = input.mealType;
  if (input.consumedAt !== undefined) {
    patch.consumedAt = new Date(input.consumedAt);
  }

  const [row] = await db
    .update(foodLogs)
    .set(patch)
    .where(and(eq(foodLogs.id, id), eq(foodLogs.userId, userId)))
    .returning();

  if (!row) {
    throw new NutritionError(404, 'FOOD_LOG_NOT_FOUND', 'Food log not found');
  }

  return toCreated(row);
};

export const deleteFoodLog = async (
  userId: string,
  id: string,
): Promise<void> => {
  const result = await db
    .delete(foodLogs)
    .where(and(eq(foodLogs.id, id), eq(foodLogs.userId, userId)))
    .returning({ id: foodLogs.id });

  if (result.length === 0) {
    throw new NutritionError(404, 'FOOD_LOG_NOT_FOUND', 'Food log not found');
  }
};

export const getDailySummary = async (
  userId: string,
  date: string,
): Promise<DailySummary> => {
  const [rows, metricsRow] = await Promise.all([
    fetchLogsForDate(userId, date),
    db
      .select({
        calories: userMetrics.dailyCalorieTarget,
        proteinG: userMetrics.proteinG,
        carbsG: userMetrics.carbsG,
        fatG: userMetrics.fatG,
      })
      .from(userMetrics)
      .where(eq(userMetrics.userId, userId))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const consumed = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };
  const meals = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };

  for (const row of rows) {
    const cal = row.calories;
    consumed.calories += cal;
    consumed.proteinG += Number(row.proteinG);
    consumed.carbsG += Number(row.carbsG);
    consumed.fatG += Number(row.fatG);

    switch (row.mealType) {
      case 'BREAKFAST':
        meals.breakfast += cal;
        break;
      case 'LUNCH':
        meals.lunch += cal;
        break;
      case 'DINNER':
        meals.dinner += cal;
        break;
      case 'SNACK':
        meals.snack += cal;
        break;
    }
  }

  const consumedRounded = {
    calories: consumed.calories,
    proteinG: round2(consumed.proteinG),
    carbsG: round2(consumed.carbsG),
    fatG: round2(consumed.fatG),
  };

  let target: DailySummary['target'] = null;
  let remaining: DailySummary['remaining'] = null;
  let progressPercent: number | null = null;

  if (metricsRow) {
    target = {
      calories: metricsRow.calories,
      proteinG: metricsRow.proteinG,
      carbsG: metricsRow.carbsG,
      fatG: metricsRow.fatG,
    };
    remaining = {
      calories: target.calories - consumedRounded.calories,
      proteinG: round2(target.proteinG - consumedRounded.proteinG),
      carbsG: round2(target.carbsG - consumedRounded.carbsG),
      fatG: round2(target.fatG - consumedRounded.fatG),
    };
    progressPercent =
      target.calories > 0
        ? round1((consumedRounded.calories / target.calories) * 100)
        : null;
  }

  return {
    date,
    target,
    consumed: consumedRounded,
    remaining,
    progressPercent,
    meals,
  };
};
