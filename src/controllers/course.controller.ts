import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../lib/api-error';
import { toUploadApiError } from '../lib/upload-error';
import {
  archiveCourse,
  createCourse,
  discoverCourses,
  getOwnCourseById,
  getPublicCourseDetail,
  listOwnCourses,
  listPurchasedCourses,
  patchCourse,
  publishCourse,
  replaceCurriculum,
  setLessonPreview,
  uploadCourseThumbnail,
  uploadLessonVideo,
} from '../services/course.service';
import {
  courseCurriculumSchema,
  courseIdParamSchema,
  createCourseBodySchema,
  discoverCoursesQuerySchema,
  lessonVideoParamSchema,
  listOwnCoursesQuerySchema,
  listPurchasedQuerySchema,
  patchCourseBodySchema,
  setLessonPreviewBodySchema,
} from '../validations/course.validation';

const sendError = (
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void => {
  const body: {
    success: false;
    error: { code: string; message: string; details?: unknown };
  } = {
    success: false,
    error: { code, message },
  };
  if (details !== undefined) body.error.details = details;
  res.status(status).json(body);
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
    const details = (err as ApiError & { details?: unknown }).details;
    sendError(res, err.status, err.code, err.message, details);
    return;
  }
  console.error('Course controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

const requireUser = (req: Request, res: Response): string | null => {
  if (!req.user) {
    sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
    return null;
  }
  return req.user.id;
};

// ── PT-owned ──────────────────────────────────────────────────

export const createCourseHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUser(req, res);
    if (!ptId) return;
    const body = createCourseBodySchema.parse(req.body);
    const data = await createCourse(ptId, body);
    sendSuccess(res, 201, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const listOwnCoursesHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUser(req, res);
    if (!ptId) return;
    const query = listOwnCoursesQuerySchema.parse(req.query);
    const { items, totalItems } = await listOwnCourses(ptId, query);
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

export const getOwnCourseByIdHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUser(req, res);
    if (!ptId) return;
    const { id } = courseIdParamSchema.parse(req.params);
    const data = await getOwnCourseById(ptId, id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const patchCourseHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUser(req, res);
    if (!ptId) return;
    const { id } = courseIdParamSchema.parse(req.params);
    const body = patchCourseBodySchema.parse(req.body);
    const data = await patchCourse(ptId, id, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const replaceCurriculumHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUser(req, res);
    if (!ptId) return;
    const { id } = courseIdParamSchema.parse(req.params);
    const body = courseCurriculumSchema.parse(req.body);
    const data = await replaceCurriculum(ptId, id, body);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const publishCourseHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUser(req, res);
    if (!ptId) return;
    const { id } = courseIdParamSchema.parse(req.params);
    const data = await publishCourse(ptId, id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const archiveCourseHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUser(req, res);
    if (!ptId) return;
    const { id } = courseIdParamSchema.parse(req.params);
    const data = await archiveCourse(ptId, id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

// ── Public / authenticated discover ───────────────────────────

export const discoverCoursesHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const query = discoverCoursesQuerySchema.parse(req.query);
    const { items, totalItems } = await discoverCourses(query);
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

export const getPublicCourseDetailHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = courseIdParamSchema.parse(req.params);
    const data = await getPublicCourseDetail(id);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

// ── PT media upload ───────────────────────────────────────────

export const uploadCourseThumbnailHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUser(req, res);
    if (!ptId) return;

    const uploadError = (req as Request & { uploadError?: unknown }).uploadError;
    if (uploadError) {
      const apiError = toUploadApiError(uploadError, {
        fieldName: 'thumbnail',
        maxSizeLabel: '5 MB',
      });
      if (apiError) throw apiError;
      throw uploadError; // unexpected — handleError classifies as 500
    }

    const { id } = courseIdParamSchema.parse(req.params);
    if (!req.file) {
      throw new ApiError(400, 'NO_FILE_PROVIDED', 'No image file provided in field "thumbnail"');
    }
    if (req.file.size === 0) {
      throw new ApiError(400, 'EMPTY_FILE', 'Uploaded file is empty');
    }

    const data = await uploadCourseThumbnail(ptId, id, req.file);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const uploadLessonVideoHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUser(req, res);
    if (!ptId) return;

    const uploadError = (req as Request & { uploadError?: unknown }).uploadError;
    if (uploadError) {
      const apiError = toUploadApiError(uploadError, {
        fieldName: 'video',
        maxSizeLabel: '100 MB',
      });
      if (apiError) throw apiError;
      throw uploadError; // unexpected — handleError classifies as 500
    }

    const { id, lessonId } = lessonVideoParamSchema.parse(req.params);
    if (!req.file) {
      throw new ApiError(400, 'NO_FILE_PROVIDED', 'No video file provided in field "video"');
    }
    if (req.file.size === 0) {
      throw new ApiError(400, 'EMPTY_FILE', 'Uploaded file is empty');
    }

    const data = await uploadLessonVideo(ptId, id, lessonId, req.file);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const setLessonPreviewHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const ptId = requireUser(req, res);
    if (!ptId) return;

    const { id, lessonId } = lessonVideoParamSchema.parse(req.params);
    const { isPreview } = setLessonPreviewBodySchema.parse(req.body);

    const data = await setLessonPreview(ptId, id, lessonId, isPreview);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

// ── Student-facing ────────────────────────────────────────────

export const listPurchasedCoursesHandler = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = requireUser(req, res);
    if (!userId) return;
    const query = listPurchasedQuerySchema.parse(req.query);
    const { items, totalItems } = await listPurchasedCourses(userId, query);
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
