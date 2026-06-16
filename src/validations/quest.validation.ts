import { z } from 'zod';

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

/** POST /quests/trigger — DAILY_LOGIN/PERFECT_DIARY/DISCIPLINE_MASTER are
 *  server-initiated only and deliberately excluded from this enum. */
export const triggerQuestSchema = z.object({
  body: z.object({
    questId: z.enum(
      ['AI_SCAN', 'WORKOUT_DONE', 'PT_VISIT', 'DAILY_SHARE'] as const,
      {
        errorMap: () => ({
          message:
            'questId must be one of: AI_SCAN, WORKOUT_DONE, PT_VISIT, DAILY_SHARE',
        }),
      },
    ),
    date: dateStringSchema,
    referenceId: z.string().max(64).optional(),
  }),
});

/** POST /quests/diary-lock */
export const diaryLockSchema = z.object({
  body: z.object({
    date: dateStringSchema,
  }),
});

/** GET /quests/points — query params */
export const getPointsSchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? parseInt(v, 10) : 20)),
  }),
});

/** Admin: POST /admin/quests */
export const createQuestSchema = z.object({
  body: z.object({
    id: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Z_]+$/, 'id must be UPPER_SNAKE_CASE'),
    title: z.string().min(1).max(200),
    description: z.string().min(1),
    pointsPerCompletion: z.number().int().positive(),
    maxCompletionsPerDay: z.number().int().positive().default(1),
    isActive: z.boolean().default(true),
  }),
});

/** Admin: PATCH /admin/quests/:id */
export const updateQuestSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().min(1).optional(),
    pointsPerCompletion: z.number().int().positive().optional(),
    maxCompletionsPerDay: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
  }),
});

/** Admin: GET /admin/quests/leaderboard */
export const leaderboardSchema = z.object({
  query: z.object({
    limit: z
      .string()
      .optional()
      .transform((v) => Math.min(v ? parseInt(v, 10) : 50, 100)),
  }),
});

export type TriggerQuestInput = z.infer<typeof triggerQuestSchema>['body'];
export type DiaryLockInput = z.infer<typeof diaryLockSchema>['body'];
export type CreateQuestInput = z.infer<typeof createQuestSchema>['body'];
export type UpdateQuestInput = z.infer<typeof updateQuestSchema>['body'];

// ── Reward redemption (migration 0016) ────────────────────────
// Flat schemas (parsed directly from req.body / req.query / req.params),
// matching admin.controller + the wider codebase convention.

export const redeemRewardSchema = z
  .object({
    rewardId: z.string().uuid({ message: 'rewardId must be a valid UUID' }),
    deliveryAddress: z
      .string()
      .trim()
      .min(5, 'deliveryAddress must be at least 5 characters')
      .max(255, 'deliveryAddress must be at most 255 characters'),
    phone: z
      .string()
      .trim()
      .regex(/^(0|\+84)\d{9}$/, 'phone must be a valid Vietnamese mobile number'),
  })
  .strict();

export const myRedemptionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminRedemptionsQuerySchema = z.object({
  status: z.enum(['PENDING', 'FULFILLED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const redemptionIdParamSchema = z.object({
  id: z.string().uuid({ message: 'redemption id must be a valid UUID' }),
});

export const fulfillRedemptionSchema = z
  .object({
    adminNote: z.string().trim().max(500).optional(),
  })
  .strict();

export const rejectRedemptionSchema = z
  .object({
    adminNote: z
      .string()
      .trim()
      .min(5, 'adminNote (reject reason) must be at least 5 characters')
      .max(500),
  })
  .strict();

export type RedeemRewardInput = z.infer<typeof redeemRewardSchema>;
export type MyRedemptionsQuery = z.infer<typeof myRedemptionsQuerySchema>;
export type AdminRedemptionsQuery = z.infer<typeof adminRedemptionsQuerySchema>;
