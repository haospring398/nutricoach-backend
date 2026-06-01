import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './user.model';

// Lowercase in DB, uppercase in API — same convention as course/pt enums.
export const articleStatusEnum = pgEnum('article_status', [
  'draft',
  'published',
  'archived',
]);

export const articleCategories = pgTable(
  'article_categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    displayOrderIdx: index('article_categories_display_order_idx').on(
      t.displayOrder,
    ),
  }),
);

export const articles = pgTable(
  'articles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    // Server-generated from the title; immutable after creation.
    slug: varchar('slug', { length: 280 }).notNull().unique(),
    title: varchar('title', { length: 200 }).notNull(),
    excerpt: varchar('excerpt', { length: 300 }).notNull(),
    // Markdown, stored and returned raw — never rendered to HTML server-side.
    body: text('body').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => articleCategories.id, { onDelete: 'restrict' }),
    // v1: always an admin user.
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    coverImageUrl: varchar('cover_image_url', { length: 512 }),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Server-computed from body (200 wpm); recomputed on body change.
    readingTimeMin: integer('reading_time_min').notNull().default(1),
    viewCount: integer('view_count').notNull().default(0),
    status: articleStatusEnum('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusPublishedIdx: index('articles_status_published_idx').on(
      t.status,
      t.publishedAt,
    ),
    categoryIdx: index('articles_category_idx').on(t.categoryId),
    // The pg_trgm GIN index on title, the GIN index on tags, and the CHECK
    // constraints live in the migration SQL (drizzle-kit 0.20 can't express
    // them).
  }),
);

export type ArticleCategory = typeof articleCategories.$inferSelect;
export type NewArticleCategory = typeof articleCategories.$inferInsert;
export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;
