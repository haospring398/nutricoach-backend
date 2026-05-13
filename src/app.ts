import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import authRouter from './modules/auth/auth.routes';

const app: Application = express();

// ── Security ─────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  }),
);

// ── Body parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ──────────────────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Health check ─────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── API routes (wire modules here as you build them) ─────────
app.use('/api/v1/auth', authRouter);
// app.use('/api/v1/users',     usersRouter);
// app.use('/api/v1/nutrition', nutritionRouter);
// app.use('/api/v1/scan',      scanRouter);
// app.use('/api/v1/workout',   workoutRouter);
// app.use('/api/v1/pt',        ptRouter);
// app.use('/api/v1/payment',   paymentRouter);
// app.use('/api/v1/content',   contentRouter);
// app.use('/api/v1/dashboard', dashboardRouter);

export default app;
