import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export type UserRole = 'user' | 'pt' | 'admin';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

export const signAccessToken = (
  payload: Omit<AccessTokenPayload, 'type'>,
): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(
    { email: payload.email, role: payload.role, type: 'access' },
    env.JWT_SECRET,
    { ...options, subject: payload.sub },
  );
};

export const signRefreshToken = (
  payload: Omit<RefreshTokenPayload, 'type'>,
): string => {
  const options: SignOptions = {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign({ type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    ...options,
    subject: payload.sub,
  });
};

export const verifyAccessToken = (
  token: string,
): AccessTokenPayload & JwtPayload => {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded === 'string') {
    throw new Error('Invalid access token');
  }
  if (decoded.type !== 'access' || typeof decoded.sub !== 'string') {
    throw new Error('Invalid access token payload');
  }
  return decoded as AccessTokenPayload & JwtPayload;
};

export const verifyRefreshToken = (
  token: string,
): RefreshTokenPayload & JwtPayload => {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  if (typeof decoded === 'string') {
    throw new Error('Invalid refresh token');
  }
  if (decoded.type !== 'refresh' || typeof decoded.sub !== 'string') {
    throw new Error('Invalid refresh token payload');
  }
  return decoded as RefreshTokenPayload & JwtPayload;
};

export const getTokenExpiry = (token: string): Date => {
  const decoded = jwt.decode(token);
  if (
    !decoded ||
    typeof decoded === 'string' ||
    typeof decoded.exp !== 'number'
  ) {
    throw new Error('Cannot determine token expiry');
  }
  return new Date(decoded.exp * 1000);
};
