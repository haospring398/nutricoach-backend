import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import apiRouter from './routes';

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
// The `verify` callback stashes the raw request bytes on `req.rawBody`,
// which the PayOS webhook handler parses itself (signature verification
// must run against the bytes as sent, not the re-serialized JSON).
app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res: any, buf: any) => {
      (req as Request & { rawBody?: string }).rawBody = buf.toString('utf-8');
    },
  }),
);
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

// ── API routes ────────────────────────────────────────────────
app.use('/api/v1', apiRouter);

export default app;
