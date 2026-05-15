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

const router: Router = Router();

router.use(authenticate);

router.get('/me', me);
router.patch('/me', patchMe);
router.post('/me/onboarding', onboarding);
router.get('/me/metrics', myMetrics);
router.post('/me/change-password', changeMyPassword);
router.delete('/me', deleteMyAccount);

export default router;
