import { z } from 'zod';

// ── Public: list articles ─────────────────────────────────────
// `category` is the category SLUG (friendly URLs: ?category=nutrition),
// resolved to a uuid in the service.
export const listArticlesQuerySchema = z.object({
  category: z.string().trim().min(1).max(64).optional(),
  tag: z.string().trim().min(1).max(40).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ── Public: article by slug ───────────────────────────────────
export const articleSlugParamSchema = z.object({
  slug: z.string().trim().min(1).max(280),
});

// ── Admin: create article ─────────────────────────────────────
export const createArticleBodySchema = z.object({
  title: z.string().trim().min(3).max(200),
  excerpt: z.string().trim().min(20).max(300),
  body: z.string().trim().min(50),
  categoryId: z.string().uuid(),
  coverImageUrl: z.string().max(512).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

// ── Admin: patch article ──────────────────────────────────────
export const patchArticleBodySchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    excerpt: z.string().trim().min(20).max(300).optional(),
    body: z.string().trim().min(50).optional(),
    categoryId: z.string().uuid().optional(),
    coverImageUrl: z.string().max(512).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: 'At least one field must be provided',
  });

// ── Admin: list all articles ──────────────────────────────────
export const adminListArticlesQuerySchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  category: z.string().trim().min(1).max(64).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ── Admin: article id param ───────────────────────────────────
export const articleIdParamSchema = z.object({
  id: z.string().uuid('article id must be a UUID'),
});

// ── Admin: create category ────────────────────────────────────
export const createCategoryBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9-]{2,64}$/,
      'slug must be lowercase alphanumeric with hyphens',
    ),
  name: z.string().trim().min(2).max(100),
  displayOrder: z.number().int().min(0).max(1000).default(0),
});

export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;
export type ArticleSlugParam = z.infer<typeof articleSlugParamSchema>;
export type CreateArticleBody = z.infer<typeof createArticleBodySchema>;
export type PatchArticleBody = z.infer<typeof patchArticleBodySchema>;
export type AdminListArticlesQuery = z.infer<
  typeof adminListArticlesQuerySchema
>;
export type ArticleIdParam = z.infer<typeof articleIdParamSchema>;
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;
