import express from 'express';
import crypto from 'node:crypto';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import prisma from '../db/prisma.js';
import { registerApiRoute } from '../docs/swagger.js';
import { AuthenticatedRequest, checkAuth } from '../utils/authMiddleware.js';
import { flutterwaveProvider, FlutterwaveProviderError } from '../services/payments/flutterwaveProvider.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();
const bucketName = process.env.AWS_S3_BUCKET ?? 'property-images';
const durations = [1, 3, 6, 12, 24] as const;
type AdvertDuration = typeof durations[number];

const plans: Record<AdvertDuration, number> = {
  1: 25000,
  3: 60000,
  6: 100000,
  12: 180000,
  24: 300000
};

const s3Client = new S3Client({
  forcePathStyle: true,
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_S3_ENDPOINT,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
    : undefined
});

const uploadSchema = z.object({
  file_name: z.string().trim().min(1).max(255),
  content_type: z.string().regex(/^image\/(jpeg|png|webp|gif)$/i)
});

const createAdvertSchema = z.object({
  object_key: z.string().trim().min(1),
  destination_url: z.union([z.string().url().max(2000), z.literal('')]).optional().transform((value) => value || null),
  placement: z.enum(['HORIZONTAL', 'VERTICAL']).default('HORIZONTAL'),
  duration_months: z.coerce.number().int().refine((value): value is AdvertDuration => durations.includes(value as AdvertDuration), 'Duration must be 1, 3, 6, 12, or 24 months')
});

const eventSchema = z.object({
  anonymous_session_id: z.string().trim().min(1).max(100).optional()
});

function userIdFrom(req: express.Request): string | null {
  return (req as AuthenticatedRequest).user?.user_id ?? null;
}

function safeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
}

function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue) =>
      typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue
    )
  ) as T;
}

async function objectExists(objectKey: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: objectKey }));
    return true;
  } catch {
    return false;
  }
}

const advertPlanSchema = z.object({ duration_months: z.number(), price: z.number(), currency: z.literal('XAF') });
const advertPlansResponseSchema = z.object({ success: z.literal(true), plans: z.array(advertPlanSchema) });

registerApiRoute({
  method: 'get',
  path: '/api/adverts/plans',
  summary: 'List advert campaign plans',
  tags: ['Adverts'],
  responses: { 200: { description: 'Advert plans', schema: advertPlansResponseSchema } }
});

router.get('/adverts/plans', (_req, res) => {
  return res.json({
    success: true,
    plans: durations.map((duration_months) => ({ duration_months, price: plans[duration_months], currency: 'XAF' }))
  });
});

router.post('/adverts/upload', checkAuth, asyncHandler(async (req, res) => {
  const userId = userIdFrom(req);
  const parsed = uploadSchema.safeParse(req.body);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid advert image', message: parsed.error.issues.map((issue) => issue.message).join(', ') });

  const objectKey = `adverts/${userId}/${Date.now()}-${safeFileName(parsed.data.file_name)}`;
  const upload_url = await getSignedUrl(s3Client, new PutObjectCommand({ Bucket: bucketName, Key: objectKey, ContentType: parsed.data.content_type }), { expiresIn: 3600 });
  return res.status(201).json({ success: true, bucket: bucketName, object_key: objectKey, upload_url });
}));

