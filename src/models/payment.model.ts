import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './user.model';

// Payment enums are stored lowercase in DB; API responses uppercase them.
export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'paid',
  'failed',
  'expired',
  'cancelled',
]);

export const productTypeEnum = pgEnum('product_type', [
  'pro_monthly',
  'pro_yearly',
  'pt_course', // reserved for the future PT module
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'expired',
  'cancelled',
]);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    orderCode: bigint('order_code', { mode: 'number' })
      .notNull()
      .unique(),
    productType: productTypeEnum('product_type').notNull(),
    productRefId: varchar('product_ref_id', { length: 64 }),
    amountVnd: integer('amount_vnd').notNull(),
    status: transactionStatusEnum('status').notNull().default('pending'),
    paymentLinkId: varchar('payment_link_id', { length: 64 }),
    checkoutUrl: varchar('checkout_url', { length: 512 }),
    reference: varchar('reference', { length: 64 }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    failureReason: varchar('failure_reason', { length: 200 }),
    rawWebhookPayload: jsonb('raw_webhook_payload'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdIdx: index('transactions_user_id_idx').on(t.userId),
    statusIdx: index('transactions_status_idx').on(t.status),
  }),
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plan: productTypeEnum('plan').notNull(),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    autoRenew: boolean('auto_renew').notNull().default(false),
    lastTransactionId: uuid('last_transaction_id').references(
      () => transactions.id,
    ),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdIdx: index('subscriptions_user_id_idx').on(t.userId),
    // The partial unique index (one ACTIVE subscription per user) and the
    // plan CHECK constraint cannot be expressed in drizzle-kit 0.20's DSL —
    // they are added as raw SQL in the migration file.
  }),
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
