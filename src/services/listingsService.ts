import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
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

interface ListingEnquiryRequestBody {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
}

interface UpdateListingRequestBody {
  title?: string;
  description?: string;
  location?: string;
  property_type?: string;
  bedrooms?: number;
  bathrooms?: number;
  property_size?: number;
  living_area?: number;
  land_size?: number;
  amount?: number;
  furnished?: boolean;
  available_from?: Date | string;
  rental_term?: string;
  parking_spaces?: number;
  parking_type?: string;
  pet_friendly?: boolean;
  garden?: boolean;
  pool?: boolean;
  flatlet?: boolean;
  retirement?: boolean;
  on_show?: boolean;
  security_estate?: boolean;
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

function resolveOptionalAuthenticatedUserId(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return null;
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const secret = process.env.JWT_KEY;

  if (!secret) {
    throw new Error('JWT secret is not configured');
  }

  const token = authHeader.slice(7);
  const decoded = jwt.verify(token, secret) as { user_id?: string };

  if (!decoded.user_id) {
    throw new Error('Invalid token');
  }

  return decoded.user_id;
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

async function objectExistsInS3(bucket: string, key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error) {
      const errorName = String((error as { name?: string }).name);
      if (errorName === 'NotFound' || errorName === 'NoSuchKey') {
        return false;
      }
    }

    throw error;
  }
}

export function filterConfirmedImages(images: Array<{ id?: string; object_key?: string; upload_confirmed?: boolean }>) {
  return images.filter((image) => image.upload_confirmed === true);
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

export const confirmListingImageUpload: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const listingId = Number(req.params.listingId);
  const imageId = req.params.imageId;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!Number.isInteger(listingId) || !imageId) {
    return res.status(400).json({ success: false, error: 'Invalid listing or image id' });
  }

  try {
    const listing = await listingsDb.getOwnedListingById(listingId, userId);

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    const bucketName = process.env.AWS_S3_BUCKET ?? 'property-images';
    const existingImage = await listingsDb.getListingImageById(listingId, imageId);

    if (!existingImage) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    const existsInS3 = await objectExistsInS3(bucketName, existingImage.object_key);

    if (!existsInS3) {
      return res.status(404).json({ success: false, error: 'Uploaded image not found in storage' });
    }

    const confirmedImage = await listingsDb.confirmListingImageUpload(listingId, imageId);

    if (!confirmedImage) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    return res.json({ success: true, image: confirmedImage });
  } catch (error: unknown) {
    console.error('Confirm listing image upload error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to confirm image upload',
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

    const imagesData = await listingsDb.getListingImages(listingId);
    const confirmedImages = filterConfirmedImages(
      imagesData as Array<{ id?: string; object_key?: string; upload_confirmed?: boolean }>
    );

    const images = [] as Array<Record<string, unknown>>;
    const bucketName = process.env.AWS_S3_BUCKET ?? 'property-images';

    for (const image of confirmedImages) {
      const objectKey = String(image.object_key);
      const viewUrl = await buildPresignedGetUrl(bucketName, objectKey);
      images.push({
        id: image.id,
        bucket: bucketName,
        object_key: objectKey,
        upload_confirmed: image.upload_confirmed,
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

    const imagesData = await listingsDb.getListingImages(listingId);
    const confirmedImages = filterConfirmedImages(
      imagesData as Array<{ id?: string; object_key?: string; upload_confirmed?: boolean }>
    );

    const images = [] as Array<Record<string, unknown>>;
    const bucketName = process.env.AWS_S3_BUCKET ?? 'property-images';

    for (const image of confirmedImages) {
      const objectKey = String(image.object_key);
      const viewUrl = await buildPresignedGetUrl(bucketName, objectKey);
      images.push({
        id: image.id,
        bucket: bucketName,
        object_key: objectKey,
        upload_confirmed: image.upload_confirmed,
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

export const createListingEnquiry: RequestHandler = async (req, res) => {
  const listingId = Number(req.params.id);
  const body = (req.body ?? {}) as ListingEnquiryRequestBody;

  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  if (!body.name || !body.email || !body.message) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      message: 'name, email, and message are required'
    });
  }

  try {
    const authenticatedUserId = resolveOptionalAuthenticatedUserId(req);
    const listing = await listingsDb.getPublicListingById(listingId);

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    await listingsDb.ensureListingEnquiriesTable();

    const enquiry = await listingsDb.createListingEnquiry({
      listing_id: listingId,
      listing_owner_user_id: String(listing.user_id),
      submitted_by_user_id: authenticatedUserId,
      name: body.name.trim(),
      email: body.email.trim(),
      phone: body.phone?.trim() || null,
      message: body.message.trim()
    });

    return res.status(201).json({ success: true, enquiry });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'Missing or invalid authorization header' || message === 'Invalid token') {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message
      });
    }

    console.error('Create listing enquiry error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create listing enquiry',
      message
    });
  }
};

export const updateListing: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const listingId = Number(req.params.id);
  const body = (req.body ?? {}) as UpdateListingRequestBody;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  try {
    const listing = await listingsDb.getListingById(listingId);

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    if (String(listing.user_id) !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only modify your own listings'
      });
    }

    const updatedListing = await listingsDb.updateOwnedListing(listingId, userId, body as Record<string, unknown>);

    if (!updatedListing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    return res.json({ success: true, listing: updatedListing });
  } catch (error: unknown) {
    console.error('Update listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update listing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const deleteListing: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const listingId = Number(req.params.id);

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  try {
    const listing = await listingsDb.getListingById(listingId);

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    if (String(listing.user_id) !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only archive your own listings'
      });
    }

    const archivedListing = await listingsDb.archiveOwnedListing(listingId, userId);

    if (!archivedListing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    return res.json({ success: true, listing: archivedListing });
  } catch (error: unknown) {
    console.error('Delete listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to archive listing',
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