router.post('/adverts', checkAuth, asyncHandler(async (req, res) => {
  const userId = userIdFrom(req);
  const parsed = createAdvertSchema.safeParse(req.body);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!parsed.success) return res.status(400).json({ success: false, error: 'Invalid advert campaign', message: parsed.error.issues.map((issue) => issue.message).join(', ') });
  if (!parsed.data.object_key.startsWith(`adverts/${userId}/`)) return res.status(403).json({ success: false, error: 'Invalid advert image ownership' });
  if (!(await objectExists(parsed.data.object_key))) return res.status(404).json({ success: false, error: 'Advert image has not finished uploading' });

  const price = plans[parsed.data.duration_months];
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    INSERT INTO advert_campaigns (user_id, image_object_key, destination_url, placement, duration_months, price, currency, status)
    VALUES (${userId}, ${parsed.data.object_key}, ${parsed.data.destination_url}, ${parsed.data.placement}::advert_placement, ${parsed.data.duration_months}, ${price}, 'XAF', 'PENDING_PAYMENT'::advert_campaign_status)
    RETURNING id, image_object_key, destination_url, placement, duration_months, price::text, currency, status, impressions, clicks, visibility_score, created_at
  `;
  return res.status(201).json({ success: true, campaign: toJsonSafe(rows[0]), payment_required: true });
}));

router.post('/adverts/:id/checkout', checkAuth, asyncHandler(async (req, res) => {
  const userId = userIdFrom(req);
  const advertId = z.string().uuid().safeParse(req.params.id);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!advertId.success) return res.status(400).json({ success: false, error: 'Invalid advert id' });

  const campaigns = await prisma.$queryRaw<Array<{ id: string; price: string; currency: string; duration_months: number }>>`
    SELECT id, price::text, currency, duration_months
    FROM advert_campaigns
    WHERE id = ${advertId.data}::uuid AND user_id = ${userId}
      AND status IN ('DRAFT'::advert_campaign_status, 'PENDING_PAYMENT'::advert_campaign_status)
    LIMIT 1
  `;
  const campaign = campaigns[0];
  if (!campaign) return res.status(404).json({ success: false, error: 'Advert campaign not found' });

  const users = await prisma.$queryRaw<Array<{ email: string; username: string; phone: string | null }>>`
    SELECT email, username, phone FROM users WHERE id = ${userId} LIMIT 1
  `;
  const user = users[0];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const reference = `ndabo-advert-${advertId.data}-${crypto.randomBytes(6).toString('hex')}`;
  const redirectUrl = process.env.ADVERT_PAYMENT_CALLBACK_URL || `${process.env.API_PUBLIC_URL || 'http://localhost:3000'}/api/adverts/checkout/complete`;
  try {
    const checkout = await flutterwaveProvider.createHostedCheckout({
      amount: Number(campaign.price),
      currency: campaign.currency.trim(),
      reference,
      customer: { email: user.email, name: user.username, ...(user.phone ? { phoneNumber: user.phone } : {}) },
      redirectUrl,
      description: `Ndabo advert campaign (${campaign.duration_months} months)`,
      meta: { advert_id: campaign.id, user_id: userId }
    });
    const payments = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO advert_payments (advert_id, user_id, amount, currency, provider_reference, provider_transaction_id, checkout_url)
      VALUES (${campaign.id}::uuid, ${userId}, ${campaign.price}, ${campaign.currency}, ${reference}, ${checkout.transactionId ?? null}, ${checkout.link})
      RETURNING id
    `;
    await prisma.$executeRaw`
      UPDATE advert_campaigns SET status = 'PENDING_PAYMENT'::advert_campaign_status, updated_at = NOW()
      WHERE id = ${campaign.id}::uuid AND user_id = ${userId}
    `;
    return res.status(201).json({ success: true, payment_id: payments[0]?.id, reference, checkout_url: checkout.link });
  } catch (error) {
    if (error instanceof FlutterwaveProviderError) return res.status(502).json({ success: false, error: 'PAYMENT_PROVIDER_ERROR', message: error.message });
    return res.status(500).json({ success: false, error: 'ADVERT_CHECKOUT_FAILED' });
  }
}));

router.get('/adverts/checkout/complete', asyncHandler(async (req, res) => {
  const reference = typeof req.query.tx_ref === 'string' ? req.query.tx_ref : undefined;
  const transactionId = typeof req.query.transaction_id === 'string' ? req.query.transaction_id : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : '';
  const redirectBase = process.env.FRONTEND_PUBLIC_URL || 'http://localhost:5173/advertise';
  if (!reference || !transactionId || ['cancelled', 'canceled', 'failed'].includes(status)) return res.redirect(`${redirectBase}?payment=failed`);

  const payments = await prisma.$queryRaw<Array<{ id: string; advert_id: string; amount: string; currency: string; duration_months: number }>>`
    SELECT p.id, p.advert_id, p.amount::text, p.currency, c.duration_months
    FROM advert_payments p JOIN advert_campaigns c ON c.id = p.advert_id
    WHERE p.provider_reference = ${reference} AND p.status = 'PENDING'::advert_payment_status
    LIMIT 1
  `;
  const payment = payments[0];
  if (!payment) return res.redirect(`${redirectBase}?payment=failed`);

  try {
    const verified = await flutterwaveProvider.retrieveHostedTransaction(transactionId);
    const verifiedStatus = String(verified.status ?? '').toLowerCase();
    const verifiedAmount = Number(verified.amount);
    if (!['successful', 'success', 'completed'].includes(verifiedStatus) || verifiedAmount !== Number(payment.amount)) throw new Error('Payment verification failed');
    await prisma.$executeRaw`
      UPDATE advert_payments SET status = 'SUCCESS'::advert_payment_status, provider_transaction_id = ${transactionId}, paid_at = NOW(), updated_at = NOW()
      WHERE id = ${payment.id}::uuid
    `;
    await prisma.$executeRaw`
      UPDATE advert_campaigns
      SET status = 'ACTIVE'::advert_campaign_status, starts_at = NOW(), expires_at = NOW() + make_interval(months => duration_months), updated_at = NOW()
      WHERE id = ${payment.advert_id}::uuid
    `;
    return res.redirect(`${redirectBase}?payment=success&advert=${payment.advert_id}`);
  } catch {
    await prisma.$executeRaw`UPDATE advert_payments SET status = 'FAILED'::advert_payment_status, updated_at = NOW() WHERE id = ${payment.id}::uuid`;
    return res.redirect(`${redirectBase}?payment=failed`);
  }
}));

