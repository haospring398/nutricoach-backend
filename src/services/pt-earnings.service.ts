import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/db';
import { cache } from '../config/redis';
import { ApiError } from '../lib/api-error';
import { users } from '../models/user.model';
import { ptProfiles } from '../models/pt.model';
import {
  ptEarnings,
  withdrawals,
  type Withdrawal,
} from '../models/pt-earnings.model';
import {
  sendWithdrawalApprovedEmail,
  sendWithdrawalRejectedEmail,
} from '../lib/email';
import type {
  AdminListWithdrawalsQuery,
  ApproveWithdrawalBody,
  CreateWithdrawalBody,
  EarningsQuery,
  ListOwnWithdrawalsQuery,
  RejectWithdrawalBody,
} from '../validations/pt-earnings.validation';

export class PtEarningsError extends ApiError {}

type WithdrawalStatusDb = 'pending_approval' | 'completed' | 'rejected';
type ApiWithdrawalStatus = 'PENDING_APPROVAL' | 'COMPLETED' | 'REJECTED';

const toApiWithdrawalStatus = (s: WithdrawalStatusDb): ApiWithdrawalStatus =>
  s.toUpperCase() as ApiWithdrawalStatus;

const WITHDRAWAL_IDEM_TTL_SECONDS = 86_400;
const HOLD_DAYS = 7;
const DAY_MS = 86_400_000;

const idemKey = (ptId: string, key: string): string =>
  `idem:withdrawal:${ptId}:${key}`;

// ── Response shapes ───────────────────────────────────────────
export interface EarningsBreakdownItem {
  period: string;
  grossVnd: number;
  feeVnd: number;
  netVnd: number;
  transactionsCount: number;
}

export interface EarningsReport {
  totalRevenueVnd: number;
  platformFeeVnd: number;
  netEarningsVnd: number;
  availableBalanceVnd: number;
  pendingWithdrawalVnd: number;
  withdrawnTotalVnd: number;
  breakdown: EarningsBreakdownItem[];
}

export interface WithdrawalView {
  id: string;
  amountVnd: number;
  status: ApiWithdrawalStatus;
  bankCode: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  note: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  transferReference: string | null;
  rejectionReason: string | null;
}

export interface AdminWithdrawalView extends WithdrawalView {
  ptId: string;
  ptFullName: string;
}

export interface Page<T> {
  items: T[];
  totalItems: number;
}

interface BalanceSnapshot {
  availableBalanceVnd: number;
  totalEarnedAvailableVnd: number;
  pendingWithdrawalVnd: number;
  completedWithdrawalVnd: number;
}

// ── Mappers ───────────────────────────────────────────────────
const mapWithdrawal = (w: Withdrawal): WithdrawalView => ({
  id: w.id,
  amountVnd: w.amountVnd,
  status: toApiWithdrawalStatus(w.status),
  bankCode: w.bankCode,
  bankAccountNumber: w.bankAccountNumber,
  bankAccountHolder: w.bankAccountHolder,
  note: w.note,
  requestedAt: w.requestedAt.toISOString(),
  reviewedAt: w.reviewedAt ? w.reviewedAt.toISOString() : null,
  transferReference: w.transferReference,
  rejectionReason: w.rejectionReason,
});

// ── Balance computation ──────────────────────────────────────
// The on_hold → available transition is implicit in time (no cron).
// `effective` status here is what the read computes, not what's stored.
type DbExecutor = Pick<typeof db, 'select'>;

const computeBalance = async (
  executor: DbExecutor,
  ptId: string,
): Promise<BalanceSnapshot> => {
  const [available] = await executor
    .select({
      amount: sql<number>`COALESCE(SUM(${ptEarnings.netVnd}) FILTER (
        WHERE ${ptEarnings.status} NOT IN ('refunded', 'paid_out')
        AND now() >= ${ptEarnings.availableAt}
      ), 0)::int`,
    })
    .from(ptEarnings)
    .where(eq(ptEarnings.ptId, ptId));

  const [outflow] = await executor
    .select({
      pending: sql<number>`COALESCE(SUM(${withdrawals.amountVnd}) FILTER (
        WHERE ${withdrawals.status} = 'pending_approval'
      ), 0)::int`,
      completed: sql<number>`COALESCE(SUM(${withdrawals.amountVnd}) FILTER (
        WHERE ${withdrawals.status} = 'completed'
      ), 0)::int`,
    })
    .from(withdrawals)
    .where(eq(withdrawals.ptId, ptId));

  // Defensive coercion — pg-node sometimes returns SUM aggregates as strings
  // (bigint quirk) even with COALESCE(..., 0)::int. Explicit null/undefined
  // check + Number() guarantees a JS number reaches callers.
  const totalEarnedAvailableVnd =
    available?.amount != null ? Number(available.amount) : 0;
  const pendingWithdrawalVnd =
    outflow?.pending != null ? Number(outflow.pending) : 0;
  const completedWithdrawalVnd =
    outflow?.completed != null ? Number(outflow.completed) : 0;

  return {
    totalEarnedAvailableVnd,
    pendingWithdrawalVnd,
    completedWithdrawalVnd,
    availableBalanceVnd:
      totalEarnedAvailableVnd -
      pendingWithdrawalVnd -
      completedWithdrawalVnd,
  };
};

