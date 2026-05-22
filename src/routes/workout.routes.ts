import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  createSessionHandler,
  deleteSessionHandler,
  getExerciseByIdHandler,
  getSessionByIdHandler,
  listExercisesHandler,
  listSessionsHandler,
  updateSessionHandler,
} from '../controllers/workout.controller';

const router: Router = Router();

router.use(authenticate);

// Exercise library (static, read-only)
router.get('/exercises', listExercisesHandler);
router.get('/exercises/:id', getExerciseByIdHandler);

// Sessions
router.post('/sessions', createSessionHandler);
router.get('/sessions', listSessionsHandler);
router.get('/sessions/:id', getSessionByIdHandler);
router.patch('/sessions/:id', updateSessionHandler);
router.delete('/sessions/:id', deleteSessionHandler);

export default router;