router.get('/adverts/mine', checkAuth, asyncHandler(async (req, res) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT id, image_object_key, destination_url, placement, duration_months, price::text, currency, status,
           starts_at, expires_at, impressions, clicks, visibility_score, created_at
    FROM advert_campaigns
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return res.json({ success: true, campaigns: toJsonSafe(rows) });
}));

router.get('/adverts/active', asyncHandler(async (_req, res) => {
  await prisma.$executeRaw`
    UPDATE advert_campaigns
    SET status = 'EXPIRED'::advert_campaign_status, updated_at = NOW()
    WHERE status = 'ACTIVE'::advert_campaign_status AND expires_at <= NOW();
  `;
  const rows = await prisma.$queryRaw<Array<{ id: string; image_object_key: string; destination_url: string | null; placement: 'HORIZONTAL' | 'VERTICAL'; visibility_score: number }>>`
    SELECT id, image_object_key, destination_url, placement, visibility_score
    FROM (
      SELECT id, image_object_key, destination_url, placement, visibility_score,
             ROW_NUMBER() OVER (PARTITION BY placement ORDER BY visibility_score ASC, created_at ASC) AS placement_rank
      FROM advert_campaigns
      WHERE status = 'ACTIVE'::advert_campaign_status
        AND starts_at <= NOW()
        AND expires_at > NOW()
    ) ranked_adverts
    WHERE placement_rank <= 12
    ORDER BY visibility_score ASC
  `;
  const adverts = await Promise.all(rows.map(async (advert) => ({
    id: advert.id,
    destination_url: advert.destination_url,
    placement: advert.placement,
    visibility_score: advert.visibility_score,
    image_url: await getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucketName, Key: advert.image_object_key }), { expiresIn: 900 })
  })));
  return res.json({ success: true, adverts: toJsonSafe(adverts) });
}));

async function recordEvent(req: express.Request, res: express.Response, eventType: 'IMPRESSION' | 'CLICK') {
  const advertId = z.string().uuid().safeParse(req.params.id);
  const parsed = eventSchema.safeParse(req.body ?? {});
  if (!advertId.success || !parsed.success) return res.status(400).json({ success: false, error: 'Invalid advert event' });

  const userId = userIdFrom(req);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO advert_events (advert_id, event_type, viewer_id, anonymous_session_id)
    SELECT id, ${eventType}, ${userId}, ${parsed.data.anonymous_session_id}
    FROM advert_campaigns
    WHERE id = ${advertId.data}::uuid
      AND status = 'ACTIVE'::advert_campaign_status
      AND starts_at <= NOW()
      AND expires_at > NOW()
    RETURNING id
  `;
  if (rows.length === 0) return res.status(404).json({ success: false, error: 'Advert not found or inactive' });

  if (eventType === 'CLICK') {
    await prisma.$executeRaw`
      UPDATE advert_campaigns
      SET clicks = clicks + 1,
          visibility_score = GREATEST(50, LEAST(99, COALESCE(70 + ROUND(((clicks + 1)::numeric / NULLIF(impressions, 0)) * 1000)::integer, 70))),
          updated_at = NOW()
      WHERE id = ${advertId.data}::uuid
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE advert_campaigns
      SET impressions = impressions + 1,
          visibility_score = GREATEST(50, LEAST(99, 70 + ROUND((clicks::numeric / NULLIF(impressions + 1, 0)) * 1000)::integer)),
          updated_at = NOW()
      WHERE id = ${advertId.data}::uuid
    `;
  }
  return res.status(204).send();
}

router.post('/adverts/:id/impression', asyncHandler((req, res) => recordEvent(req, res, 'IMPRESSION')));
router.post('/adverts/:id/click', asyncHandler((req, res) => recordEvent(req, res, 'CLICK')));

export default router;
