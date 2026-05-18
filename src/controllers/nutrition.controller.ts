import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import {
  createFoodLog,
  deleteFoodLog,
  getDailySummary,
  listFoodLogsByDate,
  updateFoodLog,
} from '../services/nutrition.service';
import {
  createFoodLogSchema,
  dateQuerySchema,
  idParamSchema,
  updateFoodLogSchema,
} from '../validations/nutrition.validation';

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
  console.error('Nutrition controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

const requireUser = (req: Request, res: Response): string | null => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.user.id;
};

export const createLog = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const input = createFoodLogSchema.parse(req.body);
    const data = await createFoodLog(userId, input);
    sendSuccess(res, 201, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const listLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { date } = dateQuerySchema.parse(req.query);
    const data = await listFoodLogsByDate(userId, date);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const updateLog = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { id } = idParamSchema.parse(req.params);
    const input = updateFoodLogSchema.parse(req.body);
    const data = await updateFoodLog(userId, id, input);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const deleteLog = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { id } = idParamSchema.parse(req.params);
    await deleteFoodLog(userId, id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
};

export const dailySummary = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { date } = dateQuerySchema.parse(req.query);
    const data = await getDailySummary(userId, date);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};
