import express from 'express';
import { z } from 'zod';
import { checkAuth, AuthenticatedRequest } from '../utils/authMiddleware.js';
import { createPackageCheckout, completePackagePayment, PackagePaymentError } from '../services/packagePaymentsService.js';

const router = express.Router();

const checkoutSchema = z.object({
  package_id: z.coerce.number().int().positive(),
  method: z.enum(['CARD', 'MOBILE_MONEY']).default('MOBILE_MONEY')
});

router.post('/packages/checkout', checkAuth, async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Invalid checkout request', message: parsed.error.issues.map((issue) => issue.message).join(', ') });
  }

  const userId = (req as AuthenticatedRequest).user?.user_id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const checkout = await createPackageCheckout(userId, parsed.data.package_id, parsed.data.method);
    return res.status(201).json({ success: true, ...checkout });
  } catch (error) {
    if (error instanceof PackagePaymentError) {
      return res.status(error.status).json({ success: false, error: error.code, message: error.message });
    }
    console.error('Package checkout error:', error);
    return res.status(500).json({ success: false, error: 'PAYMENT_FAILED', message: 'Unable to start payment' });
  }
});

router.get('/payments/flutterwave/complete', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : undefined;
  const paymentId = typeof req.query.payment_id === 'string' ? req.query.payment_id : undefined;
  const transactionId = typeof req.query.transaction_id === 'string' ? req.query.transaction_id : undefined;
  const reference = typeof req.query.tx_ref === 'string' ? req.query.tx_ref : undefined;
  const redirectBase = process.env.FLW_SUCCESS_REDIRECT_URL || 'http://localhost:3000/packages';

  if (status === 'cancelled' || status === 'canceled' || status === 'failed') {
    if (reference) {
      try {
        const resolvedPaymentId = await resolvePaymentId(reference);
        if (resolvedPaymentId) {
          const prisma = (await import('../db/prisma.js')).default;
          await prisma.$executeRaw`
            UPDATE payments SET status = 'FAILED'::payment_status, failure_reason = ${`Flutterwave payment ${status}`}, updated_at = NOW()
            WHERE id = ${resolvedPaymentId}::uuid AND status NOT IN ('SUCCESS'::payment_status, 'FAILED'::payment_status)
          `;
        }
      } catch (error) {
        console.error('Failed to record cancelled Flutterwave payment:', error);
      }
    }
    return res.redirect(`${redirectBase}${redirectBase.includes('?') ? '&' : '?'}payment=failed&error=PAYMENT_CANCELLED`);
  }

  if (!transactionId || (!paymentId && !reference)) {
    return res.redirect(`${redirectBase}${redirectBase.includes('?') ? '&' : '?'}payment=failed&error=PAYMENT_CALLBACK_INVALID`);
  }

  try {
    const resolvedPaymentId = paymentId || await resolvePaymentId(reference as string);
    if (!resolvedPaymentId) return res.status(404).json({ success: false, error: 'PAYMENT_NOT_FOUND' });
    const result = await completePackagePayment(resolvedPaymentId, transactionId);
    return res.redirect(`${redirectBase}${redirectBase.includes('?') ? '&' : '?'}payment=success&package=${encodeURIComponent(result.package_name)}`);
  } catch (error) {
    const code = error instanceof PackagePaymentError ? error.code : 'PAYMENT_FAILED';
    console.error('Package payment completion error:', error);
    return res.redirect(`${redirectBase}${redirectBase.includes('?') ? '&' : '?'}payment=failed&error=${encodeURIComponent(code)}`);
  }
});

async function resolvePaymentId(reference: string): Promise<string | null> {
  const prisma = (await import('../db/prisma.js')).default;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM payments WHERE provider_reference = ${reference} LIMIT 1
  `;
  return rows[0]?.id || null;
}

export default router;
