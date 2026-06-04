import { and, eq, ne } from 'drizzle-orm';
import { db } from '../config/db';
import { refreshTokens, users } from '../models/user.model';
import { userMetrics } from '../models/user-metrics.model';
import { ApiError } from '../lib/api-error';
import { cloudinary } from '../config/cloudinary';
import { comparePassword, hashPassword } from '../lib/hash';
import {
  toPublicRole,
  toPublicTier,
  type PublicRole,
  type PublicTier,
} from '../lib/user-presenter';
import type {
  ChangePasswordInput,
  DeleteMeInput,
  OnboardingInput,
  UpdateMeInput,
} from '../validations/users.validation';

export class UserError extends ApiError {}

interface Macros {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface MetricsPayload {
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: string;
  heightCm: number;
  weightKg: number;
  activityLevel:
    | 'SEDENTARY'
    | 'LIGHT'
    | 'MODERATE'
    | 'ACTIVE'
    | 'VERY_ACTIVE';
  goal: 'LOSE_WEIGHT' | 'MAINTAIN' | 'GAIN_WEIGHT' | 'GAIN_MUSCLE';
  targetWeightKg: number | null;
  bmr: number;
  tdee: number;
  dailyCalorieTarget: number;
  macros: Macros;
}

export interface UserMe {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  role: PublicRole;
  tier: PublicTier;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  metrics: MetricsPayload | null;
  createdAt: Date;
}

export interface OnboardingResult {
  bmr: number;
  tdee: number;
  dailyCalorieTarget: number;
  macros: Macros;
  onboardingCompleted: true;
}

export interface MyMetricsResult {
  bmi: number;
  bmiCategory: 'UNDERWEIGHT' | 'NORMAL' | 'OVERWEIGHT' | 'OBESE';
  bmr: number;
  tdee: number;
  dailyCalorieTarget: number;
  macros: Macros;
}

const ACTIVITY_MULTIPLIER: Record<OnboardingInput['activityLevel'], number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

const ageFromDob = (iso: string): number => {
  const birth = new Date(iso + 'T00:00:00Z').getTime();
  return Math.floor((Date.now() - birth) / (365.25 * 24 * 60 * 60 * 1000));
};

const calculateBmr = (
  gender: OnboardingInput['gender'],
  weightKg: number,
  heightCm: number,
  age: number,
): number => {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(gender === 'MALE' ? base + 5 : base - 161);
};

const calculateTdee = (
  bmr: number,
  activityLevel: OnboardingInput['activityLevel'],
): number => Math.round(bmr * ACTIVITY_MULTIPLIER[activityLevel]);

const calculateDailyCalorieTarget = (
  tdee: number,
  goal: OnboardingInput['goal'],
): number => {
  switch (goal) {
    case 'LOSE_WEIGHT':
      return Math.round(tdee - 500);
    case 'GAIN_WEIGHT':
    case 'GAIN_MUSCLE':
      return Math.round(tdee + 300);
    case 'MAINTAIN':
      return Math.round(tdee);
  }
};

const calculateMacros = (kcal: number): Macros => ({
  proteinG: Math.round((0.30 * kcal) / 4),
  carbsG: Math.round((0.40 * kcal) / 4),
  fatG: Math.round((0.30 * kcal) / 9),
});

const bmiCategoryFor = (
  bmi: number,
): MyMetricsResult['bmiCategory'] => {
  if (bmi < 18.5) return 'UNDERWEIGHT';
  if (bmi < 25) return 'NORMAL';
  if (bmi < 30) return 'OVERWEIGHT';
  return 'OBESE';
};

const toMetricsPayload = (row: {
  gender: 'MALE' | 'FEMALE';
  dateOfBirth: string;
  heightCm: number;
  weightKg: string;
  activityLevel:
    | 'SEDENTARY'
    | 'LIGHT'
    | 'MODERATE'
    | 'ACTIVE'
    | 'VERY_ACTIVE';
  goal: 'LOSE_WEIGHT' | 'MAINTAIN' | 'GAIN_WEIGHT' | 'GAIN_MUSCLE';
  targetWeightKg: string | null;
  bmr: number;
  tdee: number;
  dailyCalorieTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): MetricsPayload => ({
  gender: row.gender,
  dateOfBirth: row.dateOfBirth,
  heightCm: row.heightCm,
  weightKg: Number(row.weightKg),
  activityLevel: row.activityLevel,
  goal: row.goal,
  targetWeightKg: row.targetWeightKg === null ? null : Number(row.targetWeightKg),
  bmr: row.bmr,
  tdee: row.tdee,
  dailyCalorieTarget: row.dailyCalorieTarget,
  macros: {
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
  },
});

const loadUserOr404 = async (userId: string) => {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) {
    throw new UserError(404, 'USER_NOT_FOUND', 'User not found');
  }
  return row;
};

const buildUserMe = async (userId: string): Promise<UserMe> => {
  const user = await loadUserOr404(userId);
  const [metrics] = await db
    .select()
    .from(userMetrics)
    .where(eq(userMetrics.userId, userId))
    .limit(1);

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    role: toPublicRole(user.role),
    tier: toPublicTier(user.tier),
    emailVerified: user.emailVerified,
    onboardingCompleted: user.onboardingCompleted,
    metrics: metrics ? toMetricsPayload(metrics) : null,
    createdAt: user.createdAt,
  };
};

export const getMe = (userId: string): Promise<UserMe> => buildUserMe(userId);

