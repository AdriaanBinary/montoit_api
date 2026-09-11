import express from 'express';
import { z } from 'zod';
import { checkAuth, AuthenticatedRequest } from '../utils/authMiddleware.js';
import { createPackageCheckout, completePackagePayment, PackagePaymentError } from '../services/packagePaymentsService.js';
import { isValidFlutterwaveWebhookSecret, isValidFlutterwaveWebhookSignature } from '../services/payments/flutterwaveProvider.js';
import { errorFields, logger, maskIdentifier } from '../utils/logger.js';

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

  logger.info('payment.checkout.requested', { request_id: req.requestId, user_id: userId, package_id: parsed.data.package_id, method: parsed.data.method });

  try {
    const checkout = await createPackageCheckout(userId, parsed.data.package_id, parsed.data.method, req.requestId);
    logger.info('payment.checkout.created', { request_id: req.requestId, user_id: userId, package_id: parsed.data.package_id, method: parsed.data.method, payment_id: checkout.payment_id, provider_reference: checkout.reference });
    return res.status(201).json({ success: true, ...checkout, request_id: req.requestId });
  } catch (error) {
    if (error instanceof PackagePaymentError) {
      logger.warn('payment.checkout.failed', { request_id: req.requestId, user_id: userId, package_id: parsed.data.package_id, method: parsed.data.method, error_code: error.code, error_message: error.message });
      return res.status(error.status).json({ success: false, error: error.code, message: error.message });
    }
    logger.error('payment.checkout.failed', { request_id: req.requestId, user_id: userId, package_id: parsed.data.package_id, method: parsed.data.method, ...errorFields(error) });
    return res.status(500).json({ success: false, error: 'PAYMENT_FAILED', message: 'Unable to start payment' });
  }
});

