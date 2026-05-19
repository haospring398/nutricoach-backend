import { z } from 'zod';

export const foodsSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  type: z.enum(['INGREDIENT', 'DISH']).optional(),
  category: z.string().trim().min(1).max(128).optional(),
  completeness: z.enum(['FULL', 'PARTIAL', 'CALORIES_ONLY']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const foodIdParamSchema = z.object({
  id: z.string().uuid('id must be a UUID'),
});

export const foodsCategoriesQuerySchema = z.object({
  type: z.enum(['INGREDIENT', 'DISH']).optional(),
});

export type FoodsSearchQuery = z.infer<typeof foodsSearchQuerySchema>;
export type FoodIdParam = z.infer<typeof foodIdParamSchema>;
export type FoodsCategoriesQuery = z.infer<typeof foodsCategoriesQuerySchema>;
