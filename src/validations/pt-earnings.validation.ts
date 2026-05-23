import { z } from 'zod';

// ── Earnings ──────────────────────────────────────────────────
export const earningsQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    // 'day' / 'week' deferred to v1.1.
    granularity: z.enum(['month']).default('month'),
  })
  .refine((d) => !d.from || !d.to || d.from <= d.to, {
    message: "'from' must be on or before 'to'",
  });

// ── Withdrawals (PT) ──────────────────────────────────────────
export const createWithdrawalBodySchema = z.object({
  amountVnd: z
    .number()
    .int()
    .min(200000)
    .max(50000000)
    .refine((n) => n % 1000 === 0, 'amountVnd must be a multiple of 1000'),
  note: z.string().trim().max(500).optional(),
});

// Idempotency-Key header — matches the format used by /payment/checkout.
export const withdrawalIdempotencyKeySchema = z
  .string({ required_error: 'Idempotency-Key header is required' })
  .trim()
  .min(1)
  .max(64);

export const listOwnWithdrawalsQuerySchema = z.object({
  status: z.enum(['PENDING_APPROVAL', 'COMPLETED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ── Withdrawals (Admin) ───────────────────────────────────────
export const adminListWithdrawalsQuerySchema = z.object({
  status: z.enum(['PENDING_APPROVAL', 'COMPLETED', 'REJECTED']).optional(),
  ptId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const withdrawalIdParamSchema = z.object({
  id: z.string().uuid('withdrawal id must be a UUID'),
});

export const approveWithdrawalBodySchema = z.object({
  transferReference: z.string().trim().min(3).max(64),
  note: z.string().trim().max(500).optional(),
});

export const rejectWithdrawalBodySchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

export type EarningsQuery = z.infer<typeof earningsQuerySchema>;
export type CreateWithdrawalBody = z.infer<typeof createWithdrawalBodySchema>;
export type ListOwnWithdrawalsQuery = z.infer<
  typeof listOwnWithdrawalsQuerySchema
>;
export type AdminListWithdrawalsQuery = z.infer<
  typeof adminListWithdrawalsQuerySchema
>;
export type ApproveWithdrawalBody = z.infer<
  typeof approveWithdrawalBodySchema
>;
export type RejectWithdrawalBody = z.infer<typeof rejectWithdrawalBodySchema>;
