import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  changeMyPassword,
  deleteMyAccount,
  me,
  myMetrics,
  onboarding,
  patchMe,
  updateMyMetrics,
  uploadAvatar,
} from '../controllers/users.controller';
import { listMyAssignmentsHandler } from '../controllers/pt-students.controller';
import { uploadSingle } from '../middlewares/upload.middleware';

const router: Router = Router();

router.use(authenticate);

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get the current user (canonical)
 *     description: Canonical "who am I" endpoint. Includes metrics (BMR/TDEE/daily targets) and onboarding status.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user with metrics
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
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me', me);

/**
 * @openapi
 * /users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update the current user's profile
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateMeBody'
 *     responses:
 *       200:
 *         description: Updated user
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
router.patch('/me', patchMe);

/**
 * @openapi
 * /users/me/onboarding:
 *   post:
 *     tags: [Users]
 *     summary: Submit onboarding metrics
 *     description: Stores body metrics and computes BMR/TDEE/daily targets.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OnboardingBody'
 *     responses:
 *       200:
 *         description: Onboarding saved; computed metrics returned
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
router.post('/me/onboarding', onboarding);

/**
 * @openapi
 * /users/me/metrics:
 *   get:
 *     tags: [Users]
 *     summary: Get the current user's computed metrics
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Body metrics + BMR/TDEE/daily targets
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
 *       404:
 *         description: Metrics not found (onboarding not completed)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me/metrics', myMetrics);

/**
 * @openapi
 * /users/me/metrics:
 *   patch:
 *     tags: [Users]
 *     summary: Update body metrics post-onboarding (re-computes BMR/TDEE/macros/BMI)
 *     description: >
 *       Partial update of the user_metrics row. gender and dateOfBirth are
 *       immutable and rejected. All derived fields (BMR, TDEE, daily calorie
 *       target, macros, BMI) are recomputed every call.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             additionalProperties: false
 *             properties:
 *               weightKg: { type: number, minimum: 30, maximum: 300 }
 *               heightCm: { type: integer, minimum: 100, maximum: 250 }
 *               activityLevel: { type: string, enum: [SEDENTARY, LIGHT, MODERATE, ACTIVE, VERY_ACTIVE] }
 *               goal: { type: string, enum: [LOSE_WEIGHT, MAINTAIN, GAIN_WEIGHT, GAIN_MUSCLE] }
 *               targetWeightKg: { type: number, minimum: 30, maximum: 300 }
 *               dietaryRestrictions: { type: array, items: { type: string } }
 *               allergies: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Updated metrics with recomputed targets, BMI and category
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error (empty body, unknown key, or out-of-range)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: USER_METRICS_NOT_FOUND (onboarding not completed)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: INTERNAL_ERROR
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/me/metrics', updateMyMetrics);

/**
 * @openapi
 * /users/me/change-password:
 *   post:
 *     tags: [Users]
 *     summary: Change the current user's password
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordBody'
 *     responses:
 *       200:
 *         description: Password changed
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
 *         description: Wrong current password (INVALID_CURRENT_PASSWORD)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/me/change-password', changeMyPassword);

/**
 * @openapi
 * /users/me:
 *   delete:
 *     tags: [Users]
 *     summary: Soft-delete the current account
 *     description: Sets deleted_at and revokes all refresh tokens. Requires the current password.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DeleteMeBody'
 *     responses:
 *       204:
 *         description: Account deleted (no content)
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Wrong password (INVALID_PASSWORD)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/me', deleteMyAccount);

/**
 * @openapi
 * /users/me/pt-assignments:
 *   get:
 *     tags: [Users]
 *     summary: Student feed of PT assignments
 *     description: Active (non-superseded) meal-plan and exercise assignments from the user's PT(s), newest first.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [MEAL_PLAN, EXERCISE_ADDITION]
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
 *         description: Paginated assignment feed
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
router.get('/me/pt-assignments', listMyAssignmentsHandler);

/**
 * @openapi
 * /users/me/avatar:
 *   post:
 *     tags: [Users]
 *     summary: Upload or replace the current user's avatar
 *     description: >
 *       Uploads an avatar image (JPEG, PNG, or WebP, max 5 MB) to Cloudinary,
 *       overwriting any existing avatar via a stable public_id, and returns the
 *       stored URL.
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: Image file (image/jpeg, image/png, image/webp)
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     avatarUrl:
 *                       type: string
 *                       example: https://res.cloudinary.com/<cloud>/image/upload/v1/nutricoach/avatars/avatar_<uuid>.jpg
 *       400:
 *         description: INVALID_FILE_TYPE | FILE_TOO_LARGE | NO_FILE_PROVIDED
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: UNAUTHORIZED | INVALID_TOKEN | ACCOUNT_DELETED
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: UPLOAD_FAILED | INTERNAL_ERROR
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// `authenticate` is applied router-wide (router.use above), so it runs before
// uploadSingle — auth fails before any file is parsed. Order: authenticate →
// uploadSingle('avatar') → handler.
router.post('/me/avatar', uploadSingle('avatar'), uploadAvatar);

export default router;
