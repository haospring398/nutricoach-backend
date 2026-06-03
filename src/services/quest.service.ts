import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../config/db';
import { ApiError } from '../lib/api-error';
import { users } from '../models/user.model';
import { userMetrics } from '../models/user-metrics.model';
import { foodLogs } from '../models/food-log.model';
import { workoutSessions } from '../models/workout.model';
import {
  dailyMissionLogs,
  quests,
  userPoints,
  type DailyMissionLog,
  type Quest,
} from '../models/quest.model';

export class QuestError extends ApiError {}

// Drizzle transaction handle — awardPoints runs inside an open transaction.
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── VN date utility ───────────────────────────────────────────
// en-CA locale yields ISO 'YYYY-MM-DD'.
export function getVnDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// ── Shared: total points (out of transaction) ─────────────────
async function getUserTotalPoints(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: userPoints.totalPoints })
    .from(userPoints)
    .where(eq(userPoints.userId, userId));
  return row?.total ?? 0;
}

// ── Shared: award points (inside a transaction) ───────────────
// Insert-or-increment the daily log and upsert user_points. Returns whether
// the award fired (false when the daily cap is already reached).
async function awardPoints(
  tx: DbTx,
  userId: string,
  questId: string,
  vnDate: string,
  quest: Quest,
  referenceId?: string,
): Promise<{ triggered: boolean; pointsAwarded: number }> {
  const [existing] = await tx
    .select()
    .from(dailyMissionLogs)
    .where(
      and(
        eq(dailyMissionLogs.userId, userId),
        eq(dailyMissionLogs.questId, questId),
        eq(dailyMissionLogs.date, vnDate),
      ),
    );

  if (existing && existing.completedCount >= quest.maxCompletionsPerDay) {
    return { triggered: false, pointsAwarded: 0 };
  }

  const points = quest.pointsPerCompletion;

  if (!existing) {
    await tx.insert(dailyMissionLogs).values({
      userId,
      questId,
      date: vnDate,
      completedCount: 1,
      pointsEarned: points,
      referenceId: referenceId ?? null,
    });
  } else {
    await tx
      .update(dailyMissionLogs)
      .set({
        completedCount: sql`${dailyMissionLogs.completedCount} + 1`,
        pointsEarned: sql`${dailyMissionLogs.pointsEarned} + ${points}`,
        // referenceId intentionally kept at the first-inserted value (audit).
      })
      .where(eq(dailyMissionLogs.id, existing.id));
  }

  await tx
    .insert(userPoints)
    .values({ userId, totalPoints: points, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userPoints.userId,
      set: {
        totalPoints: sql`${userPoints.totalPoints} + ${points}`,
        updatedAt: new Date(),
      },
    });

  return { triggered: true, pointsAwarded: points };
}

// ── 1. GET /quests/daily ──────────────────────────────────────
export interface DailyQuestItem {
  id: string;
  title: string;
  description: string;
  pointsPerCompletion: number;
  maxCompletionsPerDay: number;
  todayCompletedCount: number;
  todayPointsEarned: number;
  isCompleted: boolean;
}

export async function getDailyQuests(userId: string): Promise<{
  dailyLoginTriggered: boolean;
  totalPoints: number;
  quests: DailyQuestItem[];
}> {
  const vnToday = getVnDateString();

  const catalog = await db
    .select()
    .from(quests)
    .where(eq(quests.isActive, true));

  const todayLogs = await db
    .select()
    .from(dailyMissionLogs)
    .where(
      and(
        eq(dailyMissionLogs.userId, userId),
        eq(dailyMissionLogs.date, vnToday),
      ),
    );
  const logByQuestId: Record<string, DailyMissionLog> = Object.fromEntries(
    todayLogs.map((l) => [l.questId, l]),
  );

  // Auto-trigger DAILY_LOGIN once per VN day.
  const loginQuest = catalog.find((q) => q.id === 'DAILY_LOGIN');
  let dailyLoginTriggered = false;

  if (loginQuest && !logByQuestId['DAILY_LOGIN']) {
    await db.transaction(async (tx) => {
      const result = await awardPoints(
        tx,
        userId,
        'DAILY_LOGIN',
        vnToday,
        loginQuest,
      );
      dailyLoginTriggered = result.triggered;
    });
    if (dailyLoginTriggered) {
      logByQuestId['DAILY_LOGIN'] = {
        id: '',
        userId,
        questId: 'DAILY_LOGIN',
        date: vnToday,
        completedCount: 1,
        pointsEarned: loginQuest.pointsPerCompletion,
        referenceId: null,
        createdAt: new Date(),
      };
    }
  }

  const totalPoints = await getUserTotalPoints(userId);

  const questsWithProgress: DailyQuestItem[] = catalog.map((q) => {
    const log = logByQuestId[q.id];
    return {
      id: q.id,
      title: q.title,
      description: q.description,
      pointsPerCompletion: q.pointsPerCompletion,
      maxCompletionsPerDay: q.maxCompletionsPerDay,
      todayCompletedCount: log?.completedCount ?? 0,
      todayPointsEarned: log?.pointsEarned ?? 0,
      isCompleted: (log?.completedCount ?? 0) >= q.maxCompletionsPerDay,
    };
  });

  return { dailyLoginTriggered, totalPoints, quests: questsWithProgress };
}

