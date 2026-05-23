import {
  and,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db } from '../config/db';
import { ApiError } from '../lib/api-error';
import { users } from '../models/user.model';
import { userMetrics } from '../models/user-metrics.model';
import { foodLogs } from '../models/food-log.model';
import {
  exercises,
  workoutSessions,
} from '../models/workout.model';
import { courses, enrollments } from '../models/course.model';
import {
  ptAssignments,
  type PtAssignment,
} from '../models/pt-assignment.model';
import type {
  ListMyAssignmentsQuery,
  ListStudentsQuery,
  PostExerciseBody,
  PutMealPlanBody,
} from '../validations/pt-assignment.validation';

export class PtStudentsError extends ApiError {}

type EnrollmentStatusDb = 'active' | 'completed' | 'refunded';
type ApiEnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'REFUNDED';
type AssignmentTypeDb = 'meal_plan' | 'exercise_addition';
type ApiAssignmentType = 'MEAL_PLAN' | 'EXERCISE_ADDITION';

const toApiEnrollmentStatus = (s: EnrollmentStatusDb): ApiEnrollmentStatus =>
  s.toUpperCase() as ApiEnrollmentStatus;
const toApiAssignmentType = (s: AssignmentTypeDb): ApiAssignmentType =>
  s.toUpperCase() as ApiAssignmentType;

const DAY_MS = 86_400_000;
const YEAR_MS = 365.25 * DAY_MS;

// ── Response shapes ───────────────────────────────────────────
export interface StudentListItem {
  studentId: string;
  fullName: string;
  avatarUrl: string | null;
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  status: ApiEnrollmentStatus;
  enrolledAt: string;
  daysCompletedPercent: number;
  lastActiveAt: string | null;
}

export interface StudentDetail {
  student: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
    age: number | null;
    gender: string | null;
    heightCm: number | null;
    weightKg: number | null;
    targetWeightKg: number | null;
    goal: string | null;
    activityLevel: string | null;
  };
  metrics: {
    bmr: number | null;
    tdee: number | null;
    dailyCalorieTarget: number | null;
    macros: {
      proteinG: number | null;
      carbsG: number | null;
      fatG: number | null;
    };
  };
  enrollment: {
    id: string;
    courseId: string;
    courseTitle: string;
    enrolledAt: string;
    daysSinceEnrollment: number;
    daysCompletedPercent: number;
    courseDurationDays: number;
    status: ApiEnrollmentStatus;
  };
  last7Days: {
    nutrition: {
      loggedDaysCount: number;
      avgDailyCalories: number;
      avgDailyMacros: { proteinG: number; carbsG: number; fatG: number };
      adherencePercent: number;
    };
    workout: {
      sessionsCount: number;
      totalDurationSec: number;
      totalCaloriesBurned: number;
    };
  };
  recentFoodLogs: Array<{
    id: string;
    consumedAt: string;
    mealType: string;
    foodName: string;
    calories: number;
  }>;
  recentWorkoutSessions: Array<{
    id: string;
    name: string;
    performedAt: string;
    durationSec: number;
    caloriesBurned: number;
  }>;
  currentMealPlan: AssignmentView | null;
  recentExerciseAssignments: AssignmentView[];
  lastActiveAt: string | null;
}

export interface AssignmentView {
  id: string;
  type: ApiAssignmentType;
  studentId: string;
  enrollmentId: string;
  payload: unknown;
  scheduledFor: string | null;
  note: string | null;
  createdAt: string;
}

export interface MealPlanResponse extends AssignmentView {
  supersededPreviousAssignmentId: string | null;
}

