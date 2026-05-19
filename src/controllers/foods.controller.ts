import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import {
  getFoodById,
  listCategories,
  searchFoods,
} from '../services/foods.service';
import {
  foodIdParamSchema,
  foodsCategoriesQuerySchema,
  foodsSearchQuerySchema,
} from '../validations/foods.validation';

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
      first?.message ?? 'Invalid request body',
    );
    return;
  }
  if (err instanceof ApiError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }
  console.error('Foods controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

export const search = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = foodsSearchQuerySchema.parse(req.query);
    const { items, totalItems } = await searchFoods(query);
    const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
    res.status(200).json({
      success: true,
      data: items,
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages,
        hasNext: query.page < totalPages,
        hasPrev: query.page > 1,
      },
    });
  } catch (err) {
    handleError(res, err);
  }
};

export const getById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = foodIdParamSchema.parse(req.params);
    const data = await getFoodById(id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const categories = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const query = foodsCategoriesQuerySchema.parse(req.query);
    const data = await listCategories(query);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};
