import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import {
  getOwnVerificationStatusHandler,
  getPtMeHandler,
  submitVerificationHandler,
  updatePtMeHandler,
} from '../controllers/pt.controller';

const router: Router = Router();

router.use(authenticate);

// Any authenticated user (incl. a pending applicant) may submit / check status.
router.post('/verification', submitVerificationHandler);
router.get('/verification/status', getOwnVerificationStatusHandler);

// PT only.
router.get('/me', requireRole('pt'), getPtMeHandler);
router.patch('/me', requireRole('pt'), updatePtMeHandler);

// Phase 2+ endpoints (courses, students, earnings, withdrawals) are
// deliberately not registered — Express returns its default 404.

export default router;
