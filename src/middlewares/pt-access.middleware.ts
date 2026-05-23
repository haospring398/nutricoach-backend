import type { NextFunction, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../config/db';
import { enrollments } from '../models/course.model';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sendNotFound = (res: Response): void => {
  res.status(404).json({
    success: false,
    error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found' },
  });
};

/**
 * Gate routes under /pt/students/:studentId. Verifies that an ACTIVE
 * enrollment exists where (pt_id = req.user.id AND user_id = :studentId).
 *
 * Returns 404 — never 403 — for every failure mode (invalid uuid, missing
 * enrollment, refunded enrollment, no such student) so a PT cannot probe
 * the platform for other users' existence.
 *
 * Side effect: attaches the enrollment row to req.enrollment.
 */
export const requirePtAccessToStudent = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const ptId = req.user?.id;
  if (!ptId) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
    return;
  }

  const studentId = req.params.studentId;
  if (!studentId || !UUID_RE.test(studentId)) {
    sendNotFound(res);
    return;
  }

  try {
    const [enrollment] = await db
      .select({
        id: enrollments.id,
        userId: enrollments.userId,
        courseId: enrollments.courseId,
        ptId: enrollments.ptId,
        enrolledAt: enrollments.enrolledAt,
      })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.ptId, ptId),
          eq(enrollments.userId, studentId),
          eq(enrollments.status, 'active'),
        ),
      )
      .limit(1);

    if (!enrollment) {
      sendNotFound(res);
      return;
    }

    req.enrollment = enrollment;
    next();
  } catch (err) {
    console.error('[pt-access.middleware] DB lookup failed:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Access check failed' },
    });
  }
};
