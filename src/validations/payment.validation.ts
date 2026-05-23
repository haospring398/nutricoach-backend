import { z } from 'zod';

export const checkoutBodySchema = z
  .object({
    productType: z.enum(['PRO_MONTHLY', 'PRO_YEARLY', 'PT_COURSE']),
    // Required (UUID) when productType=PT_COURSE; ignored otherwise.
    productId: z.string().uuid().optional(),
    returnUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.productType === 'PT_COURSE' && !data.productId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productId'],
        message: 'productId is required for PT_COURSE',
      });
    }
  });

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
