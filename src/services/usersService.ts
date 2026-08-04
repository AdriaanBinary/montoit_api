import { RequestHandler } from 'express';
import listingsDb from '../db/listings.js';
import usersDb from '../db/users.js';
import { AuthenticatedRequest } from '../utils/authMiddleware.js';

interface FavoriteListingRequestBody {
  listing_id?: number;
}

interface FavoritesRequestQuery {
  page?: string;
  limit?: string;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const addFavoriteListing: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const body = (req.body ?? {}) as FavoriteListingRequestBody;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!Number.isInteger(body.listing_id ?? NaN) || (body.listing_id ?? 0) <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid request body', message: 'listing_id is required' });
  }

  try {
    const listing = await listingsDb.getPublicListingById(body.listing_id as number);

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    await usersDb.ensureUserFavoritesTable();
    await usersDb.upsertFavoriteListing(userId, body.listing_id as number);

    return res.status(201).json({ success: true, listing });
  } catch (error: unknown) {
    console.error('Add favorite listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to add favorite listing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const removeFavoriteListing: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const listingId = Number(req.params.listingId);

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!Number.isInteger(listingId) || listingId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  try {
    await usersDb.ensureUserFavoritesTable();
    await usersDb.removeFavoriteListing(userId, listingId);

    return res.json({ success: true, message: 'Favorite removed' });
  } catch (error: unknown) {
    console.error('Remove favorite listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to remove favorite listing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getFavoriteListings: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const typedReq = req as AuthenticatedRequest & { query: FavoritesRequestQuery };

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const currentPage = toPositiveInt(typedReq.query.page, 1);
  const itemsPerPage = Math.min(toPositiveInt(typedReq.query.limit, 20), 100);

  try {
    await usersDb.ensureUserFavoritesTable();

    const totalItems = await usersDb.countFavoriteListings(userId);
    const pages = totalItems === 0 ? 1 : Math.ceil(totalItems / itemsPerPage);
    const safePage = Math.min(currentPage, pages);
    const safeOffset = (safePage - 1) * itemsPerPage;

    const favoriteListingIds = await usersDb.getFavoriteListingIds(userId, itemsPerPage, safeOffset);

    if (favoriteListingIds.length === 0) {
      return res.json({
        success: true,
        pagination: {
          currentpage: safePage,
          pages,
          itemsPerPage
        },
        totalItems,
        count: 0,
        listings: []
      });
    }

    const listings = await listingsDb.getPublicListings(
      favoriteListingIds.length,
      0,
      {
        id: { in: favoriteListingIds },
        status: 'active',
        is_published: true,
        deleted_at: null
      },
      { created_at: 'desc' }
    );

    const listingsById = new Map<number, Record<string, unknown>>();

    for (const listing of listings) {
      const listingId = Number(listing.id);
      if (Number.isInteger(listingId)) {
        listingsById.set(listingId, listing);
      }
    }

    const orderedListings = favoriteListingIds
      .map((listingId) => listingsById.get(listingId))
      .filter((listing): listing is Record<string, unknown> => Boolean(listing));

    return res.json({
      success: true,
      pagination: {
        currentpage: safePage,
        pages,
        itemsPerPage
      },
      totalItems,
      count: orderedListings.length,
      listings: orderedListings
    });
  } catch (error: unknown) {
    console.error('Get favorite listings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch favorite listings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};