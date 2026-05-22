import { z } from 'zod';

export const ALLOWED_SPECIALTIES = [
  'WEIGHT_LOSS',
  'MUSCLE_GAIN',
  'STRENGTH_TRAINING',
  'CARDIO',
  'HIIT',
  'YOGA',
  'PILATES',
  'REHABILITATION',
  'NUTRITION_COACHING',
  'POSTPARTUM',
  'SENIOR_FITNESS',
  'SPORTS_PERFORMANCE',
] as const;

const bankAccountSchema = z.object({
  bankCode: z.string().trim().regex(/^[A-Z0-9]{2,16}$/, 'Invalid bank code'),
  accountNumber: z
    .string()
    .trim()
    .regex(/^[0-9]{6,20}$/, 'Account number must be 6-20 digits'),
  accountHolder: z.string().trim().min(2).max(100),
});

export const submitVerificationBodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    dateOfBirth: z.coerce.date().refine(
      (d) => {
        const age =
          (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
        return age >= 18 && age <= 80;
      },
      { message: 'Age must be between 18 and 80' },
    ),
    citizenIdNumber: z
      .string()
      .trim()
      .regex(/^[0-9]{9,12}$/, 'Citizen ID must be 9-12 digits'),
    citizenIdFrontKey: z.string().trim().min(1).max(256),
    citizenIdBackKey: z.string().trim().min(1).max(256),
    certificates: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          issuedBy: z.string().trim().min(1).max(200),
          issuedAt: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
          fileKey: z.string().trim().min(1).max(256),
        }),
      )
      .min(1)
      .max(10),
    specialties: z.array(z.enum(ALLOWED_SPECIALTIES)).min(1).max(5),
    yearsOfExperience: z.number().int().min(0).max(60),
    bio: z.string().trim().min(50).max(2000),
    bankAccount: bankAccountSchema,
  })
  .strict();

export const updatePtProfileBodySchema = z
  .object({
    bio: z.string().trim().min(50).max(2000).optional(),
    specialties: z.array(z.enum(ALLOWED_SPECIALTIES)).min(1).max(5).optional(),
    yearsOfExperience: z.number().int().min(0).max(60).optional(),
    bankAccount: bankAccountSchema.optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, {
    message: 'At least one field must be provided',
  });

export const listVerificationsQuerySchema = z
  .object({
    status: z
      .enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED'])
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const verificationIdParamSchema = z.object({
  id: z.string().uuid('verification id must be a UUID'),
});

export const approveVerificationBodySchema = z
  .object({
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export const rejectVerificationBodySchema = z
  .object({
    reason: z.string().trim().min(10).max(1000),
    requireResubmit: z.boolean().default(true),
  })
  .strict();

export type SubmitVerificationBody = z.infer<
  typeof submitVerificationBodySchema
>;
export type UpdatePtProfileBody = z.infer<typeof updatePtProfileBodySchema>;
export type ListVerificationsQuery = z.infer<
  typeof listVerificationsQuerySchema
>;
export type ApproveVerificationBody = z.infer<
  typeof approveVerificationBodySchema
>;
export type RejectVerificationBody = z.infer<
  typeof rejectVerificationBodySchema
>;
