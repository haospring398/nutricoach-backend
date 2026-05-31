import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  createSessionHandler,
  deleteSessionHandler,
  getExerciseByIdHandler,
  getSessionByIdHandler,
  listExercisesHandler,
  listSessionsHandler,
  updateSessionHandler,
} from '../controllers/workout.controller';

const router: Router = Router();

router.use(authenticate);

// Exercise library (static, read-only)

/**
 * @openapi
 * /workout/exercises:
 *   get:
 *     tags: [Workout]
 *     summary: List exercises from the library
 *     description: Read-only seeded catalog, filterable by muscle group, equipment, difficulty, and name search.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: muscleGroup
 *         schema:
 *           type: string
 *           enum: [CHEST, BACK, SHOULDERS, BICEPS, TRICEPS, LEGS, GLUTES, CORE, CARDIO, FULL_BODY]
 *       - in: query
 *         name: equipment
 *         schema:
 *           type: string
 *           enum: [BODYWEIGHT, DUMBBELL, BARBELL, MACHINE, KETTLEBELL, BAND, CABLE, OTHER]
 *       - in: query
 *         name: difficulty
 *         schema:
 *           type: string
 *           enum: [BEGINNER, INTERMEDIATE, ADVANCED]
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
 *         description: Paginated exercises
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
router.get('/exercises', listExercisesHandler);

/**
 * @openapi
 * /workout/exercises/{id}:
 *   get:
 *     tags: [Workout]
 *     summary: Get an exercise by slug id
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Exercise slug (e.g. ex_pushup_standard)
 *         schema:
 *           type: string
 *           pattern: '^ex_[a-z0-9_]+$'
 *     responses:
 *       200:
 *         description: Exercise detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Exercise not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/exercises/:id', getExerciseByIdHandler);

// Sessions

/**
 * @openapi
 * /workout/sessions:
 *   post:
 *     tags: [Workout]
 *     summary: Log a workout session
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSessionBody'
 *     responses:
 *       201:
 *         description: Session created
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
 *         description: Referenced exercise not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   get:
 *     tags: [Workout]
 *     summary: List the current user's workout sessions
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
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
 *         description: Paginated session summaries
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
router.post('/sessions', createSessionHandler);
router.get('/sessions', listSessionsHandler);

/**
 * @openapi
 * /workout/sessions/{id}:
 *   get:
 *     tags: [Workout]
 *     summary: Get a workout session with its exercise logs
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
 *         description: Session detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   patch:
 *     tags: [Workout]
 *     summary: Update a workout session's metadata
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
 *             $ref: '#/components/schemas/UpdateSessionBody'
 *     responses:
 *       200:
 *         description: Updated session
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
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   delete:
 *     tags: [Workout]
 *     summary: Delete a workout session
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
 *       204:
 *         description: Deleted (no content)
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/sessions/:id', getSessionByIdHandler);
router.patch('/sessions/:id', updateSessionHandler);
router.delete('/sessions/:id', deleteSessionHandler);

export default router;
