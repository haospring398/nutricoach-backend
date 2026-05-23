import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  changeMyPassword,
  deleteMyAccount,
  me,
  myMetrics,
  onboarding,
  patchMe,
} from '../controllers/users.controller';
import { listMyAssignmentsHandler } from '../controllers/pt-students.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/me', me);
router.patch('/me', patchMe);
router.post('/me/onboarding', onboarding);
router.get('/me/metrics', myMetrics);
router.post('/me/change-password', changeMyPassword);
router.delete('/me', deleteMyAccount);

// Phase 3: student-side PT assignment feed (active rows only).
router.get('/me/pt-assignments', listMyAssignmentsHandler);

export default router;
