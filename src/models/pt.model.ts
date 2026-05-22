import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './user.model';

export const verificationStatusEnum = pgEnum('verification_status', [
  'pending_review',
  'approved',
  'rejected',
]);

export interface CertificateEntry {
  name: string;
  issuedBy: string;
  issuedAt: string; // ISO date string
  fileKey: string;
}

// The *application form*. Created on POST /pt/verification, never deleted.
// A user may have many rows (resubmit after rejection); at most one
// pending_review at a time (partial unique index, added in the migration).
export const ptVerifications = pgTable(
  'pt_verifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    fullName: varchar('full_name', { length: 100 }).notNull(),
    dateOfBirth: date('date_of_birth').notNull(),
    citizenIdNumber: varchar('citizen_id_number', { length: 32 }).notNull(),

    // File keys are opaque strings. Phase 1: out-of-band placeholders
    // (e.g. "zalo-submission-2026-05-21"). When S3 + presigned URLs ship,
    // these become real object keys — no schema change, the column stays
    // varchar(256). Do NOT add a CHECK requiring an "s3://" prefix.
    citizenIdFrontKey: varchar('citizen_id_front_key', {
      length: 256,
    }).notNull(),
    citizenIdBackKey: varchar('citizen_id_back_key', {
      length: 256,
    }).notNull(),

    certificates: jsonb('certificates')
      .notNull()
      .$type<CertificateEntry[]>(),
    specialties: text('specialties').array().notNull(),
    yearsOfExperience: integer('years_of_experience').notNull(),
    bio: text('bio').notNull(),

    bankCode: varchar('bank_code', { length: 16 }).notNull(),
    bankAccountNumber: varchar('bank_account_number', {
      length: 32,
    }).notNull(),
    bankAccountHolder: varchar('bank_account_holder', {
      length: 100,
    }).notNull(),

    status: verificationStatusEnum('status')
      .notNull()
      .default('pending_review'),
    reviewedByAdminId: uuid('reviewed_by_admin_id').references(
      () => users.id,
      { onDelete: 'set null' },
    ),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    requireResubmit: boolean('require_resubmit').default(false),

    submittedAt: timestamp('submitted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdIdx: index('pt_verifications_user_id_idx').on(t.userId),
    statusIdx: index('pt_verifications_status_idx').on(t.status),
  }),
);

// The *approved-PT data*. Created only when a verification is approved.
// One row per PT.
export const ptProfiles = pgTable('pt_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  bio: text('bio').notNull(),
  specialties: text('specialties').array().notNull(),
  yearsOfExperience: integer('years_of_experience').notNull(),

  bankCode: varchar('bank_code', { length: 16 }).notNull(),
  bankAccountNumber: varchar('bank_account_number', { length: 32 }).notNull(),
  bankAccountHolder: varchar('bank_account_holder', { length: 100 }).notNull(),

  // PT receives (100 - commissionPercent)% of each course sale.
  // Default 10. PT-readable, admin-editable in a future phase.
  commissionPercent: integer('commission_percent').notNull().default(10),

  approvedFromVerificationId: uuid('approved_from_verification_id').references(
    () => ptVerifications.id,
    { onDelete: 'set null' },
  ),

  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type PtVerification = typeof ptVerifications.$inferSelect;
export type NewPtVerification = typeof ptVerifications.$inferInsert;
export type PtProfile = typeof ptProfiles.$inferSelect;
export type NewPtProfile = typeof ptProfiles.$inferInsert;
