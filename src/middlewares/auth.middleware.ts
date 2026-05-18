import { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../config/db';
import { users } from '../models/user.model';
import { verifyAccessToken } from '../lib/jwt';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header',
      },
    });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing access token' },
    });
    return;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired access token',
      },
    });
    return;
  }

  try {
    const [user] = await db
      .select({ id: users.id, deletedAt: users.deletedAt })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'User no longer exists',
        },
      });
      return;
    }

    if (user.deletedAt !== null) {
      res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_DELETED',
          message: 'Tài khoản đã bị xóa',
        },
      });
      return;
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch (err) {
    console.error('[auth.middleware] DB lookup failed:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication check failed',
      },
    });
  }
};
