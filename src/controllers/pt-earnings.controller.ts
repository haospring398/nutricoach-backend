import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import {
  approveWithdrawal,
  createWithdrawal,
  getEarningsReport,
  listAllWithdrawals,
  listOwnWithdrawals,
  rejectWithdrawal,
} from '../services/pt-earnings.service';
import {
  adminListWithdrawalsQuerySchema,
  approveWithdrawalBodySchema,
  createWithdrawalBodySchema,
  earningsQuerySchema,
  listOwnWithdrawalsQuerySchema,
  rejectWithdrawalBodySchema,
  withdrawalIdParamSchema,
  withdrawalIdempotencyKeySchema,
} from '../validations/pt-earnings.validation';

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
  console.error('PT earnings controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

const requireUserId = (req: Request, res: Response): string | null => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.user.id;
};

// ── PT-facing ─────────────────────────────────────────────────

export const getEarningsHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUserId(req, res);
    if (!ptId) return;
    const query = earningsQuerySchema.parse(req.query);
    const data = await getEarningsReport(ptId, query);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const createWithdrawalHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUserId(req, res);
    if (!ptId) return;
    const idempotencyKey = withdrawalIdempotencyKeySchema.parse(
      req.header('Idempotency-Key'),
    );
    const body = createWithdrawalBodySchema.parse(req.body);
    const { data, replayed } = await createWithdrawal(
      ptId,
      body,
      idempotencyKey,
    );
    sendSuccess(res, replayed ? 200 : 201, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const listOwnWithdrawalsHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUserId(req, res);
    if (!ptId) return;
    const query = listOwnWithdrawalsQuerySchema.parse(req.query);
    const { items, totalItems } = await listOwnWithdrawals(ptId, query);
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

// ── Admin ─────────────────────────────────────────────────────

export const adminListWithdrawalsHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const query = adminListWithdrawalsQuerySchema.parse(req.query);
    const { items, totalItems } = await listAllWithdrawals(query);
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

export const adminApproveWithdrawalHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const adminId = requireUserId(req, res);
    if (!adminId) return;
    const { id } = withdrawalIdParamSchema.parse(req.params);
    const body = approveWithdrawalBodySchema.parse(req.body);
    const data = await approveWithdrawal(id, adminId, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const adminRejectWithdrawalHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const adminId = requireUserId(req, res);
    if (!adminId) return;
    const { id } = withdrawalIdParamSchema.parse(req.params);
    const body = rejectWithdrawalBodySchema.parse(req.body);
    const data = await rejectWithdrawal(id, adminId, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};
