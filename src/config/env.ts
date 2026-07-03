import { z } from 'zod';
import { config } from 'dotenv';

config(); // load .env

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('3000')
    .transform(Number)
    .pipe(z.number().min(1).max(65535)),

  // Database
  DB_HOST: z.string().min(1, 'DB_HOST is required'),
  DB_PORT: z
    .string()
    .default('5432')
    .transform(Number)
    .pipe(z.number().min(1).max(65535)),
  DB_USER: z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
  // NB: z.coerce.boolean() is wrong here — Boolean('false') === true. Parse the
  // string explicitly so DB_SSL=false (and an absent var) both resolve to false.
  DB_SSL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Redis
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL (redis://host:port)'),

  // JWT — both secrets must be present, min 32 chars, validated distinct at runtime
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be ≥ 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be ≥ 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // External services (optional in dev)
  OPENAI_API_KEY: z.string().optional(),
  PAYOS_CLIENT_ID: z.string().optional(),
  PAYOS_API_KEY: z.string().optional(),
  PAYOS_CHECKSUM_KEY: z.string().optional(),
  // Public URL PayOS should POST payment webhooks to (e.g. a deployed domain
  // or an ngrok tunnel in local dev). Optional: unset means "don't attempt
  // registration" (e.g. no public URL available yet) — see server.ts boot.
  PAYOS_WEBHOOK_URL: z.string().url().optional(),

  // Cloudinary (avatar uploads) — boot-required (per avatar-upload-spec §4.2).
  // Non-optional .min(1) is the credential guard: env.ts exits at boot if any
  // is missing, so cloudinary.ts can read them unconditionally.
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),

  // AI microservice (food scan + meal-plan generation) — boot-required so the
  // server fails fast if the integration is misconfigured (quirk #9).
  // Strip a trailing slash: callers build paths as `${AI_SERVICE_URL}/plan`,
  // and a slash-terminated URL (e.g. Render dashboard default) would double up
  // to `//plan` and 404 against the AI service.
  AI_SERVICE_URL: z
    .string()
    .url()
    .transform((url) => url.replace(/\/+$/, '')),
  AI_SERVICE_SECRET: z.string().min(16),

  // Storage
  STORAGE_TYPE: z.enum(['local', 's3', 'r2']).default('local'),
  STORAGE_PATH: z.string().default('./uploads'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_BUCKET_NAME: z.string().optional(),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .default('900000')
    .transform(Number)
    .pipe(z.number()),
  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .default('100')
    .transform(Number)
    .pipe(z.number()),

  // Email (Resend)
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  EMAIL_FROM: z.string().email().default('noreply@nutricoach.vn'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const lines = result.error.errors.map(
      (e) => `  ❌  ${e.path.join('.')}: ${e.message}`,
    );
    console.error('Environment validation failed:\n' + lines.join('\n'));
    console.error('\nCheck your .env file (copy from .env.example).\n');
    process.exit(1);
  }

  const parsed = result.data;

  // Extra runtime check: JWT secrets must be distinct
  if (parsed.JWT_SECRET === parsed.JWT_REFRESH_SECRET) {
    console.error(
      '  ❌  JWT_SECRET and JWT_REFRESH_SECRET must be different values.\n' +
        '     Generate each independently:\n' +
        '     node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
    process.exit(1);
  }

  return parsed;
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;

export const isProduction = () => env.NODE_ENV === 'production';
export const isDevelopment = () => env.NODE_ENV === 'development';
export const isTest = () => env.NODE_ENV === 'test';