router.post('/payments/flutterwave/webhook', async (req, res) => {
  const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const signature = typeof req.headers['flutterwave-signature'] === 'string'
    ? req.headers['flutterwave-signature']
    : typeof req.headers['verif-hash'] === 'string' ? req.headers['verif-hash'] : undefined;
  const environment = process.env.FLW_USE_SANDBOX?.toLowerCase() === 'false' ? 'LIVE' : 'SANDBOX';
  const secretHash = process.env[`FLW_${environment}_SECRET_HASH`];

  if (!isValidFlutterwaveWebhookSignature(rawBody, signature, secretHash) && !isValidFlutterwaveWebhookSecret(signature, secretHash)) {
    logger.warn('payment.webhook.rejected', { request_id: req.requestId });
    return res.status(401).json({ success: false, error: 'INVALID_WEBHOOK_SIGNATURE' });
  }

  const payload = req.body && typeof req.body === 'object' ? req.body as Record<string, any> : {};
  const data = payload.data && typeof payload.data === 'object' ? payload.data as Record<string, any> : payload;
  const eventId = typeof payload.id === 'string' || typeof payload.id === 'number' ? String(payload.id) : null;
  const transactionId = data.id || data.transaction_id || data.transactionId;
  const reference = data.tx_ref || data.reference || data.meta?.tx_ref;
  const status = String(data.status || payload.status || '').toLowerCase();
  const eventType = String(payload.event || payload.type || status || 'unknown');
  const prisma = (await import('../db/prisma.js')).default;

  if (!transactionId || !reference) {
    logger.warn('payment.webhook.invalid', { request_id: req.requestId, event_type: eventType });
    return res.status(400).json({ success: false, error: 'INVALID_WEBHOOK_PAYLOAD' });
  }

  const paymentRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM payments WHERE provider_reference = ${String(reference)} LIMIT 1
  `;
  const paymentId = paymentRows[0]?.id || null;
  await prisma.$executeRaw`
    INSERT INTO payment_webhook_events (provider, provider_event_id, provider_transaction_id, payment_id, event_type, payload, processed)
    VALUES ('flutterwave', ${eventId}, ${String(transactionId)}, ${paymentId}::uuid, ${eventType}, ${JSON.stringify(payload)}::jsonb, false)
    ON CONFLICT (provider_event_id) DO NOTHING
  `;

  try {
    if (!paymentId) throw new PackagePaymentError('PAYMENT_NOT_FOUND', 'Payment not found', 404);
    if (['failed', 'cancelled', 'canceled'].includes(status)) {
      await prisma.$executeRaw`
        UPDATE payments SET status = 'FAILED'::payment_status, failure_reason = ${`Flutterwave webhook status: ${status}`}, updated_at = NOW()
        WHERE id = ${paymentId}::uuid AND status <> 'SUCCESS'::payment_status
      `;
    } else if (['successful', 'success', 'completed', 'succeeded'].includes(status)) {
      await completePackagePayment(paymentId, String(transactionId), req.requestId);
    }
    await prisma.$executeRaw`
      UPDATE payment_webhook_events SET processed = true, processed_at = NOW()
      WHERE provider = 'flutterwave' AND provider_transaction_id = ${String(transactionId)}
        AND processed = false
    `;
    logger.info('payment.webhook.processed', { request_id: req.requestId, payment_id: paymentId, transaction_id: maskIdentifier(String(transactionId)), status });
    return res.status(200).json({ success: true });
  } catch (error) {
    await prisma.$executeRaw`
      UPDATE payment_webhook_events SET processing_error = ${error instanceof Error ? error.message : 'Webhook processing failed'}
      WHERE provider = 'flutterwave' AND provider_transaction_id = ${String(transactionId)} AND processed = false
    `;
    logger.error('payment.webhook.processing_failed', { request_id: req.requestId, payment_id: paymentId, transaction_id: maskIdentifier(String(transactionId)), ...errorFields(error) });
    return res.status(error instanceof PackagePaymentError ? error.status : 500).json({ success: false, error: error instanceof PackagePaymentError ? error.code : 'WEBHOOK_PROCESSING_FAILED' });
  }
});

router.get('/payments/flutterwave/complete', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : undefined;
  const paymentId = typeof req.query.payment_id === 'string' ? req.query.payment_id : undefined;
  const transactionId = typeof req.query.transaction_id === 'string' ? req.query.transaction_id : undefined;
  const reference = typeof req.query.tx_ref === 'string' ? req.query.tx_ref : undefined;
  const redirectBase = process.env.FLW_SUCCESS_REDIRECT_URL || 'http://localhost:3000/packages';

  logger.info('payment.callback.received', { request_id: req.requestId, status, has_payment_id: Boolean(paymentId), has_transaction_id: Boolean(transactionId), has_reference: Boolean(reference), transaction_id: maskIdentifier(transactionId), provider_reference: maskIdentifier(reference) });

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
        logger.error('payment.callback.cancel_record_failed', { request_id: req.requestId, provider_reference: maskIdentifier(reference), ...errorFields(error) });
      }
    }
    logger.warn('payment.callback.cancelled', { request_id: req.requestId, status, provider_reference: maskIdentifier(reference) });
    return res.redirect(`${redirectBase}${redirectBase.includes('?') ? '&' : '?'}payment=failed&error=PAYMENT_CANCELLED`);
  }

  if (!transactionId || (!paymentId && !reference)) {
    logger.warn('payment.callback.invalid', { request_id: req.requestId, has_payment_id: Boolean(paymentId), has_transaction_id: Boolean(transactionId), has_reference: Boolean(reference) });
    return res.redirect(`${redirectBase}${redirectBase.includes('?') ? '&' : '?'}payment=failed&error=PAYMENT_CALLBACK_INVALID`);
  }

  try {
    const resolvedPaymentId = paymentId || await resolvePaymentId(reference as string);
    if (!resolvedPaymentId) return res.status(404).json({ success: false, error: 'PAYMENT_NOT_FOUND' });
    logger.info('payment.completion.started', { request_id: req.requestId, payment_id: resolvedPaymentId, transaction_id: maskIdentifier(transactionId) });
    const result = await completePackagePayment(resolvedPaymentId, transactionId, req.requestId);
    logger.info('payment.completed', { request_id: req.requestId, payment_id: resolvedPaymentId, transaction_id: maskIdentifier(transactionId), package_name: result.package_name });
    return res.redirect(`${redirectBase}${redirectBase.includes('?') ? '&' : '?'}payment=success&package=${encodeURIComponent(result.package_name)}`);
  } catch (error) {
    const code = error instanceof PackagePaymentError ? error.code : 'PAYMENT_FAILED';
    logger.error('payment.completion.failed', { request_id: req.requestId, payment_id: paymentId, transaction_id: maskIdentifier(transactionId), error_code: code, ...errorFields(error) });
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
