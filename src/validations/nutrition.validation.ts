import { z } from 'zod';

const mealType = z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']);
const isoDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

// Reject timestamps more than 5 minutes in the future (clock-drift guard).
const consumedAt = z
  .string()
  .datetime({ offset: true })
  .refine(
    (s) => new Date(s).getTime() <= Date.now() + 5 * 60 * 1000,
    'consumedAt cannot be more than 5 minutes in the future',
  );

// Mode A — log from catalog. Server snapshots macros from food_items.
const createFoodLogModeA = z
  .object({
    foodItemId: z.string().uuid('foodItemId must be a UUID'),
    portionGrams: z.number().int().min(1).max(5000),
    mealType,
    consumedAt,
  })
  .strict();

// Mode B — custom one-off; client supplies all macros + multiplier.
const createFoodLogModeB = z
  .object({
    customName: z.string().trim().min(1).max(200),
    calories: z.number().int().min(0).max(10000),
    macros: z.object({
      proteinG: z.number().min(0).max(500),
      carbsG: z.number().min(0).max(2000),
      fatG: z.number().min(0).max(500),
    }),
    portion: z.number().min(0.25).max(10),
    mealType,
    consumedAt,
  })
  .strict();

export const createFoodLogSchema = z.union([
  createFoodLogModeA,
  createFoodLogModeB,
]);

export type CreateFoodLogModeAInput = z.infer<typeof createFoodLogModeA>;
export type CreateFoodLogModeBInput = z.infer<typeof createFoodLogModeB>;
export type CreateFoodLogInput =
  | CreateFoodLogModeAInput
  | CreateFoodLogModeBInput;

export const updateFoodLogSchema = z
  .object({
    foodName: z.string().trim().min(1).max(200).optional(),
    calories: z.number().int().min(0).max(10000).optional(),
    proteinG: z.number().min(0).max(500).optional(),
    carbsG: z.number().min(0).max(500).optional(),
    fatG: z.number().min(0).max(500).optional(),
    portion: z.number().min(0.25).max(10).optional(),
    mealType: mealType.optional(),
    consumedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  });

export const dateQuerySchema = z
  .object({
    date: isoDateOnly,
  })
  .strict();

export const idParamSchema = z
  .object({
    id: z.string().uuid('id must be a UUID'),
  })
  .strict();

export type UpdateFoodLogInput = z.infer<typeof updateFoodLogSchema>;
export type DateQuery = z.infer<typeof dateQuerySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
