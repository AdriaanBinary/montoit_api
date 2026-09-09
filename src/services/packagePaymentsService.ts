import crypto from 'node:crypto';
import prisma from '../db/prisma.js';
import { flutterwaveProvider, FlutterwaveProviderError } from './payments/flutterwaveProvider.js';

export type PackagePaymentMethod = 'CARD' | 'MOBILE_MONEY';

export type MobileMoneyDetails = {
  network?: string;
  phoneNumber?: string;
};

type PackageRecord = {
  id: number;
  name: string;
  customer_type: 'PRIVATE' | 'AGENCY';
  price: string;
  currency: string;
  duration_days: number | null;
};

type PendingPayment = {
  id: string;
  user_id: string;
  package_id: number;
  amount: string;
  currency: string;
  provider_reference: string;
  package_name: string;
  duration_days: number | null;
};

export class PackagePaymentError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'PackagePaymentError';
  }
}

function checkoutUrl(order: Record<string, unknown>): string | null {
  const nextAction = order.next_action as { redirect_url?: { url?: string } } | undefined;
  const candidates = [
    nextAction?.redirect_url?.url,
    typeof order.checkout_url === 'string' ? order.checkout_url : null,
    typeof order.redirect_url === 'string' ? order.redirect_url : null
  ];
  return candidates.find((value): value is string => Boolean(value)) || null;
}

function paymentInstruction(charge: Record<string, unknown>): string | null {
  const nextAction = charge.next_action as { payment_instruction?: { note?: string } } | undefined;
  return nextAction?.payment_instruction?.note || null;
}

function expiryDate(durationDays: number | null, startsAt: Date): Date | null {
  if (!durationDays) return null;
  const expiry = new Date(startsAt);
  expiry.setUTCDate(expiry.getUTCDate() + durationDays);
  return expiry;
}

export async function createPackageCheckout(userId: string, packageId: number, method: PackagePaymentMethod, mobileMoney?: MobileMoneyDetails) {
  const [userRows, packageRows] = await Promise.all([
    prisma.$queryRaw<Array<{ email: string; username: string; phone: string | null }>>`
      SELECT email, username, phone FROM users WHERE id = ${userId} LIMIT 1
    `,
    prisma.$queryRaw<PackageRecord[]>`
      SELECT id, name, customer_type, price::text, currency, duration_days
      FROM packages WHERE id = ${packageId} AND is_active = true LIMIT 1
    `
  ]);

  const user = userRows[0];
  const packageRecord = packageRows[0];
  if (!user) throw new PackagePaymentError('USER_NOT_FOUND', 'User not found', 404);
  if (!packageRecord) throw new PackagePaymentError('PACKAGE_NOT_FOUND', 'Package is not available', 404);

  const reference = `montoit-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
  const paymentRows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO payments (user_id, package_id, amount, currency, method, provider, provider_reference, idempotency_key)
    VALUES (${userId}, ${packageRecord.id}, ${packageRecord.price}, ${packageRecord.currency}, ${method}::payment_method, 'flutterwave', ${reference}, ${reference})
    RETURNING id
  `;
  const paymentId = paymentRows[0]?.id;
  if (!paymentId) throw new PackagePaymentError('PAYMENT_CREATE_FAILED', 'Unable to create payment', 500);

  try {
    const callbackUrl = process.env.FLW_PAYMENT_CALLBACK_URL || process.env.FLW_REDIRECT_URL || 'http://localhost:3000/api/payments/flutterwave/complete';
    if (process.env.FLW_HOSTED_CHECKOUT_ENABLED?.toLowerCase() === 'true') {
      const hosted = await flutterwaveProvider.createHostedCheckout({
        amount: Number(packageRecord.price),
        currency: packageRecord.currency,
        reference,
        customer: { email: user.email, name: { first: user.username, last: '' }, ...(user.phone ? { phone: { country_code: '237', number: user.phone } } : {}) },
        redirectUrl: callbackUrl,
        description: packageRecord.name,
        paymentOptions: method === 'CARD' ? 'card' : 'mobilemoneycm',
        meta: { payment_id: paymentId, package_id: String(packageRecord.id) }
      });
      await prisma.$executeRaw`
        UPDATE payments SET checkout_url = ${hosted.link}, provider_transaction_id = ${hosted.transactionId || null}, updated_at = NOW() WHERE id = ${paymentId}::uuid
      `;
      return { payment_id: paymentId, reference, checkout_url: hosted.link, payment_instruction: null, package_name: packageRecord.name };
    }

    if (method !== 'MOBILE_MONEY') {
      throw new PackagePaymentError('PAYMENT_METHOD_UNAVAILABLE', 'Hosted Card checkout is not enabled. Configure FLW_HOSTED_CHECKOUT_ENABLED and the Flutterwave secret key.', 400);
    }
    if (!mobileMoney?.phoneNumber || !mobileMoney.network) {
      throw new PackagePaymentError('MOBILE_MONEY_DETAILS_REQUIRED', 'Mobile Money network and phone number are required.', 400);
    }

    const charge = await flutterwaveProvider.createCharge({
      amount: Number(packageRecord.price),
      currency: packageRecord.currency,
      reference,
      customer: {
        email: user.email,
        name: { first: user.username, last: '' },
        phone: { country_code: '237', number: mobileMoney.phoneNumber }
      },
      payment_method: {
        type: 'mobile_money',
        mobile_money: {
          country_code: '237',
          network: mobileMoney.network,
          phone_number: mobileMoney.phoneNumber
        }
      },
      redirect_url: callbackUrl,
      description: packageRecord.name,
      meta: { payment_id: paymentId, package_id: String(packageRecord.id) }
    });
    const redirectUrl = checkoutUrl(charge as Record<string, unknown>);
    const instruction = paymentInstruction(charge as Record<string, unknown>);
    if (!redirectUrl && !instruction) throw new PackagePaymentError('CHECKOUT_ACTION_MISSING', 'Flutterwave did not return payment instructions', 502);

    await prisma.$executeRaw`
      UPDATE payments SET checkout_url = ${redirectUrl}, updated_at = NOW() WHERE id = ${paymentId}::uuid
    `;
    return { payment_id: paymentId, reference, checkout_url: redirectUrl, payment_instruction: instruction, package_name: packageRecord.name };
  } catch (error) {
    await prisma.$executeRaw`
      UPDATE payments SET status = 'FAILED'::payment_status, failure_reason = ${error instanceof Error ? error.message : 'Checkout initialization failed'}, updated_at = NOW()
      WHERE id = ${paymentId}::uuid
    `;
    if (error instanceof PackagePaymentError) throw error;
    const message = error instanceof FlutterwaveProviderError ? error.message : 'Unable to initialize payment with Flutterwave';
    throw new PackagePaymentError('PAYMENT_INITIALIZATION_FAILED', message, 502);
  }
}

