import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../config/db';
import { ApiError } from '../lib/api-error';
import { slugify, computeReadingTimeMin } from '../lib/slug';
import { users } from '../models/user.model';
import {
  articleCategories,
  articles,
  type Article,
} from '../models/content.model';
import type {
  AdminListArticlesQuery,
  CreateArticleBody,
  CreateCategoryBody,
  ListArticlesQuery,
  PatchArticleBody,
} from '../validations/content.validation';

export class ContentError extends ApiError {}

type ArticleStatusDb = 'draft' | 'published' | 'archived';
type ApiArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

const toApiStatus = (s: ArticleStatusDb): ApiArticleStatus =>
  s.toUpperCase() as ApiArticleStatus;

// ── Response shapes ───────────────────────────────────────────
interface CategoryRef {
  slug: string;
  name: string;
}
interface AuthorRef {
  fullName: string;
  avatarUrl: string | null;
}

export interface ArticleListItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  category: CategoryRef;
  author: AuthorRef;
  tags: string[];
  readingTimeMin: number;
  viewCount: number;
  publishedAt: string | null;
}

// Admin list adds status; public list omits it.
export interface AdminArticleListItem extends ArticleListItem {
  status: ApiArticleStatus;
  createdAt: string;
}

export interface ArticleDetail extends ArticleListItem {
  body: string;
}

export interface ArticleAdminView {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  categoryId: string;
  coverImageUrl: string | null;
  tags: string[];
  readingTimeMin: number;
  viewCount: number;
  status: ApiArticleStatus;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryView {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
  articleCount: number;
}

export interface CategoryCreatedView {
  id: string;
  slug: string;
  name: string;
  displayOrder: number;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  totalItems: number;
}

// ── Mappers ───────────────────────────────────────────────────
const mapAdminView = (a: Article): ArticleAdminView => ({
  id: a.id,
  slug: a.slug,
  title: a.title,
  excerpt: a.excerpt,
  body: a.body,
  categoryId: a.categoryId,
  coverImageUrl: a.coverImageUrl,
  tags: a.tags,
  readingTimeMin: a.readingTimeMin,
  viewCount: a.viewCount,
  status: toApiStatus(a.status),
  publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
  archivedAt: a.archivedAt ? a.archivedAt.toISOString() : null,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

// Resolve a category slug → uuid. Returns null when the slug doesn't exist
// (callers treat that as "empty result", not an error).
const resolveCategoryId = async (slug: string): Promise<string | null> => {
  const [row] = await db
    .select({ id: articleCategories.id })
    .from(articleCategories)
    .where(eq(articleCategories.slug, slug))
    .limit(1);
  return row?.id ?? null;
};

// The list-card SELECT (no body), joined with category + author.
const listSelection = {
  id: articles.id,
  slug: articles.slug,
  title: articles.title,
  excerpt: articles.excerpt,
  coverImageUrl: articles.coverImageUrl,
  tags: articles.tags,
  readingTimeMin: articles.readingTimeMin,
  viewCount: articles.viewCount,
  status: articles.status,
  publishedAt: articles.publishedAt,
  createdAt: articles.createdAt,
  categorySlug: articleCategories.slug,
  categoryName: articleCategories.name,
  authorFullName: users.fullName,
  authorAvatarUrl: users.avatarUrl,
};

const toListItem = (r: {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImageUrl: string | null;
  tags: string[];
  readingTimeMin: number;
  viewCount: number;
  publishedAt: Date | null;
  categorySlug: string;
  categoryName: string;
  authorFullName: string;
  authorAvatarUrl: string | null;
}): ArticleListItem => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  excerpt: r.excerpt,
  coverImageUrl: r.coverImageUrl,
  category: { slug: r.categorySlug, name: r.categoryName },
  author: { fullName: r.authorFullName, avatarUrl: r.authorAvatarUrl },
  tags: r.tags,
  readingTimeMin: r.readingTimeMin,
  viewCount: r.viewCount,
  publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
});

// ── 1. listPublishedArticles ──────────────────────────────────
export const listPublishedArticles = async (
  query: ListArticlesQuery,
): Promise<Page<ArticleListItem>> => {
  const filters: SQL[] = [eq(articles.status, 'published')];

  if (query.category) {
    const categoryId = await resolveCategoryId(query.category);
    // Unknown category slug → empty result, not an error.
    if (!categoryId) return { items: [], totalItems: 0 };
    filters.push(eq(articles.categoryId, categoryId));
  }
  if (query.tag) {
    filters.push(sql`${articles.tags} @> ARRAY[${query.tag}]::text[]`);
  }
  if (query.search) {
    filters.push(sql`(
      similarity(${articles.title}, ${query.search}) > 0.2
      OR ${articles.title} ILIKE '%' || ${query.search} || '%'
    )`);
  }

  const where = filters.length === 1 ? filters[0] : and(...filters);
  const offset = (query.page - 1) * query.limit;

  const base = db
    .select(listSelection)
    .from(articles)
    .innerJoin(
      articleCategories,
      eq(articleCategories.id, articles.categoryId),
    )
    .innerJoin(users, eq(users.id, articles.authorId))
    .where(where)
    .limit(query.limit)
    .offset(offset);

  const rowsPromise = query.search
    ? base.orderBy(
        desc(
          sql<number>`GREATEST(similarity(${articles.title}, ${query.search}), 0)`,
        ),
        desc(articles.publishedAt),
      )
    : base.orderBy(desc(articles.publishedAt));

  const [rows, countRows] = await Promise.all([
    rowsPromise,
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(articles)
      .where(where),
  ]);

  return {
    items: rows.map(toListItem),
    totalItems: countRows[0]?.n ?? 0,
  };
};

// ── 2. getPublishedArticleBySlug ──────────────────────────────
export const getPublishedArticleBySlug = async (
  slug: string,
): Promise<ArticleDetail> => {
  const [row] = await db
    .select({ ...listSelection, body: articles.body })
    .from(articles)
    .innerJoin(
      articleCategories,
      eq(articleCategories.id, articles.categoryId),
    )
    .innerJoin(users, eq(users.id, articles.authorId))
    .where(and(eq(articles.slug, slug), eq(articles.status, 'published')))
    .limit(1);

  if (!row) {
    throw new ContentError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
  }

  // Fire-and-forget view increment — never blocks the response, never in a
  // transaction. A soft metric; log and move on if it fails.
  void db
    .update(articles)
    .set({ viewCount: sql`${articles.viewCount} + 1` })
    .where(eq(articles.id, row.id))
    .catch((err) => {
      console.error('[content] view_count increment failed', {
        articleId: row.id,
        err,
      });
    });

  return {
    ...toListItem(row),
    body: row.body,
    // Reflect the increment we just issued so the client sees a fresh count.
    viewCount: row.viewCount + 1,
  };
};

// ── 3. listCategories ─────────────────────────────────────────
export const listCategories = async (): Promise<CategoryView[]> => {
  const publishedCount = sql<number>`(
    SELECT COUNT(*)::int FROM ${articles}
    WHERE ${articles.categoryId} = ${articleCategories.id}
    AND ${articles.status} = 'published'
  )`;

  const rows = await db
    .select({
      id: articleCategories.id,
      slug: articleCategories.slug,
      name: articleCategories.name,
      displayOrder: articleCategories.displayOrder,
      articleCount: publishedCount,
    })
    .from(articleCategories)
    .orderBy(asc(articleCategories.displayOrder), asc(articleCategories.name));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    displayOrder: r.displayOrder,
    articleCount: Number(r.articleCount ?? 0),
  }));
};

