import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import {
  approvePtVerificationHandler,
  getPtVerificationByIdHandler,
  listPtVerificationsHandler,
  rejectPtVerificationHandler,
} from '../controllers/admin.controller';
import {
  adminApproveWithdrawalHandler,
  adminListWithdrawalsHandler,
  adminRejectWithdrawalHandler,
} from '../controllers/pt-earnings.controller';

const router: Router = Router();

router.use(authenticate);
router.use(requireRole('admin'));

router.get('/pt-verifications', listPtVerificationsHandler);
router.get('/pt-verifications/:id', getPtVerificationByIdHandler);
router.post('/pt-verifications/:id/approve', approvePtVerificationHandler);
router.post('/pt-verifications/:id/reject', rejectPtVerificationHandler);

// Phase 4: Withdrawals.
router.get('/withdrawals', adminListWithdrawalsHandler);
router.post('/withdrawals/:id/approve', adminApproveWithdrawalHandler);
router.post('/withdrawals/:id/reject', adminRejectWithdrawalHandler);

export default router;
