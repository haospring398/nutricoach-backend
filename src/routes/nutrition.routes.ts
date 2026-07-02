import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  createLog,
  dailySummary,
  deleteLog,
  generateMealPlan,
  getMealPlan,
  listLogs,
  updateLog,
} from '../controllers/nutrition.controller';

const router: Router = Router();

router.use(authenticate);

/**
 * @openapi
 * /nutrition/food-logs:
 *   post:
 *     tags: [Nutrition]
 *     summary: Create a food log
 *     description: Mode A logs from a catalog item (foodItemId + portionGrams); Mode B logs a custom entry (customName + macros).
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/CreateFoodLogModeA'
 *               - $ref: '#/components/schemas/CreateFoodLogModeB'
 *     responses:
 *       201:
 *         description: Food log created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Food item not found (Mode A)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   get:
 *     tags: [Nutrition]
 *     summary: List food logs for a date
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         description: Calendar date (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Food logs for the given date
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/food-logs', createLog);
router.get('/food-logs', listLogs);

/**
 * @openapi
 * /nutrition/food-logs/{id}:
 *   patch:
 *     tags: [Nutrition]
 *     summary: Update a food log
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateFoodLogBody'
 *     responses:
 *       200:
 *         description: Updated food log
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Food log not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   delete:
 *     tags: [Nutrition]
 *     summary: Delete a food log
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted (no content)
 *       404:
 *         description: Food log not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/food-logs/:id', updateLog);
router.delete('/food-logs/:id', deleteLog);

/**
 * @openapi
 * /nutrition/summary/daily:
 *   get:
 *     tags: [Nutrition]
 *     summary: Daily nutrition summary
 *     description: Totals (calories + macros) and per-meal breakdown for a calendar date.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         description: Calendar date (YYYY-MM-DD)
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Daily summary
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/summary/daily', dailySummary);

/**
 * @openapi
 * /nutrition/meal-plans/generate:
 *   post:
 *     tags: [Nutrition]
 *     summary: Generate an AI meal plan (synchronous)
 *     description: >
 *       Loads the caller's onboarding metrics and forwards them to the AI
 *       microservice's /plan endpoint ({ question, userInfo } contract),
 *       returning the generated multi-day meal + exercise plan. Retries transient
 *       AI failures (429/502/503/504) up to 3x, injects a default exercise plan
 *       when the AI omits one, and upserts the result into meal_plans (one row
 *       per user) so it can be re-read via GET /nutrition/meal-plans. Requires
 *       completed onboarding.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Generated meal plan (summary, calories_target, daily_meals, exercise_plan)
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
 *       404:
 *         description: USER_METRICS_NOT_FOUND (onboarding not completed)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: INTERNAL_ERROR (failed to persist the generated plan)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: AI_SERVICE_UNAVAILABLE (AI microservice down or errored)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/meal-plans/generate', generateMealPlan);

/**
 * @openapi
 * /nutrition/meal-plans:
 *   get:
 *     tags: [Nutrition]
 *     summary: Get the latest saved meal plan
 *     description: >
 *       Returns the caller's most recently generated meal + exercise plan
 *       (persisted by POST /nutrition/meal-plans/generate). Returns 404 when the
 *       user has never generated a plan.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: The saved meal plan (summary, calories_target, daily_meals, exercise_plan)
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
 *       404:
 *         description: MEAL_PLAN_NOT_FOUND (user has not generated a plan yet)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/meal-plans', getMealPlan);

export default router;
