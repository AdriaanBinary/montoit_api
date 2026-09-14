import { RequestHandler } from 'express';
import prisma from '../db/prisma.js';
import { AuthenticatedRequest } from './authMiddleware.js';

export type AccountType = 'PRIVATE' | 'AGENCY';

export type PackageFeatures = {
  active_listings: number | null;
  agents: number | null;
  photos_per_listing: number | null;
  featured_listings_per_month: number | null;
  agent_profile: boolean;
  verification_badge: boolean;
  priority_placement: boolean;
};

const EMPTY_FEATURES: PackageFeatures = {
  active_listings: null,
  agents: null,
  photos_per_listing: null,
  featured_listings_per_month: null,
  agent_profile: false,
  verification_badge: false,
  priority_placement: false
};

type PackageFeatureRow = {
  key: string;
  value_type: 'BOOLEAN' | 'INTEGER' | 'DECIMAL' | 'TEXT';
  boolean_value: boolean | null;
  integer_value: number | null;
};

type ActivePackage = {
  package_id: number;
  package_name: string;
  subscription_expiry: Date | null;
  features: PackageFeatures;
};

export function getAccountType(role: unknown): AccountType {
  return String(role).toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'AGENCY';
}

export function hasActiveLegacyPackage(subscription: unknown, expiry: Date | string | null | undefined): boolean {
  const normalizedSubscription = String(subscription || '').trim().toLowerCase();
  if (!normalizedSubscription || normalizedSubscription === 'free') return false;
  return !expiry || new Date(expiry).getTime() > Date.now();
}

function decodeFeatures(rows: PackageFeatureRow[]): PackageFeatures {
  const features = { ...EMPTY_FEATURES };
  for (const row of rows) {
    if (row.value_type === 'BOOLEAN' && row.boolean_value !== null && row.key in features) {
      (features as Record<string, boolean | number | null>)[row.key] = row.boolean_value;
    } else if (row.value_type === 'INTEGER' && row.integer_value !== null && row.key in features) {
      (features as Record<string, boolean | number | null>)[row.key] = row.integer_value;
    }
  }
  return features;
}

export async function getActivePackageFeatures(userId: string): Promise<ActivePackage | null> {
  const packageRows = await prisma.$queryRaw<Array<{
    package_name: string;
    subscription_expiry: Date | null;
    package_id: number;
  }>>`
    SELECT p.name AS package_name, ue.expires_at AS subscription_expiry, ue.package_id
    FROM user_entitlements ue
    JOIN packages p ON p.id = ue.package_id
    WHERE ue.user_id = ${userId}
      AND ue.status = 'ACTIVE'::entitlement_status
      AND (ue.expires_at IS NULL OR ue.expires_at > NOW())
      AND p.is_active = true
    ORDER BY ue.starts_at DESC
    LIMIT 1
  `;

  const activePackage = packageRows[0];
  if (!activePackage) return null;

  const featureRows = await prisma.$queryRaw<PackageFeatureRow[]>`
    SELECT key, value_type, boolean_value, integer_value
    FROM package_features
    WHERE package_id = ${activePackage.package_id}
  `;

  return {
    package_id: activePackage.package_id,
    package_name: activePackage.package_name,
    subscription_expiry: activePackage.subscription_expiry,
    features: decodeFeatures(featureRows)
  };
}

export async function getPackageSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, subscription: true, subscription_expiry: true }
  });

  if (!user) return null;

  const accountType = getAccountType(user.role);
  let normalizedPackage: ActivePackage | null = null;
  try {
    normalizedPackage = await getActivePackageFeatures(userId);
  } catch (error) {
    console.warn('Normalized package lookup failed; using legacy subscription fields:', error);
  }

  const publishedListings = await prisma.listing.count({
    where: { user_id: userId, is_published: true, deleted_at: null }
  });
  const active = normalizedPackage !== null || hasActiveLegacyPackage(user.subscription, user.subscription_expiry);
  const features = normalizedPackage?.features ?? {
    ...EMPTY_FEATURES,
    active_listings: accountType === 'PRIVATE' ? 1 : 10
  };
  const maxPublishedListings = features.active_listings ?? 0;

  return {
    account_type: accountType,
    package_name: normalizedPackage?.package_name ?? (active ? user.subscription : null),
    subscription_status: active ? 'ACTIVE' : user.subscription_expiry && new Date(user.subscription_expiry).getTime() <= Date.now() ? 'EXPIRED' : 'INACTIVE',
    subscription_expiry: normalizedPackage?.subscription_expiry ?? user.subscription_expiry,
    published_listings: publishedListings,
    max_published_listings: maxPublishedListings,
    remaining_published_listings: Math.max(0, maxPublishedListings - publishedListings),
    features
  } as const;
}

export const requireActivePackage: RequestHandler = async (req, res, next) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const summary = await getPackageSummary(userId);
    if (!summary) return res.status(404).json({ success: false, error: 'User not found' });
    if (summary.subscription_status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: 'PACKAGE_REQUIRED',
        message: 'An active package is required for this action.',
        package: summary
      });
    }
    next();
  } catch (error) {
    console.error('Package access check failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to verify package access' });
  }
};

export const requirePublishedListingCapacity: RequestHandler = async (req, res, next) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const summary = await getPackageSummary(userId);
    if (!summary) return res.status(404).json({ success: false, error: 'User not found' });
    if (summary.published_listings >= summary.max_published_listings) {
      return res.status(403).json({
        success: false,
        error: 'PUBLISHED_LISTING_LIMIT_REACHED',
        message: `Your package allows ${summary.max_published_listings} published listing${summary.max_published_listings === 1 ? '' : 's'}.`,
        package: summary
      });
    }
    next();
  } catch (error) {
    console.error('Published listing capacity check failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to verify listing capacity' });
  }
};