export interface AssignmentFeedItem {
  id: string;
  type: ApiAssignmentType;
  payload: unknown;
  scheduledFor: string | null;
  note: string | null;
  createdAt: string;
  from: {
    ptId: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

export interface Page<T> {
  items: T[];
  totalItems: number;
}

// ── Helpers ───────────────────────────────────────────────────
const toAssignmentView = (a: PtAssignment): AssignmentView => ({
  id: a.id,
  type: toApiAssignmentType(a.type),
  studentId: a.studentId,
  enrollmentId: a.enrollmentId,
  payload: a.payload,
  scheduledFor: a.scheduledFor ?? null,
  note: a.note,
  createdAt: a.createdAt.toISOString(),
});

const daysCompletedPercent = (
  enrolledAt: Date,
  durationDays: number,
  now: Date = new Date(),
): number => {
  if (durationDays <= 0) return 0;
  const days = Math.floor((now.getTime() - enrolledAt.getTime()) / DAY_MS);
  const pct = Math.round((days / durationDays) * 100);
  return Math.min(100, Math.max(0, pct));
};

const numOrNull = (v: string | null): number | null =>
  v === null ? null : Number(v);

// ── 1. listStudents ───────────────────────────────────────────
export const listStudents = async (
  ptId: string,
  query: ListStudentsQuery,
): Promise<Page<StudentListItem>> => {
  const filters: SQL[] = [eq(enrollments.ptId, ptId)];
  if (query.status) {
    filters.push(
      eq(enrollments.status, query.status.toLowerCase() as EnrollmentStatusDb),
    );
  } else {
    // Default: hide refunded students (they've been off-boarded).
    filters.push(ne(enrollments.status, 'refunded'));
  }
  if (query.search) {
    filters.push(ilike(users.fullName, `%${query.search}%`));
  }
  const where = filters.length === 1 ? filters[0] : and(...filters);
  const offset = (query.page - 1) * query.limit;

  const lastFoodAt = sql<Date | null>`(
    SELECT MAX(${foodLogs.consumedAt}) FROM ${foodLogs}
    WHERE ${foodLogs.userId} = ${enrollments.userId}
  )`;
  const lastWorkoutAt = sql<Date | null>`(
    SELECT MAX(${workoutSessions.performedAt}) FROM ${workoutSessions}
    WHERE ${workoutSessions.userId} = ${enrollments.userId}
  )`;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        enrollmentId: enrollments.id,
        userId: enrollments.userId,
        courseId: enrollments.courseId,
        status: enrollments.status,
        enrolledAt: enrollments.enrolledAt,
        fullName: users.fullName,
        avatarUrl: users.avatarUrl,
        courseTitle: courses.title,
        durationDays: courses.durationDays,
        lastFoodAt,
        lastWorkoutAt,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.userId))
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(where)
      .orderBy(desc(enrollments.enrolledAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.userId))
      .where(where),
  ]);

  const items: StudentListItem[] = rows.map((r) => {
    const food = r.lastFoodAt ? new Date(r.lastFoodAt) : null;
    const workout = r.lastWorkoutAt ? new Date(r.lastWorkoutAt) : null;
    const lastActive =
      food && workout
        ? food > workout
          ? food
          : workout
        : (food ?? workout);
    return {
      studentId: r.userId,
      fullName: r.fullName,
      avatarUrl: r.avatarUrl,
      enrollmentId: r.enrollmentId,
      courseId: r.courseId,
      courseTitle: r.courseTitle,
      status: toApiEnrollmentStatus(r.status),
      enrolledAt: r.enrolledAt.toISOString(),
      daysCompletedPercent: daysCompletedPercent(
        r.enrolledAt,
        r.durationDays,
      ),
      lastActiveAt: lastActive ? lastActive.toISOString() : null,
    };
  });

  return { items, totalItems: countRows[0]?.n ?? 0 };
};

// ── 2. getStudentDetail ───────────────────────────────────────
export interface StudentDetailContext {
  id: string;
  userId: string;
  courseId: string;
  enrolledAt: Date;
}

