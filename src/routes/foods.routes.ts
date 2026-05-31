import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  categories,
  getById,
  search,
} from '../controllers/foods.controller';

const router: Router = Router();

router.use(authenticate);

/**
 * @openapi
 * /foods/search:
 *   get:
 *     tags: [Foods]
 *     summary: Search the food catalog
 *     description: Trigram + ILIKE search over Vietnamese/English names, with optional filters.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [INGREDIENT, DISH]
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           maxLength: 128
 *       - in: query
 *         name: completeness
 *         schema:
 *           type: string
 *           enum: [FULL, PARTIAL, CALORIES_ONLY]
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
 *         description: Paginated search hits
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
router.get('/search', search);

/**
 * @openapi
 * /foods/categories:
 *   get:
 *     tags: [Foods]
 *     summary: List food categories with counts
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [INGREDIENT, DISH]
 *     responses:
 *       200:
 *         description: Categories with item counts
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
router.get('/categories', categories);

/**
 * @openapi
 * /foods/{id}:
 *   get:
 *     tags: [Foods]
 *     summary: Get a food item by id
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
 *         description: Food item detail (full nutrient profile)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error (id not a UUID)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Food item not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', getById);

export default router;
