import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/db';
import { ApiError } from '../lib/api-error';
import {
  exercises,
  sessionExerciseLogs,
  workoutSessions,
  type Exercise,
  type SessionExerciseLog,
  type WorkoutSession,
} from '../models/workout.model';
import type {
  CreateSessionBody,
  ListExercisesQuery,
  ListSessionsQuery,
  SetLogInput,
  UpdateSessionBody,
} from '../validations/workout.validation';

export class WorkoutError extends ApiError {}

type MuscleGroupDb =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'legs'
  | 'glutes'
  | 'core'
  | 'cardio'
  | 'full_body';
type EquipmentDb = Exercise['equipment'];
type DifficultyDb = Exercise['difficulty'];

const toApiEnum = <T extends string>(v: T): Uppercase<T> =>
  v.toUpperCase() as Uppercase<T>;
const toDbEnum = <T extends string>(v: T): Lowercase<T> =>
  v.toLowerCase() as Lowercase<T>;

// ── Response shapes ───────────────────────────────────────────
export interface ExerciseListItem {
  id: string;
  nameVi: string;
  nameEn: string;
  muscleGroups: string[];
  equipment: string;
  difficulty: string;
  caloriesPerMinute: number;
  thumbnailUrl: string | null;
  animation2dUrl: string | null;
  youtubeVideoId: string | null;
}

export interface ExerciseDetail extends ExerciseListItem {
  instructions: string[];
  commonMistakes: string[];
  variations: { id: string; name: string }[];
}

export interface ExerciseListResult {
  items: ExerciseListItem[];
  totalItems: number;
}

export interface SessionSummary {
  id: string;
  name: string;
  performedAt: string;
  durationSec: number;
  estimatedCaloriesBurned: number;
  caloriesBurned: number;
  totalExercises: number;
  totalSets: number;
  notes: string | null;
  createdAt: string;
}

export interface SessionListItem {
  id: string;
  name: string;
  performedAt: string;
  durationSec: number;
  caloriesBurned: number;
  totalExercises: number;
  totalSets: number;
}

export interface SessionListResult {
  items: SessionListItem[];
  totalItems: number;
}

export interface SessionLogItem {
  id: string;
  exerciseId: string;
  exerciseNameSnapshot: string;
  orderIndex: number;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  restSec: number;
  rpe: number | null;
  notes: string | null;
}

export interface SessionDetail {
  id: string;
  name: string;
  performedAt: string;
  durationSec: number;
  estimatedCaloriesBurned: number;
  caloriesBurned: number;
  notes: string | null;
  logs: SessionLogItem[];
  createdAt: string;
  updatedAt: string;
}

// ── Mappers ───────────────────────────────────────────────────
const mapListItem = (row: Exercise): ExerciseListItem => ({
  id: row.id,
  nameVi: row.nameVi,
  nameEn: row.nameEn,
  muscleGroups: row.muscleGroups.map((m) => toApiEnum(m)),
  equipment: toApiEnum(row.equipment),
  difficulty: toApiEnum(row.difficulty),
  caloriesPerMinute: Number(row.caloriesPerMinute),
  thumbnailUrl: row.thumbnailUrl,
  animation2dUrl: row.animation2dUrl,
  youtubeVideoId: row.youtubeVideoId,
});

const mapDetail = (row: Exercise): ExerciseDetail => ({
  ...mapListItem(row),
  instructions: row.instructions ?? [],
  commonMistakes: row.commonMistakes ?? [],
  variations: row.variations ?? [],
});

const mapLog = (row: SessionExerciseLog): SessionLogItem => ({
  id: row.id,
  exerciseId: row.exerciseId,
  exerciseNameSnapshot: row.exerciseNameSnapshot,
  orderIndex: row.orderIndex,
  setNumber: row.setNumber,
  reps: row.reps,
  weightKg: row.weightKg !== null ? Number(row.weightKg) : null,
  durationSec: row.durationSec,
  restSec: row.restSec,
  rpe: row.rpe,
  notes: row.notes,
});

