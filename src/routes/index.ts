import { Router } from 'express';
import authRouter from './auth.routes';
import usersRouter from './users.routes';

const router: Router = Router();

router.use('/auth', authRouter);
router.use('/users', usersRouter);
// router.use('/nutrition', nutritionRouter);
// router.use('/scan',      scanRouter);
// router.use('/workout',   workoutRouter);
// router.use('/pt',        ptRouter);
// router.use('/payment',   paymentRouter);
// router.use('/content',   contentRouter);
// router.use('/dashboard', dashboardRouter);

export default router;
