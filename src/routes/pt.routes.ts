import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import {
  getOwnVerificationStatusHandler,
  getPtMeHandler,
  submitVerificationHandler,
  updatePtMeHandler,
} from '../controllers/pt.controller';
import {
  archiveCourseHandler,
  createCourseHandler,
  getOwnCourseByIdHandler,
  listOwnCoursesHandler,
  patchCourseHandler,
  publishCourseHandler,
  replaceCurriculumHandler,
} from '../controllers/course.controller';

const router: Router = Router();

router.use(authenticate);

// Any authenticated user (incl. a pending applicant) may submit / check status.
router.post('/verification', submitVerificationHandler);
router.get('/verification/status', getOwnVerificationStatusHandler);

// PT only.
router.get('/me', requireRole('pt'), getPtMeHandler);
router.patch('/me', requireRole('pt'), updatePtMeHandler);

// Phase 2: Courses (PT only).
router.post('/courses', requireRole('pt'), createCourseHandler);
router.get('/courses', requireRole('pt'), listOwnCoursesHandler);
router.get('/courses/:id', requireRole('pt'), getOwnCourseByIdHandler);
router.patch('/courses/:id', requireRole('pt'), patchCourseHandler);
router.put(
  '/courses/:id/curriculum',
  requireRole('pt'),
  replaceCurriculumHandler,
);
router.post(
  '/courses/:id/publish',
  requireRole('pt'),
  publishCourseHandler,
);
router.post(
  '/courses/:id/archive',
  requireRole('pt'),
  archiveCourseHandler,
);

// Phase 3+ endpoints (/pt/students, /pt/earnings, /pt/withdrawals) are
// deliberately not registered — Express returns its default 404.

export default router;
