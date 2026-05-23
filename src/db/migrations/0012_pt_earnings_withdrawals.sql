DO $$ BEGIN
 CREATE TYPE "earnings_status" AS ENUM('on_hold', 'available', 'refunded', 'paid_out');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "withdrawal_status" AS ENUM('pending_approval', 'completed', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pt_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"gross_vnd" integer NOT NULL,
	"platform_fee_vnd" integer NOT NULL,
	"net_vnd" integer NOT NULL,
	"commission_percent_snapshot" integer NOT NULL,
	"status" "earnings_status" DEFAULT 'on_hold' NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pt_earnings_transaction_uq" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "withdrawals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"amount_vnd" integer NOT NULL,
	"bank_code" varchar(16) NOT NULL,
	"bank_account_number" varchar(32) NOT NULL,
	"bank_account_holder" varchar(100) NOT NULL,
	"status" "withdrawal_status" DEFAULT 'pending_approval' NOT NULL,
	"idempotency_key" varchar(64) NOT NULL,
	"note" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by_admin_id" uuid,
	"reviewed_at" timestamp with time zone,
	"transfer_reference" varchar(64),
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "withdrawals_pt_idem_uq" UNIQUE("pt_id","idempotency_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pt_earnings_pt_id_idx" ON "pt_earnings" ("pt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pt_earnings_status_available_at_idx" ON "pt_earnings" ("status","available_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawals_pt_id_idx" ON "withdrawals" ("pt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawals_status_idx" ON "withdrawals" ("status");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_earnings" ADD CONSTRAINT "pt_earnings_pt_id_users_id_fk" FOREIGN KEY ("pt_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_earnings" ADD CONSTRAINT "pt_earnings_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_earnings" ADD CONSTRAINT "pt_earnings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_earnings" ADD CONSTRAINT "pt_earnings_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_pt_id_users_id_fk" FOREIGN KEY ("pt_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_reviewed_by_admin_id_users_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_earnings" ADD CONSTRAINT "pt_earnings_amounts_check" CHECK (
   gross_vnd >= 0 AND platform_fee_vnd >= 0 AND net_vnd >= 0
   AND net_vnd = gross_vnd - platform_fee_vnd
 );
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_earnings" ADD CONSTRAINT "pt_earnings_commission_check" CHECK (commission_percent_snapshot BETWEEN 0 AND 50);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_amount_check" CHECK (amount_vnd >= 200000 AND amount_vnd % 1000 = 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- ============================================================================
-- Backfill: create pt_earnings rows for every existing paid pt_course
-- transaction. Idempotent via ON CONFLICT on the transaction_id unique index.
--
-- Only 'paid' transactions are backfilled — the transaction_status enum has
-- no 'refunded' value (refunds are not yet wired in the payment module), so
-- every backfilled row starts in 'on_hold'.
--
-- commission_percent_snapshot uses the CURRENT pt_profiles.commission_percent.
-- This is imperfect — if a PT's rate had changed between when their
-- transactions paid and when this migration runs, accuracy is lost. Accepted
-- because the rate has not changed before Phase 4 ships (only dev/staging
-- seed data exists).
-- ============================================================================
INSERT INTO pt_earnings (
  pt_id, transaction_id, course_id, enrollment_id,
  gross_vnd, platform_fee_vnd, net_vnd, commission_percent_snapshot,
  status, available_at
)
SELECT
  c.pt_id,
  t.id,
  c.id,
  e.id,
  t.amount_vnd,
  FLOOR(t.amount_vnd * pp.commission_percent / 100.0)::integer,
  (t.amount_vnd - FLOOR(t.amount_vnd * pp.commission_percent / 100.0)::integer),
  pp.commission_percent,
  'on_hold'::earnings_status,
  COALESCE(t.paid_at, t.created_at) + interval '7 days'
FROM transactions t
JOIN enrollments e ON e.transaction_id = t.id
JOIN courses c ON c.id = e.course_id
JOIN pt_profiles pp ON pp.user_id = c.pt_id
WHERE t.product_type = 'pt_course'
  AND t.status = 'paid'
ON CONFLICT (transaction_id) DO NOTHING;
