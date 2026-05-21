import { z } from 'zod';

// PT_COURSE is deliberately rejected in v1 — the PT/courses module isn't built.
export const checkoutBodySchema = z
  .object({
    productType: z.enum(['PRO_MONTHLY', 'PRO_YEARLY']),
    productId: z.string().optional(), // ignored for PRO plans; reserved for pt_course
    returnUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  })
  .strict();

export const idempotencyKeySchema = z
  .string({ required_error: 'Idempotency-Key header is required' })
  .uuid('Idempotency-Key must be a UUID');

export const transactionsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    status: z
      .enum(['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED'])
      .optional(),
  })
  .strict();

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;
export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;
