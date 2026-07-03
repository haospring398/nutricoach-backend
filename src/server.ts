import app from './app';
import { env } from './config/env';
import { testDbConnection, closeDbConnection } from './config/db';
import { testRedisConnection, closeRedisConnection } from './config/redis';
import { registerWebhook } from './services/payment/payos.client';

async function start() {
  console.log('\n🔍 Checking service connections...\n');

  const [dbOk, redisOk] = await Promise.all([
    testDbConnection(),
    testRedisConnection(),
  ]);

  if (!dbOk || !redisOk) {
    console.error('\n❌ One or more services failed to connect. Aborting.\n');
    process.exit(1);
  }

  // Best-effort — logs and continues on failure, never blocks boot.
  await registerWebhook();

  const server = app.listen(env.PORT, () => {
    console.log(`
🚀 ─────────────────────────────────────
   NutriCoach API
   ENV  : ${env.NODE_ENV}
   PORT : ${env.PORT}
   URL  : http://localhost:${env.PORT}
──────────────────────────────────────`);
  });

  // AI meal-plan generation can run for tens of seconds; raise the socket
  // timeouts so long-but-legitimate requests aren't cut off. headersTimeout
  // must stay above keepAliveTimeout to avoid premature 5xx on kept-alive
  // connections.
  server.timeout = 100_000;
  server.keepAliveTimeout = 100_000;
  server.headersTimeout = 101_000;

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ Port ${env.PORT} is already in use.`);
      console.error(`   Kill it first:  fuser -k ${env.PORT}/tcp\n`);
    } else {
      console.error('❌ Server error:', err);
    }
    process.exit(1);
  });

  // ── Graceful shutdown ───────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`\n⚠️  ${signal} received — shutting down gracefully...`);

    server.close(async () => {
      await closeDbConnection();
      await closeRedisConnection();
      console.log('✅ Clean shutdown complete.\n');
      process.exit(0);
    });

    // Force-kill if still hanging after 10 s
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('❌ Fatal startup error:', err);
  process.exit(1);
});
