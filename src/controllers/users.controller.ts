import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import {
  changePassword,
  completeOnboarding,
  deleteMe,
  getMe,
  getMyMetrics,
  updateMe,
} from '../services/users.service';
import {
  changePasswordSchema,
  deleteMeSchema,
  onboardingSchema,
  updateMeSchema,
} from '../validations/users.validation';

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
  console.error('Users controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

const requireUser = (req: Request, res: Response): string | null => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.user.id;
};

export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const data = await getMe(userId);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const patchMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const input = updateMeSchema.parse(req.body);
    const data = await updateMe(userId, input);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const onboarding = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const input = onboardingSchema.parse(req.body);
    const data = await completeOnboarding(userId, input);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const myMetrics = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const data = await getMyMetrics(userId);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const changeMyPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const input = changePasswordSchema.parse(req.body);
    await changePassword(userId, input);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
};

export const deleteMyAccount = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const input = deleteMeSchema.parse(req.body);
    await deleteMe(userId, input);
    res.status(204).end();
  } catch (err) {
    handleError(res, err);
  }
};
