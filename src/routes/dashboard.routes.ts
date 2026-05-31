import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { getUserDashboardHandler } from '../controllers/dashboard.controller';

const router: Router = Router();

router.use(authenticate);

/**
 * @openapi
 * /dashboard/user:
 *   get:
 *     tags: [Dashboard]
 *     summary: User home-screen aggregate
 *     description: Today's calories/macros, meal breakdown, logging streak, weight, and goal in one payload.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard aggregate
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/user', getUserDashboardHandler);

export default router;
