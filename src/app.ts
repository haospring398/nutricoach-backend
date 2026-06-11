import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { swaggerSpec } from './config/swagger';
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
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: string }).rawBody = buf.toString('utf-8');
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '12mb' }));

// ── Logging ──────────────────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── API docs (Swagger UI) ────────────────────────────────────
// Served outside the /api/v1 prefix. The raw spec is exposed at
// /api-docs.json for tooling / client generation.
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (_req: Request, res: Response) => {
  res.json(swaggerSpec);
});

// ── Health check ─────────────────────────────────────────────
// Not annotated for Swagger: it lives at the root, outside the /api/v1
// server base declared in swagger.ts, so it can't be expressed accurately
// under that single base. /api-docs covers the /api/v1 surface.
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
