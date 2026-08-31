import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import listingsDb from '../db/listings.js';
import {
  addListingGeneralFees,
  getListingGeneralFees,
  GeneralFeeInput,
  GeneralFeeValidationError,
  OtherGeneralFeeInput,
  replaceListingGeneralFees,
  validateGeneralFeeIds
} from '../db/generalFees.js';
import {
  addListingOptions,
  groupListingOptions,
  ListingOptionValidationError,
  replaceListingOptionSelections,
  validateListingOptionIds
} from '../db/listingOptions.js';
import { LocationValidationError, validateListingLocationIds } from '../db/locations.js';
import usersDb from '../db/users.js';
import { AuthenticatedRequest } from '../utils/authMiddleware.js';
import { attachPublicImageUrls } from './publicListingsService.js';

interface ListingCreateInput {
  title?: string;
  description?: string;
  property_type?: PropertyTypeValue;
  listing_type?: 'sale' | 'rent';
  bedrooms?: number;
  bathrooms?: number;
  property_size?: number;
  amount?: number;
  currency?: string;
  features?: string[];
  other?: string[];
  option_ids?: number[];
  general_fees?: GeneralFeeInput[];
  other_general_fees?: OtherGeneralFeeInput[];
  status?: 'draft' | 'active' | 'archived' | 'sold';
  sold?: boolean;
  region_id?: number;
  city_id?: number;
  municipality_id?: number;
  neighborhood_id?: number;
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
  property_type?: PropertyTypeValue;
  listing_type?: 'sale' | 'rent';
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
  option_ids?: number[];
  general_fees?: GeneralFeeInput[];
  other_general_fees?: OtherGeneralFeeInput[];
  status?: 'draft' | 'active' | 'archived' | 'sold';
  sold?: boolean;
  region_id?: number;
  city_id?: number;
  municipality_id?: number;
  neighborhood_id?: number;
  verified?: boolean;
}

export type PropertyTypeValue =
  | 'House'
  | 'Apartment / Flat'
  | 'Villa'
  | 'Commercial'
  | 'Industrial'
  | 'Vacant Land';

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

export function validatePublishRequirements(confirmedImageCount: number): { valid: boolean; message?: string } {
  if (confirmedImageCount < 5) {
    return {
      valid: false,
      message: 'A listing must have at least 5 confirmed images before it can be published.'
    };
  }

  return {
    valid: true,
    message: undefined
  };
}

export function validateRightsConfirmation(rightsConfirmed: unknown): { valid: boolean; message?: string } {
  if (rightsConfirmed !== true) {
    return {
      valid: false,
      message: 'You must confirm you have the rights and permission to publish this listing.'
    };
  }

  return {
    valid: true,
    message: undefined
  };
}

export function normalizeCreateListingInput(input: Partial<ListingCreateInput>, userId: string) {
  const normalizedStatus = normalizeListingStatus(input.status);
  const normalizedListingType = input.listing_type === 'rent' ? 'rent' : 'sale';
  const features = Array.isArray(input.features) ? input.features : [];
  const other = Array.isArray(input.other) ? input.other : [];
  const option_ids = Array.isArray(input.option_ids) ? [...new Set(input.option_ids)] : [];

  return {
    user_id: userId,
    title: input.title ?? null,
    description: input.description ?? null,
    property_type: input.property_type ?? null,
    listing_type: normalizedListingType,
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    property_size: input.property_size ?? null,
    amount: input.amount ?? null,
    currency: input.currency ?? 'XAF',
    features,
    other,
    option_ids,
    general_fees: Array.isArray(input.general_fees) ? input.general_fees : [],
    other_general_fees: Array.isArray(input.other_general_fees) ? input.other_general_fees : [],
    status: normalizedStatus,
    sold: Boolean(input.sold ?? false),
    region_id: input.region_id ?? null,
    city_id: input.city_id ?? null,
    municipality_id: input.municipality_id ?? null,
    neighborhood_id: input.neighborhood_id ?? null,
    verified: Boolean(input.verified ?? false)
  };
}

export function isAgentRole(role: unknown): boolean {
  return role === 'AGENT';
}

export function requiresAgentForPropertyType(propertyType: unknown): boolean {
  return propertyType === 'Commercial';
}

