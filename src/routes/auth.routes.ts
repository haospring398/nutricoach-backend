import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  forgotPassword,
  login,
  logout,
  logoutAll,
  me,
  refresh,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
} from '../controllers/auth.controller';

const router: Router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.post('/logout-all', authenticate, logoutAll);
router.get('/me', authenticate, me);

router.post('/verify-email', verifyEmail);
router.post('/resend-verification', authenticate, resendVerification);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
