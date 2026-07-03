import PayOS from '@payos/node';
import { env } from '../../config/env';

// PAYOS_* are optional in env.ts; fail fast at boot if the payment module
// is wired but credentials are absent.
const { PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY } = env;
if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
  throw new Error(
    'PayOS credentials missing — set PAYOS_CLIENT_ID, PAYOS_API_KEY and PAYOS_CHECKSUM_KEY in .env',
  );
}

// Singleton wrapper so the rest of the codebase never imports PayOS directly.
// @payos/node v1.0.10 exposes `createPaymentLink()` and the synchronous
// `verifyPaymentWebhookData()` — NOT the v2 `paymentRequests` / `webhooks`
// namespaces. Confirmed against node_modules/@payos/node/lib/index.d.ts.
export const payos = new PayOS(
  PAYOS_CLIENT_ID,
  PAYOS_API_KEY,
  PAYOS_CHECKSUM_KEY,
);

// Registers env.PAYOS_WEBHOOK_URL with PayOS so it knows where to POST
// payment webhooks — a one-time (idempotent) registration call against
// PayOS's own servers, unrelated to our HTTP server being up. Without this,
// a payment can succeed on PayOS's side while our transaction stays PENDING
// forever (no webhook ever arrives). Best-effort: PAYOS_WEBHOOK_URL is
// optional (e.g. no public URL yet in local dev without a tunnel), and a
// failed registration call must not crash server boot.
export const registerWebhook = async (): Promise<void> => {
  if (!env.PAYOS_WEBHOOK_URL) {
    console.warn(
      '⚠️  PAYOS_WEBHOOK_URL not set — skipping webhook registration. ' +
        'PayOS payments will stay PENDING until a webhook URL is registered ' +
        '(dashboard or PAYOS_WEBHOOK_URL + reboot).',
    );
    return;
  }
  try {
    await payos.confirmWebhook(env.PAYOS_WEBHOOK_URL);
    console.log('✅ PayOS webhook URL registered:', env.PAYOS_WEBHOOK_URL);
  } catch (err) {
    console.error(
      '❌ PayOS webhook registration failed — payments may stay PENDING:',
      err instanceof Error ? err.message : err,
    );
  }
};