// ── 1. getEarningsReport ──────────────────────────────────────
export const getEarningsReport = async (
  ptId: string,
  query: EarningsQuery,
): Promise<EarningsReport> => {
  const filters: SQL[] = [eq(ptEarnings.ptId, ptId)];
  if (query.from) filters.push(gte(ptEarnings.createdAt, query.from));
  if (query.to) filters.push(lte(ptEarnings.createdAt, query.to));
  const where = filters.length === 1 ? filters[0] : and(...filters);

  const totalsPromise = db
    .select({
      gross: sql<number>`COALESCE(SUM(${ptEarnings.grossVnd}), 0)::int`,
      fee: sql<number>`COALESCE(SUM(${ptEarnings.platformFeeVnd}), 0)::int`,
      net: sql<number>`COALESCE(SUM(${ptEarnings.netVnd}), 0)::int`,
    })
    .from(ptEarnings)
    .where(where);

  const breakdownPromise = db
    .select({
      period: sql<string>`to_char(date_trunc('month', ${ptEarnings.createdAt}), 'YYYY-MM')`,
      grossVnd: sql<number>`COALESCE(SUM(${ptEarnings.grossVnd}), 0)::int`,
      feeVnd: sql<number>`COALESCE(SUM(${ptEarnings.platformFeeVnd}), 0)::int`,
      netVnd: sql<number>`COALESCE(SUM(${ptEarnings.netVnd}), 0)::int`,
      transactionsCount: sql<number>`COUNT(*)::int`,
    })
    .from(ptEarnings)
    .where(where)
    .groupBy(sql`date_trunc('month', ${ptEarnings.createdAt})`)
    .orderBy(desc(sql`date_trunc('month', ${ptEarnings.createdAt})`));

  const [totalsRows, breakdownRows, balance] = await Promise.all([
    totalsPromise,
    breakdownPromise,
    computeBalance(db, ptId),
  ]);

  const totals = totalsRows[0];

  return {
    totalRevenueVnd: totals?.gross != null ? Number(totals.gross) : 0,
    platformFeeVnd: totals?.fee != null ? Number(totals.fee) : 0,
    netEarningsVnd: totals?.net != null ? Number(totals.net) : 0,
    availableBalanceVnd: balance.availableBalanceVnd,
    pendingWithdrawalVnd: balance.pendingWithdrawalVnd,
    withdrawnTotalVnd: balance.completedWithdrawalVnd,
    breakdown: breakdownRows.map((r) => ({
      period: r.period,
      grossVnd: r.grossVnd != null ? Number(r.grossVnd) : 0,
      feeVnd: r.feeVnd != null ? Number(r.feeVnd) : 0,
      netVnd: r.netVnd != null ? Number(r.netVnd) : 0,
      transactionsCount:
        r.transactionsCount != null ? Number(r.transactionsCount) : 0,
    })),
  };
};

// ── 2. createWithdrawal ───────────────────────────────────────
interface PgUniqueViolation {
  code?: string;
  constraint?: string;
}

const isUniqueViolation = (
  err: unknown,
  constraint: string,
): boolean => {
  if (!err || typeof err !== 'object') return false;
  const e = err as PgUniqueViolation;
  return e.code === '23505' && e.constraint === constraint;
};

export interface CreateWithdrawalResult {
  data: WithdrawalView;
  replayed: boolean;
}

