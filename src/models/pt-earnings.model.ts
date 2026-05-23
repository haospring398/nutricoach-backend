import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './user.model';
import { transactions } from './payment.model';
import { courses, enrollments } from './course.model';

// `paid_out` is reserved for a future "match individual earning rows to a
// specific withdrawal" feature. Phase 4 never writes it — balance math
// derives from SUM filters, not per-row tagging.
export const earningsStatusEnum = pgEnum('earnings_status', [
  'on_hold',
  'available',
  'refunded',
  'paid_out',
]);

export const withdrawalStatusEnum = pgEnum('withdrawal_status', [
  'pending_approval',
  'completed',
  'rejected',
]);

export const ptEarnings = pgTable(
  'pt_earnings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ptId: uuid('pt_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'restrict' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    enrollmentId: uuid('enrollment_id')
      .notNull()
      .references(() => enrollments.id, { onDelete: 'restrict' }),

    grossVnd: integer('gross_vnd').notNull(),
    platformFeeVnd: integer('platform_fee_vnd').notNull(),
    netVnd: integer('net_vnd').notNull(),
    // Snapshot at the moment of payment. Immutable; later commission
    // rate changes do not retroactively rewrite earnings.
    commissionPercentSnapshot: integer('commission_percent_snapshot').notNull(),

    status: earningsStatusEnum('status').notNull().default('on_hold'),
    // paid_at + 7 days. The on_hold → available transition is computed on
    // read (CASE expression); no background cron mutates this column.
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    ptIdIdx: index('pt_earnings_pt_id_idx').on(t.ptId),
    transactionUq: unique('pt_earnings_transaction_uq').on(t.transactionId),
    statusAvailableAtIdx: index('pt_earnings_status_available_at_idx').on(
      t.status,
      t.availableAt,
    ),
    // CHECK constraints (amount math, commission bounds) live in the
    // migration — drizzle-kit 0.20 can't express CHECK.
  }),
);

export const withdrawals = pgTable(
  'withdrawals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ptId: uuid('pt_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    amountVnd: integer('amount_vnd').notNull(),

    // Snapshot at request time. If PT later changes their bank account via
    // PATCH /pt/me, in-flight withdrawals still pay to this account — a
    // security feature against credential-compromise redirects.
    bankCode: varchar('bank_code', { length: 16 }).notNull(),
    bankAccountNumber: varchar('bank_account_number', { length: 32 }).notNull(),
    bankAccountHolder: varchar('bank_account_holder', { length: 100 }).notNull(),

    status: withdrawalStatusEnum('status')
      .notNull()
      .default('pending_approval'),

    idempotencyKey: varchar('idempotency_key', { length: 64 }).notNull(),
    note: text('note'),

    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedByAdminId: uuid('reviewed_by_admin_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    transferReference: varchar('transfer_reference', { length: 64 }),
    rejectionReason: text('rejection_reason'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    ptIdIdx: index('withdrawals_pt_id_idx').on(t.ptId),
    statusIdx: index('withdrawals_status_idx').on(t.status),
    idempotencyUq: unique('withdrawals_pt_idem_uq').on(
      t.ptId,
      t.idempotencyKey,
    ),
  }),
);

export type PtEarning = typeof ptEarnings.$inferSelect;
export type NewPtEarning = typeof ptEarnings.$inferInsert;
export type Withdrawal = typeof withdrawals.$inferSelect;
export type NewWithdrawal = typeof withdrawals.$inferInsert;
