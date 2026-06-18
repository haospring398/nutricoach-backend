import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import { toUploadApiError } from '../lib/upload-error';
import {
  changePassword,
  completeOnboarding,
  deleteMe,
  getMe,
  getMyMetrics,
  updateMe,
  updateMetrics as updateMetricsService,
  uploadAvatar as uploadAvatarService,
} from '../services/users.service';
import {
  changePasswordSchema,
  deleteMeSchema,
  onboardingSchema,
  updateMeSchema,
  updateMetricsSchema,
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

export const updateMyMetrics = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const body = updateMetricsSchema.parse(req.body);
    const data = await updateMetricsService(userId, body);
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

export const uploadAvatar = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;

    // The upload middleware stashes any multer error here instead of
    // forwarding it (no global error handler). Convert it before inspecting
    // req.file.
    const uploadError = (req as Request & { uploadError?: unknown })
      .uploadError;
    if (uploadError) {
      const apiError = toUploadApiError(uploadError, {
        fieldName: 'avatar',
        maxSizeLabel: '5 MB',
      });
      if (apiError) throw apiError;
      throw uploadError; // unexpected — handleError classifies as 500
    }

    if (!req.file) {
      throw new ApiError(
        400,
        'NO_FILE_PROVIDED',
        'No avatar file provided in field "avatar"',
      );
    }

    if (req.file.size === 0) {
      throw new ApiError(400, 'EMPTY_FILE', 'Uploaded file is empty');
    }

    const avatarUrl = await uploadAvatarService(userId, req.file);
    sendSuccess(res, 200, { avatarUrl });
  } catch (err) {
    handleError(res, err);
  }
};
