DO $$ BEGIN
 CREATE TYPE "difficulty" AS ENUM('beginner', 'intermediate', 'advanced');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "equipment" AS ENUM('bodyweight', 'dumbbell', 'barbell', 'machine', 'kettlebell', 'band', 'cable', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "muscle_group" AS ENUM('chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'core', 'cardio', 'full_body');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exercises" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name_vi" varchar(200) NOT NULL,
	"name_en" varchar(200) NOT NULL,
	"muscle_groups" muscle_group[] NOT NULL,
	"equipment" "equipment" NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"calories_per_minute" numeric(5, 2) NOT NULL,
	"thumbnail_url" varchar(512),
	"animation_2d_url" varchar(512),
	"youtube_video_id" varchar(32),
	"instructions" jsonb,
	"common_mistakes" jsonb,
	"variations" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_exercise_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" varchar(64) NOT NULL,
	"exercise_name_snapshot" varchar(200) NOT NULL,
	"order_index" integer NOT NULL,
	"set_number" integer NOT NULL,
	"reps" integer,
	"weight_kg" numeric(6, 2),
	"duration_sec" integer,
	"rest_sec" integer DEFAULT 0 NOT NULL,
	"rpe" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"estimated_calories_burned" integer DEFAULT 0 NOT NULL,
	"calories_burned" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_equipment_idx" ON "exercises" ("equipment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_difficulty_idx" ON "exercises" ("difficulty");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_exercise_logs_session_idx" ON "session_exercise_logs" ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workout_sessions_user_performed_idx" ON "workout_sessions" ("user_id","performed_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_muscle_groups_gin" ON "exercises" USING gin ("muscle_groups");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_name_vi_trgm" ON "exercises" USING gin ("name_vi" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_name_en_trgm" ON "exercises" USING gin ("name_en" gin_trgm_ops);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_exercise_logs" ADD CONSTRAINT "session_exercise_logs_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "workout_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_exercise_logs" ADD CONSTRAINT "session_exercise_logs_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