export const getStudentDetail = async (
  studentId: string,
  enrollment: StudentDetailContext,
): Promise<StudentDetail> => {
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS);

  const studentRowPromise = db
    .select({
      id: users.id,
      fullName: users.fullName,
      avatarUrl: users.avatarUrl,
      gender: userMetrics.gender,
      dateOfBirth: userMetrics.dateOfBirth,
      heightCm: userMetrics.heightCm,
      weightKg: userMetrics.weightKg,
      targetWeightKg: userMetrics.targetWeightKg,
      goal: userMetrics.goal,
      activityLevel: userMetrics.activityLevel,
      bmr: userMetrics.bmr,
      tdee: userMetrics.tdee,
      dailyCalorieTarget: userMetrics.dailyCalorieTarget,
      proteinG: userMetrics.proteinG,
      carbsG: userMetrics.carbsG,
      fatG: userMetrics.fatG,
    })
    .from(users)
    .leftJoin(userMetrics, eq(userMetrics.userId, users.id))
    .where(eq(users.id, studentId))
    .limit(1);

  const coursePromise = db
    .select({
      title: courses.title,
      durationDays: courses.durationDays,
    })
    .from(courses)
    .where(eq(courses.id, enrollment.courseId))
    .limit(1);

  const nutritionAggPromise = db
    .select({
      totalCalories: sql<number>`COALESCE(SUM(${foodLogs.calories}), 0)::int`,
      totalProtein: sql<number>`COALESCE(SUM(${foodLogs.proteinG}), 0)::float8`,
      totalCarbs: sql<number>`COALESCE(SUM(${foodLogs.carbsG}), 0)::float8`,
      totalFat: sql<number>`COALESCE(SUM(${foodLogs.fatG}), 0)::float8`,
      loggedDays: sql<number>`COUNT(DISTINCT date_trunc('day', ${foodLogs.consumedAt}))::int`,
    })
    .from(foodLogs)
    .where(
      and(
        eq(foodLogs.userId, studentId),
        gte(foodLogs.consumedAt, sevenDaysAgo),
      ),
    );

  const workoutAggPromise = db
    .select({
      sessionsCount: sql<number>`COUNT(*)::int`,
      totalDurationSec: sql<number>`COALESCE(SUM(${workoutSessions.durationSec}), 0)::int`,
      totalCaloriesBurned: sql<number>`COALESCE(SUM(${workoutSessions.caloriesBurned}), 0)::int`,
    })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, studentId),
        gte(workoutSessions.performedAt, sevenDaysAgo),
      ),
    );

  const recentFoodLogsPromise = db
    .select({
      id: foodLogs.id,
      consumedAt: foodLogs.consumedAt,
      mealType: foodLogs.mealType,
      foodName: foodLogs.foodName,
      calories: foodLogs.calories,
    })
    .from(foodLogs)
    .where(eq(foodLogs.userId, studentId))
    .orderBy(desc(foodLogs.consumedAt))
    .limit(5);

  const recentWorkoutsPromise = db
    .select({
      id: workoutSessions.id,
      name: workoutSessions.name,
      performedAt: workoutSessions.performedAt,
      durationSec: workoutSessions.durationSec,
      caloriesBurned: workoutSessions.caloriesBurned,
    })
    .from(workoutSessions)
    .where(eq(workoutSessions.userId, studentId))
    .orderBy(desc(workoutSessions.performedAt))
    .limit(5);

  const currentMealPlanPromise = db
    .select()
    .from(ptAssignments)
    .where(
      and(
        eq(ptAssignments.enrollmentId, enrollment.id),
        eq(ptAssignments.type, 'meal_plan'),
        isNull(ptAssignments.supersededBy),
      ),
    )
    .limit(1);

  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);
  const recentExerciseAssignmentsPromise = db
    .select()
    .from(ptAssignments)
    .where(
      and(
        eq(ptAssignments.enrollmentId, enrollment.id),
        eq(ptAssignments.type, 'exercise_addition'),
        gte(ptAssignments.createdAt, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(ptAssignments.createdAt))
    .limit(10);

  const [
    studentRows,
    courseRows,
    nutritionAggRows,
    workoutAggRows,
    recentFoodLogRows,
    recentWorkoutRows,
    currentMealPlanRows,
    recentExerciseAssignmentRows,
  ] = await Promise.all([
    studentRowPromise,
    coursePromise,
    nutritionAggPromise,
    workoutAggPromise,
    recentFoodLogsPromise,
    recentWorkoutsPromise,
    currentMealPlanPromise,
    recentExerciseAssignmentsPromise,
  ]);

  const s = studentRows[0];
  if (!s) {
    // Middleware guaranteed enrollment exists, so the student should too.
    // If this fires, the user was deleted between middleware and handler.
    throw new PtStudentsError(
      404,
      'STUDENT_NOT_FOUND',
      'Student not found',
    );
  }

  const course = courseRows[0];
  const nutritionAgg = nutritionAggRows[0]!;
  const workoutAgg = workoutAggRows[0]!;

  let age: number | null = null;
  if (s.dateOfBirth) {
    const dob = new Date(s.dateOfBirth);
    age = Math.floor((Date.now() - dob.getTime()) / YEAR_MS);
  }

  const loggedDays = nutritionAgg.loggedDays ?? 0;
  const avgDailyCalories = loggedDays
    ? Math.round(nutritionAgg.totalCalories / loggedDays)
    : 0;
  const avgDailyMacros = {
    proteinG: loggedDays
      ? Math.round(nutritionAgg.totalProtein / loggedDays)
      : 0,
    carbsG: loggedDays ? Math.round(nutritionAgg.totalCarbs / loggedDays) : 0,
    fatG: loggedDays ? Math.round(nutritionAgg.totalFat / loggedDays) : 0,
  };

  const daysSince = Math.floor(
    (Date.now() - enrollment.enrolledAt.getTime()) / DAY_MS,
  );

  const lastFood = recentFoodLogRows[0]?.consumedAt ?? null;
  const lastWorkout = recentWorkoutRows[0]?.performedAt ?? null;
  const lastActive =
    lastFood && lastWorkout
      ? lastFood > lastWorkout
        ? lastFood
        : lastWorkout
      : (lastFood ?? lastWorkout);

  return {
    student: {
      id: s.id,
      fullName: s.fullName,
      avatarUrl: s.avatarUrl,
      age,
      gender: s.gender ?? null,
      heightCm: s.heightCm ?? null,
      weightKg: numOrNull(s.weightKg ?? null),
      targetWeightKg: numOrNull(s.targetWeightKg ?? null),
      goal: s.goal ?? null,
      activityLevel: s.activityLevel ?? null,
    },
    metrics: {
      bmr: s.bmr ?? null,
      tdee: s.tdee ?? null,
      dailyCalorieTarget: s.dailyCalorieTarget ?? null,
      macros: {
        proteinG: s.proteinG ?? null,
        carbsG: s.carbsG ?? null,
        fatG: s.fatG ?? null,
      },
    },
    enrollment: {
      id: enrollment.id,
      courseId: enrollment.courseId,
      courseTitle: course?.title ?? '',
      enrolledAt: enrollment.enrolledAt.toISOString(),
      daysSinceEnrollment: Math.max(0, daysSince),
      daysCompletedPercent: daysCompletedPercent(
        enrollment.enrolledAt,
        course?.durationDays ?? 0,
      ),
      courseDurationDays: course?.durationDays ?? 0,
      status: 'ACTIVE',
    },
    last7Days: {
      nutrition: {
        loggedDaysCount: loggedDays,
        avgDailyCalories,
        avgDailyMacros,
        adherencePercent: Math.round((loggedDays / 7) * 100),
      },
      workout: {
        sessionsCount: workoutAgg.sessionsCount,
        totalDurationSec: workoutAgg.totalDurationSec,
        totalCaloriesBurned: workoutAgg.totalCaloriesBurned,
      },
    },
    recentFoodLogs: recentFoodLogRows.map((r) => ({
      id: r.id,
      consumedAt: r.consumedAt.toISOString(),
      mealType: r.mealType,
      foodName: r.foodName,
      calories: r.calories,
    })),
    recentWorkoutSessions: recentWorkoutRows.map((r) => ({
      id: r.id,
      name: r.name,
      performedAt: r.performedAt.toISOString(),
      durationSec: r.durationSec,
      caloriesBurned: r.caloriesBurned,
    })),
    currentMealPlan: currentMealPlanRows[0]
      ? toAssignmentView(currentMealPlanRows[0])
      : null,
    recentExerciseAssignments: recentExerciseAssignmentRows.map(
      toAssignmentView,
    ),
    lastActiveAt: lastActive ? lastActive.toISOString() : null,
  };
};

// ── 3. putMealPlan ────────────────────────────────────────────
export const putMealPlan = async (
  ptId: string,
  studentId: string,
  enrollment: StudentDetailContext,
  body: PutMealPlanBody,
): Promise<MealPlanResponse> => {
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(ptAssignments)
      .where(
        and(
          eq(ptAssignments.enrollmentId, enrollment.id),
          eq(ptAssignments.type, 'meal_plan'),
          isNull(ptAssignments.supersededBy),
        ),
      )
      .limit(1);

    // SELF-SUPERSEDE TRICK: the partial unique index
    //   WHERE type='meal_plan' AND superseded_by IS NULL
    // forbids two active rows for the same enrollment. We can't insert the
    // new row while the old one is still "active". Setting the old row's
    // superseded_by to its own id drops it out of the partial index without
    // mutating any user-visible field, freeing the slot for the insert.
    // Step B below points the audit pointer at the real new row.
    if (existing) {
      await tx
        .update(ptAssignments)
        .set({ supersededBy: existing.id, updatedAt: new Date() })
        .where(eq(ptAssignments.id, existing.id));
    }

    const [created] = await tx
      .insert(ptAssignments)
      .values({
        ptId,
        studentId,
        enrollmentId: enrollment.id,
        type: 'meal_plan',
        payload: { days: body.days },
        note: body.note ?? null,
        supersededBy: null,
      })
      .returning();

    if (!created) {
      throw new PtStudentsError(
        500,
        'INTERNAL_ERROR',
        'Failed to create meal plan',
      );
    }

    if (existing) {
      await tx
        .update(ptAssignments)
        .set({ supersededBy: created.id, updatedAt: new Date() })
        .where(eq(ptAssignments.id, existing.id));
    }

    return {
      created,
      supersededPreviousAssignmentId: existing ? existing.id : null,
    };
  });

  return {
    ...toAssignmentView(result.created),
    supersededPreviousAssignmentId: result.supersededPreviousAssignmentId,
  };
};

