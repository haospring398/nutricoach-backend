import { and, eq } from 'drizzle-orm';
import { db } from '../../config/db';
import {
  refreshTokens,
  users,
  type User,
} from '../../db/schema/users.schema';
import { comparePassword, hashPassword } from '../../lib/hash';
import {
  getTokenExpiry,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../lib/jwt';
import type { LoginInput, RegisterInput } from './auth.schema';

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: User['role'];
  createdAt: Date;
}

export interface LoginUser {
  id: string;
  name: string;
  email: string;
  role: User['role'];
}

export interface ProfileUser extends PublicUser {
  isVerified: boolean;
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
      name: input.name,
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
      name: created.name,
      email: created.email,
      role: created.role,
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
      name: user.name,
      email: user.email,
      role: user.role,
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
      name: users.name,
      email: users.email,
      role: users.role,
      isVerified: users.isVerified,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AuthError(401, 'USER_NOT_FOUND', 'User not found');
  }

  return user;
};
