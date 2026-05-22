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
