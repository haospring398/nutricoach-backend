import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  diaryLockHandler,
  getDailyQuestsHandler,
  getPointsHandler,
  triggerQuestHandler,
} from '../controllers/quest.controller';

const router: Router = Router();

router.use(authenticate);

/**
 * @openapi
 * /quests/daily:
 *   get:
 *     tags: [Quests]
 *     summary: List today's quests + progress (auto-triggers DAILY_LOGIN)
 *     description: Returns the active quest catalog with today's per-quest progress. The first call of a VN calendar day auto-awards DAILY_LOGIN; dailyLoginTriggered reflects whether it fired.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Daily quests, progress, and totalPoints
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
router.get('/daily', getDailyQuestsHandler);

/**
 * @openapi
 * /quests/trigger:
 *   post:
 *     tags: [Quests]
 *     summary: Trigger a client-verifiable quest
 *     description: WORKOUT_DONE is server-verified against workout_sessions; AI_SCAN/PT_VISIT/DAILY_SHARE are client-verified with a DB daily cap. DAILY_LOGIN/PERFECT_DIARY/DISCIPLINE_MASTER are not accepted here.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TriggerQuestBody'
 *     responses:
 *       200:
 *         description: 'Result: { triggered, pointsAwarded, totalPoints }. triggered=false when the daily cap is already reached.'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error, REFERENCE_REQUIRED, or INVALID_REFERENCE
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Quest not found or inactive (QUEST_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/trigger', triggerQuestHandler);

/**
 * @openapi
 * /quests/diary-lock:
 *   post:
 *     tags: [Quests]
 *     summary: Lock the day's diary (PERFECT_DIARY + DISCIPLINE_MASTER)
 *     description: Awards PERFECT_DIARY when BREAKFAST, LUNCH, and DINNER are all logged for the date, and DISCIPLINE_MASTER when total calories are within TDEE.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DiaryLockBody'
 *     responses:
 *       200:
 *         description: 'Result: { missionsCompleted, pointsAwarded, totalPoints }'
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
 *       409:
 *         description: Diary incomplete (DIARY_INCOMPLETE) — not all 3 meals logged
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/diary-lock', diaryLockHandler);

/**
 * @openapi
 * /quests/points:
 *   get:
 *     tags: [Quests]
 *     summary: Total points + paginated award history
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 20
 *     responses:
 *       200:
 *         description: totalPoints, history, pagination
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
router.get('/points', getPointsHandler);

export default router;
