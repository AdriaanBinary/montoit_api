import { RequestHandler } from 'express';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import listingsDb from '../db/listings.js';
import usersDb from '../db/users.js';
import { AuthenticatedRequest } from '../utils/authMiddleware.js';

const s3Client = new S3Client({
  forcePathStyle: true,
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_S3_ENDPOINT,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }
    : undefined
});

async function objectExistsInS3(bucket: string, key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function buildAvatarGetUrl(bucket: string, key: string): Promise<string> {
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
}

function buildAvatarObjectKey(userId: string, fileName: string): string {
  const cleanedFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  return `users/${userId}/profile/${Date.now()}-${cleanedFileName}`;
}

export const createAvatarUpload: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const body = (req.body ?? {}) as { file_name?: string; content_type?: string };
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!body.file_name?.trim() || !body.content_type?.startsWith('image/')) return res.status(400).json({ success: false, error: 'An image file_name and content_type are required' });
  const bucket = process.env.AWS_S3_BUCKET ?? 'property-images';
  const objectKey = buildAvatarObjectKey(userId, body.file_name.trim());
  const upload_url = await getSignedUrl(s3Client, new PutObjectCommand({ Bucket: bucket, Key: objectKey, ContentType: body.content_type }), { expiresIn: 3600 });
  return res.status(201).json({ success: true, upload_url, object_key: objectKey, bucket });
};

export const confirmAvatarUpload: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const objectKey = String((req.body ?? {}).object_key ?? '');
  if (!userId || !objectKey.startsWith(`users/${userId}/profile/`)) return res.status(400).json({ success: false, error: 'Invalid avatar upload' });
  const bucket = process.env.AWS_S3_BUCKET ?? 'property-images';
  if (!(await objectExistsInS3(bucket, objectKey))) return res.status(404).json({ success: false, error: 'Uploaded avatar not found in storage' });
  const user = await usersDb.updateAvatar(userId, objectKey);
  const avatar_url = user?.avatar_url ? await buildAvatarGetUrl(bucket, String(user.avatar_url)) : null;
  return res.json({ success: true, user: user ? { ...user, user_id: user.id, avatar_url } : null });
};

export const removeAvatar: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const user = await usersDb.updateAvatar(userId, null);
  return res.json({ success: true, user: user ? { ...user, user_id: user.id } : null });
};

export const getCurrentUser: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const user = await usersDb.getUserById(userId);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const bucket = process.env.AWS_S3_BUCKET ?? 'property-images';
    const avatar_url = typeof user.avatar_url === 'string' && user.avatar_url
      ? await buildAvatarGetUrl(bucket, user.avatar_url).catch(() => null)
      : null;
    return res.json({ success: true, user: { ...user, user_id: user.id, avatar_url } });
  } catch (error: unknown) {
    return res.status(500).json({
      success: false,
      error: 'Failed to load current user',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

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