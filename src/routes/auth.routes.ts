import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  login,
  logout,
  me,
  refresh,
  register,
} from '../controllers/auth.controller';

const router: Router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, me);

export default router;
