import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import {
  getStudentDetail,
  listMyAssignments,
  listStudents,
  postExerciseAssignment,
  putMealPlan,
} from '../services/pt-students.service';
import {
  listMyAssignmentsQuerySchema,
  listStudentsQuerySchema,
  postExerciseBodySchema,
  putMealPlanBodySchema,
} from '../validations/pt-assignment.validation';

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
  console.error('PT students controller error:', err);
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

export const listStudentsHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUserId(req, res);
    if (!ptId) return;
    const query = listStudentsQuerySchema.parse(req.query);
    const { items, totalItems } = await listStudents(ptId, query);
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

export const getStudentDetailHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // Middleware guarantees req.enrollment and req.params.studentId.
    const enrollment = req.enrollment!;
    const studentId = req.params.studentId!;
    const data = await getStudentDetail(studentId, enrollment);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const putMealPlanHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUserId(req, res);
    if (!ptId) return;
    const enrollment = req.enrollment!;
    const studentId = req.params.studentId!;
    const body = putMealPlanBodySchema.parse(req.body);
    const data = await putMealPlan(ptId, studentId, enrollment, body);
    sendSuccess(res, 201, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const postExerciseAssignmentHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUserId(req, res);
    if (!ptId) return;
    const enrollment = req.enrollment!;
    const studentId = req.params.studentId!;
    const body = postExerciseBodySchema.parse(req.body);
    const data = await postExerciseAssignment(
      ptId,
      studentId,
      enrollment,
      body,
    );
    sendSuccess(res, 201, data);
  } catch (err) {
    handleError(res, err);
  }
};

// ── Student-facing ────────────────────────────────────────────

export const listMyAssignmentsHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;
    const query = listMyAssignmentsQuerySchema.parse(req.query);
    const { items, totalItems } = await listMyAssignments(userId, query);
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
