import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import {
  adminCreateQuest,
  adminGetLeaderboard,
  adminListQuests,
  adminUpdateQuest,
  diaryLock,
  getDailyQuests,
  getPoints,
  triggerQuest,
} from '../services/quest.service';
import {
  createQuestSchema,
  diaryLockSchema,
  getPointsSchema,
  leaderboardSchema,
  triggerQuestSchema,
  updateQuestSchema,
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
  console.error('Quest controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

const requireUser = (req: Request, res: Response): string | null => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.user.id;
};

// ── User handlers ─────────────────────────────────────────────

export const getDailyQuestsHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const data = await getDailyQuests(userId);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const triggerQuestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { body } = triggerQuestSchema.parse({ body: req.body });
    const data = await triggerQuest(
      userId,
      body.questId,
      body.date,
      body.referenceId,
    );
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const diaryLockHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { body } = diaryLockSchema.parse({ body: req.body });
    const data = await diaryLock(userId, body.date);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const getPointsHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const { query } = getPointsSchema.parse({ query: req.query });
    const data = await getPoints(userId, query.page, query.limit);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

// ── Admin handlers ────────────────────────────────────────────

export const adminListQuestsHandler = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const data = await adminListQuests();
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const adminCreateQuestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { body } = createQuestSchema.parse({ body: req.body });
    const data = await adminCreateQuest(body);
    sendSuccess(res, 201, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const adminUpdateQuestHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { params, body } = updateQuestSchema.parse({
      params: req.params,
      body: req.body,
    });
    const data = await adminUpdateQuest(params.id, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const adminLeaderboardHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { query } = leaderboardSchema.parse({ query: req.query });
    const data = await adminGetLeaderboard(query.limit);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};
