import { z } from 'zod';

export const adminUsersQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(['USER', 'PT', 'ADMIN']).optional(),
  // z.coerce.boolean() is buggy with string 'false' — use enum+transform instead
  isBanned: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminUserIdParamSchema = z.object({
  id: z.string().uuid({ message: 'User id must be a valid UUID' }),
});

export const adminBanUserSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(10, 'Reason must be at least 10 characters')
      .max(500),
  })
  .strict();

export const adminChangeRoleSchema = z
  .object({
    role: z.enum(['USER', 'PT', 'ADMIN']),
  })
  .strict();

export const adminAnalyticsQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d'),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminBanUserInput = z.infer<typeof adminBanUserSchema>;
export type AdminChangeRoleInput = z.infer<typeof adminChangeRoleSchema>;
export type AdminAnalyticsQuery = z.infer<typeof adminAnalyticsQuerySchema>;
