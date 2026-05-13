import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from './auth.schema';
import {
  AuthError,
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  rotateRefreshToken,
} from './auth.service';

const sendError = (
  res: Response,
  status: number,
  code: string,
  message: string,
): void => {
  res.status(status).json({
    success: false,
    error: { code, message },
  });
};

const sendSuccess = (res: Response, status: number, data: unknown): void => {
  res.status(status).json({ success: true, data });
};

const handleError = (res: Response, err: unknown): void => {
  if (err instanceof ZodError) {
    const first = err.errors[0];
    sendError(
      res,
      400,
      'VALIDATION_ERROR',
      first?.message ?? 'Invalid request body',
    );
    return;
  }
  if (err instanceof AuthError) {
    sendError(res, err.status, err.code, err.message);
    return;
  }
  console.error('Auth controller error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};

export const register = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const input = registerSchema.parse(req.body);
    const data = await registerUser(input);
    sendSuccess(res, 201, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const login = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const input = loginSchema.parse(req.body);
    const data = await loginUser(input);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const refresh = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const data = await rotateRefreshToken(refreshToken);
    sendSuccess(res, 200, data);
  } catch (err) {
    handleError(res, err);
  }
};

export const logout = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const { refreshToken } = logoutSchema.parse(req.body);
    await logoutUser(req.user.id, refreshToken);
    sendSuccess(res, 200, { message: 'Logged out' });
  } catch (err) {
    handleError(res, err);
  }
};

export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
      return;
    }
    const user = await getCurrentUser(req.user.id);
    sendSuccess(res, 200, { user });
  } catch (err) {
    handleError(res, err);
  }
};
