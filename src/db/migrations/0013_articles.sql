DO $$ BEGIN
 CREATE TYPE "article_status" AS ENUM('draft', 'published', 'archived');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "article_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(280) NOT NULL,
	"title" varchar(200) NOT NULL,
	"excerpt" varchar(300) NOT NULL,
	"body" text NOT NULL,
	"category_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"cover_image_url" varchar(512),
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"reading_time_min" integer DEFAULT 1 NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"status" "article_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "article_categories_display_order_idx" ON "article_categories" ("display_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_status_published_idx" ON "articles" ("status","published_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_category_idx" ON "articles" ("category_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "articles" ADD CONSTRAINT "articles_category_id_article_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "article_categories"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "articles" ADD CONSTRAINT "articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "articles" ADD CONSTRAINT "articles_title_check" CHECK (char_length(trim(title)) >= 3);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "articles" ADD CONSTRAINT "articles_excerpt_check" CHECK (char_length(trim(excerpt)) >= 20);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "articles" ADD CONSTRAINT "articles_body_check" CHECK (char_length(trim(body)) >= 50);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- pg_trgm enabled by migration 0004; safe-create here for robustness.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_title_trgm_idx" ON "articles" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "articles_tags_gin_idx" ON "articles" USING gin ("tags");--> statement-breakpoint
-- Seed initial categories (idempotent).
INSERT INTO "article_categories" ("slug", "name", "display_order") VALUES
  ('nutrition',  'Dinh dưỡng',        0),
  ('training',   'Luyện tập',         1),
  ('lifestyle',  'Lối sống',          2),
  ('recipes',    'Công thức nấu ăn',  3),
  ('motivation', 'Động lực',          4)
ON CONFLICT ("slug") DO NOTHING;
