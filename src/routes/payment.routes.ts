import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  createCheckoutHandler,
  getSubscriptionHandler,
  listTransactionsHandler,
  payosWebhookHandler,
} from '../controllers/payment.controller';
import { listPurchasedCoursesHandler } from '../controllers/course.controller';

const router: Router = Router();

// Webhook is unauthenticated — security is PayOS signature verification.
// Declared before `authenticate` so the middleware does not apply to it.
// Raw body is captured globally via the express.json verify callback (app.ts).
router.post('/webhook/payos', payosWebhookHandler);

router.use(authenticate);

router.post('/checkout', createCheckoutHandler);
router.get('/transactions', listTransactionsHandler);
router.get('/subscription', getSubscriptionHandler);
router.get('/courses', listPurchasedCoursesHandler);

export default router;