// ── 4. postExerciseAssignment ─────────────────────────────────
export const postExerciseAssignment = async (
  ptId: string,
  studentId: string,
  enrollment: StudentDetailContext,
  body: PostExerciseBody,
): Promise<AssignmentView> => {
  const [ex] = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(eq(exercises.id, body.exerciseId))
    .limit(1);

  if (!ex) {
    throw new PtStudentsError(
      404,
      'EXERCISE_NOT_FOUND',
      'Exercise not found',
    );
  }

  const payload: Record<string, unknown> = { exerciseId: body.exerciseId };
  if (body.sets != null) payload.sets = body.sets;
  if (body.reps != null) payload.reps = body.reps;
  if (body.weightKg != null) payload.weightKg = body.weightKg;
  if (body.durationSec != null) payload.durationSec = body.durationSec;
  if (body.restSec != null) payload.restSec = body.restSec;

  const scheduledFor = body.scheduledDate
    ? body.scheduledDate.toISOString().slice(0, 10)
    : null;

  const [created] = await db
    .insert(ptAssignments)
    .values({
      ptId,
      studentId,
      enrollmentId: enrollment.id,
      type: 'exercise_addition',
      payload,
      scheduledFor,
      note: body.note ?? null,
      supersededBy: null,
    })
    .returning();

  if (!created) {
    throw new PtStudentsError(
      500,
      'INTERNAL_ERROR',
      'Failed to create exercise assignment',
    );
  }

  return toAssignmentView(created);
};

