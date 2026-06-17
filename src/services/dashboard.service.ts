import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../config/db';
import { users } from '../models/user.model';
import { userMetrics } from '../models/user-metrics.model';
import { foodLogs } from '../models/food-log.model';
import { ApiError } from '../lib/api-error';

export class DashboardError extends ApiError {}

// Hardcoded for v1 — not a per-user setting yet.
const VN_TZ = 'Asia/Ho_Chi_Minh';
const VN_OFFSET = '+07:00';

type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
type Goal = 'LOSE_WEIGHT' | 'MAINTAIN' | 'GAIN_WEIGHT' | 'GAIN_MUSCLE';
type Tier = 'FREE' | 'PRO';

interface MacroSet {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface UserDashboardResponse {
  date: string;
  timezone: string;
  todayCalories: {
    consumed: number;
    target: number | null;
    remaining: number | null;
    progressPercent: number | null;
  };
  todayMacros: {
    consumed: MacroSet;
    target: MacroSet | null;
  };
  mealsBreakdown: Record<MealType, number>;
  streakDays: number;
  lastLoggedAt: string | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  weightTrend7dKg: null;
  goal: Goal | null;
  tier: Tier;
  onboardingCompleted: boolean;
  upcomingMeals: unknown[];
  todayExercises: unknown[];
  weeklyWorkouts: null;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

// "Today" in Asia/Ho_Chi_Minh: the date string plus the UTC instants of the
// VN-midnight day boundaries (used for the food_logs range query).
const getTodayInVn = (): {
  dateStr: string;
  startUtc: Date;
  endUtc: Date;
} => {
  const now = new Date();
  // formatToParts('en-US') with explicit numeric fields is locale-pattern-
  // independent and small-icu-safe — no non-ISO Date(string) parse. See quest.service.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: VN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const startUtc = new Date(`${dateStr}T00:00:00${VN_OFFSET}`);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { dateStr, startUtc, endUtc };
};

// Consecutive VN calendar days with >=1 food log, counting back from today.
// Forgiving: if today has no log yet, start counting from yesterday.
const calculateStreak = (
  logDatesDesc: string[],
  todayInVn: string,
): number => {
  const dateSet = new Set(logDatesDesc);
  const cursor = new Date(`${todayInVn}T00:00:00Z`);
  const cursorStr = (d: Date): string => d.toISOString().slice(0, 10);

  if (!dateSet.has(cursorStr(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  let streak = 0;
  while (dateSet.has(cursorStr(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
};

export const getUserDashboard = async (
  userId: string,
): Promise<UserDashboardResponse> => {
  const { dateStr, startUtc, endUtc } = getTodayInVn();

  const [userRows, mealRows, lastRows, streakResult] = await Promise.all([
    // Core user fields + onboarding metrics (LEFT JOIN — metrics may be absent).
    db
      .select({
        tier: users.tier,
        onboardingCompleted: users.onboardingCompleted,
        dailyCalorieTarget: userMetrics.dailyCalorieTarget,
        targetProteinG: userMetrics.proteinG,
        targetCarbsG: userMetrics.carbsG,
        targetFatG: userMetrics.fatG,
        weightKg: userMetrics.weightKg,
        targetWeightKg: userMetrics.targetWeightKg,
        goal: userMetrics.goal,
      })
      .from(users)
      .leftJoin(userMetrics, eq(userMetrics.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1),
    // Today's food logs aggregated by meal type. SUM skips null macros
    // naturally (PARTIAL-catalog snapshots) — intended, not zero-filled.
    db
      .select({
        mealType: foodLogs.mealType,
        calories: sql<number>`COALESCE(SUM(${foodLogs.calories}), 0)::int`,
        proteinG: sql<string>`COALESCE(SUM(${foodLogs.proteinG}), 0)`,
        fatG: sql<string>`COALESCE(SUM(${foodLogs.fatG}), 0)`,
        carbsG: sql<string>`COALESCE(SUM(${foodLogs.carbsG}), 0)`,
      })
      .from(foodLogs)
      .where(
        and(
          eq(foodLogs.userId, userId),
          gte(foodLogs.consumedAt, startUtc),
          lt(foodLogs.consumedAt, endUtc),
        ),
      )
      .groupBy(foodLogs.mealType),
    // Most recent log overall (for lastLoggedAt).
    db
      .select({ consumedAt: foodLogs.consumedAt })
      .from(foodLogs)
      .where(eq(foodLogs.userId, userId))
      .orderBy(desc(foodLogs.consumedAt))
      .limit(1),
    // Distinct VN log-dates over the last 90 days, newest first.
    // consumed_at is `timestamp without time zone` storing UTC wall-clock,
    // so it must be cast to UTC first, then converted to VN.
    db.execute(sql`
      SELECT DISTINCT
        ((${foodLogs.consumedAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS log_date
      FROM ${foodLogs}
      WHERE ${foodLogs.userId} = ${userId}
        AND ${foodLogs.consumedAt} >= ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - interval '90 days')
      ORDER BY log_date DESC
      LIMIT 90
    `),
  ]);

  const user = userRows[0];
  if (!user) {
    throw new DashboardError(404, 'USER_NOT_FOUND', 'User not found');
  }

  const mealsBreakdown: Record<MealType, number> = {
    BREAKFAST: 0,
    LUNCH: 0,
    DINNER: 0,
    SNACK: 0,
  };
  let consumedCalories = 0;
  let consumedProtein = 0;
  let consumedCarbs = 0;
  let consumedFat = 0;

  for (const row of mealRows) {
    const cals = Number(row.calories);
    mealsBreakdown[row.mealType] = cals;
    consumedCalories += cals;
    consumedProtein += Number(row.proteinG);
    consumedCarbs += Number(row.carbsG);
    consumedFat += Number(row.fatG);
  }

  const calorieTarget = user.dailyCalorieTarget;
  const remaining =
    calorieTarget !== null ? calorieTarget - consumedCalories : null;
  const progressPercent =
    calorieTarget !== null && calorieTarget > 0
      ? round1((consumedCalories / calorieTarget) * 100)
      : null;

  const macroTarget: MacroSet | null =
    user.targetProteinG !== null &&
    user.targetCarbsG !== null &&
    user.targetFatG !== null
      ? {
          proteinG: user.targetProteinG,
          carbsG: user.targetCarbsG,
          fatG: user.targetFatG,
        }
      : null;

  const streakRows = streakResult.rows as Array<{ log_date: string }>;
  const streakDays = calculateStreak(
    streakRows.map((r) => r.log_date),
    dateStr,
  );

  const lastLogged = lastRows[0]?.consumedAt ?? null;

  return {
    date: dateStr,
    timezone: VN_TZ,
    todayCalories: {
      consumed: consumedCalories,
      target: calorieTarget,
      remaining,
      progressPercent,
    },
    todayMacros: {
      consumed: {
        proteinG: round2(consumedProtein),
        carbsG: round2(consumedCarbs),
        fatG: round2(consumedFat),
      },
      target: macroTarget,
    },
    mealsBreakdown,
    streakDays,
    lastLoggedAt: lastLogged ? lastLogged.toISOString() : null,
    currentWeightKg:
      user.weightKg !== null ? round2(Number(user.weightKg)) : null,
    targetWeightKg:
      user.targetWeightKg !== null
        ? round2(Number(user.targetWeightKg))
        : null,
    weightTrend7dKg: null,
    goal: user.goal,
    tier: user.tier,
    onboardingCompleted: user.onboardingCompleted,
    upcomingMeals: [],
    todayExercises: [],
    weeklyWorkouts: null,
  };
};
