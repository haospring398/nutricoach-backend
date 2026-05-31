import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { requireRole } from '../middlewares/role.middleware';
import { requirePtAccessToStudent } from '../middlewares/pt-access.middleware';
import {
  getOwnVerificationStatusHandler,
  getPtMeHandler,
  submitVerificationHandler,
  updatePtMeHandler,
} from '../controllers/pt.controller';
import {
  archiveCourseHandler,
  createCourseHandler,
  getOwnCourseByIdHandler,
  listOwnCoursesHandler,
  patchCourseHandler,
  publishCourseHandler,
  replaceCurriculumHandler,
} from '../controllers/course.controller';
import {
  getStudentDetailHandler,
  listStudentsHandler,
  postExerciseAssignmentHandler,
  putMealPlanHandler,
} from '../controllers/pt-students.controller';
import {
  createWithdrawalHandler,
  getEarningsHandler,
  listOwnWithdrawalsHandler,
} from '../controllers/pt-earnings.controller';

const router: Router = Router();

router.use(authenticate);

// Any authenticated user (incl. a pending applicant) may submit / check status.

/**
 * @openapi
 * /pt/verification:
 *   post:
 *     tags: [PT]
 *     summary: Submit a PT verification application
 *     description: Any authenticated user. At most one pending application per user.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubmitVerificationBody'
 *     responses:
 *       201:
 *         description: Application submitted (PENDING_REVIEW)
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
 *         description: Already a PT (ALREADY_PT) or pending application exists (VERIFICATION_PENDING)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/verification', submitVerificationHandler);

/**
 * @openapi
 * /pt/verification/status:
 *   get:
 *     tags: [PT]
 *     summary: Get the caller's latest verification status
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Status (NONE if no application)
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
router.get('/verification/status', getOwnVerificationStatusHandler);

// PT only.

/**
 * @openapi
 * /pt/me:
 *   get:
 *     tags: [PT]
 *     summary: Get the current PT profile
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: PT profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       403:
 *         description: Forbidden (not a PT)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: PT profile not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   patch:
 *     tags: [PT]
 *     summary: Update the current PT profile
 *     description: commissionPercent is not editable here (admin-only later).
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdatePtProfileBody'
 *     responses:
 *       200:
 *         description: Updated PT profile
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
 *       403:
 *         description: Forbidden (not a PT)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: PT profile not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me', requireRole('pt'), getPtMeHandler);
router.patch('/me', requireRole('pt'), updatePtMeHandler);

// Phase 2: Courses (PT only).

/**
 * @openapi
 * /pt/courses:
 *   post:
 *     tags: [PT Courses]
 *     summary: Create a course (status DRAFT)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCourseBody'
 *     responses:
 *       201:
 *         description: Course created (DRAFT)
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
 *       403:
 *         description: Forbidden (not a PT)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   get:
 *     tags: [PT Courses]
 *     summary: List the PT's own courses (any status)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, PUBLISHED, ARCHIVED]
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
 *         description: Paginated course summaries
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       403:
 *         description: Forbidden (not a PT)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/courses', requireRole('pt'), createCourseHandler);
router.get('/courses', requireRole('pt'), listOwnCoursesHandler);

/**
 * @openapi
 * /pt/courses/{id}:
 *   get:
 *     tags: [PT Courses]
 *     summary: Get own course detail with curriculum
 *     description: Returns 404 for courses owned by another PT (no existence leak).
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
 *       403:
 *         description: Forbidden (not a PT)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   patch:
 *     tags: [PT Courses]
 *     summary: Update course metadata
 *     description: Once enrollments exist, priceVnd and durationDays are locked.
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
 *             $ref: '#/components/schemas/PatchCourseBody'
 *     responses:
 *       200:
 *         description: Updated course summary
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
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Locked by enrollments (COURSE_LOCKED_BY_ENROLLMENTS)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/courses/:id', requireRole('pt'), getOwnCourseByIdHandler);
router.patch('/courses/:id', requireRole('pt'), patchCourseHandler);

/**
 * @openapi
 * /pt/courses/{id}/curriculum:
 *   put:
 *     tags: [PT Courses]
 *     summary: Replace a course's curriculum (modules + lessons)
 *     description: Rejected once any non-refunded enrollment exists.
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
 *             $ref: '#/components/schemas/CourseCurriculumBody'
 *     responses:
 *       200:
 *         description: Full course detail after replacement
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
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Locked by enrollments (COURSE_LOCKED_BY_ENROLLMENTS)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  '/courses/:id/curriculum',
  requireRole('pt'),
  replaceCurriculumHandler,
);

/**
 * @openapi
 * /pt/courses/{id}/publish:
 *   post:
 *     tags: [PT Courses]
 *     summary: Publish a course (DRAFT to PUBLISHED)
 *     description: Requires every lesson to have a youtubeVideoId; PT self-publishes (no admin review in v1).
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
 *         description: Course published
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Course not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Invalid status transition (INVALID_COURSE_STATUS_TRANSITION)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: Curriculum incomplete (CURRICULUM_INCOMPLETE) — details lists offending lessons
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/courses/:id/publish',
  requireRole('pt'),
  publishCourseHandler,
);

/**
 * @openapi
 * /pt/courses/{id}/archive:
 *   post:
 *     tags: [PT Courses]
 *     summary: Archive a course (DRAFT or PUBLISHED to ARCHIVED)
 *     description: Existing enrollments retain access.
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
 *         description: Course archived
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Course not found
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
router.post(
  '/courses/:id/archive',
  requireRole('pt'),
  archiveCourseHandler,
);

// Phase 3: Student management.

/**
 * @openapi
 * /pt/students:
 *   get:
 *     tags: [PT Students]
 *     summary: List the PT's students
 *     description: Students enrolled in the PT's courses. Refunded enrollments are hidden unless status=REFUNDED.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         description: ILIKE match on student full name
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, COMPLETED, REFUNDED]
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
 *         description: Paginated student list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       403:
 *         description: Forbidden (not a PT)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/students', requireRole('pt'), listStudentsHandler);

/**
 * @openapi
 * /pt/students/{studentId}:
 *   get:
 *     tags: [PT Students]
 *     summary: Coaching dashboard for one student
 *     description: Requires an active enrollment between this PT and the student. Returns 404 for any access failure (no existence leak). PII-whitelisted.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Student coaching detail
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       403:
 *         description: Forbidden (not a PT)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Student not found / not enrolled with this PT (STUDENT_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get(
  '/students/:studentId',
  requireRole('pt'),
  requirePtAccessToStudent,
  getStudentDetailHandler,
);

/**
 * @openapi
 * /pt/students/{studentId}/meal-plan:
 *   put:
 *     tags: [PT Students]
 *     summary: Assign a meal plan to a student
 *     description: Supersedes any existing active meal plan for the enrollment.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PutMealPlanBody'
 *     responses:
 *       201:
 *         description: Meal plan assigned (includes supersededPreviousAssignmentId)
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
 *       403:
 *         description: Forbidden (not a PT)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Student not found / not enrolled with this PT (STUDENT_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put(
  '/students/:studentId/meal-plan',
  requireRole('pt'),
  requirePtAccessToStudent,
  putMealPlanHandler,
);

/**
 * @openapi
 * /pt/students/{studentId}/exercises:
 *   post:
 *     tags: [PT Students]
 *     summary: Assign an exercise to a student
 *     description: Provide either weight-training (sets + reps) or cardio (durationSec), not both.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PostExerciseAssignmentBody'
 *     responses:
 *       201:
 *         description: Exercise assigned
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
 *       403:
 *         description: Forbidden (not a PT)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Student not found (STUDENT_NOT_FOUND) or exercise not found (EXERCISE_NOT_FOUND)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/students/:studentId/exercises',
  requireRole('pt'),
  requirePtAccessToStudent,
  postExerciseAssignmentHandler,
);

// Phase 4: Earnings + Withdrawals (PT only).

/**
 * @openapi
 * /pt/earnings:
 *   get:
 *     tags: [PT Earnings]
 *     summary: PT earnings report
 *     description: Totals, derived available balance, and monthly breakdown.
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
 *         name: granularity
 *         schema:
 *           type: string
 *           enum: [month]
 *           default: month
 *     responses:
 *       200:
 *         description: Earnings report
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
 *       403:
 *         description: Forbidden (not a PT)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/earnings', requireRole('pt'), getEarningsHandler);

/**
 * @openapi
 * /pt/withdrawals:
 *   post:
 *     tags: [PT Earnings]
 *     summary: Request a withdrawal
 *     description: Requires an Idempotency-Key header. Bank account is snapshotted from the PT profile.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         description: 1-64 chars. Repeated key returns the first call's cached response.
 *         schema:
 *           type: string
 *           maxLength: 64
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateWithdrawalBody'
 *     responses:
 *       201:
 *         description: Withdrawal requested (first call)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       200:
 *         description: Idempotent replay of an existing request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error (bad body or missing Idempotency-Key)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden (not a PT)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: PT profile not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Insufficient balance (INSUFFICIENT_BALANCE)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   get:
 *     tags: [PT Earnings]
 *     summary: List the PT's own withdrawals
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING_APPROVAL, COMPLETED, REJECTED]
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
 *         description: Paginated withdrawal history
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       403:
 *         description: Forbidden (not a PT)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/withdrawals', requireRole('pt'), createWithdrawalHandler);
router.get('/withdrawals', requireRole('pt'), listOwnWithdrawalsHandler);

export default router;
