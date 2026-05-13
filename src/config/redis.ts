import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  // Exponential-ish backoff capped at 2 s
  retryStrategy: (times) => Math.min(times * 50, 2_000),

  maxRetriesPerRequest: 3,
  enableOfflineQueue: true,
  connectTimeout: 10_000,
  keepAlive: 30_000,
  enableAutoPipelining: true,
  lazyConnect: false,

  tls:
    env.NODE_ENV === 'production' && env.REDIS_URL.startsWith('rediss://')
      ? { rejectUnauthorized: false }
      : undefined,
});

redis.on('ready', () => console.log('✅ Redis connected'));
redis.on('error', (err) =>
  console.error('❌ Redis error:', err.message),
);
redis.on('reconnecting', (ms: number) =>
  console.log(`🔄 Redis reconnecting in ${ms} ms`),
);
redis.on('close', () => console.log('🔌 Redis connection closed'));
redis.on('end', () => console.log('⛔ Redis connection ended'));

/** Call once at startup. */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') return false;

    await redis.set('health:check', 'ok', 'EX', 10);
    const val = await redis.get('health:check');

    const info = await redis.info('server');
    const ver = info.match(/redis_version:([^\r\n]+)/)?.[1] ?? 'unknown';

    console.log('✅ Redis ready');
    console.log(`   version : ${ver}`);
    console.log(`   r/w test: ${val === 'ok' ? 'passed' : 'FAILED'}`);
    return val === 'ok';
  } catch (err: any) {
    console.error('❌ Redis connection test failed:', err.message);
    return false;
  }
}

/** Call during graceful shutdown. */
export async function closeRedisConnection(): Promise<void> {
  try {
    await redis.quit();
    console.log('✅ Redis connection closed');
  } catch {
    redis.disconnect();
  }
}

// ── JSON cache helpers ───────────────────────────────────────────────────────

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  async set<T>(key: string, value: T, ttlSeconds = 3_600): Promise<boolean> {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return true;
    } catch {
      return false;
    }
  },

  async del(key: string): Promise<boolean> {
    try {
      await redis.del(key);
      return true;
    } catch {
      return false;
    }
  },

  async exists(key: string): Promise<boolean> {
    try {
      return (await redis.exists(key)) === 1;
    } catch {
      return false;
    }
  },
};

export default redis;
