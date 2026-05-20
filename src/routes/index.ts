import { Router } from 'express';
import authRouter from './auth.routes';
import usersRouter from './users.routes';
import nutritionRouter from './nutrition.routes';
import foodsRouter from './foods.routes';
import dashboardRouter from './dashboard.routes';

const router: Router = Router();

router.use('/auth', authRouter);
router.use('/users', usersRouter);
router.use('/nutrition', nutritionRouter);
router.use('/foods', foodsRouter);
router.use('/dashboard', dashboardRouter);
// router.use('/scan',      scanRouter);
// router.use('/workout',   workoutRouter);
// router.use('/pt',        ptRouter);
// router.use('/payment',   paymentRouter);
// router.use('/content',   contentRouter);

export default router;
