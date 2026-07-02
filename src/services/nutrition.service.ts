import { and, eq, sql } from 'drizzle-orm';
import { db } from '../config/db';
import { env } from '../config/env';
import { foodLogs, type FoodLog } from '../models/food-log.model';
import { foodItems } from '../models/food-item.model';
import { userMetrics } from '../models/user-metrics.model';
import { users } from '../models/user.model';
import { mealPlans } from '../models/meal-plan.model';
import { ApiError } from '../lib/api-error';
import type {
  CreateFoodLogInput,
  CreateFoodLogModeAInput,
  CreateFoodLogModeBInput,
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
  foodItemId: string | null;
  foodName: string;
  calories: number;
  macros: Macros;
  portion: number;
  mealType: MealType;
  consumedAt: Date;
}

export interface CreatedFoodLog {
  foodLogId: string;
  foodItemId: string | null;
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
const round2Str = (n: number): string => n.toFixed(2);

// Treat null DB values as 0 at the API boundary to keep the response shape
// stable (macros are always numbers in /food-logs responses, even if Mode A
// snapshotted from a PARTIAL catalog item).
const numOrZero = (v: string | null): number =>
  v === null ? 0 : Number(v);

const toItem = (row: FoodLog): FoodLogItem => ({
  id: row.id,
  foodItemId: row.foodItemId,
  foodName: row.foodName,
  calories: row.calories,
  macros: {
    proteinG: numOrZero(row.proteinG),
    carbsG: numOrZero(row.carbsG),
    fatG: numOrZero(row.fatG),
  },
  portion: Number(row.portion),
  mealType: row.mealType,
  consumedAt: row.consumedAt,
});

const toCreated = (row: FoodLog): CreatedFoodLog => ({
  foodLogId: row.id,
  foodItemId: row.foodItemId,
  foodName: row.foodName,
  calories: row.calories,
  macros: {
    proteinG: numOrZero(row.proteinG),
    carbsG: numOrZero(row.carbsG),
    fatG: numOrZero(row.fatG),
  },
  portion: Number(row.portion),
  mealType: row.mealType,
  consumedAt: row.consumedAt,
});

const isModeA = (
  input: CreateFoodLogInput,
): input is CreateFoodLogModeAInput =>
  (input as CreateFoodLogModeAInput).foodItemId !== undefined;

const createFromCatalog = async (
  userId: string,
  input: CreateFoodLogModeAInput,
): Promise<CreatedFoodLog> => {
  const [food] = await db
    .select()
    .from(foodItems)
    .where(eq(foodItems.id, input.foodItemId))
    .limit(1);

  if (!food) {
    throw new NutritionError(
      404,
      'FOOD_ITEM_NOT_FOUND',
      'Food item not found',
    );
  }

  const grams = input.portionGrams;
  const factor = grams / 100;

  const cal100 = Number(food.caloriesKcal);
  const pro100 = food.proteinG !== null ? Number(food.proteinG) : null;
  const fat100 = food.totalFatG !== null ? Number(food.totalFatG) : null;
  const car100 = food.carbohydrateG !== null ? Number(food.carbohydrateG) : null;

  const [row] = await db
    .insert(foodLogs)
    .values({
      userId,
      foodItemId: input.foodItemId,
      foodName: food.nameVi,
      calories: Math.round(cal100 * factor),
      proteinG: pro100 !== null ? round2Str(pro100 * factor) : null,
      fatG: fat100 !== null ? round2Str(fat100 * factor) : null,
      carbsG: car100 !== null ? round2Str(car100 * factor) : null,
      portion: round2Str(factor),
      mealType: input.mealType,
      consumedAt: new Date(input.consumedAt),
      sourceType: 'MANUAL',
    })
    .returning();

  if (!row) {
    throw new NutritionError(
      500,
      'INTERNAL_ERROR',
      'Failed to create food log',
    );
  }

  return toCreated(row);
};

const createCustom = async (
  userId: string,
  input: CreateFoodLogModeBInput,
): Promise<CreatedFoodLog> => {
  const [row] = await db
    .insert(foodLogs)
    .values({
      userId,
      foodItemId: null,
      foodName: input.customName,
      calories: input.calories,
      proteinG: round2Str(input.macros.proteinG),
      carbsG: round2Str(input.macros.carbsG),
      fatG: round2Str(input.macros.fatG),
      portion: round2Str(input.portion),
      mealType: input.mealType,
      consumedAt: new Date(input.consumedAt),
      sourceType: 'MANUAL',
    })
    .returning();

  if (!row) {
    throw new NutritionError(
      500,
      'INTERNAL_ERROR',
      'Failed to create food log',
    );
  }

  return toCreated(row);
};

export const createFoodLog = async (
  userId: string,
  input: CreateFoodLogInput,
): Promise<CreatedFoodLog> => {
  if (isModeA(input)) {
    return createFromCatalog(userId, input);
  }
  return createCustom(userId, input);
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
    consumed.proteinG += numOrZero(row.proteinG);
    consumed.carbsG += numOrZero(row.carbsG);
    consumed.fatG += numOrZero(row.fatG);

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

// ── AI meal-plan generation (synchronous; persisted) ──────────
// Loads the caller's metrics, maps them to the AI service's /plan contract
// ({ question, userInfo }), retries transient failures, injects a default
// exercise plan when the AI omits one, then upserts the result into meal_plans
// (one row per user). The generated plan is returned as-is to the client.

// The exact contract the deployed AI /plan endpoint expects. Kept fully typed
// (no `any`) so a contract drift surfaces at compile time.
interface GenerateMealPlanPayload {
  question: string;
  userInfo: {
    id: string;
    fullName?: string | null;
    subscription: {
      plan: 'FREE' | 'PRO';
    };
    metrics: {
      gender: string;
      dateOfBirth: string | null;
      heightCm: number;
      weightKg: number;
      activityLevel: string;
      goal: string;
      targetWeightKg?: number;
      dailyCalorieTarget: number;
      dietaryRestrictions: string[] | null;
      allergies: string[] | null;
      macros: {
        proteinG: number;
        carbsG: number;
        fatG: number;
      };
    };
  };
}

// Injected when the AI plan omits an exercise_plan (or returns an empty one) so
// the mobile app always has a workout to render. Extracted to a constant (not
// inlined) to keep generateMealPlan readable.
const DEFAULT_EXERCISE_PLAN = [
  {
    day: 1,
    session_name: 'Toàn thân cơ bản',
    focus: 'Sức khỏe chung',
    duration_minutes: 30,
    notes: 'Dành cho người mới bắt đầu',
    exercises: [
      {
        exercise_name: 'Squat',
        display_name: 'Squat cơ bản',
        sets: 3,
        reps: '10-12',
        rest_seconds: 60,
      },
      {
        exercise_name: 'Push Up',
        display_name: 'Hít đất',
        sets: 3,
        reps: '8-10',
        rest_seconds: 60,
      },
    ],
  },
];

const AI_PLAN_MAX_RETRIES = 3;
// Status codes worth retrying — rate limit + transient upstream/gateway errors.
const AI_RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

// The AI service may wrap the plan as `{ plan: ... }` or return it directly.
const unwrapPlan = (resp: unknown): unknown => {
  if (resp && typeof resp === 'object' && 'plan' in resp) {
    const inner = (resp as { plan?: unknown }).plan;
    return inner ?? resp;
  }
  return resp;
};

export const generateMealPlan = async (userId: string): Promise<unknown> => {
  const [m] = await db
    .select()
    .from(userMetrics)
    .where(eq(userMetrics.userId, userId))
    .limit(1);
  if (!m) {
    throw new NutritionError(
      404,
      'USER_METRICS_NOT_FOUND',
      'Complete onboarding before generating a meal plan',
    );
  }

  const [u] = await db
    .select({ fullName: users.fullName, tier: users.tier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // numeric(5,2) columns come back as strings → coerce to numbers (quirk #19).
  const payload: GenerateMealPlanPayload = {
    question: 'Tạo kế hoạch dinh dưỡng',
    userInfo: {
      id: userId,
      fullName: u?.fullName,
      subscription: {
        plan: u?.tier === 'PRO' ? 'PRO' : 'FREE',
      },
      metrics: {
        gender: m.gender,
        dateOfBirth: m.dateOfBirth,
        heightCm: m.heightCm,
        weightKg: Number(m.weightKg),
        activityLevel: m.activityLevel,
        goal: m.goal,
        targetWeightKg:
          m.targetWeightKg === null ? undefined : Number(m.targetWeightKg),
        dailyCalorieTarget: m.dailyCalorieTarget,
        dietaryRestrictions: m.dietaryRestrictions,
        allergies: m.allergies,
        macros: {
          proteinG: m.proteinG,
          carbsG: m.carbsG,
          fatG: m.fatG,
        },
      },
    },
  };

  // ── Call the AI service with bounded retries (kept separate from the DB
  //    write below so a persistence failure never masquerades as an AI error).
  let aiData: unknown = null;

  for (let attempt = 1; attempt <= AI_PLAN_MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(`${env.AI_SERVICE_URL}/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-AI-Secret': env.AI_SERVICE_SECRET,
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const body = await resp.text();
        console.error(
          `AI_SERVICE_ERROR (/plan attempt ${attempt}):`,
          resp.status,
          body.slice(0, 500),
        );
        if (AI_RETRYABLE_STATUS.has(resp.status) && attempt < AI_PLAN_MAX_RETRIES) {
          const delayMs = attempt * 2000; // 2s, 4s
          console.warn(`[AI /plan] Retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw new NutritionError(
          503,
          'AI_SERVICE_UNAVAILABLE',
          `AI service responded ${resp.status}: ${body.slice(0, 500)}`,
        );
      }

      const plan = unwrapPlan((await resp.json()) as unknown);
      if (!plan) {
        throw new Error('AI response is missing plan data');
      }

      // Guarantee an exercise_plan for the mobile app.
      if (plan && typeof plan === 'object' && !Array.isArray(plan)) {
        const planObj = plan as Record<string, unknown>;
        const ex = planObj.exercise_plan;
        if (!ex || (Array.isArray(ex) && ex.length === 0)) {
          planObj.exercise_plan = DEFAULT_EXERCISE_PLAN;
        }
      }

      aiData = plan;
      break; // success
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (attempt < AI_PLAN_MAX_RETRIES) {
        const delayMs = attempt * 2000;
        console.warn(
          `[AI /plan] Network/parse error on attempt ${attempt}. Retrying in ${delayMs}ms...`,
          (err as Error).message,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw new NutritionError(
        503,
        'AI_SERVICE_UNAVAILABLE',
        'AI service unreachable or returned invalid format',
      );
    }
  }

  if (aiData === null) {
    // Unreachable in practice (the loop breaks with data or throws), but keeps
    // the type narrowed and guards against a silent empty upsert.
    throw new NutritionError(
      503,
      'AI_SERVICE_UNAVAILABLE',
      'AI service unreachable or returned invalid format',
    );
  }

  // ── Persist (upsert one row per user). A DB failure here is our fault, not
  //    the AI's → INTERNAL_ERROR, never AI_SERVICE_UNAVAILABLE.
  try {
    await db
      .insert(mealPlans)
      .values({ userId, data: aiData })
      .onConflictDoUpdate({
        target: mealPlans.userId,
        set: { data: aiData, updatedAt: new Date() },
      });
  } catch (dbErr) {
    console.error('DB_ERROR saving meal plan:', dbErr);
    throw new NutritionError(
      500,
      'INTERNAL_ERROR',
      'Failed to save meal plan to database',
    );
  }

  return aiData;
};

// Returns the caller's latest persisted meal plan (the raw AI plan `data`).
export const getLatestMealPlan = async (userId: string): Promise<unknown> => {
  const [plan] = await db
    .select({ data: mealPlans.data })
    .from(mealPlans)
    .where(eq(mealPlans.userId, userId))
    .limit(1);

  if (!plan) {
    throw new NutritionError(404, 'MEAL_PLAN_NOT_FOUND', 'No meal plan found');
  }

  return plan.data;
};
