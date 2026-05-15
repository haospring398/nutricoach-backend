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
    })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user) {
    throw new AuthError(401, 'INVALID_TOKEN', 'User no longer exists');
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
