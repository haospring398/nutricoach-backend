DO $$ BEGIN
 CREATE TYPE "verification_status" AS ENUM('pending_review', 'approved', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pt_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"bio" text NOT NULL,
	"specialties" text[] NOT NULL,
	"years_of_experience" integer NOT NULL,
	"bank_code" varchar(16) NOT NULL,
	"bank_account_number" varchar(32) NOT NULL,
	"bank_account_holder" varchar(100) NOT NULL,
	"commission_percent" integer DEFAULT 10 NOT NULL,
	"approved_from_verification_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pt_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pt_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" varchar(100) NOT NULL,
	"date_of_birth" date NOT NULL,
	"citizen_id_number" varchar(32) NOT NULL,
	"citizen_id_front_key" varchar(256) NOT NULL,
	"citizen_id_back_key" varchar(256) NOT NULL,
	"certificates" jsonb NOT NULL,
	"specialties" text[] NOT NULL,
	"years_of_experience" integer NOT NULL,
	"bio" text NOT NULL,
	"bank_code" varchar(16) NOT NULL,
	"bank_account_number" varchar(32) NOT NULL,
	"bank_account_holder" varchar(100) NOT NULL,
	"status" "verification_status" DEFAULT 'pending_review' NOT NULL,
	"reviewed_by_admin_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"require_resubmit" boolean DEFAULT false,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pt_verifications_user_id_idx" ON "pt_verifications" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pt_verifications_status_idx" ON "pt_verifications" ("status");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_profiles" ADD CONSTRAINT "pt_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_profiles" ADD CONSTRAINT "pt_profiles_approved_from_verification_id_pt_verifications_id_fk" FOREIGN KEY ("approved_from_verification_id") REFERENCES "pt_verifications"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_verifications" ADD CONSTRAINT "pt_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_verifications" ADD CONSTRAINT "pt_verifications_reviewed_by_admin_id_users_id_fk" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_verifications" ADD CONSTRAINT "pt_verifications_age_check" CHECK (date_of_birth <= now() - interval '18 years');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_verifications" ADD CONSTRAINT "pt_verifications_experience_check" CHECK (years_of_experience BETWEEN 0 AND 60);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_profiles" ADD CONSTRAINT "pt_profiles_commission_check" CHECK (commission_percent BETWEEN 0 AND 50);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pt_verifications_one_pending_per_user" ON "pt_verifications" ("user_id") WHERE status = 'pending_review';
