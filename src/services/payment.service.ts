import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../config/db';
import { cache } from '../config/redis';
import { users } from '../models/user.model';
import {
  subscriptions,
  transactions,
  type Transaction,
} from '../models/payment.model';
import { courses, enrollments } from '../models/course.model';
import { ApiError } from '../lib/api-error';
import { payos } from './payment/payos.client';
import { PRO_PLANS, type ProPlan } from './payment/plans';
import { resolvePtCoursePrice } from './course.service';
import { recordPtEarning } from './pt-earnings.service';

export class PaymentError extends ApiError {}

// ── Enum types ────────────────────────────────────────────────
type ProductTypeDb = 'pro_monthly' | 'pro_yearly' | 'pt_course';
type TxnStatusDb = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';
type ApiProductType = 'PRO_MONTHLY' | 'PRO_YEARLY' | 'PT_COURSE';
type ApiTxnStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
type ApiSubStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'NONE';

const toApiEnum = <T extends string>(v: T): Uppercase<T> =>
  v.toUpperCase() as Uppercase<T>;

const DAY_MS = 86_400_000;
const IDEM_TTL_SECONDS = 86_400; // 24h

// ── Response shapes ───────────────────────────────────────────
export interface CheckoutResponse {
  transactionId: string;
  orderCode: number;
  productType: ApiProductType;
  amountVnd: number;
  status: ApiTxnStatus;
  paymentLinkId: string | null;
  checkoutUrl: string | null;
  qrCode: string | null;
  expiresAt: string | null;
}

