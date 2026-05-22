import type { NextFunction, Request, Response } from 'express';

type Role = 'user' | 'pt' | 'admin';

/**
 * Route guard — must run after `authenticate` (which populates `req.user`).
 * Compares against the lowercase DB role values carried in the JWT.
 * Responds 403 directly (the project has no global error middleware).
 */
export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient role' },
      });
      return;
    }
    next();
  };
};