// ── 2. POST /quests/trigger ───────────────────────────────────
export async function triggerQuest(
  userId: string,
  questId: 'AI_SCAN' | 'WORKOUT_DONE' | 'PT_VISIT' | 'DAILY_SHARE',
  date: string,
  referenceId?: string,
): Promise<{ triggered: boolean; pointsAwarded: number; totalPoints: number }> {
  const [quest] = await db
    .select()
    .from(quests)
    .where(and(eq(quests.id, questId), eq(quests.isActive, true)));
  if (!quest) {
    throw new QuestError(404, 'QUEST_NOT_FOUND', 'Quest not found or inactive');
  }

  if (questId === 'WORKOUT_DONE') {
    if (!referenceId) {
      throw new QuestError(
        400,
        'REFERENCE_REQUIRED',
        'referenceId (workout session id) is required for WORKOUT_DONE',
      );
    }
    // Server-verified. workout_sessions.performed_at is timestamptz → single
    // AT TIME ZONE cast to get the VN calendar date.
    const [session] = await db
      .select({ id: workoutSessions.id })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.id, referenceId),
          eq(workoutSessions.userId, userId),
          sql`(${workoutSessions.performedAt} AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ${date}::date`,
        ),
      );
    if (!session) {
      throw new QuestError(
        400,
        'INVALID_REFERENCE',
        'Workout session not found, does not belong to you, or was not performed on the given date',
      );
    }
  }

  if (questId === 'AI_SCAN') {
    // TEMPORARY: the ai_food_scans table does not exist yet (Scan module not
    // built — see CODEBASE_CONTEXT §6). Server-side verification of referenceId
    // is deferred. Until the scan module ships, accept the client claim; the
    // DB cap (completedCount < 3) is the only guard.
    // TODO when scan ships: verify
    //   SELECT 1 FROM ai_food_scans WHERE id = referenceId AND user_id = userId
    //   AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = date::date
  }

  if (questId === 'PT_VISIT') {
    // Client-verified. The server cannot confirm a PT profile view. Protection
    // is the DB daily cap (max 1/day). referenceId is stored for audit only.
  }

  if (questId === 'DAILY_SHARE') {
    // Client-verified. The server cannot confirm a native OS share. Protection
    // is the DB daily cap (max 1/day) only.
  }

  let result = { triggered: false, pointsAwarded: 0 };
  await db.transaction(async (tx) => {
    result = await awardPoints(tx, userId, questId, date, quest, referenceId);
  });

  const totalPoints = await getUserTotalPoints(userId);
  return { ...result, totalPoints };
}

// ── 3. POST /quests/diary-lock ────────────────────────────────
export async function diaryLock(
  userId: string,
  date: string,
): Promise<{
  missionsCompleted: string[];
  pointsAwarded: number;
  totalPoints: number;
}> {
  // food_logs.consumed_at is timestamp WITHOUT time zone storing UTC → double
  // cast to get the VN calendar date.
  const mealGroups = await db
    .select({
      mealType: foodLogs.mealType,
      totalCalories: sql<number>`COALESCE(SUM(${foodLogs.calories}), 0)::int`,
    })
    .from(foodLogs)
    .where(
      and(
        eq(foodLogs.userId, userId),
        sql`(${foodLogs.consumedAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ${date}::date`,
      ),
    )
    .groupBy(foodLogs.mealType);

  const mealTypes = new Set<string>(mealGroups.map((r) => r.mealType));
  const hasAllMeals = ['BREAKFAST', 'LUNCH', 'DINNER'].every((m) =>
    mealTypes.has(m),
  );

  if (!hasAllMeals) {
    throw new QuestError(
      409,
      'DIARY_INCOMPLETE',
      'Cần ghi chép đầy đủ 3 bữa Sáng (BREAKFAST), Trưa (LUNCH), Tối (DINNER) trước khi chốt nhật ký',
    );
  }

  const totalCalories = mealGroups.reduce(
    (sum, r) => sum + Number(r.totalCalories),
    0,
  );

  const [metrics] = await db
    .select({ tdee: userMetrics.tdee })
    .from(userMetrics)
    .where(eq(userMetrics.userId, userId));

  const passesDiscipline = metrics
    ? totalCalories > 0 && totalCalories <= metrics.tdee
    : false;

  const questIds = passesDiscipline
    ? ['PERFECT_DIARY', 'DISCIPLINE_MASTER']
    : ['PERFECT_DIARY'];

  const questCatalog = await db
    .select()
    .from(quests)
    .where(and(inArray(quests.id, questIds), eq(quests.isActive, true)));
  const questMap: Record<string, Quest> = Object.fromEntries(
    questCatalog.map((q) => [q.id, q]),
  );

  const missionsCompleted: string[] = [];
  let pointsAwarded = 0;

  await db.transaction(async (tx) => {
    for (const qid of questIds) {
      const q = questMap[qid];
      if (!q) continue;
      const result = await awardPoints(tx, userId, qid, date, q);
      if (result.triggered) {
        missionsCompleted.push(qid);
        pointsAwarded += result.pointsAwarded;
      }
    }
  });

  const totalPoints = await getUserTotalPoints(userId);
  return { missionsCompleted, pointsAwarded, totalPoints };
}