export interface TransactionItem {
  id: string;
  orderCode: number;
  productType: ApiProductType;
  amountVnd: number;
  status: ApiTxnStatus;
  paymentLinkId: string | null;
  checkoutUrl: string | null;
  reference: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface TransactionsPage {
  items: TransactionItem[];
  totalItems: number;
}

export interface SubscriptionResponse {
  status: ApiSubStatus;
  plan: ApiProductType | null;
  startedAt: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  daysRemaining: number;
}

export interface WebhookResult {
  received: true;
  action:
    | 'paid'
    | 'already_paid'
    | 'unknown_order'
    | 'amount_mismatch';
}

// ── Helpers ───────────────────────────────────────────────────

// Monotonic, collision-resistant int64 that stays well under 2^53.
const generateOrderCode = (): number =>
  Number(
    `${Date.now()}${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`,
  );

const idemKey = (userId: string, key: string): string =>
  `idem:checkout:${userId}:${key}`;

const mapTransaction = (row: Transaction): TransactionItem => ({
  id: row.id,
  orderCode: row.orderCode,
  productType: toApiEnum(row.productType),
  amountVnd: row.amountVnd,
  status: toApiEnum(row.status),
  paymentLinkId: row.paymentLinkId,
  checkoutUrl: row.checkoutUrl,
  reference: row.reference,
  paidAt: row.paidAt ? row.paidAt.toISOString() : null,
  expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
});

// ── 1. createCheckout ─────────────────────────────────────────

export interface CreateCheckoutInput {
  userId: string;
  productType: ApiProductType;
  productId?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

interface ResolvedProduct {
  dbProductType: ProductTypeDb;
  productRefId: string | null;
  priceVnd: number;
  label: string;
  // PayOS description is ASCII and length-capped.
  description: string;
}

const resolveProduct = async (
  userId: string,
  productType: ApiProductType,
  productId: string | undefined,
): Promise<ResolvedProduct> => {
  if (productType === 'PRO_MONTHLY' || productType === 'PRO_YEARLY') {
    const dbProductType = productType.toLowerCase() as ProPlan;
    const plan = PRO_PLANS[dbProductType];
    return {
      dbProductType,
      productRefId: null,
      priceVnd: plan.priceVnd,
      label: plan.label,
      description: 'NutriCoach PRO',
    };
  }

  // PT_COURSE — productId is enforced by the validation layer.
  if (!productId) {
    throw new PaymentError(
      400,
      'VALIDATION_ERROR',
      'productId is required for PT_COURSE',
    );
  }
  const { priceVnd, label } = await resolvePtCoursePrice(userId, productId);
  return {
    dbProductType: 'pt_course',
    productRefId: productId,
    priceVnd,
    label,
    description: 'NutriCoach PT Course',
  };
};

export const createCheckout = async (
  input: CreateCheckoutInput,
  idempotencyKey: string,
): Promise<{ data: CheckoutResponse; replayed: boolean }> => {
  const cacheKey = idemKey(input.userId, idempotencyKey);

  const cached = await cache.get<CheckoutResponse>(cacheKey);
  if (cached) {
    return { data: cached, replayed: true };
  }

  const resolved = await resolveProduct(
    input.userId,
    input.productType,
    input.productId,
  );

  const orderCode = generateOrderCode();

  const [txn] = await db
    .insert(transactions)
    .values({
      userId: input.userId,
      orderCode,
      productType: resolved.dbProductType,
      productRefId: resolved.productRefId,
      amountVnd: resolved.priceVnd,
      status: 'pending',
    })
    .returning();

  if (!txn) {
    throw new PaymentError(
      500,
      'INTERNAL_ERROR',
      'Failed to create transaction',
    );
  }

  const returnUrl = input.returnUrl ?? 'nutricoach://payment/success';
  const cancelUrl = input.cancelUrl ?? 'nutricoach://payment/cancel';

  let link;
  try {
    link = await payos.createPaymentLink({
      orderCode,
      amount: resolved.priceVnd,
      // PayOS caps description length — keep it short and ASCII.
      description: resolved.description,
      returnUrl,
      cancelUrl,
      items: [
        { name: resolved.label, quantity: 1, price: resolved.priceVnd },
      ],
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'PayOS error';
    await db
      .update(transactions)
      .set({
        status: 'failed',
        failureReason: reason.slice(0, 200),
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, txn.id));
    throw new PaymentError(
      503,
      'PAYOS_UNAVAILABLE',
      'Payment provider is unavailable, please try again',
    );
  }

  const expiresAt =
    typeof link.expiredAt === 'number'
      ? new Date(link.expiredAt * 1000)
      : null;

  await db
    .update(transactions)
    .set({
      paymentLinkId: link.paymentLinkId,
      checkoutUrl: link.checkoutUrl,
      expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, txn.id));

  const data: CheckoutResponse = {
    transactionId: txn.id,
    orderCode,
    productType: input.productType,
    amountVnd: resolved.priceVnd,
    status: 'PENDING',
    paymentLinkId: link.paymentLinkId,
    checkoutUrl: link.checkoutUrl,
    qrCode: link.qrCode,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };

  await cache.set(cacheKey, data, IDEM_TTL_SECONDS);
  return { data, replayed: false };
};

// ── 2. handlePayosWebhook ─────────────────────────────────────

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const handlePayosWebhook = async (
  webhookBody: unknown,
): Promise<WebhookResult> => {
  // verifyPaymentWebhookData is synchronous and throws on a bad signature.
  let verified;
  try {
    verified = payos.verifyPaymentWebhookData(
      webhookBody as Parameters<typeof payos.verifyPaymentWebhookData>[0],
    );
  } catch {
    throw new PaymentError(
      401,
      'INVALID_SIGNATURE',
      'Webhook signature verification failed',
    );
  }

  const { orderCode, amount, reference, transactionDateTime } = verified;

  const [txn] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.orderCode, orderCode))
    .limit(1);

  if (!txn) {
    console.warn('[payment] webhook for unknown orderCode:', orderCode);
    return { received: true, action: 'unknown_order' };
  }

  // Idempotency — PayOS retries; an already-paid txn is a no-op.
  if (txn.status === 'paid') {
    return { received: true, action: 'already_paid' };
  }

  // Amount mismatch is a security event — never flip status.
  if (txn.amountVnd !== amount) {
    console.error(
      '[payment] webhook amount mismatch for orderCode',
      orderCode,
      'expected',
      txn.amountVnd,
      'received',
      amount,
    );
    return { received: true, action: 'amount_mismatch' };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({
        status: 'paid',
        reference,
        paidAt: transactionDateTime
          ? new Date(transactionDateTime)
          : new Date(),
        rawWebhookPayload: webhookBody as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, txn.id));

    if (
      txn.productType === 'pro_monthly' ||
      txn.productType === 'pro_yearly'
    ) {
      await activateProSubscription(tx, txn);
    } else if (txn.productType === 'pt_course') {
      await activateCourseEnrollment(tx, txn);
    }
  });

  return { received: true, action: 'paid' };
};

// ── 3. activateProSubscription (runs inside a DB transaction) ──

const activateProSubscription = async (
  tx: DbTx,
  txn: Transaction,
): Promise<void> => {
  const plan = txn.productType as ProPlan;
  const durationDays = PRO_PLANS[plan].durationDays;
  const now = new Date();

  const [existing] = await tx
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, txn.userId),
        eq(subscriptions.status, 'active'),
      ),
    )
    .limit(1);

  if (existing && existing.expiresAt > now) {
    // Mid-period upgrade/renewal — extend from the current expiry.
    const expiresAt = new Date(
      existing.expiresAt.getTime() + durationDays * DAY_MS,
    );
    await tx
      .update(subscriptions)
      .set({
        plan,
        expiresAt,
        lastTransactionId: txn.id,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, existing.id));
  } else {
    if (existing) {
      // Stale active row whose expiry has passed — retire it.
      await tx
        .update(subscriptions)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(subscriptions.id, existing.id));
    }
    const expiresAt = new Date(now.getTime() + durationDays * DAY_MS);
    await tx.insert(subscriptions).values({
      userId: txn.userId,
      plan,
      status: 'active',
      startedAt: now,
      expiresAt,
      autoRenew: false,
      lastTransactionId: txn.id,
    });
  }

  // Flip the denormalized tier flag (DB enum is uppercase).
  await tx
    .update(users)
    .set({ tier: 'PRO', updatedAt: now })
    .where(eq(users.id, txn.userId));
};

