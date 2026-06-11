import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { scan } from '../controllers/scan.controller';

const router: Router = Router();

router.use(authenticate);

/**
 * @openapi
 * /scan:
 *   post:
 *     tags: [Scan]
 *     summary: AI food scan
 *     description: >
 *       Sends a base64 food image to the AI microservice (Gemini vision →
 *       dataset retrieval → Vietnamese answer), persists the image hash + result,
 *       and triggers the AI_SCAN quest server-side (daily cap 3). Returns the
 *       extraction, matched dataset rows and the free-text answer — not
 *       structured S/M/L sizes or per-macro numbers.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [imageBase64]
 *             properties:
 *               imageBase64:
 *                 type: string
 *                 description: Raw base64 image (no `data:` prefix)
 *               question:
 *                 type: string
 *                 maxLength: 300
 *                 description: Optional question for the model (Vietnamese)
 *     responses:
 *       200:
 *         description: Scan result (extraction, matched rows, answer, quest)
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
 *       503:
 *         description: AI_SERVICE_UNAVAILABLE (AI microservice down or errored)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', scan);

export default router;
