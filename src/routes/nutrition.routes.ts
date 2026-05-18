import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  createLog,
  dailySummary,
  deleteLog,
  listLogs,
  updateLog,
} from '../controllers/nutrition.controller';

const router: Router = Router();

router.use(authenticate);

router.post('/food-logs', createLog);
router.get('/food-logs', listLogs);
router.patch('/food-logs/:id', updateLog);
router.delete('/food-logs/:id', deleteLog);
router.get('/summary/daily', dailySummary);

export default router;
