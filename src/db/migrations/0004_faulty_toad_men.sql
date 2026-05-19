CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "food_data_completeness" AS ENUM('FULL', 'PARTIAL', 'CALORIES_ONLY');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "food_type" AS ENUM('INGREDIENT', 'DISH');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" varchar(32) NOT NULL,
	"source" varchar(32) DEFAULT 'VN_NIN' NOT NULL,
	"type" "food_type" NOT NULL,
	"name_vi" varchar(255) NOT NULL,
	"name_en" varchar(255),
	"category" varchar(255) NOT NULL,
	"calories_kcal" numeric(7, 2) NOT NULL,
	"protein_g" numeric(6, 2),
	"total_fat_g" numeric(6, 2),
	"carbohydrate_g" numeric(6, 2),
	"sugar_g" numeric(6, 2),
	"calcium_mg" numeric(8, 2),
	"iron_mg" numeric(6, 2),
	"sodium_mg" numeric(8, 2),
	"potassium_mg" numeric(8, 2),
	"vitamin_c_mg" numeric(6, 2),
	"vitamin_a_iu" numeric(8, 2),
	"micronutrients" jsonb,
	"data_completeness" "food_data_completeness" NOT NULL,
	"is_verified" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_items_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "food_logs" ALTER COLUMN "protein_g" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "food_logs" ALTER COLUMN "carbs_g" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "food_logs" ALTER COLUMN "fat_g" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "food_logs" ADD COLUMN "food_item_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_food_item_id_food_items_id_fk" FOREIGN KEY ("food_item_id") REFERENCES "food_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_items_name_vi_trgm" ON "food_items" USING gin ("name_vi" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_items_name_en_trgm" ON "food_items" USING gin ("name_en" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_items_type_idx" ON "food_items" ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_items_category_idx" ON "food_items" ("category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_logs_food_item_id_idx" ON "food_logs" ("food_item_id");
--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_source_check" CHECK (food_item_id IS NOT NULL OR food_name IS NOT NULL);
