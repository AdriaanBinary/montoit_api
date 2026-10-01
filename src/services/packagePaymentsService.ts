import crypto from 'node:crypto';
import prisma from '../db/prisma.js';
import { sendPackageActivationEmail } from './email/emailService.js';
import { flutterwaveProvider, FlutterwaveProviderError } from './payments/flutterwaveProvider.js';
import { errorFields, logger, maskIdentifier } from '../utils/logger.js';

export type PackagePaymentMethod = 'CARD' | 'MOBILE_MONEY';

type PackageRecord = {
  id: number;
  name: string;
  customer_type: 'PRIVATE' | 'AGENCY';
  price: string;
  currency: string;
  duration_days: number | null;
};

type ActivePackageRecord = {
  price: string;
  name: string;
  duration_days: number | null;
  starts_at: Date | null;
  expires_at: Date | null;
};

type CheckoutUser = {
  email: string;
  username: string;
  phone: string | null;
  role: string;
  subscription: string | null;
  subscription_expiry: Date | null;
};

type PackageCheckoutContext = {
  user: CheckoutUser;
  packageRecord: PackageRecord;
  activePackage?: ActivePackageRecord;
};

export type PackageUpgradeQuote = {
  package_name: string;
  currency: string;
  package_price: number;
  current_package_name: string | null;
  current_package_price: number;
  unused_credit: number;
  amount_due: number;
};

type PendingPayment = {
  id: string;
  user_id: string;
  package_id: number;
  amount: string;
  currency: string;
  provider_reference: string;
  method: PackagePaymentMethod;
  package_name: string;
  duration_days: number | null;
};

export class PackagePaymentError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'PackagePaymentError';
  }
}

function expiryDate(durationDays: number | null, startsAt: Date): Date | null {
  if (!durationDays) return null;
  const expiry = new Date(startsAt);
  expiry.setUTCDate(expiry.getUTCDate() + durationDays);
  return expiry;
}

async function getPackageCheckoutContext(userId: string, packageId: number): Promise<PackageCheckoutContext> {
  const [userRows, packageRows, activePackageRows] = await Promise.all([
    prisma.$queryRaw<CheckoutUser[]>`
      SELECT email, username, phone, role, subscription, subscription_expiry FROM users WHERE id = ${userId} LIMIT 1
    `,
    prisma.$queryRaw<PackageRecord[]>`
      SELECT id, name, customer_type, price::text, currency, duration_days
      FROM packages WHERE id = ${packageId} AND is_active = true LIMIT 1
    `,
    prisma.$queryRaw<ActivePackageRecord[]>`
      SELECT p.price::text, p.name, p.duration_days, ue.starts_at, ue.expires_at
      FROM user_entitlements ue
      JOIN packages p ON p.id = ue.package_id
      WHERE ue.user_id = ${userId}
        AND ue.status = 'ACTIVE'::entitlement_status
        AND (ue.expires_at IS NULL OR ue.expires_at > NOW())
        AND p.is_active = true
      ORDER BY ue.starts_at DESC
      LIMIT 1
    `
  ]);

  const user = userRows[0];
  const packageRecord = packageRows[0];
  if (!user) throw new PackagePaymentError('USER_NOT_FOUND', 'User not found', 404);
  if (user.role === 'AGENT') throw new PackagePaymentError('AGENCY_MANAGED_ACCOUNT', 'Your package is managed by your agency.', 403);
  if (!packageRecord) throw new PackagePaymentError('PACKAGE_NOT_FOUND', 'Package is not available', 404);
  const expectedCustomerType = user.role === 'PRIVATE' ? 'PRIVATE' : 'AGENCY';
  if (packageRecord.customer_type !== expectedCustomerType) {
    throw new PackagePaymentError('PACKAGE_ACCOUNT_TYPE_MISMATCH', 'This package is not available for your account type.', 403);
  }

  const activePackage = activePackageRows[0] || (user.subscription && (!user.subscription_expiry || user.subscription_expiry > new Date())
    ? (await prisma.$queryRaw<ActivePackageRecord[]>`
        SELECT price::text, name, duration_days, NULL::timestamptz AS starts_at, ${user.subscription_expiry}::timestamptz AS expires_at
        FROM packages
        WHERE name = ${user.subscription} AND is_active = true
        LIMIT 1
      `)[0]
    : undefined);

  return { user, packageRecord, activePackage };
}

