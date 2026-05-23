import { z } from 'zod';

// ── Meal plan payload ─────────────────────────────────────────
const mealSchema = z.object({
  mealType: z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']),
  name: z.string().trim().min(2).max(200),
  calories: z.number().int().min(0).max(5000),
  macros: z.object({
    proteinG: z.number().min(0).max(500),
    carbsG: z.number().min(0).max(2000),
    fatG: z.number().min(0).max(500),
  }),
  notes: z.string().trim().max(500).optional(),
});

const daySchema = z.object({
  dayIndex: z.number().int().min(0).max(364),
  meals: z.array(mealSchema).min(1).max(8),
});

export const putMealPlanBodySchema = z.object({
  days: z
    .array(daySchema)
    .min(1)
    .max(31)
    .refine(
      (days) => {
        const seen = new Set<number>();
        for (const d of days) {
          if (seen.has(d.dayIndex)) return false;
          seen.add(d.dayIndex);
        }
        return true;
      },
      { message: 'dayIndex values must be unique within a meal plan' },
    ),
  note: z.string().trim().max(2000).optional(),
});

// ── Exercise addition payload ─────────────────────────────────
// Mirrors the workout module's set-log rules: weight training has
// sets + reps (weightKg optional for bodyweight); cardio has durationSec.
export const postExerciseBodySchema = z
  .object({
    exerciseId: z
      .string()
      .regex(/^ex_[a-z0-9_]+$/, 'exerciseId must be a valid slug'),
    scheduledDate: z.coerce.date().optional(),
    sets: z.number().int().min(1).max(20).optional(),
    reps: z.number().int().min(1).max(500).optional(),
    weightKg: z.number().min(0).max(500).optional(),
    durationSec: z.number().int().min(1).max(7200).optional(),
    restSec: z.number().int().min(0).max(900).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    const hasWeightTraining =
      data.sets != null || data.reps != null || data.weightKg != null;
    const hasCardio = data.durationSec != null;

    if (hasWeightTraining && hasCardio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Provide EITHER weight-training fields (sets/reps/weightKg) OR cardio (durationSec), not both',
      });
    }
    if (!hasWeightTraining && !hasCardio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either weight-training fields or durationSec',
      });
    }
    if (hasWeightTraining && (data.sets == null || data.reps == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Weight-training exercises require both sets and reps',
      });
    }
  });

// ── Path & query ──────────────────────────────────────────────
export const studentIdParamSchema = z.object({
  studentId: z.string().uuid(),
});

export const listStudentsQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'REFUNDED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const listMyAssignmentsQuerySchema = z.object({
  type: z.enum(['MEAL_PLAN', 'EXERCISE_ADDITION']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PutMealPlanBody = z.infer<typeof putMealPlanBodySchema>;
export type PostExerciseBody = z.infer<typeof postExerciseBodySchema>;
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
export type ListMyAssignmentsQuery = z.infer<
  typeof listMyAssignmentsQuerySchema
>;