// ── 4. createArticle ──────────────────────────────────────────
export const createArticle = async (
  authorId: string,
  input: CreateArticleBody,
): Promise<ArticleAdminView> => {
  const [category] = await db
    .select({ id: articleCategories.id })
    .from(articleCategories)
    .where(eq(articleCategories.id, input.categoryId))
    .limit(1);

  if (!category) {
    throw new ContentError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  }

  const [created] = await db
    .insert(articles)
    .values({
      slug: slugify(input.title),
      title: input.title,
      excerpt: input.excerpt,
      body: input.body,
      categoryId: input.categoryId,
      authorId,
      coverImageUrl: input.coverImageUrl ?? null,
      tags: input.tags ?? [],
      readingTimeMin: computeReadingTimeMin(input.body),
      status: 'draft',
    })
    .returning();

  if (!created) {
    throw new ContentError(500, 'INTERNAL_ERROR', 'Failed to create article');
  }

  return mapAdminView(created);
};

// ── 5. updateArticle ──────────────────────────────────────────
export const updateArticle = async (
  articleId: string,
  patch: PatchArticleBody,
): Promise<ArticleAdminView> => {
  const [existing] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!existing) {
    throw new ContentError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
  }

  if (patch.categoryId !== undefined) {
    const [category] = await db
      .select({ id: articleCategories.id })
      .from(articleCategories)
      .where(eq(articleCategories.id, patch.categoryId))
      .limit(1);
    if (!category) {
      throw new ContentError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    }
  }

  // Slug is intentionally NOT recomputed when the title changes (immutable).
  const set: Partial<typeof articles.$inferInsert> = { updatedAt: new Date() };
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.excerpt !== undefined) set.excerpt = patch.excerpt;
  if (patch.body !== undefined) {
    set.body = patch.body;
    set.readingTimeMin = computeReadingTimeMin(patch.body);
  }
  if (patch.categoryId !== undefined) set.categoryId = patch.categoryId;
  if (patch.coverImageUrl !== undefined) {
    set.coverImageUrl = patch.coverImageUrl;
  }
  if (patch.tags !== undefined) set.tags = patch.tags;

  const [updated] = await db
    .update(articles)
    .set(set)
    .where(eq(articles.id, articleId))
    .returning();

  return mapAdminView(updated!);
};

