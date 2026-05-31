import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import {
  approvePtVerificationHandler,
  getPtVerificationByIdHandler,
  listPtVerificationsHandler,
  rejectPtVerificationHandler,
} from '../controllers/admin.controller';
import {
  adminApproveWithdrawalHandler,
  adminListWithdrawalsHandler,
  adminRejectWithdrawalHandler,
} from '../controllers/pt-earnings.controller';

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

export default router;