export const createWithdrawal = async (
  ptId: string,
  body: CreateWithdrawalBody,
  idempotencyKey: string,
): Promise<CreateWithdrawalResult> => {
  const cacheKey = idemKey(ptId, idempotencyKey);
  const cached = await cache.get<WithdrawalView>(cacheKey);
  if (cached) {
    return { data: cached, replayed: true };
  }

  const [profile] = await db
    .select({
      bankCode: ptProfiles.bankCode,
      bankAccountNumber: ptProfiles.bankAccountNumber,
      bankAccountHolder: ptProfiles.bankAccountHolder,
    })
    .from(ptProfiles)
    .where(eq(ptProfiles.userId, ptId))
    .limit(1);

  if (!profile) {
    throw new PtEarningsError(
      404,
      'PT_PROFILE_NOT_FOUND',
      'PT profile not found',
    );
  }

  // Balance check + insert in a transaction. Note: under truly concurrent
  // withdrawal requests this is read-then-write without a row lock, so two
  // racing requests could each pass the check and both insert. Accepted
  // for v1 — a single PT issuing concurrent withdrawals is not a realistic
  // adversary. The DB UNIQUE (pt_id, idempotency_key) blocks accidental
  // dupes.
  const created = await db.transaction(async (tx) => {
    const balance = await computeBalance(tx, ptId);

    if (body.amountVnd > balance.availableBalanceVnd) {
      throw new PtEarningsError(
        409,
        'INSUFFICIENT_BALANCE',
        `Requested ${body.amountVnd}, available ${balance.availableBalanceVnd}`,
      );
    }

    try {
      const [row] = await tx
        .insert(withdrawals)
        .values({
          ptId,
          amountVnd: body.amountVnd,
          bankCode: profile.bankCode,
          bankAccountNumber: profile.bankAccountNumber,
          bankAccountHolder: profile.bankAccountHolder,
          status: 'pending_approval',
          idempotencyKey,
          note: body.note ?? null,
        })
        .returning();
      if (!row) {
        throw new PtEarningsError(
          500,
          'INTERNAL_ERROR',
          'Failed to create withdrawal',
        );
      }
      return row;
    } catch (err) {
      if (isUniqueViolation(err, 'withdrawals_pt_idem_uq')) {
        // Race: cache miss but DB constraint caught a replay. Fetch the
        // existing row and return it as if we'd hit the cache.
        const [existing] = await tx
          .select()
          .from(withdrawals)
          .where(
            and(
              eq(withdrawals.ptId, ptId),
              eq(withdrawals.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);
        if (existing) return existing;
      }
      throw err;
    }
  });

  const data = mapWithdrawal(created);
  await cache.set(cacheKey, data, WITHDRAWAL_IDEM_TTL_SECONDS);
  return { data, replayed: false };
};

// ── 3. listOwnWithdrawals ─────────────────────────────────────
export const listOwnWithdrawals = async (
  ptId: string,
  query: ListOwnWithdrawalsQuery,
): Promise<Page<WithdrawalView>> => {
  const filters: SQL[] = [eq(withdrawals.ptId, ptId)];
  if (query.status) {
    filters.push(
      eq(
        withdrawals.status,
        query.status.toLowerCase() as WithdrawalStatusDb,
      ),
    );
  }
  const where = filters.length === 1 ? filters[0] : and(...filters);
  const offset = (query.page - 1) * query.limit;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(withdrawals)
      .where(where)
      .orderBy(desc(withdrawals.requestedAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(withdrawals)
      .where(where),
  ]);

  return {
    items: rows.map(mapWithdrawal),
    totalItems: countRows[0]?.n ?? 0,
  };
};

// ── 4. listAllWithdrawals (admin) ─────────────────────────────
export const listAllWithdrawals = async (
  query: AdminListWithdrawalsQuery,
): Promise<Page<AdminWithdrawalView>> => {
  const filters: SQL[] = [];
  if (query.status) {
    filters.push(
      eq(
        withdrawals.status,
        query.status.toLowerCase() as WithdrawalStatusDb,
      ),
    );
  }
  if (query.ptId) filters.push(eq(withdrawals.ptId, query.ptId));
  const where = filters.length === 0 ? undefined : and(...filters);
  const offset = (query.page - 1) * query.limit;

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: withdrawals.id,
        amountVnd: withdrawals.amountVnd,
        status: withdrawals.status,
        bankCode: withdrawals.bankCode,
        bankAccountNumber: withdrawals.bankAccountNumber,
        bankAccountHolder: withdrawals.bankAccountHolder,
        note: withdrawals.note,
        requestedAt: withdrawals.requestedAt,
        reviewedAt: withdrawals.reviewedAt,
        transferReference: withdrawals.transferReference,
        rejectionReason: withdrawals.rejectionReason,
        ptId: withdrawals.ptId,
        ptFullName: users.fullName,
      })
      .from(withdrawals)
      .innerJoin(users, eq(users.id, withdrawals.ptId))
      .where(where)
      .orderBy(desc(withdrawals.requestedAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(withdrawals)
      .where(where),
  ]);

  const items: AdminWithdrawalView[] = rows.map((r) => ({
    id: r.id,
    amountVnd: r.amountVnd,
    status: toApiWithdrawalStatus(r.status),
    bankCode: r.bankCode,
    bankAccountNumber: r.bankAccountNumber,
    bankAccountHolder: r.bankAccountHolder,
    note: r.note,
    requestedAt: r.requestedAt.toISOString(),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    transferReference: r.transferReference,
    rejectionReason: r.rejectionReason,
    ptId: r.ptId,
    ptFullName: r.ptFullName,
  }));

  return { items, totalItems: countRows[0]?.n ?? 0 };
};