function buildPackageUpgradeQuote({ packageRecord, activePackage }: Omit<PackageCheckoutContext, 'user'>): PackageUpgradeQuote {
  const packagePrice = Number(packageRecord.price);
  const activePackagePrice = activePackage ? Number(activePackage.price) : null;
  if (activePackage && packagePrice <= activePackagePrice!) {
    throw new PackagePaymentError('PACKAGE_DOWNGRADE_NOT_ALLOWED', 'Downgrading to a lower-tier package is not permitted while your current package is active.', 409);
  }

  const totalDurationMs = activePackage?.starts_at && activePackage.expires_at
    ? activePackage.expires_at.getTime() - activePackage.starts_at.getTime()
    : (activePackage?.duration_days || 0) * 24 * 60 * 60 * 1000;
  const remainingTimeFraction = activePackage?.expires_at && totalDurationMs > 0
    ? Math.max(0, Math.min(1, (activePackage.expires_at.getTime() - Date.now()) / totalDurationMs))
    : 0;
  const unusedCredit = activePackagePrice !== null ? Math.round(activePackagePrice * remainingTimeFraction * 100) / 100 : 0;
  const amount = Math.round(Math.max(0, packagePrice - unusedCredit) * 100) / 100;

  return {
    package_name: packageRecord.name,
    currency: packageRecord.currency,
    package_price: packagePrice,
    current_package_name: activePackage?.name || null,
    current_package_price: activePackagePrice || 0,
    unused_credit: unusedCredit,
    amount_due: amount
  };
}

export async function getPackageUpgradeQuote(userId: string, packageId: number): Promise<PackageUpgradeQuote> {
  const { packageRecord, activePackage } = await getPackageCheckoutContext(userId, packageId);
  return buildPackageUpgradeQuote({ packageRecord, activePackage });
}

export async function createPackageCheckout(userId: string, packageId: number, method: PackagePaymentMethod, requestId?: string) {
  const { user, packageRecord, activePackage } = await getPackageCheckoutContext(userId, packageId);
  const quote = buildPackageUpgradeQuote({ packageRecord, activePackage });
  const amount = quote.amount_due;

  const reference = `montoit-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
  const paymentRows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO payments (user_id, package_id, amount, currency, method, provider, provider_reference, idempotency_key)
    VALUES (${userId}, ${packageRecord.id}, ${amount}, ${packageRecord.currency}, ${method}::payment_method, 'flutterwave', ${reference}, ${reference})
    RETURNING id
  `;
  const paymentId = paymentRows[0]?.id;
  if (!paymentId) throw new PackagePaymentError('PAYMENT_CREATE_FAILED', 'Unable to create payment', 500);

  try {
    const callbackUrl = process.env.FLW_PAYMENT_CALLBACK_URL || `${process.env.API_PUBLIC_URL || 'http://localhost:3000'}/api/payments/flutterwave/complete`;
    if (process.env.FLW_HOSTED_CHECKOUT_ENABLED?.toLowerCase() === 'true') {
      const hosted = await flutterwaveProvider.createHostedCheckout({
        amount,
        currency: packageRecord.currency,
        reference,
        customer: { email: user.email, name: user.username, phoneNumber: user.phone || undefined },
        redirectUrl: callbackUrl,
        description: packageRecord.name,
        paymentOptions: 'card,mobilemoneycm',
        meta: { payment_id: paymentId, package_id: String(packageRecord.id) }
      });
      await prisma.$executeRaw`
        UPDATE payments SET checkout_url = ${hosted.link}, provider_transaction_id = ${hosted.transactionId || null}, updated_at = NOW() WHERE id = ${paymentId}::uuid
      `;
      logger.info('payment.provider.checkout_created', { request_id: requestId, payment_id: paymentId, user_id: userId, package_id: packageId, method, provider_reference: reference, provider_transaction_id: maskIdentifier(hosted.transactionId) });
      return { payment_id: paymentId, reference, checkout_url: hosted.link, payment_instruction: null, package_name: packageRecord.name };
    }

    throw new PackagePaymentError('PAYMENT_METHOD_UNAVAILABLE', 'Flutterwave hosted checkout is not enabled. Configure FLW_HOSTED_CHECKOUT_ENABLED and the v3 secret key.', 400);
  } catch (error) {
    await prisma.$executeRaw`
      UPDATE payments SET status = 'FAILED'::payment_status, failure_reason = ${error instanceof Error ? error.message : 'Checkout initialization failed'}, updated_at = NOW()
      WHERE id = ${paymentId}::uuid
    `;
    if (error instanceof PackagePaymentError) throw error;
    logger.error('payment.provider.checkout_failed', { request_id: requestId, payment_id: paymentId, user_id: userId, package_id: packageId, method, ...errorFields(error) });
    const message = error instanceof FlutterwaveProviderError ? error.message : 'Unable to initialize payment with Flutterwave';
    throw new PackagePaymentError('PAYMENT_INITIALIZATION_FAILED', message, 502);
  }
}

