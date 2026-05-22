import { z } from 'zod';

// ── List exercises ────────────────────────────────────────────
export const listExercisesQuerySchema = z
  .object({
    muscleGroup: z
      .enum([
        'CHEST',
        'BACK',
        'SHOULDERS',
        'BICEPS',
        'TRICEPS',
        'LEGS',
        'GLUTES',
        'CORE',
        'CARDIO',
        'FULL_BODY',
      ])
      .optional(),
    equipment: z
      .enum([
        'BODYWEIGHT',
        'DUMBBELL',
        'BARBELL',
        'MACHINE',
        'KETTLEBELL',
        'BAND',
        'CABLE',
        'OTHER',
      ])
      .optional(),
    difficulty: z
      .enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'])
      .optional(),
    search: z.string().trim().min(1).max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

// ── Get exercise by id ────────────────────────────────────────
export const exerciseIdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^ex_[a-z0-9_]+$/, 'exercise id must be a valid slug'),
});

// ── Create session ────────────────────────────────────────────
const setLogSchema = z
  .object({
    exerciseId: z.string().regex(/^ex_[a-z0-9_]+$/),
    orderIndex: z.number().int().min(0).max(200),
    setNumber: z.number().int().min(1).max(50),
    reps: z.number().int().min(1).max(500).optional(),
    weightKg: z.number().min(0).max(500).optional(),
    durationSec: z.number().int().min(1).max(7200).optional(),
    restSec: z.number().int().min(0).max(900).default(0),
    rpe: z.number().int().min(1).max(10).optional(),
    notes: z.string().max(500).optional(),
  })
  .strict()
  .refine((s) => (s.reps != null) !== (s.durationSec != null), {
    message:
      'Each log must have EITHER reps (weight-training) OR durationSec (cardio), not both and not neither',
  });

export const createSessionBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    performedAt: z.coerce
      .date()
      .refine((d) => d.getTime() <= Date.now() + 5 * 60 * 1000, {
        message: 'performedAt cannot be in the future',
      }),
    durationSec: z.number().int().min(0).max(14400).default(0),
    caloriesBurned: z.number().int().min(0).max(5000).optional(),
    notes: z.string().max(2000).optional(),
    logs: z.array(setLogSchema).min(1).max(200),
  })
  .strict();

// ── List sessions ─────────────────────────────────────────────
export const listSessionsQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

// ── Session id param / update ─────────────────────────────────
export const sessionIdParamSchema = z.object({
  id: z.string().uuid('session id must be a UUID'),
});

export const updateSessionBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    notes: z.string().max(2000).optional(),
    durationSec: z.number().int().min(0).max(14400).optional(),
    caloriesBurned: z.number().int().min(0).max(5000).optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, {
    message: 'At least one field must be provided',
  });

export type ListExercisesQuery = z.infer<typeof listExercisesQuerySchema>;
export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;
export type SetLogInput = z.infer<typeof setLogSchema>;
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;
export type UpdateSessionBody = z.infer<typeof updateSessionBodySchema>;
