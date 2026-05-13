import 'express';

declare global {
  namespace Express {
    interface UserPayload {
      id: string;
      email: string;
      role: 'user' | 'pt' | 'admin';
    }

    interface Request {
      user?: UserPayload;
    }
  }
}

export {};