// ── 5. approveWithdrawal (admin) ──────────────────────────────
export const approveWithdrawal = async (
  withdrawalId: string,
  adminUserId: string,
  body: ApproveWithdrawalBody,
): Promise<WithdrawalView> => {
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .limit(1);

    if (!existing) {
      throw new PtEarningsError(
        404,
        'WITHDRAWAL_NOT_FOUND',
        'Withdrawal not found',
      );
    }
    if (existing.status !== 'pending_approval') {
      throw new PtEarningsError(
        409,
        'WITHDRAWAL_ALREADY_REVIEWED',
        `Withdrawal already ${existing.status}`,
      );
    }

    const now = new Date();
    const [row] = await tx
      .update(withdrawals)
      .set({
        status: 'completed',
        reviewedByAdminId: adminUserId,
        reviewedAt: now,
        transferReference: body.transferReference,
        updatedAt: now,
      })
      .where(eq(withdrawals.id, withdrawalId))
      .returning();

    return row!;
  });

  // Fire-and-forget approval email. Email failure does NOT roll back state.
  const [pt] = await db
    .select({ email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, updated.ptId))
    .limit(1);
  if (pt) {
    void sendWithdrawalApprovedEmail(
      pt.email,
      pt.fullName,
      updated.amountVnd,
      updated.transferReference ?? '',
    );
  }

  return mapWithdrawal(updated);
};

// ── 6. rejectWithdrawal (admin) ───────────────────────────────
export const rejectWithdrawal = async (
  withdrawalId: string,
  adminUserId: string,
  body: RejectWithdrawalBody,
): Promise<WithdrawalView> => {
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(withdrawals)
      .where(eq(withdrawals.id, withdrawalId))
      .limit(1);

    if (!existing) {
      throw new PtEarningsError(
        404,
        'WITHDRAWAL_NOT_FOUND',
        'Withdrawal not found',
      );
    }
    if (existing.status !== 'pending_approval') {
      throw new PtEarningsError(
        409,
        'WITHDRAWAL_ALREADY_REVIEWED',
        `Withdrawal already ${existing.status}`,
      );
    }

    const now = new Date();
    const [row] = await tx
      .update(withdrawals)
      .set({
        status: 'rejected',
        reviewedByAdminId: adminUserId,
        reviewedAt: now,
        rejectionReason: body.reason,
        updatedAt: now,
      })
      .where(eq(withdrawals.id, withdrawalId))
      .returning();

    return row!;
  });

  const [pt] = await db
    .select({ email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.id, updated.ptId))
    .limit(1);
  if (pt) {
    void sendWithdrawalRejectedEmail(
      pt.email,
      pt.fullName,
      updated.amountVnd,
      body.reason,
    );
  }

  return mapWithdrawal(updated);
};

// ── Shared with the payment webhook ───────────────────────────

export interface RecordEarningInput {
  ptId: string;
  transactionId: string;
  courseId: string;
  enrollmentId: string;
  amountVnd: number;
  paidAt: Date;
}

/**
 * Insert a pt_earnings row inside an open DB transaction (webhook flow).
 * Idempotent via pt_earnings_transaction_uq. Never throws on missing PT
 * profile — logs and skips so the webhook can still return 200.
 *
 * NOTE: this is called from payment.service.ts inside the webhook's open
 * transaction (the same one that flips transactions.status → 'paid' and
 * inserts the enrollments row).
 */
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const recordPtEarning = async (
  tx: DbTx,
  input: RecordEarningInput,
): Promise<void> => {
  const [profile] = await tx
    .select({ commissionPercent: ptProfiles.commissionPercent })
    .from(ptProfiles)
    .where(eq(ptProfiles.userId, input.ptId))
    .limit(1);

  if (!profile) {
    console.error(
      '[payment] PT profile missing during earnings creation — manual review required',
      { txnId: input.transactionId, ptId: input.ptId },
    );
    return;
  }

  const [existing] = await tx
    .select({ id: ptEarnings.id })
    .from(ptEarnings)
    .where(eq(ptEarnings.transactionId, input.transactionId))
    .limit(1);
  if (existing) return;

  const commissionPercent = profile.commissionPercent;
  const platformFeeVnd = Math.floor(
    (input.amountVnd * commissionPercent) / 100,
  );
  const netVnd = input.amountVnd - platformFeeVnd;

  const availableAt = new Date(input.paidAt.getTime() + HOLD_DAYS * DAY_MS);

  await tx.insert(ptEarnings).values({
    ptId: input.ptId,
    transactionId: input.transactionId,
    courseId: input.courseId,
    enrollmentId: input.enrollmentId,
    grossVnd: input.amountVnd,
    platformFeeVnd,
    netVnd,
    commissionPercentSnapshot: commissionPercent,
    status: 'on_hold',
    availableAt,
  });
};