export const createListing: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const userRole = await usersDb.getUserRole(userId);
    const payload = normalizeCreateListingInput(req.body as Partial<ListingCreateInput>, userId);

    if (requiresAgentForPropertyType(payload.property_type) && !isAgentRole(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Only agents can create commercial property listings'
      });
    }

    await validateListingOptionIds(payload.option_ids);
    await validateGeneralFeeIds(payload.general_fees);
    await validateListingLocationIds({
      region_id: payload.region_id,
      city_id: payload.city_id,
      municipality_id: payload.municipality_id,
      neighborhood_id: payload.neighborhood_id
    });

    const createdListing = await listingsDb.createListing(payload as Record<string, unknown>);
    await replaceListingOptionSelections(Number(createdListing.id), payload.option_ids);
    await replaceListingGeneralFees(Number(createdListing.id), payload.general_fees, payload.other_general_fees);

    return res.status(201).json({
      success: true,
      listing: await addListingGeneralFees(await addListingOptions(createdListing))
    });
  } catch (error: unknown) {
    if (error instanceof LocationValidationError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        message: error.message
      });
    }

    if (error instanceof ListingOptionValidationError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid listing options',
        message: error.message,
        option_ids: error.optionIds
      });
    }

    if (error instanceof GeneralFeeValidationError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid general fees',
        message: error.message,
        fee_ids: error.feeIds
      });
    }

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
  const body = (req.body ?? {}) as { rights_confirmed?: boolean };

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

    const rightsValidation = validateRightsConfirmation(body.rights_confirmed);

    if (!rightsValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Rights confirmation required',
        message: rightsValidation.message
      });
    }

    const confirmedImages = await listingsDb.getListingImages(listingId);
    const publishValidation = validatePublishRequirements(confirmedImages.length);

    if (!publishValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Minimum image requirement not met',
        message: publishValidation.message
      });
    }

    const updatedListing = await listingsDb.publishListing(listingId, userId);

    if (!updatedListing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    return res.json({
      success: true,
      listing: await addListingGeneralFees(await addListingOptions(updatedListing))
    });
  } catch (error: unknown) {
    console.error('Publish listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to publish listing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const unpublishListing: RequestHandler = async (req, res) => {
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

    const updatedListing = await listingsDb.unpublishListing(listingId, userId);

    if (!updatedListing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    return res.json({
      success: true,
      listing: await addListingGeneralFees(await addListingOptions(updatedListing))
    });
  } catch (error: unknown) {
    console.error('Unpublish listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to unpublish listing',
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

export const reorderListingImages: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const listingId = Number(req.params.id);
  const body = (req.body ?? {}) as { image_ids?: string[] };

  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!Number.isInteger(listingId)) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  const imageIds = Array.isArray(body.image_ids) ? body.image_ids : [];

  if (imageIds.length === 0) {
    return res.status(400).json({ success: false, error: 'image_ids must be a non-empty array' });
  }

  try {
    const listing = await listingsDb.getOwnedListingById(listingId, userId);

    if (!listing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    const images = await listingsDb.reorderListingImages(listingId, imageIds);
    const bucketName = process.env.AWS_S3_BUCKET ?? 'property-images';

    const hydratedImages = await Promise.all(
      images.map(async (image) => ({
        id: image.id,
        bucket: bucketName,
        object_key: image.object_key,
        upload_confirmed: image.upload_confirmed,
        sort_order: image.sort_order,
        url: await buildPresignedGetUrl(bucketName, image.object_key)
      }))
    );

    return res.json({ success: true, images: hydratedImages });
  } catch (error: unknown) {
    console.error('Reorder listing images error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reorder listing images',
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

    return res.json({
      success: true,
      listing: { ...(await addListingGeneralFees(await addListingOptions(listing))), images }
    });
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

    return res.json({
      success: true,
      listing: { ...(await addListingGeneralFees(await addListingOptions(listing))), images }
    });
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

    if (requiresAgentForPropertyType(body.property_type)) {
      const userRole = await usersDb.getUserRole(userId);

      if (!isAgentRole(userRole)) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Only agents can create commercial property listings'
        });
      }
    }

    await validateListingLocationIds({
      region_id: body.region_id,
      city_id: body.city_id,
      municipality_id: body.municipality_id,
      neighborhood_id: body.neighborhood_id
    });

    if (body.option_ids !== undefined) {
      await validateListingOptionIds(body.option_ids);
    }

    const updatedListing = await listingsDb.updateOwnedListing(listingId, userId, body as Record<string, unknown>);

    if (!updatedListing) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }

    if (body.option_ids !== undefined) {
      await replaceListingOptionSelections(listingId, body.option_ids);
    }

    if (body.general_fees !== undefined || body.other_general_fees !== undefined) {
      const existingFees = await getListingGeneralFees(listingId);
      const generalFees = body.general_fees ?? existingFees.general_fees.map((fee) => ({
        fee_id: fee.fee_id,
        amount: fee.amount
      }));
      const otherGeneralFees = body.other_general_fees ?? existingFees.other_general_fees;
      await validateGeneralFeeIds(generalFees);
      await replaceListingGeneralFees(listingId, generalFees, otherGeneralFees);
    }

    return res.json({
      success: true,
      listing: await addListingGeneralFees(await addListingOptions(updatedListing))
    });
  } catch (error: unknown) {
    if (error instanceof LocationValidationError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        message: error.message
      });
    }

    if (error instanceof ListingOptionValidationError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid listing options',
        message: error.message,
        option_ids: error.optionIds
      });
    }

    if (error instanceof GeneralFeeValidationError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid general fees',
        message: error.message,
        fee_ids: error.feeIds
      });
    }

    console.error('Update listing error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update listing',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getListingOptions: RequestHandler = async (_req, res) => {
  try {
    return res.json({ success: true, ...(await groupListingOptions()) });
  } catch (error: unknown) {
    console.error('Get listing options error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch listing options',
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

    return res.json({
      success: true,
      listing: await addListingGeneralFees(await addListingOptions(archivedListing))
    });
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

    const privateListings = await listingsDb.getPrivateListings(userId, itemsPerPage, safeOffset);
    const listingsWithDetails = await Promise.all(
      privateListings.map(async (listing) => addListingGeneralFees(await addListingOptions(listing)))
    );
    const listings = await attachPublicImageUrls(listingsWithDetails);

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