// ── 1. listExercises ──────────────────────────────────────────
export const listExercises = async (
  query: ListExercisesQuery,
): Promise<ExerciseListResult> => {
  const filters: SQL[] = [];

  if (query.muscleGroup) {
    const dbMg = toDbEnum(query.muscleGroup);
    filters.push(
      sql`${exercises.muscleGroups} @> ARRAY[${dbMg}]::muscle_group[]`,
    );
  }
  if (query.equipment) {
    filters.push(
      eq(exercises.equipment, toDbEnum(query.equipment) as EquipmentDb),
    );
  }
  if (query.difficulty) {
    filters.push(
      eq(exercises.difficulty, toDbEnum(query.difficulty) as DifficultyDb),
    );
  }

  const q = query.search;
  if (q) {
    filters.push(sql`(
      similarity(${exercises.nameVi}, ${q}) > 0.2
      OR similarity(${exercises.nameEn}, ${q}) > 0.2
      OR ${exercises.nameVi} ILIKE '%' || ${q} || '%'
      OR ${exercises.nameEn} ILIKE '%' || ${q} || '%'
    )`);
  }

  const where =
    filters.length === 0
      ? undefined
      : filters.length === 1
        ? filters[0]
        : and(...filters);

  const orderBy = q
    ? desc(
        sql`GREATEST(similarity(${exercises.nameVi}, ${q}), similarity(${exercises.nameEn}, ${q}))`,
      )
    : asc(exercises.nameVi);

  const offset = (query.page - 1) * query.limit;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(exercises)
      .where(where)
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(exercises)
      .where(where),
  ]);

  return {
    items: rows.map(mapListItem),
    totalItems: countRows[0]?.n ?? 0,
  };
};

// ── 2. getExerciseById ────────────────────────────────────────
export const getExerciseById = async (
  id: string,
): Promise<ExerciseDetail> => {
  const [row] = await db
    .select()
    .from(exercises)
    .where(eq(exercises.id, id))
    .limit(1);

  if (!row) {
    throw new WorkoutError(404, 'EXERCISE_NOT_FOUND', 'Exercise not found');
  }
  return mapDetail(row);
};

// ── Estimation + naming helpers ───────────────────────────────
const computeEstimatedCalories = (
  logs: SetLogInput[],
  exerciseMap: Map<string, Exercise>,
): number => {
  const byExercise = new Map<string, SetLogInput[]>();
  for (const log of logs) {
    const arr = byExercise.get(log.exerciseId) ?? [];
    arr.push(log);
    byExercise.set(log.exerciseId, arr);
  }

  let total = 0;
  for (const [exerciseId, exLogs] of byExercise) {
    const calPerMin = Number(exerciseMap.get(exerciseId)!.caloriesPerMinute);

    let wtMinutes = 0;
    let wtSets = 0;
    let cardioMinutes = 0;
    for (const l of exLogs) {
      if (l.reps != null) {
        wtMinutes += (l.reps * 3 + l.restSec) / 60;
        wtSets++;
      } else if (l.durationSec != null) {
        cardioMinutes += l.durationSec / 60;
      }
    }

    let estimatedMinutes = 0;
    if (wtSets > 0) estimatedMinutes += Math.max(1, wtMinutes);
    estimatedMinutes += cardioMinutes;

    total += calPerMin * estimatedMinutes;
  }

  return Math.round(total);
};

const MUSCLE_VI: Record<MuscleGroupDb, string> = {
  chest: 'ngực',
  back: 'lưng',
  shoulders: 'vai',
  biceps: 'tay trước',
  triceps: 'tay sau',
  legs: 'chân',
  glutes: 'mông',
  core: 'bụng',
  cardio: 'cardio',
  full_body: 'full body',
};

