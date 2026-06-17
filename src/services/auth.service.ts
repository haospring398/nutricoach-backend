import { and, eq } from 'drizzle-orm';
import { db } from '../config/db';
import {
  refreshTokens,
  users,
  type User,
} from '../models/user.model';
import { comparePassword, hashPassword } from '../lib/hash';
import {
  getTokenExpiry,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/jwt';
import {
  toPublicRole,
  toPublicTier,
  type PublicRole,
  type PublicTier,
} from '../lib/user-presenter';
import {
  deleteEmailVerificationToken,
  deletePasswordResetToken,
  generateEmailVerificationToken,
  generatePasswordResetToken,
  getEmailVerificationToken,
  getPasswordResetToken,
  saveEmailVerificationToken,
  savePasswordResetToken,
} from '../lib/auth-tokens';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../lib/email';
import type {
  LoginInput,
  RegisterInput,
} from '../validations/auth.validation';
import { ApiError } from '../lib/api-error';

export class AuthError extends ApiError {}

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  role: PublicRole;
  tier: PublicTier;
  createdAt: Date;
}

export interface LoginUser {
  id: string;
  fullName: string;
  email: string;
  role: PublicRole;
  tier: PublicTier;
}

export interface ProfileUser {
  id: string;
  fullName: string;
  email: string;
  role: PublicRole;
  emailVerified: boolean;
  tier: PublicTier;
  onboardingCompleted: boolean;
  createdAt: Date;
}

const issueTokensFor = async (
  user: Pick<User, 'id' | 'email' | 'role'>,
): Promise<{ accessToken: string; refreshToken: string }> => {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = signRefreshToken({ sub: user.id });

  await db.insert(refreshTokens).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: getTokenExpiry(refreshToken),
  });

  return { accessToken, refreshToken };
};

export const registerUser = async (
  input: RegisterInput,
): Promise<{
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}> => {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (existing.length > 0) {
    throw new AuthError(409, 'EMAIL_EXISTS', 'Email is already registered');
  }

  const passwordHash = await hashPassword(input.password);

  const [created] = await db
    .insert(users)
    .values({
      fullName: input.fullName,
      email: input.email,
      password: passwordHash,
    })
    .returning();

  if (!created) {
    throw new AuthError(500, 'INTERNAL_ERROR', 'Failed to create user');
  }

  const tokens = await issueTokensFor(created);

  // Fire-and-forget email verification — must not block registration.
  const verifyToken = generateEmailVerificationToken();
  await saveEmailVerificationToken(created.id, verifyToken);
  void sendVerificationEmail(created.email, created.fullName, verifyToken);

  return {
    user: {
      id: created.id,
      fullName: created.fullName,
      email: created.email,
      role: toPublicRole(created.role),
      tier: toPublicTier(created.tier),
      createdAt: created.createdAt,
    },
    ...tokens,
  };
};

export const loginUser = async (
  input: LoginInput,
): Promise<{
  user: LoginUser;
  accessToken: string;
  refreshToken: string;
}> => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  if (!user) {
    throw new AuthError(
      401,
      'INVALID_CREDENTIALS',
      'Invalid email or password',
    );
  }

  const valid = await comparePassword(input.password, user.password);
  if (!valid) {
    throw new AuthError(
      401,
      'INVALID_CREDENTIALS',
      'Invalid email or password',
    );
  }

  if (user.isBanned) {
    throw new AuthError(
      401,
      'ACCOUNT_BANNED',
      `Tài khoản của bạn đã bị khóa. Lý do: ${user.banReason ?? 'Không có lý do'}`,
    );
  }

  const tokens = await issueTokensFor(user);

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: toPublicRole(user.role),
      tier: toPublicTier(user.tier),
    },
    ...tokens,
  };
};

