import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import {
  approveVerification,
  getVerificationById,
  listVerifications,
  rejectVerification,
} from '../services/pt.service';
import {
  approveVerificationBodySchema,
  listVerificationsQuerySchema,
  rejectVerificationBodySchema,
  verificationIdParamSchema,
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
  console.error('Admin controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

const requireUser = (req: Request, res: Response): string | null => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.user.id;
};

export const listPtVerificationsHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const query = listVerificationsQuerySchema.parse(req.query);
    const { items, totalItems } = await listVerifications(query);
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

export const getPtVerificationByIdHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = verificationIdParamSchema.parse(req.params);
    const data = await getVerificationById(id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const approvePtVerificationHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const adminUserId = requireUser(req, res);
    if (!adminUserId) return;
    const { id } = verificationIdParamSchema.parse(req.params);
    const { note } = approveVerificationBodySchema.parse(req.body);
    const data = await approveVerification(id, adminUserId, note);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const rejectPtVerificationHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const adminUserId = requireUser(req, res);
    if (!adminUserId) return;
    const { id } = verificationIdParamSchema.parse(req.params);
    const { reason, requireResubmit } = rejectVerificationBodySchema.parse(
      req.body,
    );
    const data = await rejectVerification(
      id,
      adminUserId,
      reason,
      requireResubmit,
    );
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};