const autoGenerateSessionName = (
  logs: SetLogInput[],
  exerciseMap: Map<string, Exercise>,
): string => {
  // Primary muscle group = first entry of each distinct exercise's array.
  const primaries: MuscleGroupDb[] = [];
  for (const id of new Set(logs.map((l) => l.exerciseId))) {
    const ex = exerciseMap.get(id);
    if (ex && ex.muscleGroups.length > 0) {
      primaries.push(ex.muscleGroups[0] as MuscleGroupDb);
    }
  }

  const distinct = new Set(primaries);
  if (distinct.size >= 3) return 'Buổi tập full body';

  const counts = new Map<MuscleGroupDb, number>();
  for (const p of primaries) counts.set(p, (counts.get(p) ?? 0) + 1);
  let dominant: MuscleGroupDb = primaries[0] ?? 'full_body';
  let best = 0;
  for (const [mg, n] of counts) {
    if (n > best) {
      best = n;
      dominant = mg;
    }
  }

  if (dominant === 'cardio') return 'Buổi cardio';
  if (dominant === 'full_body') return 'Buổi tập full body';
  return `Buổi tập ${MUSCLE_VI[dominant]}`;
};

// ── 3. createSession ──────────────────────────────────────────
export const createSession = async (
  userId: string,
  input: CreateSessionBody,
): Promise<SessionSummary> => {
  const exerciseIds = [...new Set(input.logs.map((l) => l.exerciseId))];

  return db.transaction(async (tx) => {
    const exerciseRows = await tx
      .select()
      .from(exercises)
      .where(inArray(exercises.id, exerciseIds));
    const exerciseMap = new Map(exerciseRows.map((e) => [e.id, e]));

    for (const log of input.logs) {
      if (!exerciseMap.has(log.exerciseId)) {
        throw new WorkoutError(
          404,
          'EXERCISE_NOT_FOUND',
          `Exercise not found: ${log.exerciseId}`,
        );
      }
    }

    const estimated = computeEstimatedCalories(input.logs, exerciseMap);
    const name =
      input.name ?? autoGenerateSessionName(input.logs, exerciseMap);

    const [session] = await tx
      .insert(workoutSessions)
      .values({
        userId,
        name,
        performedAt: input.performedAt,
        durationSec: input.durationSec,
        estimatedCaloriesBurned: estimated,
        caloriesBurned: input.caloriesBurned ?? estimated,
        notes: input.notes ?? null,
      })
      .returning();

    if (!session) {
      throw new WorkoutError(
        500,
        'INTERNAL_ERROR',
        'Failed to create session',
      );
    }

    await tx.insert(sessionExerciseLogs).values(
      input.logs.map((l) => ({
        sessionId: session.id,
        exerciseId: l.exerciseId,
        exerciseNameSnapshot: exerciseMap.get(l.exerciseId)!.nameVi,
        orderIndex: l.orderIndex,
        setNumber: l.setNumber,
        reps: l.reps ?? null,
        weightKg: l.weightKg != null ? l.weightKg.toFixed(2) : null,
        durationSec: l.durationSec ?? null,
        restSec: l.restSec,
        rpe: l.rpe ?? null,
        notes: l.notes ?? null,
      })),
    );

    return {
      id: session.id,
      name: session.name,
      performedAt: session.performedAt.toISOString(),
      durationSec: session.durationSec,
      estimatedCaloriesBurned: session.estimatedCaloriesBurned,
      caloriesBurned: session.caloriesBurned,
      totalExercises: exerciseIds.length,
      totalSets: input.logs.length,
      notes: session.notes,
      createdAt: session.createdAt.toISOString(),
    };
  });
};

