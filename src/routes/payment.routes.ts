import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  createCheckoutHandler,
  getSubscriptionHandler,
  listTransactionsHandler,
  payosWebhookHandler,
} from '../controllers/payment.controller';
import { listPurchasedCoursesHandler } from '../controllers/course.controller';

const router: Router = Router();

// Webhook is unauthenticated — security is PayOS signature verification.
// Declared before `authenticate` so the middleware does not apply to it.
// Raw body is captured globally via the express.json verify callback (app.ts).
/**
 * @openapi
 * /payment/webhook/payos:
 *   post:
 *     tags: [Payment]
 *     summary: PayOS payment webhook
 *     description: Unauthenticated — security is the PayOS signature. Always returns 200 once processed (or on a forged signature) so PayOS does not retry. Does not use the standard envelope.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: PayOS webhook envelope ({ code, desc, success, data, signature }).
 *     responses:
 *       200:
 *         description: 'Received. Body: { received: true, action: paid|already_paid|unknown_order|amount_mismatch }'
 *       400:
 *         description: Malformed JSON body (INVALID_JSON)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Processing failure (WEBHOOK_PROCESSING_ERROR) — PayOS retries
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/webhook/payos', payosWebhookHandler);

router.use(authenticate);

/**
 * @openapi
 * /payment/checkout:
 *   post:
 *     tags: [Payment]
 *     summary: Create a PayOS checkout (PRO subscription or PT course)
 *     description: Returns 201 on first call, 200 on idempotent replay. For PT_COURSE, productId (a published course) is required.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         description: UUID. A repeated key returns the first call's cached response.
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CheckoutBody'
 *     responses:
 *       201:
 *         description: Checkout created (first call)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       200:
 *         description: Idempotent replay of an existing checkout
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error (bad body or missing Idempotency-Key / productId)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Course not found or not published (PT_COURSE)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Already enrolled in this course (ALREADY_ENROLLED)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: PayOS unavailable (PAYOS_UNAVAILABLE)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/checkout', createCheckoutHandler);

/**
 * @openapi
 * /payment/transactions:
 *   get:
 *     tags: [Payment]
 *     summary: List the current user's transactions
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, FAILED, EXPIRED, CANCELLED]
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
 *         description: Paginated transactions
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
router.get('/transactions', listTransactionsHandler);

/**
 * @openapi
 * /payment/subscription:
 *   get:
 *     tags: [Payment]
 *     summary: Get the current user's subscription
 *     description: Returns status NONE when there is no active subscription; EXPIRED is computed on read.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription status
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
router.get('/subscription', getSubscriptionHandler);

/**
 * @openapi
 * /payment/courses:
 *   get:
 *     tags: [Payment]
 *     summary: List the current user's purchased courses
 *     description: One row per non-refunded enrollment, newest first.
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
 *           maximum: 50
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated purchased courses
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
router.get('/courses', listPurchasedCoursesHandler);

export default router;
