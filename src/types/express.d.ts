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
      // Raw request body bytes, captured by the express.json verify callback.
      // Used by the PayOS webhook handler for signature verification.
      rawBody?: string;
      // Populated by requirePtAccessToStudent so handlers don't re-query.
      enrollment?: {
        id: string;
        userId: string;
        courseId: string;
        ptId: string;
        enrolledAt: Date;
      };
    }
  }
}

export {};
