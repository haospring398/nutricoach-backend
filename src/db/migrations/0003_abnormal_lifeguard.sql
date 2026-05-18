DO $$ BEGIN
 CREATE TYPE "food_log_source" AS ENUM('MANUAL', 'SCAN');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "meal_type" AS ENUM('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"food_name" varchar(200) NOT NULL,
	"calories" integer NOT NULL,
	"protein_g" numeric(6, 2) DEFAULT '0' NOT NULL,
	"carbs_g" numeric(6, 2) DEFAULT '0' NOT NULL,
	"fat_g" numeric(6, 2) DEFAULT '0' NOT NULL,
	"portion" numeric(4, 2) DEFAULT '1' NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"consumed_at" timestamp NOT NULL,
	"source_type" "food_log_source" DEFAULT 'MANUAL' NOT NULL,
	"scan_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
