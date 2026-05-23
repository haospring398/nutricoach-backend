import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import {
  createCheckout,
  getSubscription,
  handlePayosWebhook,
  listTransactions,
} from '../services/payment.service';
import {
  checkoutBodySchema,
  idempotencyKeySchema,
  transactionsQuerySchema,
} from '../validations/payment.validation';

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
  console.error('Payment controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

const requireUser = (req: Request, res: Response): string | null => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.user.id;
};

export const createCheckoutHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const idempotencyKey = idempotencyKeySchema.parse(
      req.header('Idempotency-Key'),
    );
    const body = checkoutBodySchema.parse(req.body);
    const { data, replayed } = await createCheckout(
      {
        userId,
        productType: body.productType,
        productId: body.productId,
        returnUrl: body.returnUrl,
        cancelUrl: body.cancelUrl,
      },
      idempotencyKey,
    );
    // First call → 201 Created; idempotent replay → 200 OK (resource exists).
    sendSuccess(res, replayed ? 200 : 201, data);
  } catch (err) {
    handleError(res, err);
  }
};

// Webhook is unauthenticated — security is the PayOS signature. It never
// returns a retry-triggering 4xx except for genuinely malformed JSON.
export const payosWebhookHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  let parsed: unknown;
  try {
    if (!req.rawBody) {
      throw new Error('missing raw body');
    }
    parsed = JSON.parse(req.rawBody);
  } catch {
    sendError(res, 400, 'INVALID_JSON', 'Malformed JSON body');
    return;
  }

  try {
    const result = await handlePayosWebhook(parsed);
    res.status(200).json(result);
  } catch (err) {
    // Bad signature → swallow and 200 so PayOS does not retry a forged call.
    if (err instanceof ApiError && err.code === 'INVALID_SIGNATURE') {
      console.warn('[payment] webhook rejected: invalid signature');
      res.status(200).json({ received: true });
      return;
    }
    // A genuine processing failure → 500 so PayOS retries later.
    console.error('[payment] webhook processing failed:', err);
    sendError(
      res,
      500,
      'WEBHOOK_PROCESSING_ERROR',
      'Webhook processing failed',
    );
  }
};

export const listTransactionsHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const query = transactionsQuerySchema.parse(req.query);
    const { items, totalItems } = await listTransactions(userId, query);
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

export const getSubscriptionHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const data = await getSubscription(userId);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};
