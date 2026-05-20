import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { getUserDashboardHandler } from '../controllers/dashboard.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/user', getUserDashboardHandler);

export default router;
