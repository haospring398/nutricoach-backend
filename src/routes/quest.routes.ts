import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  diaryLockHandler,
  getDailyQuestsHandler,
  getMyRedemptions,
  getPointsHandler,
  getRewards,
  redeem,
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

/**
 * @openapi
 * /quests/rewards:
 *   get:
 *     tags: [Quests]
 *     summary: List active redeemable rewards
 *     description: Active rewards ordered by pointsRequired ascending. Each carries a derived tier (SMALL ≤ 500 pts, LARGE > 500 pts).
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Active rewards with derived tier
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
router.get('/rewards', getRewards);

/**
 * @openapi
 * /quests/redeem:
 *   post:
 *     tags: [Quests]
 *     summary: Redeem a reward with points
 *     description: Atomically deducts pointsRequired from the caller's balance and creates a PENDING redemption. SMALL rewards generate a voucher code and email it (fire-and-forget); LARGE rewards are fulfilled offline by an admin.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rewardId, deliveryAddress, phone]
 *             properties:
 *               rewardId: { type: string, format: uuid }
 *               deliveryAddress: { type: string, minLength: 5, maxLength: 255 }
 *               phone: { type: string, description: Vietnamese mobile (0xxxxxxxxx or +84xxxxxxxxx) }
 *     responses:
 *       201:
 *         description: 'Redemption created: { redemption, totalPoints }'
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
 *         description: Reward not found or inactive (REWARD_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Insufficient points (INSUFFICIENT_POINTS)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/redeem', redeem);

/**
 * @openapi
 * /quests/redemptions:
 *   get:
 *     tags: [Quests]
 *     summary: The caller's own redemption history (paginated, newest first)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated redemptions
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
router.get('/redemptions', getMyRedemptions);

export default router;
