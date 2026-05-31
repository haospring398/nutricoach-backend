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

export default router;
