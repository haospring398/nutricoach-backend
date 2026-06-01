import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import {
  adminListArticles,
  archiveArticle,
  createArticle,
  createCategory,
  getPublishedArticleBySlug,
  listCategories,
  listPublishedArticles,
  publishArticle,
  updateArticle,
} from '../services/content.service';
import {
  adminListArticlesQuerySchema,
  articleIdParamSchema,
  articleSlugParamSchema,
  createArticleBodySchema,
  createCategoryBodySchema,
  listArticlesQuerySchema,
  patchArticleBodySchema,
} from '../validations/content.validation';

const sendError = (
  res: Response,
  status: number,
  code: string,
  message: string,
): void => {
  res.status(status).json({
    success: false,
    error: { code, message },
  });
};

const sendSuccess = (res: Response, status: number, data: unknown): void => {
  res.status(status).json({ success: true, data });
};

const handleError = (res: Response, err: unknown): void => {
  if (err instanceof ZodError) {
    const first = err.errors[0];
    sendError(
      res,
      400,
      'VALIDATION_ERROR',
      first?.message ?? 'Invalid request',
    );
    return;
  }
  if (err instanceof ApiError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }
  console.error('Content controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

const requireUserId = (req: Request, res: Response): string | null => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.user.id;
};

const sendPaginated = (
  res: Response,
  items: unknown[],
  totalItems: number,
  page: number,
  limit: number,
): void => {
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  res.status(200).json({
    success: true,
    data: items,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
};

// ── Public / read ─────────────────────────────────────────────

export const listArticlesHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const query = listArticlesQuerySchema.parse(req.query);
    const { items, totalItems } = await listPublishedArticles(query);
    sendPaginated(res, items, totalItems, query.page, query.limit);
  } catch (err) {
    handleError(res, err);
  }
};

export const getArticleBySlugHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { slug } = articleSlugParamSchema.parse(req.params);
    const data = await getPublishedArticleBySlug(slug);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const listCategoriesHandler = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = await listCategories();
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

// ── Admin / write ─────────────────────────────────────────────

export const adminListArticlesHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const query = adminListArticlesQuerySchema.parse(req.query);
    const { items, totalItems } = await adminListArticles(query);
    sendPaginated(res, items, totalItems, query.page, query.limit);
  } catch (err) {
    handleError(res, err);
  }
};

export const createArticleHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const authorId = requireUserId(req, res);
    if (!authorId) return;
    const body = createArticleBodySchema.parse(req.body);
    const data = await createArticle(authorId, body);
    sendSuccess(res, 201, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const updateArticleHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = articleIdParamSchema.parse(req.params);
    const body = patchArticleBodySchema.parse(req.body);
    const data = await updateArticle(id, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const publishArticleHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = articleIdParamSchema.parse(req.params);
    const data = await publishArticle(id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const archiveArticleHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = articleIdParamSchema.parse(req.params);
    const data = await archiveArticle(id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const createCategoryHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const body = createCategoryBodySchema.parse(req.body);
    const data = await createCategory(body);
    sendSuccess(res, 201, data);
  } catch (err) {
    handleError(res, err);
  }
};
