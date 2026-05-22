import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import {
  createSession,
  deleteSession,
  getExerciseById,
  getSessionById,
  listExercises,
  listSessions,
  updateSession,
} from '../services/workout.service';
import {
  createSessionBodySchema,
  exerciseIdParamSchema,
  listExercisesQuerySchema,
  listSessionsQuerySchema,
  sessionIdParamSchema,
  updateSessionBodySchema,
} from '../validations/workout.validation';

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
  console.error('Workout controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

const requireUser = (req: Request, res: Response): string | null => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.user.id;
};

export const listExercisesHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const query = listExercisesQuerySchema.parse(req.query);
    const { items, totalItems } = await listExercises(query);
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

export const getExerciseByIdHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = exerciseIdParamSchema.parse(req.params);
    const data = await getExerciseById(id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const createSessionHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const body = createSessionBodySchema.parse(req.body);
    const data = await createSession(userId, body);
    sendSuccess(res, 201, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const listSessionsHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const query = listSessionsQuerySchema.parse(req.query);
    const { items, totalItems } = await listSessions(userId, query);
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

export const getSessionByIdHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { id } = sessionIdParamSchema.parse(req.params);
    const data = await getSessionById(userId, id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const updateSessionHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { id } = sessionIdParamSchema.parse(req.params);
    const body = updateSessionBodySchema.parse(req.body);
    const data = await updateSession(userId, id, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const deleteSessionHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { id } = sessionIdParamSchema.parse(req.params);
    await deleteSession(userId, id);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
};