// ── 6. publishArticle ─────────────────────────────────────────
export const publishArticle = async (
  articleId: string,
): Promise<ArticleAdminView> => {
  const [a] = await db
    .select()
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!a) {
    throw new ContentError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
  }
  if (a.status !== 'draft') {
    throw new ContentError(
      409,
      'INVALID_ARTICLE_STATUS_TRANSITION',
      `Cannot publish a ${a.status} article`,
    );
  }
  // title/excerpt/body/category are NOT NULL; this is a formality.
  if (a.body.trim().length < 50) {
    throw new ContentError(
      422,
      'ARTICLE_INCOMPLETE',
      'Article body is too short to publish',
    );
  }

  const publishedAt = new Date();
  const [updated] = await db
    .update(articles)
    .set({ status: 'published', publishedAt, updatedAt: publishedAt })
    .where(eq(articles.id, articleId))
    .returning();

  return mapAdminView(updated!);
};

// ── 7. archiveArticle ─────────────────────────────────────────
export const archiveArticle = async (
  articleId: string,
): Promise<ArticleAdminView> => {
  const [a] = await db
    .select({ status: articles.status })
    .from(articles)
    .where(eq(articles.id, articleId))
    .limit(1);

  if (!a) {
    throw new ContentError(404, 'ARTICLE_NOT_FOUND', 'Article not found');
  }
  if (a.status === 'archived') {
    throw new ContentError(
      409,
      'INVALID_ARTICLE_STATUS_TRANSITION',
      'Article is already archived',
    );
  }

  const archivedAt = new Date();
  const [updated] = await db
    .update(articles)
    .set({ status: 'archived', archivedAt, updatedAt: archivedAt })
    .where(eq(articles.id, articleId))
    .returning();

  return mapAdminView(updated!);
};

// ── 8. adminListArticles ──────────────────────────────────────
export const adminListArticles = async (
  query: AdminListArticlesQuery,
): Promise<Page<AdminArticleListItem>> => {
  const filters: SQL[] = [];

  if (query.status) {
    filters.push(
      eq(articles.status, query.status.toLowerCase() as ArticleStatusDb),
    );
  }
  if (query.category) {
    const categoryId = await resolveCategoryId(query.category);
    if (!categoryId) return { items: [], totalItems: 0 };
    filters.push(eq(articles.categoryId, categoryId));
  }
  if (query.search) {
    filters.push(sql`(
      similarity(${articles.title}, ${query.search}) > 0.2
      OR ${articles.title} ILIKE '%' || ${query.search} || '%'
    )`);
  }

  const where = filters.length === 0 ? undefined : and(...filters);
  const offset = (query.page - 1) * query.limit;

  const [rows, countRows] = await Promise.all([
    db
      .select(listSelection)
      .from(articles)
      .innerJoin(
        articleCategories,
        eq(articleCategories.id, articles.categoryId),
      )
      .innerJoin(users, eq(users.id, articles.authorId))
      .where(where)
      .orderBy(desc(articles.createdAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(articles)
      .where(where),
  ]);

  const items: AdminArticleListItem[] = rows.map((r) => ({
    ...toListItem(r),
    status: toApiStatus(r.status),
    createdAt: r.createdAt.toISOString(),
  }));

  return { items, totalItems: countRows[0]?.n ?? 0 };
};

// ── 9. createCategory ─────────────────────────────────────────
interface PgUniqueViolation {
  code?: string;
  constraint?: string;
}
const isUniqueViolation = (err: unknown, constraint: string): boolean => {
  if (!err || typeof err !== 'object') return false;
  const e = err as PgUniqueViolation;
  return e.code === '23505' && e.constraint === constraint;
};

export const createCategory = async (
  input: CreateCategoryBody,
): Promise<CategoryCreatedView> => {
  try {
    const [created] = await db
      .insert(articleCategories)
      .values({
        slug: input.slug,
        name: input.name,
        displayOrder: input.displayOrder,
      })
      .returning();

    return {
      id: created!.id,
      slug: created!.slug,
      name: created!.name,
      displayOrder: created!.displayOrder,
      createdAt: created!.createdAt.toISOString(),
    };
  } catch (err) {
    if (isUniqueViolation(err, 'article_categories_slug_unique')) {
      throw new ContentError(
        409,
        'CATEGORY_SLUG_EXISTS',
        'A category with this slug already exists',
      );
    }
    throw err;
  }
};
