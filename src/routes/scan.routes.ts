import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { uploadSingle } from '../middlewares/upload.middleware';
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
 *       Uploads a food image (multipart/form-data, field `image`); the backend
 *       converts it to base64 and proxies to the AI microservice (Gemini vision →
 *       dataset retrieval → Vietnamese answer), persists the image hash + result,
 *       and triggers the AI_SCAN quest server-side (daily cap 3). FREE users are
 *       limited to 3 scans per calendar day (VN timezone); PRO users are
 *       unlimited. Returns a structured food result (name, calories, macros,
 *       confidence, ingredients, portion) mapped from the AI extraction.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [image]
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: JPG/PNG image file
 *               question:
 *                 type: string
 *                 maxLength: 300
 *                 description: Optional question for the model (Vietnamese)
 *     responses:
 *       200:
 *         description: Structured food result (scanId, foodName, calories, macros, confidence, ingredients, portion, quest)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error (missing/invalid image file)
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
 *       403:
 *         description: SCAN_LIMIT_REACHED (FREE daily scan cap of 3 reached)
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
router.post('/', uploadSingle('image'), scan);

export default router;
