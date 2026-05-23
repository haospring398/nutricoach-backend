DO $$ BEGIN
 CREATE TYPE "pt_assignment_type" AS ENUM('meal_plan', 'exercise_addition');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pt_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"type" "pt_assignment_type" NOT NULL,
	"payload" jsonb NOT NULL,
	-- Self-pointer; intentionally NOT an FK. The row it points to may be
	-- deleted before this one in some lifecycle paths (e.g. enrollment
	-- cascade) and an FK would block that. Audit-only.
	"superseded_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"scheduled_for" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pt_assignments_pt_student_idx" ON "pt_assignments" ("pt_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pt_assignments_student_created_idx" ON "pt_assignments" ("student_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pt_assignments_enrollment_type_idx" ON "pt_assignments" ("enrollment_id","type");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_assignments" ADD CONSTRAINT "pt_assignments_pt_id_users_id_fk" FOREIGN KEY ("pt_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_assignments" ADD CONSTRAINT "pt_assignments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_assignments" ADD CONSTRAINT "pt_assignments_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pt_assignments" ADD CONSTRAINT "pt_assignments_payload_is_object" CHECK (jsonb_typeof(payload) = 'object');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- DB safety net behind the "PUT meal-plan replaces the current active plan"
-- semantic. The service uses a self-supersede trick to swap rows; the
-- partial unique index ensures correctness even under concurrent PUTs.
CREATE UNIQUE INDEX IF NOT EXISTS "pt_assignments_one_active_meal_plan_per_enrollment"
  ON "pt_assignments" ("enrollment_id") WHERE type = 'meal_plan' AND superseded_by IS NULL;