// ── 4. GET /quests/points ─────────────────────────────────────
export async function getPoints(
  userId: string,
  page: number,
  limit: number,
): Promise<{
  totalPoints: number;
  history: Array<{
    questId: string;
    questTitle: string;
    date: string;
    completedCount: number;
    pointsEarned: number;
  }>;
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}> {
  const totalPoints = await getUserTotalPoints(userId);
  const offset = (page - 1) * limit;

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(dailyMissionLogs)
    .where(eq(dailyMissionLogs.userId, userId));
  const totalItems = countRow?.count ?? 0;

  const history = await db
    .select({
      questId: dailyMissionLogs.questId,
      questTitle: quests.title,
      date: dailyMissionLogs.date,
      completedCount: dailyMissionLogs.completedCount,
      pointsEarned: dailyMissionLogs.pointsEarned,
    })
    .from(dailyMissionLogs)
    .innerJoin(quests, eq(dailyMissionLogs.questId, quests.id))
    .where(eq(dailyMissionLogs.userId, userId))
    .orderBy(desc(dailyMissionLogs.date), desc(dailyMissionLogs.createdAt))
    .limit(limit)
    .offset(offset);

  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  return {
    totalPoints,
    history,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

// ── 5. Admin: list quests ─────────────────────────────────────
export async function adminListQuests(): Promise<Quest[]> {
  return db.select().from(quests).orderBy(quests.id);
}

// ── 6. Admin: create quest ────────────────────────────────────
export async function adminCreateQuest(data: {
  id: string;
  title: string;
  description: string;
  pointsPerCompletion: number;
  maxCompletionsPerDay: number;
  isActive: boolean;
}): Promise<Quest> {
  const [existing] = await db
    .select({ id: quests.id })
    .from(quests)
    .where(eq(quests.id, data.id));
  if (existing) {
    throw new QuestError(
      409,
      'QUEST_ID_EXISTS',
      `Quest with id '${data.id}' already exists`,
    );
  }
  const [created] = await db.insert(quests).values(data).returning();
  return created!;
}

// ── 7. Admin: update quest ────────────────────────────────────
export async function adminUpdateQuest(
  id: string,
  data: Partial<{
    title: string;
    description: string;
    pointsPerCompletion: number;
    maxCompletionsPerDay: number;
    isActive: boolean;
  }>,
): Promise<Quest> {
  const [existing] = await db
    .select({ id: quests.id })
    .from(quests)
    .where(eq(quests.id, id));
  if (!existing) {
    throw new QuestError(404, 'QUEST_NOT_FOUND', 'Quest not found');
  }

  const [updated] = await db
    .update(quests)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(quests.id, id))
    .returning();
  return updated!;
}

// ── 8. Admin: leaderboard ─────────────────────────────────────
export async function adminGetLeaderboard(limit: number): Promise<
  Array<{
    rank: number;
    userId: string;
    fullName: string;
    avatarUrl: string | null;
    totalPoints: number;
  }>
> {
  return db
    .select({
      rank: sql<number>`ROW_NUMBER() OVER (ORDER BY ${userPoints.totalPoints} DESC)::int`,
      userId: userPoints.userId,
      fullName: users.fullName,
      avatarUrl: users.avatarUrl,
      totalPoints: userPoints.totalPoints,
    })
    .from(userPoints)
    .innerJoin(users, eq(userPoints.userId, users.id))
    .orderBy(desc(userPoints.totalPoints))
    .limit(limit);
}
