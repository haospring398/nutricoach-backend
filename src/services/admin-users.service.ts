import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '../config/db';
import { subscriptions } from '../models/payment.model';
import { userMetrics } from '../models/user-metrics.model';
import { users, refreshTokens } from '../models/user.model';
import { userPoints } from '../models/quest.model';
import { ApiError } from '../lib/api-error';
import type {
  AdminUsersQuery,
  AdminBanUserInput,
  AdminChangeRoleInput,
  AdminAnalyticsQuery,
} from '../validations/admin.validation';

// user_role stored lowercase in DB ('user','pt','admin'); API uses UPPERCASE
const toDbRole = (role: string) => role.toLowerCase() as 'user' | 'pt' | 'admin';

function presentUser(row: typeof users.$inferSelect) {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone ?? null,
    role: row.role.toUpperCase(),
    tier: row.tier, // user_tier is UPPERCASE in DB — no conversion needed
    emailVerified: row.emailVerified,
    isBanned: row.isBanned,
    banReason: row.banReason ?? null,
    bannedAt: row.bannedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const adminListUsers = async (input: AdminUsersQuery) => {
  const conditions = [isNull(users.deletedAt)];

  if (input.search) {
    const pattern = `%${input.search}%`;
    const searchCond = or(ilike(users.email, pattern), ilike(users.fullName, pattern));
    if (searchCond) conditions.push(searchCond);
  }

  if (input.role) {
    conditions.push(eq(users.role, toDbRole(input.role)));
  }

  if (input.isBanned !== undefined) {
    conditions.push(eq(users.isBanned, input.isBanned));
  }

  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(users)
    .where(where);

  const offset = (input.page - 1) * input.limit;
  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(input.limit)
    .offset(offset);

  const totalItems = Number(total);
  const totalPages = Math.max(1, Math.ceil(totalItems / input.limit));

  return {
    items: rows.map(presentUser),
    pagination: {
      page: input.page,
      limit: input.limit,
      totalItems,
      totalPages,
      hasNext: input.page < totalPages,
      hasPrev: input.page > 1,
    },
  };
};

export const adminGetUser = async (id: string) => {
  const [row] = await db
    .select({
      user: users,
      metrics: userMetrics,
      totalPoints: userPoints.totalPoints,
      subPlan: subscriptions.plan,
      subStatus: subscriptions.status,
      subExpiresAt: subscriptions.expiresAt,
    })
    .from(users)
    .leftJoin(userMetrics, eq(userMetrics.userId, users.id))
    .leftJoin(userPoints, eq(userPoints.userId, users.id))
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.userId, users.id),
        eq(subscriptions.status, 'active'),
      ),
    )
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);

  if (!row) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  }

  const { user, metrics, totalPoints, subPlan, subStatus, subExpiresAt } = row;

  return {
    ...presentUser(user),
    metrics: metrics
      ? {
          gender: metrics.gender,
          dateOfBirth: metrics.dateOfBirth,
          heightCm: metrics.heightCm,
          weightKg: Number(metrics.weightKg), // numeric(5,2) comes back as string from pg
          activityLevel: metrics.activityLevel,
          goal: metrics.goal,
          targetWeightKg: metrics.targetWeightKg
            ? Number(metrics.targetWeightKg)
            : null,
          bmr: metrics.bmr,
          tdee: metrics.tdee,
          dailyCalorieTarget: metrics.dailyCalorieTarget,
          proteinG: metrics.proteinG,
          carbsG: metrics.carbsG,
          fatG: metrics.fatG,
        }
      : null,
    totalPoints: totalPoints ?? 0,
    subscription: subPlan
      ? {
          plan: subPlan.toUpperCase(), // product_type: lowercase DB → uppercase API
          status: subStatus ? subStatus.toUpperCase() : null,
          expiresAt: subExpiresAt?.toISOString() ?? null,
        }
      : null,
  };
};

export const adminBanUser = async (
  adminId: string,
  targetId: string,
  input: AdminBanUserInput,
) => {
  if (adminId === targetId) {
    throw new ApiError(400, 'CANNOT_BAN_SELF', 'Cannot ban your own account');
  }

  const [target] = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!target || target.deletedAt !== null) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  }

  await db
    .update(users)
    .set({
      isBanned: true,
      banReason: input.reason,
      bannedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, targetId));

  // Force logout: delete all refresh tokens from DB (not Redis — tokens live in refresh_tokens table)
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, targetId));

  return { id: targetId, isBanned: true };
};

export const adminUnbanUser = async (targetId: string) => {
  const [target] = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!target || target.deletedAt !== null) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  }

  await db
    .update(users)
    .set({
      isBanned: false,
      banReason: null,
      bannedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, targetId));

  return { id: targetId, isBanned: false };
};

export const adminChangeUserRole = async (
  adminId: string,
  targetId: string,
  input: AdminChangeRoleInput,
) => {
  if (adminId === targetId) {
    throw new ApiError(
      400,
      'CANNOT_CHANGE_OWN_ROLE',
      'Cannot change your own role',
    );
  }

  const [target] = await db
    .select({ id: users.id, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  if (!target || target.deletedAt !== null) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'User not found');
  }

  await db
    .update(users)
    .set({
      role: toDbRole(input.role),
      updatedAt: new Date(),
    })
    .where(eq(users.id, targetId));

  return { id: targetId, role: input.role };
};

const RANGE_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };

export const adminUsersAnalytics = async (input: AdminAnalyticsQuery) => {
  const days = RANGE_DAYS[input.range];
  // Calculate cutoff in JS and pass as a bound parameter — avoids string-inject into SQL
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totalRow] = await db
    .select({ total: count() })
    .from(users)
    .where(isNull(users.deletedAt));

  // users.created_at is timestamp WITHOUT timezone → double-cast for VN date
  // Pattern from dashboard.service.ts: (ts AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  const result = await db.execute(sql`
    SELECT
      ((created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::text AS date,
      COUNT(*)::int AS count
    FROM users
    WHERE deleted_at IS NULL
      AND created_at >= ${cutoff}
    GROUP BY 1
    ORDER BY 1
  `);

  const data = (result.rows as Array<{ date: string; count: number }>).map(
    (r) => ({
      date: r.date,
      count: Number(r.count),
    }),
  );

  return {
    range: input.range,
    totalUsers: Number(totalRow.total),
    newUsers: data.reduce((sum, d) => sum + d.count, 0),
    data,
  };
};