// ── 5. listMyAssignments ──────────────────────────────────────
export const listMyAssignments = async (
  studentId: string,
  query: ListMyAssignmentsQuery,
): Promise<Page<AssignmentFeedItem>> => {
  const filters: SQL[] = [
    eq(ptAssignments.studentId, studentId),
    isNull(ptAssignments.supersededBy),
  ];
  if (query.type) {
    filters.push(
      eq(ptAssignments.type, query.type.toLowerCase() as AssignmentTypeDb),
    );
  }
  const where = and(...filters);
  const offset = (query.page - 1) * query.limit;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: ptAssignments.id,
        type: ptAssignments.type,
        payload: ptAssignments.payload,
        scheduledFor: ptAssignments.scheduledFor,
        note: ptAssignments.note,
        createdAt: ptAssignments.createdAt,
        ptId: users.id,
        ptFullName: users.fullName,
        ptAvatarUrl: users.avatarUrl,
      })
      .from(ptAssignments)
      .innerJoin(users, eq(users.id, ptAssignments.ptId))
      .where(where)
      .orderBy(desc(ptAssignments.createdAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(ptAssignments)
      .where(where),
  ]);

  const items: AssignmentFeedItem[] = rows.map((r) => ({
    id: r.id,
    type: toApiAssignmentType(r.type),
    payload: r.payload,
    scheduledFor: r.scheduledFor ?? null,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
    from: {
      ptId: r.ptId,
      fullName: r.ptFullName,
      avatarUrl: r.ptAvatarUrl,
    },
  }));

  return { items, totalItems: countRows[0]?.n ?? 0 };
};