// ── 4. listSessions ───────────────────────────────────────────
export const listSessions = async (
  userId: string,
  query: ListSessionsQuery,
): Promise<SessionListResult> => {
  const filters: SQL[] = [eq(workoutSessions.userId, userId)];
  if (query.from) {
    filters.push(gte(workoutSessions.performedAt, query.from));
  }
  if (query.to) {
    filters.push(lte(workoutSessions.performedAt, query.to));
  }
  const where = filters.length === 1 ? filters[0] : and(...filters);

  const offset = (query.page - 1) * query.limit;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(workoutSessions)
      .where(where)
      .orderBy(desc(workoutSessions.performedAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(workoutSessions)
      .where(where),
  ]);

  // One grouped query for set/exercise counts across the whole page.
  const sessionIds = rows.map((r) => r.id);
  const aggMap = new Map<string, { sets: number; exercises: number }>();
  if (sessionIds.length > 0) {
    const aggRows = await db
      .select({
        sessionId: sessionExerciseLogs.sessionId,
        sets: sql<number>`count(*)::int`,
        exercises: sql<number>`count(distinct ${sessionExerciseLogs.exerciseId})::int`,
      })
      .from(sessionExerciseLogs)
      .where(inArray(sessionExerciseLogs.sessionId, sessionIds))
      .groupBy(sessionExerciseLogs.sessionId);
    for (const a of aggRows) {
      aggMap.set(a.sessionId, { sets: a.sets, exercises: a.exercises });
    }
  }

  return {
    items: rows.map((r) => {
      const agg = aggMap.get(r.id) ?? { sets: 0, exercises: 0 };
      return {
        id: r.id,
        name: r.name,
        performedAt: r.performedAt.toISOString(),
        durationSec: r.durationSec,
        caloriesBurned: r.caloriesBurned,
        totalExercises: agg.exercises,
        totalSets: agg.sets,
      };
    }),
    totalItems: countRows[0]?.n ?? 0,
  };
};

// ── 5. getSessionById ─────────────────────────────────────────
const loadOwnedSession = async (
  userId: string,
  sessionId: string,
): Promise<WorkoutSession> => {
  const [session] = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.id, sessionId),
        eq(workoutSessions.userId, userId),
      ),
    )
    .limit(1);

  if (!session) {
    // 404 (not 403) — do not leak existence of another user's session.
    throw new WorkoutError(404, 'SESSION_NOT_FOUND', 'Session not found');
  }
  return session;
};

const buildSessionDetail = async (
  session: WorkoutSession,
): Promise<SessionDetail> => {
  const logs = await db
    .select()
    .from(sessionExerciseLogs)
    .where(eq(sessionExerciseLogs.sessionId, session.id))
    .orderBy(
      asc(sessionExerciseLogs.orderIndex),
      asc(sessionExerciseLogs.setNumber),
    );

  return {
    id: session.id,
    name: session.name,
    performedAt: session.performedAt.toISOString(),
    durationSec: session.durationSec,
    estimatedCaloriesBurned: session.estimatedCaloriesBurned,
    caloriesBurned: session.caloriesBurned,
    notes: session.notes,
    logs: logs.map(mapLog),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
};

export const getSessionById = async (
  userId: string,
  sessionId: string,
): Promise<SessionDetail> => {
  const session = await loadOwnedSession(userId, sessionId);
  return buildSessionDetail(session);
};

// ── 6. updateSession ──────────────────────────────────────────
export const updateSession = async (
  userId: string,
  sessionId: string,
  patch: UpdateSessionBody,
): Promise<SessionDetail> => {
  await loadOwnedSession(userId, sessionId);

  const set: Partial<typeof workoutSessions.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.durationSec !== undefined) set.durationSec = patch.durationSec;
  if (patch.caloriesBurned !== undefined) {
    set.caloriesBurned = patch.caloriesBurned;
  }

  const [updated] = await db
    .update(workoutSessions)
    .set(set)
    .where(eq(workoutSessions.id, sessionId))
    .returning();

  return buildSessionDetail(updated!);
};

// ── 7. deleteSession ──────────────────────────────────────────
export const deleteSession = async (
  userId: string,
  sessionId: string,
): Promise<void> => {
  await loadOwnedSession(userId, sessionId);
  // ON DELETE CASCADE removes session_exercise_logs rows.
  await db.delete(workoutSessions).where(eq(workoutSessions.id, sessionId));
};
