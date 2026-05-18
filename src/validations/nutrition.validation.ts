import { z } from 'zod';

const mealType = z.enum(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']);
const isoDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const createFoodLogSchema = z
  .object({
    foodName: z.string().trim().min(1).max(200),
    calories: z.number().int().min(0).max(10000),
    proteinG: z.number().min(0).max(500).default(0),
    carbsG: z.number().min(0).max(500).default(0),
    fatG: z.number().min(0).max(500).default(0),
    portion: z.number().min(0.25).max(10).default(1),
    mealType,
    consumedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

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

export type CreateFoodLogInput = z.infer<typeof createFoodLogSchema>;
export type UpdateFoodLogInput = z.infer<typeof updateFoodLogSchema>;
export type DateQuery = z.infer<typeof dateQuerySchema>;
export type IdParam = z.infer<typeof idParamSchema>;
