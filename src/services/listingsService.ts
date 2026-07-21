import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RequestHandler } from 'express';
import listingsDb from '../db/listings.js';
import { AuthenticatedRequest } from '../utils/authMiddleware.js';

interface ListingCreateInput {
  title?: string;
  description?: string;
  property_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  property_size?: number;
  amount?: number;
  currency?: string;
  features?: string[];
  other?: string[];
  status?: 'draft' | 'active' | 'archived' | 'sold';
  sold?: boolean;
  region_id?: number;
  city_id?: number;
  municipality_id?: number;
  neighborhood_id?: number;
  is_published?: boolean;
  verified?: boolean;
}

interface ListingImageInput {
  fileName?: string;
  name?: string;
  contentType?: string;
}

interface ListingImageUploadRequestBody {
  images?: ListingImageInput[];
  name?: string;
}

interface PrivateListingsRequestQuery {
  page?: string;
  limit?: string;
}

const s3Client = new S3Client({
  forcePathStyle: true,
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_S3_ENDPOINT,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
        }
      : undefined
});

export function buildListingImageObjectKey(listingId: number, index: number, fileName: string): string {
  const cleanedFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  return `listings/${listingId}/${Date.now()}-${index + 1}-${cleanedFileName}`;
}

async function buildPresignedGetUrl(bucket: string, key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

async function buildPresignedPutUrl(bucket: string, key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType
  });

  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

function normalizeListingStatus(status?: string): 'draft' | 'active' | 'archived' | 'sold' {
  if (status === 'active' || status === 'archived' || status === 'sold') {
    return status;
  }
  return 'draft';
}

export function normalizeCreateListingInput(input: Partial<ListingCreateInput>, userId: string) {
  const normalizedStatus = normalizeListingStatus(input.status);
  const features = Array.isArray(input.features) ? input.features : [];
  const other = Array.isArray(input.other) ? input.other : [];

  return {
    user_id: userId,
    title: input.title ?? null,
    description: input.description ?? null,
    property_type: input.property_type ?? null,
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    property_size: input.property_size ?? null,
    amount: input.amount ?? null,
    currency: input.currency ?? 'USD',
    features,
    other,
    status: normalizedStatus,
    sold: Boolean(input.sold ?? false),
    region_id: input.region_id ?? null,
    city_id: input.city_id ?? null,
    municipality_id: input.municipality_id ?? null,
    neighborhood_id: input.neighborhood_id ?? null,
    is_published: Boolean(input.is_published ?? false),
    verified: Boolean(input.verified ?? false)
  };
}

export const createListing: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const payload = normalizeCreateListingInput(req.body as Partial<ListingCreateInput>, userId);
    const createdListing = await listingsDb.createListing(payload as Record<string, unknown>);

    return res.status(201).json({ success: true, listing: createdListing });
  } catch (error: unknown) {
    console.error('Create listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create listing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const publishListing: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const listingId = Number(req.params.id);

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  try {
    const updatedListing = await listingsDb.publishListing(listingId, userId);

    if (!updatedListing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    return res.json({ success: true, listing: updatedListing });
  } catch (error: unknown) {
    console.error('Publish listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to publish listing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const uploadListingImages: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const listingId = Number(req.params.id);
  const body = (req.body ?? {}) as ListingImageUploadRequestBody;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  try {
    const listing = await listingsDb.getOwnedListingById(listingId, userId);

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    await listingsDb.ensureListingImagesTable();

    const images = Array.isArray(body.images) ? body.images : [];
    const insertedImages = [] as Array<Record<string, unknown>>;
    const bucketName = process.env.AWS_S3_BUCKET ?? 'no-bucket-specified';

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return res.status(500).json({
        success: false,
        error: 'S3 credentials are not configured'
      });
    }

    for (const [index, image] of images.entries()) {
      const filename = image.fileName ?? image.name ?? `image-${index + 1}`;
      const objectKey = buildListingImageObjectKey(listingId, index, filename);
      const contentType = image.contentType ?? 'application/octet-stream';
      const uploadUrl = await buildPresignedPutUrl(bucketName, objectKey, contentType);

      const createdImage = await listingsDb.createListingImage(listingId, objectKey, index);

      insertedImages.push({
        id: createdImage.id,
        listing_id: listingId,
        bucket: bucketName,
        object_key: objectKey,
        file_name: filename,
        sort_order: index,
        upload_url: uploadUrl,
        view_url: await buildPresignedGetUrl(bucketName, objectKey)
      });
    }

    return res.status(201).json({
      success: true,
      collection_id: null,
      listing_id: listingId,
      images: insertedImages
    });
  } catch (error: unknown) {
    console.error('Upload listing images error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to upload listing images',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getListingById: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const listingId = Number(req.params.id);

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  try {
    const listing = await listingsDb.getOwnedListingById(listingId, userId);

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    const objectKeys = await listingsDb.getListingImageObjectKeys(listingId);

    const images = [] as Array<Record<string, unknown>>;
    const bucketName = process.env.AWS_S3_BUCKET ?? 'property-images';

    for (const objectKey of objectKeys) {
      const viewUrl = await buildPresignedGetUrl(bucketName, objectKey);
      images.push({
        bucket: bucketName,
        object_key: objectKey,
        url: viewUrl
      });
    }

    return res.json({ success: true, listing: { ...listing, images } });
  } catch (error: unknown) {
    console.error('Get listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch listing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getPublicListingById: RequestHandler = async (req, res) => {
  const listingId = Number(req.params.id);

  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  try {
    const listing = await listingsDb.getPublicListingById(listingId);

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    const objectKeys = await listingsDb.getListingImageObjectKeys(listingId);

    const images = [] as Array<Record<string, unknown>>;
    const bucketName = process.env.AWS_S3_BUCKET ?? 'property-images';

    for (const objectKey of objectKeys) {
      const viewUrl = await buildPresignedGetUrl(bucketName, objectKey);
      images.push({
        bucket: bucketName,
        object_key: objectKey,
        url: viewUrl
      });
    }

    return res.json({ success: true, listing: { ...listing, images } });
  } catch (error: unknown) {
    console.error('Get public listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch listing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getPrivateListings: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const typedReq = req as AuthenticatedRequest & { query: PrivateListingsRequestQuery };
  const rawPage = Number(typedReq.query.page);
  const rawLimit = Number(typedReq.query.limit);
  const currentPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const itemsPerPage = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

  try {
    const totalItems = await listingsDb.countPrivateListings(userId);
    const pages = totalItems === 0 ? 1 : Math.ceil(totalItems / itemsPerPage);
    const safePage = Math.min(currentPage, pages);
    const safeOffset = (safePage - 1) * itemsPerPage;

    const listings = await listingsDb.getPrivateListings(userId, itemsPerPage, safeOffset);

    return res.json({
      success: true,
      pagination: {
        currentpage: safePage,
        pages,
        itemsPerPage
      },
      totalItems,
      count: listings.length,
      listings
    });
  } catch (error: unknown) {
    console.error('Get private listings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch private listings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
