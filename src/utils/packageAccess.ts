import { RequestHandler } from 'express';
import prisma from '../db/prisma.js';
import { AuthenticatedRequest } from './authMiddleware.js';

export type AccountType = 'PRIVATE' | 'AGENCY';

const PUBLISHED_LISTING_LIMITS: Record<AccountType, number> = {
  PRIVATE: 1,
  AGENCY: 10
};

export function getAccountType(role: unknown): AccountType {
  return String(role).toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'AGENCY';
}

export function hasActiveLegacyPackage(subscription: unknown, expiry: Date | string | null | undefined): boolean {
  const normalizedSubscription = String(subscription || '').trim().toLowerCase();
  if (!normalizedSubscription || normalizedSubscription === 'free') return false;
  return !expiry || new Date(expiry).getTime() > Date.now();
}

export async function getPackageSummary(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, subscription: true, subscription_expiry: true }
  });

  if (!user) return null;

  const accountType = getAccountType(user.role);
  const maxPublishedListings = PUBLISHED_LISTING_LIMITS[accountType];
  const publishedListings = await prisma.listing.count({
    where: { user_id: userId, is_published: true, deleted_at: null }
  });
  const active = hasActiveLegacyPackage(user.subscription, user.subscription_expiry);

  return {
    account_type: accountType,
    package_name: active ? user.subscription : null,
    subscription_status: active ? 'ACTIVE' : user.subscription_expiry && new Date(user.subscription_expiry).getTime() <= Date.now() ? 'EXPIRED' : 'INACTIVE',
    subscription_expiry: user.subscription_expiry,
    published_listings: publishedListings,
    max_published_listings: maxPublishedListings,
    remaining_published_listings: Math.max(0, maxPublishedListings - publishedListings)
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