export const rotateRefreshToken = async (
  token: string,
): Promise<{ accessToken: string; refreshToken: string }> => {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new AuthError(
      401,
      'INVALID_TOKEN',
      'Invalid or expired refresh token',
    );
  }

  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.token, token))
    .limit(1);

  if (!stored) {
    throw new AuthError(
      401,
      'INVALID_TOKEN',
      'Refresh token not recognized',
    );
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));
    throw new AuthError(401, 'TOKEN_EXPIRED', 'Refresh token has expired');
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      isBanned: users.isBanned,
      banReason: users.banReason,
    })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user) {
    throw new AuthError(401, 'INVALID_TOKEN', 'User no longer exists');
  }

  if (user.isBanned) {
    throw new AuthError(
      401,
      'ACCOUNT_BANNED',
      `Tài khoản của bạn đã bị khóa. Lý do: ${user.banReason ?? 'Không có lý do'}`,
    );
  }

  await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const newRefreshToken = signRefreshToken({ sub: user.id });

  await db.insert(refreshTokens).values({
    userId: user.id,
    token: newRefreshToken,
    expiresAt: getTokenExpiry(newRefreshToken),
  });

  return { accessToken, refreshToken: newRefreshToken };
};

export const logoutUser = async (
  userId: string,
  token: string,
): Promise<void> => {
  await db
    .delete(refreshTokens)
    .where(
      and(
        eq(refreshTokens.token, token),
        eq(refreshTokens.userId, userId),
      ),
    );
};

export const getCurrentUser = async (
  userId: string,
): Promise<ProfileUser> => {
  const [user] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      tier: users.tier,
      emailVerified: users.emailVerified,
      onboardingCompleted: users.onboardingCompleted,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AuthError(401, 'USER_NOT_FOUND', 'User not found');
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: toPublicRole(user.role),
    emailVerified: user.emailVerified,
    tier: toPublicTier(user.tier),
    onboardingCompleted: user.onboardingCompleted,
    createdAt: user.createdAt,
  };
};

export const logoutAllForUser = async (userId: string): Promise<void> => {
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
};

export const verifyEmail = async (
  token: string,
): Promise<{ emailVerified: true }> => {
  const userId = await getEmailVerificationToken(token);
  if (!userId) {
    throw new AuthError(
      400,
      'INVALID_VERIFICATION_TOKEN',
      'Invalid or expired verification token',
    );
  }

  const [user] = await db
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    await deleteEmailVerificationToken(token);
    throw new AuthError(
      400,
      'INVALID_VERIFICATION_TOKEN',
      'Invalid or expired verification token',
    );
  }

  if (user.emailVerified) {
    await deleteEmailVerificationToken(token);
    return { emailVerified: true };
  }

  await db
    .update(users)
    .set({ emailVerified: true, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  await deleteEmailVerificationToken(token);
  return { emailVerified: true };
};

// TODO: rate limit 1 req/60s per user
export const resendVerification = async (
  userId: string,
): Promise<{ message: string }> => {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AuthError(401, 'USER_NOT_FOUND', 'User not found');
  }

  if (user.emailVerified) {
    throw new AuthError(400, 'ALREADY_VERIFIED', 'Email is already verified');
  }

  const token = generateEmailVerificationToken();
  await saveEmailVerificationToken(user.id, token);
  void sendVerificationEmail(user.email, user.fullName, token);

  return { message: 'Verification email sent' };
};

const FORGOT_PASSWORD_MESSAGE =
  'Nếu email tồn tại, link đặt lại mật khẩu đã được gửi';

export const forgotPassword = async (
  email: string,
): Promise<{ message: string }> => {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user && user.deletedAt === null) {
    const token = generatePasswordResetToken();
    await savePasswordResetToken(user.id, token);
    void sendPasswordResetEmail(user.email, user.fullName, token);
  }

  return { message: FORGOT_PASSWORD_MESSAGE };
};

export const resetPassword = async (
  token: string,
  newPassword: string,
): Promise<{ message: string }> => {
  const userId = await getPasswordResetToken(token);
  if (!userId) {
    throw new AuthError(
      400,
      'INVALID_RESET_TOKEN',
      'Invalid or expired reset token',
    );
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    await deletePasswordResetToken(token);
    throw new AuthError(
      400,
      'INVALID_RESET_TOKEN',
      'Invalid or expired reset token',
    );
  }

  const newHash = await hashPassword(newPassword);
  await db
    .update(users)
    .set({ password: newHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  await deletePasswordResetToken(token);
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));

  return { message: 'Mật khẩu đã được đặt lại thành công' };
};