export async function completePackagePayment(paymentId: string, transactionId: string, requestId?: string) {
  const payments = await prisma.$queryRaw<PendingPayment[]>`
    SELECT p.id, p.user_id, p.package_id, p.amount::text, p.currency, p.provider_reference, p.method,
           pkg.name AS package_name, pkg.duration_days
    FROM payments p JOIN packages pkg ON pkg.id = p.package_id
    WHERE p.id = ${paymentId}::uuid LIMIT 1
  `;
  const payment = payments[0];
  if (!payment) throw new PackagePaymentError('PAYMENT_NOT_FOUND', 'Payment not found', 404);

  const existingSuccess = await prisma.$queryRaw<Array<{ subscription_expiry: Date | null }>>`
    SELECT u.subscription_expiry
    FROM payments p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ${paymentId}::uuid AND p.status = 'SUCCESS'::payment_status
    LIMIT 1
  `;
  if (existingSuccess[0]) {
    return { payment_id: payment.id, package_name: payment.package_name, subscription_expiry: existingSuccess[0].subscription_expiry };
  }

  const charge = await (process.env.FLW_HOSTED_CHECKOUT_ENABLED?.toLowerCase() === 'true'
    ? flutterwaveProvider.retrieveHostedTransaction(transactionId)
    : flutterwaveProvider.retrieveCharge(transactionId)) as Record<string, unknown>;
  const providerReference = typeof charge.reference === 'string'
    ? charge.reference
    : typeof charge.tx_ref === 'string' ? charge.tx_ref : null;
  const providerStatus = String(charge.status || '').toUpperCase();
  const providerAmount = Number(charge.amount);
  const providerCurrency = String(charge.currency || '').toUpperCase();

  logger.info('payment.verification.response', { request_id: requestId, payment_id: paymentId, transaction_id: maskIdentifier(transactionId), provider_reference: maskIdentifier(providerReference || undefined), provider_status: providerStatus, provider_amount: providerAmount, provider_currency: providerCurrency, reference_matches: providerReference === payment.provider_reference, amount_matches: providerAmount === Number(payment.amount), currency_matches: providerCurrency === payment.currency });

  if (providerReference !== payment.provider_reference || providerAmount !== Number(payment.amount) || providerCurrency !== payment.currency.toUpperCase()) {
    logger.warn('payment.verification.rejected', { request_id: requestId, payment_id: paymentId, reason: 'payment_details_mismatch' });
    throw new PackagePaymentError('PAYMENT_VERIFICATION_FAILED', 'Payment details do not match the selected package', 400);
  }

  if (!['SUCCESS', 'SUCCEEDED', 'SUCCESSFUL', 'COMPLETED'].includes(providerStatus)) {
    logger.warn('payment.verification.pending', { request_id: requestId, payment_id: paymentId, provider_status: providerStatus });
    await prisma.$executeRaw`
      UPDATE payments SET status = 'PROCESSING'::payment_status, provider_transaction_id = ${transactionId}, updated_at = NOW()
      WHERE id = ${payment.id}::uuid
    `;
    throw new PackagePaymentError('PAYMENT_NOT_COMPLETE', 'Payment has not completed yet', 409);
  }

  const startedAt = new Date();
  const existingExpiry = await prisma.$queryRaw<Array<{ subscription_expiry: Date | null }>>`
    SELECT subscription_expiry FROM users WHERE id = ${payment.user_id} LIMIT 1
  `;
  const currentExpiry = existingExpiry[0]?.subscription_expiry;
  const expiryStart = currentExpiry && currentExpiry > startedAt ? currentExpiry : startedAt;
  const expiresAt = expiryDate(payment.duration_days, expiryStart);
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

  logger.info('payment.entitlement.activated', { request_id: requestId, payment_id: payment.id, user_id: payment.user_id, package_id: payment.package_id, status: 'SUCCESS' });

  const user = await prisma.user.findUnique({ where: { id: payment.user_id }, select: { username: true, email: true } });
  if (expiresAt) {
    await sendPackageActivationEmail(user?.email ?? '', user?.username ?? 'there', payment.package_name, expiresAt);
  }

  return { payment_id: payment.id, package_name: payment.package_name, subscription_expiry: expiresAt };
}
