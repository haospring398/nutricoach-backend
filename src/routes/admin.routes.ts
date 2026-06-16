import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import {
  approvePtVerificationHandler,
  fulfillRewardRedemption,
  getPtVerificationByIdHandler,
  listPtVerificationsHandler,
  listRewardRedemptions,
  rejectPtVerificationHandler,
  rejectRewardRedemption,
} from '../controllers/admin.controller';
import {
  adminApproveWithdrawalHandler,
  adminListWithdrawalsHandler,
  adminRejectWithdrawalHandler,
} from '../controllers/pt-earnings.controller';
import {
  adminListArticlesHandler,
  archiveArticleHandler,
  createArticleHandler,
  createCategoryHandler,
  getAdminArticleById,
  publishArticleHandler,
  updateArticleHandler,
} from '../controllers/content.controller';
import {
  adminCreateQuestHandler,
  adminLeaderboardHandler,
  adminListQuestsHandler,
  adminUpdateQuestHandler,
} from '../controllers/quest.controller';

const router: Router = Router();

router.use(authenticate);
router.use(requireRole('admin'));

/**
 * @openapi
 * /admin/pt-verifications:
 *   get:
 *     tags: [Admin]
 *     summary: List PT verification applications
 *     description: Admin-only. Paginated list, optionally filtered by status.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING_REVIEW, APPROVED, REJECTED]
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
 *           maximum: 50
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated list of verification applications
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       403:
 *         description: Forbidden (caller is not an admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/pt-verifications', listPtVerificationsHandler);

/**
 * @openapi
 * /admin/pt-verifications/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a PT verification application by id
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
 *       200:
 *         description: Full verification detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Verification not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/pt-verifications/:id', getPtVerificationByIdHandler);

/**
 * @openapi
 * /admin/pt-verifications/{id}/approve:
 *   post:
 *     tags: [Admin]
 *     summary: Approve a PT verification
 *     description: Marks the verification approved, creates the pt_profiles row, and promotes the user to role PT.
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
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ApproveVerificationBody'
 *     responses:
 *       200:
 *         description: Verification approved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Verification not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Verification already reviewed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/pt-verifications/:id/approve', approvePtVerificationHandler);

/**
 * @openapi
 * /admin/pt-verifications/{id}/reject:
 *   post:
 *     tags: [Admin]
 *     summary: Reject a PT verification
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
 *             $ref: '#/components/schemas/RejectVerificationBody'
 *     responses:
 *       200:
 *         description: Verification rejected
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
 *         description: Verification not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Verification already reviewed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/pt-verifications/:id/reject', rejectPtVerificationHandler);

// Phase 4: Withdrawals.

/**
 * @openapi
 * /admin/withdrawals:
 *   get:
 *     tags: [Admin]
 *     summary: List withdrawal requests
 *     description: Admin-only. Paginated, optionally filtered by status and/or PT id.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING_APPROVAL, COMPLETED, REJECTED]
 *       - in: query
 *         name: ptId
 *         schema:
 *           type: string
 *           format: uuid
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
 *           maximum: 50
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated list of withdrawals (each row includes PT name)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       403:
 *         description: Forbidden (caller is not an admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/withdrawals', adminListWithdrawalsHandler);

/**
 * @openapi
 * /admin/withdrawals/{id}/approve:
 *   post:
 *     tags: [Admin]
 *     summary: Approve a withdrawal and record the transfer reference
 *     description: Marks the withdrawal completed. The admin performs the bank transfer manually and records its reference here.
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
 *             $ref: '#/components/schemas/ApproveWithdrawalBody'
 *     responses:
 *       200:
 *         description: Withdrawal marked completed
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
 *         description: Withdrawal not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Withdrawal already reviewed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/withdrawals/:id/approve', adminApproveWithdrawalHandler);

/**
 * @openapi
 * /admin/withdrawals/{id}/reject:
 *   post:
 *     tags: [Admin]
 *     summary: Reject a withdrawal
 *     description: Marks the withdrawal rejected with a reason; the reserved balance is released automatically.
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
 *             $ref: '#/components/schemas/RejectWithdrawalBody'
 *     responses:
 *       200:
 *         description: Withdrawal marked rejected
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
 *         description: Withdrawal not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Withdrawal already reviewed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/withdrawals/:id/reject', adminRejectWithdrawalHandler);

// ── Articles (write) ──────────────────────────────────────────
// requireRole('admin') is already applied at the router level.

/**
 * @openapi
 * /admin/articles:
 *   get:
 *     tags: [Admin]
 *     summary: List all articles (any status)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, PUBLISHED, ARCHIVED]
 *       - in: query
 *         name: category
 *         description: Category slug
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 64
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
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
 *           maximum: 50
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated articles (all statuses)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       403:
 *         description: Forbidden (not an admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     tags: [Admin]
 *     summary: Create a draft article
 *     description: Slug and readingTimeMin are server-generated. Author is the calling admin.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateArticleBody'
 *     responses:
 *       201:
 *         description: Draft article created
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
 *         description: Category not found (CATEGORY_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/articles', adminListArticlesHandler);
router.post('/articles', createArticleHandler);

/**
 * @openapi
 * /admin/articles/{id}:
 *   get:
 *     tags: [Admin]
 *     summary: Get an article by id (any status — draft preview)
 *     description: Returns full article detail regardless of status (draft / published / archived). Does not increment view_count.
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
 *       200:
 *         description: Full article detail
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
 *       403:
 *         description: Forbidden (caller is not an admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Article not found (ARTICLE_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   patch:
 *     tags: [Admin]
 *     summary: Update an article
 *     description: Editing the body recomputes readingTimeMin. The slug never changes.
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
 *             $ref: '#/components/schemas/PatchArticleBody'
 *     responses:
 *       200:
 *         description: Updated article
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
 *         description: Article or category not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/articles/:id', getAdminArticleById);
router.patch('/articles/:id', updateArticleHandler);

/**
 * @openapi
 * /admin/articles/{id}/publish:
 *   post:
 *     tags: [Admin]
 *     summary: Publish an article (DRAFT to PUBLISHED)
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
 *       200:
 *         description: Article published
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Article not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Invalid status transition (INVALID_ARTICLE_STATUS_TRANSITION)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Article incomplete (ARTICLE_INCOMPLETE)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/articles/:id/publish', publishArticleHandler);

/**
 * @openapi
 * /admin/articles/{id}/archive:
 *   post:
 *     tags: [Admin]
 *     summary: Archive an article (DRAFT or PUBLISHED to ARCHIVED)
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
 *       200:
 *         description: Article archived
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Article not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Invalid status transition (already archived)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/articles/:id/archive', archiveArticleHandler);

/**
 * @openapi
 * /admin/categories:
 *   post:
 *     tags: [Admin]
 *     summary: Create an article category
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCategoryBody'
 *     responses:
 *       201:
 *         description: Category created
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
 *         description: Category slug already exists (CATEGORY_SLUG_EXISTS)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/categories', createCategoryHandler);

// ── Quests (admin) ────────────────────────────────────────────
// requireRole('admin') is already applied at the router level.

/**
 * @openapi
 * /admin/quests:
 *   get:
 *     tags: [Quests]
 *     summary: List the quest catalog (admin)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: All quests, ordered by id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       403:
 *         description: Forbidden (not an admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     tags: [Quests]
 *     summary: Create a quest
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateQuestBody'
 *     responses:
 *       201:
 *         description: Quest created
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
 *         description: Quest id already exists (QUEST_ID_EXISTS)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/quests', adminListQuestsHandler);
router.post('/quests', adminCreateQuestHandler);

/**
 * @openapi
 * /admin/quests/leaderboard:
 *   get:
 *     tags: [Quests]
 *     summary: Top users by total points
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         description: Max 100 (default 50)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *     responses:
 *       200:
 *         description: Ranked leaderboard
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       403:
 *         description: Forbidden (not an admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/quests/leaderboard', adminLeaderboardHandler);

/**
 * @openapi
 * /admin/quests/redemptions:
 *   get:
 *     tags: [Admin]
 *     summary: List reward redemptions (filterable, paginated)
 *     description: Admin-only. Each row includes the redeeming user's fullName/email. Filter by status.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, FULFILLED, REJECTED]
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated redemptions (with user info)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       403:
 *         description: Forbidden (not an admin)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/quests/redemptions', listRewardRedemptions);

/**
 * @openapi
 * /admin/quests/redemptions/{id}/fulfill:
 *   patch:
 *     tags: [Admin]
 *     summary: Mark a redemption fulfilled (PENDING → FULFILLED)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               adminNote: { type: string, maxLength: 500 }
 *     responses:
 *       200:
 *         description: Redemption fulfilled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Redemption not found (REDEMPTION_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Redemption already reviewed (REDEMPTION_ALREADY_REVIEWED)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/quests/redemptions/:id/fulfill', fulfillRewardRedemption);

/**
 * @openapi
 * /admin/quests/redemptions/{id}/reject:
 *   patch:
 *     tags: [Admin]
 *     summary: Reject a redemption and refund points (PENDING → REJECTED)
 *     description: Refunds pointsCost to the user's balance exactly once. adminNote (reject reason) is required.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [adminNote]
 *             properties:
 *               adminNote: { type: string, minLength: 5, maxLength: 500 }
 *     responses:
 *       200:
 *         description: Redemption rejected and points refunded
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
 *         description: Redemption not found (REDEMPTION_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Redemption already reviewed (REDEMPTION_ALREADY_REVIEWED)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/quests/redemptions/:id/reject', rejectRewardRedemption);

/**
 * @openapi
 * /admin/quests/{id}:
 *   patch:
 *     tags: [Quests]
 *     summary: Update a quest
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateQuestBody'
 *     responses:
 *       200:
 *         description: Quest updated
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
 *         description: Quest not found (QUEST_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/quests/:id', adminUpdateQuestHandler);

export default router;