// ── 3b. activateCourseEnrollment (runs inside a DB transaction) ──

const activateCourseEnrollment = async (
  tx: DbTx,
  txn: Transaction,
): Promise<void> => {
  if (!txn.productRefId) {
    console.error(
      '[payment] pt_course txn without productRefId — manual review required',
      txn.id,
    );
    return;
  }

  // Honor the purchase even if status changed between checkout and pay —
  // user paid in good faith. Log loudly so an operator can intervene.
  const [course] = await tx
    .select()
    .from(courses)
    .where(eq(courses.id, txn.productRefId))
    .limit(1);

  if (!course) {
    console.error(
      '[payment] course not found for paid pt_course txn — manual review required',
      { txnId: txn.id, productRefId: txn.productRefId },
    );
    return;
  }

  if (course.status === 'archived') {
    console.warn(
      '[payment] course archived between checkout and pay; creating enrollment anyway',
      { txnId: txn.id, courseId: course.id },
    );
  }

  // Idempotency — the enrollments_transaction_uq index would also catch a
  // double-insert, but skipping the round-trip avoids a noisy error log.
  const [existing] = await tx
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(eq(enrollments.transactionId, txn.id))
    .limit(1);

  if (existing) return;

  const [enrollment] = await tx
    .insert(enrollments)
    .values({
      userId: txn.userId,
      courseId: course.id,
      ptId: course.ptId,
      transactionId: txn.id,
      status: 'active',
      enrolledAt: new Date(),
    })
    .returning();

  if (!enrollment) {
    console.error(
      '[payment] enrollment insert returned no row — earnings skipped',
      { txnId: txn.id },
    );
    return;
  }

  // Phase 4: capture the PT's earning in the same DB transaction.
  // Idempotent via pt_earnings_transaction_uq; failures inside the helper
  // log + skip so the webhook can still complete.
  await recordPtEarning(tx, {
    ptId: course.ptId,
    transactionId: txn.id,
    courseId: course.id,
    enrollmentId: enrollment.id,
    amountVnd: txn.amountVnd,
    paidAt: txn.paidAt ?? new Date(),
  });
};

// ── 4. listTransactions ───────────────────────────────────────

export const listTransactions = async (
  userId: string,
  opts: { page: number; limit: number; status?: ApiTxnStatus },
): Promise<TransactionsPage> => {
  const filters = [eq(transactions.userId, userId)];
  if (opts.status) {
    filters.push(
      eq(transactions.status, opts.status.toLowerCase() as TxnStatusDb),
    );
  }
  const where = filters.length === 1 ? filters[0] : and(...filters);

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(where)
      .orderBy(desc(transactions.createdAt))
      .limit(opts.limit)
      .offset((opts.page - 1) * opts.limit),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(where),
  ]);

  return {
    items: rows.map(mapTransaction),
    totalItems: countRows[0]?.n ?? 0,
  };
};

// ── 5. getSubscription ────────────────────────────────────────

export const getSubscription = async (
  userId: string,
): Promise<SubscriptionResponse> => {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, 'active'),
      ),
    )
    .limit(1);

  if (!sub) {
    return {
      status: 'NONE',
      plan: null,
      startedAt: null,
      expiresAt: null,
      autoRenew: false,
      daysRemaining: 0,
    };
  }

  const now = Date.now();
  const expired = sub.expiresAt.getTime() <= now;
  const daysRemaining = expired
    ? 0
    : Math.max(0, Math.ceil((sub.expiresAt.getTime() - now) / DAY_MS));

  return {
    status: expired ? 'EXPIRED' : 'ACTIVE',
    plan: toApiEnum(sub.plan),
    startedAt: sub.startedAt.toISOString(),
    expiresAt: sub.expiresAt.toISOString(),
    autoRenew: sub.autoRenew,
    daysRemaining,
  };
};

// ── 6. isProActive — real-time PRO check ──────────────────────
// users.tier is a denormalized flag set to 'PRO' by activateProSubscription
// above but never flipped back to 'FREE' on natural expiry (there is no
// cron/scheduler). Any call site that gates behavior on PRO status (scan
// daily limit, AI meal-plan payload, etc.) must check the subscription's real
// expiry here instead of trusting the stale users.tier column.
export const isProActive = async (userId: string): Promise<boolean> => {
  const [sub] = await db
    .select({ expiresAt: subscriptions.expiresAt })
    .from(subscriptions)
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')),
    )
    .limit(1);

  return !!sub && sub.expiresAt.getTime() > Date.now();
};
