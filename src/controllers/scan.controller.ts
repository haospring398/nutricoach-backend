import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import { scanFood } from '../services/scan.service';
import { scanSchema } from '../validations/scan.validation';

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
  console.error('Scan controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

const requireUser = (req: Request, res: Response): string | null => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.user.id;
};

export const scan = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    // Surface any error stashed by uploadSingle (size limit, bad type) — same
    // contract the other upload controllers use (no global error middleware).
    const r = req as Request & { uploadError?: unknown };
    if (r.uploadError) {
      throw r.uploadError;
    }

    if (!req.file?.buffer) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Image file is required');
    }

    const input = scanSchema.parse(req.body);
    const data = await scanFood(userId, {
      imageBase64: req.file.buffer.toString('base64'),
      mimeType: req.file.mimetype,
      question: input.question,
    });
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};
