import { z } from 'zod';

const VN_PHONE_REGEX = /^\+84[0-9]{9}$/;

export const updateMeSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(100, 'Full name must be at most 100 characters')
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(VN_PHONE_REGEX, 'Phone must match +84XXXXXXXXX')
      .optional(),
    avatarUrl: z.string().trim().url('avatarUrl must be a valid URL').optional(),
    preferredLanguage: z.enum(['vi', 'en']).optional(),
  })
  .strict();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be ISO date (YYYY-MM-DD)');

const ageYears = (iso: string): number => {
  const birth = new Date(iso + 'T00:00:00Z').getTime();
  const now = Date.now();
  return Math.floor((now - birth) / (365.25 * 24 * 60 * 60 * 1000));
};

export const onboardingSchema = z
  .object({
    gender: z.enum(['MALE', 'FEMALE']),
    dateOfBirth: isoDate.refine(
      (v) => {
        const age = ageYears(v);
        return age >= 13 && age <= 100;
      },
      { message: 'Age must be between 13 and 100' },
    ),
    heightCm: z.number().int().min(100).max(250),
    weightKg: z.number().min(30).max(300),
    activityLevel: z.enum([
      'SEDENTARY',
      'LIGHT',
      'MODERATE',
      'ACTIVE',
      'VERY_ACTIVE',
    ]),
    goal: z.enum(['LOSE_WEIGHT', 'MAINTAIN', 'GAIN_WEIGHT', 'GAIN_MUSCLE']),
    targetWeightKg: z.number().min(30).max(300).optional(),
    dietaryRestrictions: z.array(z.string().trim().min(1)).optional(),
    allergies: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'currentPassword is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    refreshToken: z.string().min(1).optional(),
  })
  .strict();

export const deleteMeSchema = z
  .object({
    password: z.string().min(1, 'password is required'),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DeleteMeInput = z.infer<typeof deleteMeSchema>;
