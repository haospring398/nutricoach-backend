import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  discoverCoursesHandler,
  getPublicCourseDetailHandler,
} from '../controllers/course.controller';

const router: Router = Router();

router.use(authenticate);

/**
 * @openapi
 * /content/discover/pt-courses:
 *   get:
 *     tags: [Content]
 *     summary: Discover published PT courses
 *     description: Any authenticated user. Lists only PUBLISHED courses, filterable by search/tag/PT/price.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         description: Title trigram + ILIKE search
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 40
 *       - in: query
 *         name: ptId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: maxPriceVnd
 *         schema:
 *           type: integer
 *           minimum: 50000
 *           maximum: 50000000
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
 *         description: Paginated list of published courses with PT excerpt
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
 */
router.get('/discover/pt-courses', discoverCoursesHandler);

/**
 * @openapi
 * /content/pt-courses/{id}:
 *   get:
 *     tags: [Content]
 *     summary: Get a published PT course detail
 *     description: Returns full curriculum + PT excerpt. 404 for non-published courses (no draft/archived leakage).
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
 *         description: Course detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Course not found or not published
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/pt-courses/:id', getPublicCourseDetailHandler);

// Articles endpoints will be added in a later phase. Do not stub.

export default router;
