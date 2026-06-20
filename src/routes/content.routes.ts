import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  discoverCoursesHandler,
  getPublicCourseDetailHandler,
} from '../controllers/course.controller';
import {
  getArticleBySlugHandler,
  listArticlesHandler,
  listCategoriesHandler,
} from '../controllers/content.controller';

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
 *     description: Returns full curriculum + PT info (id, fullName, avatarUrl, full bio in bioExcerpt, specialties). 404 for non-published courses (no draft/archived leakage).
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

// ── Articles (read) ───────────────────────────────────────────
// authenticate is already applied at the router level. NOTE: spec 12.1 marks
// these PUBLIC, but the deployed /content router requires auth (the PT-course
// endpoints above do too), so for router consistency these require auth as
// well. Flagged to the architect.

/**
 * @openapi
 * /content/articles:
 *   get:
 *     tags: [Content]
 *     summary: List published articles
 *     description: Paginated feed of PUBLISHED articles. List cards omit the body. Filter by category slug, tag, or title search.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         description: Category slug (e.g. nutrition). Unknown slug returns an empty list.
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 64
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 40
 *       - in: query
 *         name: search
 *         description: Trigram + ILIKE search on title
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
 *         description: Paginated article cards
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
router.get('/articles', listArticlesHandler);

/**
 * @openapi
 * /content/categories:
 *   get:
 *     tags: [Content]
 *     summary: List article categories
 *     description: Ordered by displayOrder. Each includes a published-article count.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Category list
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
router.get('/categories', listCategoriesHandler);

/**
 * @openapi
 * /content/articles/{slug}:
 *   get:
 *     tags: [Content]
 *     summary: Get a published article by slug
 *     description: Returns the full article including Markdown body. Increments view_count (fire-and-forget). 404 for non-published slugs.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *           maxLength: 280
 *     responses:
 *       200:
 *         description: Article detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Article not found or not published (ARTICLE_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// Declared after /categories so the static path is matched first.
router.get('/articles/:slug', getArticleBySlugHandler);

export default router;