export async function completePackagePayment(paymentId: string, transactionId: string) {
  const payments = await prisma.$queryRaw<PendingPayment[]>`
    SELECT p.id, p.user_id, p.package_id, p.amount::text, p.currency, p.provider_reference,
           pkg.name AS package_name, pkg.duration_days
    FROM payments p JOIN packages pkg ON pkg.id = p.package_id
    WHERE p.id = ${paymentId}::uuid LIMIT 1
  `;
  const payment = payments[0];
  if (!payment) throw new PackagePaymentError('PAYMENT_NOT_FOUND', 'Payment not found', 404);

  const charge = await (process.env.FLW_HOSTED_CHECKOUT_ENABLED?.toLowerCase() === 'true'
    ? flutterwaveProvider.retrieveHostedTransaction(transactionId)
    : flutterwaveProvider.retrieveCharge(transactionId)) as Record<string, unknown>;
  const providerReference = typeof charge.reference === 'string' ? charge.reference : null;
  const providerStatus = String(charge.status || '').toUpperCase();
  const providerAmount = Number(charge.amount);
  const providerCurrency = String(charge.currency || '');

  if (providerReference !== payment.provider_reference || providerAmount !== Number(payment.amount) || providerCurrency !== payment.currency) {
    throw new PackagePaymentError('PAYMENT_VERIFICATION_FAILED', 'Payment details do not match the selected package', 400);
  }

  if (!['SUCCESS', 'SUCCEEDED', 'SUCCESSFUL', 'COMPLETED'].includes(providerStatus)) {
    await prisma.$executeRaw`
      UPDATE payments SET status = 'PROCESSING'::payment_status, provider_transaction_id = ${transactionId}, updated_at = NOW()
      WHERE id = ${payment.id}::uuid
    `;
    throw new PackagePaymentError('PAYMENT_NOT_COMPLETE', 'Payment has not completed yet', 409);
  }

  const startedAt = new Date();
  const expiresAt = expiryDate(payment.duration_days, startedAt);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE payments SET status = 'SUCCESS'::payment_status, provider_transaction_id = ${transactionId}, paid_at = ${startedAt}, updated_at = ${startedAt}
      WHERE id = ${payment.id}::uuid AND status <> 'SUCCESS'::payment_status
    `;
    await tx.$executeRaw`
      INSERT INTO user_entitlements (user_id, package_id, payment_id, status, starts_at, expires_at)
      SELECT ${payment.user_id}, ${payment.package_id}, ${payment.id}::uuid, 'ACTIVE'::entitlement_status, ${startedAt}, ${expiresAt}
      WHERE NOT EXISTS (SELECT 1 FROM user_entitlements WHERE payment_id = ${payment.id}::uuid)
    `;
    await tx.$executeRaw`
      UPDATE users SET subscription = ${payment.package_name}, subscription_expiry = ${expiresAt}, updated_at = ${startedAt}
      WHERE id = ${payment.user_id}
    `;
  });

  return { payment_id: payment.id, package_name: payment.package_name, subscription_expiry: expiresAt };
}
