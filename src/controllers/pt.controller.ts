import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import {
  getOwnVerificationStatus,
  getPtProfile,
  submitVerification,
  updatePtProfile,
} from '../services/pt.service';
import {
  submitVerificationBodySchema,
  updatePtProfileBodySchema,
} from '../validations/pt.validation';

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
  console.error('PT controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

const requireUser = (req: Request, res: Response): string | null => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.user.id;
};

export const submitVerificationHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const body = submitVerificationBodySchema.parse(req.body);
    const data = await submitVerification(userId, body);
    sendSuccess(res, 201, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const getOwnVerificationStatusHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const data = await getOwnVerificationStatus(userId);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const getPtMeHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const data = await getPtProfile(userId);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const updatePtMeHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const body = updatePtProfileBodySchema.parse(req.body);
    const data = await updatePtProfile(userId, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};
