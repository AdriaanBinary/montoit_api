import { RequestHandler } from 'express';
import listingPromotionsDb from '../db/listingPromotions.js';
import listingsDb from '../db/listings.js';
import agenciesDb from '../db/agencies.js';
import { AuthenticatedRequest } from '../utils/authMiddleware.js';
import { getActivePackageFeatures } from '../utils/packageAccess.js';

function getListingId(value: unknown): number | null {
  const listingId = Number(value);
  return Number.isInteger(listingId) && listingId > 0 ? listingId : null;
}

async function getManagedAgencyId(userId: string): Promise<number | undefined> {
  const agency = await agenciesDb.getOwnedAgency(userId);
  return agency?.status === 'ACTIVE' && typeof agency.id === 'number' ? agency.id : undefined;
}

export const getListingPromotions: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const listingId = getListingId(req.params.id);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!listingId) return res.status(400).json({ success: false, error: 'Invalid listing id' });

  const listing = await listingsDb.getOwnedListingById(listingId, userId, await getManagedAgencyId(userId));
  if (!listing) return res.status(404).json({ success: false, error: 'Listing not found' });

  return res.json({ success: true, promotions: await listingPromotionsDb.getForListing(listingId) });
};

export const featureListing: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const listingId = getListingId(req.params.id);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!listingId) return res.status(400).json({ success: false, error: 'Invalid listing id' });

  try {
    const listing = await listingsDb.getOwnedListingById(listingId, userId, await getManagedAgencyId(userId));
    if (!listing) return res.status(404).json({ success: false, error: 'Listing not found' });
    if (listing.is_published !== true || listing.status !== 'active') {
      return res.status(409).json({ success: false, error: 'LISTING_NOT_PUBLISHED', message: 'Only published listings can be featured.' });
    }

    const packageAccess = await getActivePackageFeatures(userId);
    const monthlyLimit = packageAccess?.features.featured_listings_per_month ?? 0;
    if (!packageAccess || monthlyLimit <= 0) {
      return res.status(403).json({ success: false, error: 'FEATURED_LISTING_NOT_INCLUDED', message: 'Your package does not include featured listings.' });
    }

    if (await listingPromotionsDb.getActiveForListing(listingId)) {
      return res.status(409).json({ success: false, error: 'FEATURED_LISTING_ALREADY_ACTIVE', message: 'This listing is already featured.' });
    }

    const used = await listingPromotionsDb.countUserPromotionsThisMonth(userId);
    if (used >= monthlyLimit) {
      return res.status(403).json({
        success: false,
        error: 'FEATURED_LISTING_LIMIT_REACHED',
        message: `Your package allows ${monthlyLimit} featured listing${monthlyLimit === 1 ? '' : 's'} per month.`,
        remaining_featured_listings: 0
      });
    }

    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
    const promotion = await listingPromotionsDb.createFeatured(userId, listingId, packageAccess.package_id, expiresAt);
    return res.status(201).json({
      success: true,
      promotion,
      remaining_featured_listings: Math.max(0, monthlyLimit - used - 1)
    });
  } catch (error: unknown) {
    console.error('Feature listing error:', error);
    return res.status(500).json({ success: false, error: 'Failed to feature listing' });
  }
};

export const unfeatureListing: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const listingId = getListingId(req.params.id);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!listingId) return res.status(400).json({ success: false, error: 'Invalid listing id' });

  const listing = await listingsDb.getOwnedListingById(listingId, userId, await getManagedAgencyId(userId));
  if (!listing) return res.status(404).json({ success: false, error: 'Listing not found' });
  const cancelled = await listingPromotionsDb.cancelActiveForListing(listingId, userId);
  if (!cancelled) return res.status(404).json({ success: false, error: 'FEATURED_LISTING_NOT_ACTIVE' });
  return res.json({ success: true });
};