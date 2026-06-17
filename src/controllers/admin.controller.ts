import type { Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import { uploadArticleImage as uploadArticleImageService } from '../services/content.service';
import {
  approveVerification,
  getVerificationById,
  listVerifications,
  rejectVerification,
} from '../services/pt.service';
import {
  adminBanUser,
  adminChangeUserRole,
  adminGetUser,
  adminListUsers,
  adminUnbanUser,
  adminUsersAnalytics,
} from '../services/admin-users.service';
import {
  adminCreateReward,
  adminDeleteReward,
  adminFulfillRedemption,
  adminListRedemptions,
  adminListRewards,
  adminRejectRedemption,
  adminUpdateReward,
} from '../services/quest.service';
import {
  approveVerificationBodySchema,
  listVerificationsQuerySchema,
  rejectVerificationBodySchema,
  verificationIdParamSchema,
} from '../validations/pt.validation';
import {
  adminAnalyticsQuerySchema,
  adminBanUserSchema,
  adminChangeRoleSchema,
  adminUserIdParamSchema,
  adminUsersQuerySchema,
} from '../validations/admin.validation';
import {
  adminListRewardsQuerySchema,
  adminRedemptionsQuerySchema,
  createRewardSchema,
  fulfillRedemptionSchema,
  redemptionIdParamSchema,
  rejectRedemptionSchema,
  rewardIdParamSchema,
  updateRewardSchema,
} from '../validations/quest.validation';

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

// ── Reward redemptions (admin) ────────────────────────────────

export const listRewardRedemptions = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const query = adminRedemptionsQuerySchema.parse(req.query);
    const { items, pagination } = await adminListRedemptions(query);
    res.status(200).json({ success: true, data: items, pagination });
  } catch (err) {
    handleError(res, err);
  }
};

export const fulfillRewardRedemption = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const adminId = requireUser(req, res);
    if (!adminId) return;
    const { id } = redemptionIdParamSchema.parse(req.params);
    const body = fulfillRedemptionSchema.parse(req.body);
    const data = await adminFulfillRedemption(adminId, id, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const rejectRewardRedemption = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const adminId = requireUser(req, res);
    if (!adminId) return;
    const { id } = redemptionIdParamSchema.parse(req.params);
    const body = rejectRedemptionSchema.parse(req.body);
    const data = await adminRejectRedemption(adminId, id, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const uploadArticleImage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // uploadSingle stashes any multer error here instead of forwarding it
    // (no global error handler). Convert it before inspecting req.file.
    const uploadError = (req as Request & { uploadError?: unknown })
      .uploadError;
    if (uploadError) {
      if (uploadError instanceof multer.MulterError) {
        if (uploadError.code === 'LIMIT_FILE_SIZE') {
          throw new ApiError(400, 'FILE_TOO_LARGE', 'Image must be 5 MB or smaller');
        }
        if (uploadError.code === 'LIMIT_UNEXPECTED_FILE') {
          throw new ApiError(400, 'INVALID_FIELD_NAME', 'Use field name "image"');
        }
      }
      throw uploadError; // ApiError (INVALID_FILE_TYPE) or an unexpected error
    }

    if (!req.file) {
      throw new ApiError(
        400,
        'NO_FILE_PROVIDED',
        'No image file provided in field "image"',
      );
    }

    if (req.file.size === 0) {
      throw new ApiError(400, 'EMPTY_FILE', 'Uploaded file is empty');
    }

    const imageUrl = await uploadArticleImageService(req.file);
    sendSuccess(res, 200, { imageUrl });
  } catch (err) {
    handleError(res, err);
  }
};

// ── Rewards catalog CRUD ─────────────────────────────────────

export const listAdminRewards = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const query = adminListRewardsQuerySchema.parse(req.query);
    const { items, pagination } = await adminListRewards(query);
    res.status(200).json({ success: true, data: items, pagination });
  } catch (err) {
    handleError(res, err);
  }
};

export const createReward = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const body = createRewardSchema.parse(req.body);
    const data = await adminCreateReward(body);
    sendSuccess(res, 201, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const updateReward = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = rewardIdParamSchema.parse(req.params);
    const body = updateRewardSchema.parse(req.body);
    const data = await adminUpdateReward(id, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const deleteReward = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = rewardIdParamSchema.parse(req.params);
    const data = await adminDeleteReward(id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

// ── Admin user management ─────────────────────────────────────

export const listUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = adminUsersQuerySchema.parse(req.query);
    const { items, pagination } = await adminListUsers(query);
    res.status(200).json({ success: true, data: items, pagination });
  } catch (err) {
    handleError(res, err);
  }
};

export const getUserById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = adminUserIdParamSchema.parse(req.params);
    const data = await adminGetUser(id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const banUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = requireUser(req, res);
    if (!adminId) return;
    const { id } = adminUserIdParamSchema.parse(req.params);
    const body = adminBanUserSchema.parse(req.body);
    const data = await adminBanUser(adminId, id, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const unbanUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = adminUserIdParamSchema.parse(req.params);
    const data = await adminUnbanUser(id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const changeUserRole = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const adminId = requireUser(req, res);
    if (!adminId) return;
    const { id } = adminUserIdParamSchema.parse(req.params);
    const body = adminChangeRoleSchema.parse(req.body);
    const data = await adminChangeUserRole(adminId, id, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const getUsersAnalytics = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const query = adminAnalyticsQuerySchema.parse(req.query);
    const data = await adminUsersAnalytics(query);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};