export const updateMe = async (
  userId: string,
  input: UpdateMeInput,
): Promise<UserMe> => {
  const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (input.fullName !== undefined) patch.fullName = input.fullName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;
  if (input.preferredLanguage !== undefined) {
    patch.preferredLanguage = input.preferredLanguage;
  }

  const result = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (result.length === 0) {
    throw new UserError(404, 'USER_NOT_FOUND', 'User not found');
  }

  return buildUserMe(userId);
};

export const completeOnboarding = async (
  userId: string,
  input: OnboardingInput,
): Promise<OnboardingResult> => {
  const age = ageFromDob(input.dateOfBirth);
  const bmr = calculateBmr(input.gender, input.weightKg, input.heightCm, age);
  const tdee = calculateTdee(bmr, input.activityLevel);
  const dailyCalorieTarget = calculateDailyCalorieTarget(tdee, input.goal);
  const macros = calculateMacros(dailyCalorieTarget);

  const values = {
    userId,
    gender: input.gender,
    dateOfBirth: input.dateOfBirth,
    heightCm: input.heightCm,
    weightKg: input.weightKg.toString(),
    activityLevel: input.activityLevel,
    goal: input.goal,
    targetWeightKg:
      input.targetWeightKg === undefined ? null : input.targetWeightKg.toString(),
    dietaryRestrictions: input.dietaryRestrictions ?? [],
    allergies: input.allergies ?? [],
    bmr,
    tdee,
    dailyCalorieTarget,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
    updatedAt: new Date(),
  };

  await db
    .insert(userMetrics)
    .values(values)
    .onConflictDoUpdate({
      target: userMetrics.userId,
      set: {
        gender: values.gender,
        dateOfBirth: values.dateOfBirth,
        heightCm: values.heightCm,
        weightKg: values.weightKg,
        activityLevel: values.activityLevel,
        goal: values.goal,
        targetWeightKg: values.targetWeightKg,
        dietaryRestrictions: values.dietaryRestrictions,
        allergies: values.allergies,
        bmr: values.bmr,
        tdee: values.tdee,
        dailyCalorieTarget: values.dailyCalorieTarget,
        proteinG: values.proteinG,
        carbsG: values.carbsG,
        fatG: values.fatG,
        updatedAt: values.updatedAt,
      },
    });

  await db
    .update(users)
    .set({ onboardingCompleted: true, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return {
    bmr,
    tdee,
    dailyCalorieTarget,
    macros,
    onboardingCompleted: true,
  };
};

export const getMyMetrics = async (
  userId: string,
): Promise<MyMetricsResult> => {
  const [row] = await db
    .select()
    .from(userMetrics)
    .where(eq(userMetrics.userId, userId))
    .limit(1);

  if (!row) {
    throw new UserError(
      404,
      'USER_METRICS_NOT_FOUND',
      'User metrics not found. Complete onboarding first.',
    );
  }

  const weightKg = Number(row.weightKg);
  const heightM = row.heightCm / 100;
  const bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;

  return {
    bmi,
    bmiCategory: bmiCategoryFor(bmi),
    bmr: row.bmr,
    tdee: row.tdee,
    dailyCalorieTarget: row.dailyCalorieTarget,
    macros: {
      proteinG: row.proteinG,
      carbsG: row.carbsG,
      fatG: row.fatG,
    },
  };
};

export const changePassword = async (
  userId: string,
  input: ChangePasswordInput,
): Promise<void> => {
  const user = await loadUserOr404(userId);

  const valid = await comparePassword(input.currentPassword, user.password);
  if (!valid) {
    throw new UserError(
      401,
      'INVALID_CURRENT_PASSWORD',
      'Current password is incorrect',
    );
  }

  const newHash = await hashPassword(input.newPassword);
  await db
    .update(users)
    .set({ password: newHash, updatedAt: new Date() })
    .where(eq(users.id, userId));

  if (input.refreshToken) {
    await db
      .delete(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, userId),
          ne(refreshTokens.token, input.refreshToken),
        ),
      );
  } else {
    await db
      .delete(refreshTokens)
      .where(eq(refreshTokens.userId, userId));
  }
};

export const deleteMe = async (
  userId: string,
  input: DeleteMeInput,
): Promise<void> => {
  const user = await loadUserOr404(userId);

  const valid = await comparePassword(input.password, user.password);
  if (!valid) {
    throw new UserError(401, 'INVALID_PASSWORD', 'Password is incorrect');
  }

  await db
    .update(users)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));

  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
};

/**
 * Uploads an avatar to Cloudinary (overwriting the user's existing one via a
 * stable public_id), persists the resulting URL, and returns it.
 */
export const uploadAvatar = async (
  userId: string,
  file: Express.Multer.File,
): Promise<string> => {
  let secureUrl: string;

  try {
    secureUrl = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'nutricoach/avatars',
          public_id: `avatar_${userId}`,
          overwrite: true,
          resource_type: 'image',
          transformation: [
            {
              width: 400,
              height: 400,
              crop: 'fill',
              gravity: 'face',
              quality: 'auto',
              // Patch §1: use `format: 'auto'`, NOT `fetch_format: 'auto'`.
              format: 'auto',
            },
          ],
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Empty Cloudinary response'));
            return;
          }
          resolve(result.secure_url);
        },
      );
      stream.end(file.buffer);
    });
  } catch {
    throw new ApiError(500, 'UPLOAD_FAILED', 'Failed to upload avatar image');
  }

  // users.updatedAt has no $onUpdate / DB trigger — set it explicitly.
  await db
    .update(users)
    .set({ avatarUrl: secureUrl, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return secureUrl;
};
