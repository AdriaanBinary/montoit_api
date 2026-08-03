import express from 'express';
import { z } from 'zod';
import {
  confirmListingImageUpload,
  createListing,
  getListingById,
  getPublicListingById,
  getPrivateListings,
  publishListing,
  uploadListingImages
} from '../services/listingsService.js';
import { registerApiRoute } from '../docs/swagger.js';
import { getPublicListings } from '../services/publicListingsService.js';
import { checkAuth } from '../utils/authMiddleware.js';

const router = express.Router();

const listingResultSchema = z.record(z.string(), z.unknown());

const optionalBooleanQueryParam = z
  .preprocess((value) => {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }

    return value;
  }, z.boolean())
  .optional();

const optionalDateQueryParam = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date value')
  .optional();

const propertyTypeQueryParam = z
  .preprocess((value) => {
    const values = Array.isArray(value) ? value : [value];
    const normalized = values
      .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    return normalized.length > 0 ? normalized : undefined;
  }, z.array(z.string().min(1)).nonempty())
  .optional();

const publicListingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().min(1).optional(),
  propertyType: propertyTypeQueryParam,
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  bedrooms: z.union([z.coerce.number().int().positive(), z.string().regex(/^\d+\+$/)]).optional(),
  bathrooms: z.coerce.number().nonnegative().optional(),
  parkingSpaces: z.coerce.number().int().nonnegative().optional(),
  parkingType: z.string().trim().min(1).optional(),
  minLivingArea: z.coerce.number().nonnegative().optional(),
  maxLivingArea: z.coerce.number().nonnegative().optional(),
  minLandSize: z.coerce.number().nonnegative().optional(),
  maxLandSize: z.coerce.number().nonnegative().optional(),
  furnished: optionalBooleanQueryParam,
  availableFrom: optionalDateQueryParam,
  rentalTerm: z.string().trim().min(1).optional(),
  petFriendly: optionalBooleanQueryParam,
  garden: optionalBooleanQueryParam,
  pool: optionalBooleanQueryParam,
  flatlet: optionalBooleanQueryParam,
  retirement: optionalBooleanQueryParam,
  onShow: optionalBooleanQueryParam,
  securityEstate: optionalBooleanQueryParam,
  sortBy: z.enum(['price_asc', 'price_desc', 'date_desc', 'date_asc']).default('date_desc')
});

const privateListingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const listingIdParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});

const listingImageParamsSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  imageId: z.string().min(1)
});

const createListingBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  property_type: z.string().optional(),
  bedrooms: z.coerce.number().optional(),
  bathrooms: z.coerce.number().optional(),
  property_size: z.coerce.number().optional(),
  amount: z.coerce.number().optional(),
  currency: z.string().optional(),
  features: z.array(z.string()).optional(),
  other: z.array(z.string()).optional(),
  status: z.enum(['draft', 'active', 'archived', 'sold']).optional(),
  sold: z.boolean().optional(),
  region_id: z.coerce.number().int().positive().optional(),
  city_id: z.coerce.number().int().positive().optional(),
  municipality_id: z.coerce.number().int().positive().optional(),
  neighborhood_id: z.coerce.number().int().positive().optional(),
  is_published: z.boolean().optional(),
  verified: z.boolean().optional()
});

const uploadListingImagesBodySchema = z.object({
  images: z
    .array(
      z.object({
        fileName: z.string().optional(),
        name: z.string().optional(),
        contentType: z.string().optional()
      })
    )
    .default([]),
  name: z.string().optional()
});

const publicListingsResponseSchema = z.object({
  success: z.literal(true),
  pagination: z.object({
    currentpage: z.number().int().positive(),
    pages: z.number().int().positive(),
    itemsPerPage: z.number().int().positive()
  }),
  totalItems: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  listings: z.array(listingResultSchema)
});

const genericErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string()
});

const simpleErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string()
});

const listingResponseSchema = z.object({
  success: z.literal(true),
  listing: listingResultSchema
});

const listingCreateResponseSchema = z.object({
  success: z.literal(true),
  listing: listingResultSchema
});

const uploadListingImagesResponseSchema = z.object({
  success: z.literal(true),
  collection_id: z.unknown().nullable(),
  listing_id: z.number().int().positive(),
  images: z.array(listingResultSchema)
});

const confirmListingImageResponseSchema = z.object({
  success: z.literal(true),
  image: listingResultSchema
});

registerApiRoute({
  method: 'get',
  path: '/api/listings/public',
  summary: 'Get public listings',
  description: 'Returns paginated public listings with filtering, sorting, and text search.',
  tags: ['Listings'],
  request: {
    query: publicListingsQuerySchema
  },
  responses: {
    200: { description: 'Public listings returned', schema: publicListingsResponseSchema },
    400: { description: 'Invalid query parameters', schema: genericErrorResponseSchema },
    500: { description: 'Failed to fetch active listings', schema: genericErrorResponseSchema }
  }
});

registerApiRoute({
  method: 'get',
  path: '/api/listings/public/{id}',
  summary: 'Get a public listing by ID',
  tags: ['Listings'],
  request: {
    params: listingIdParamsSchema
  },
  responses: {
    200: { description: 'Listing found', schema: listingResponseSchema },
    400: { description: 'Invalid listing id', schema: simpleErrorResponseSchema },
    404: { description: 'Listing not found', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to fetch listing', schema: genericErrorResponseSchema }
  }
});

registerApiRoute({
  method: 'get',
  path: '/api/listings/private',
  summary: 'Get private listings for authenticated user',
  tags: ['Listings'],
  security: [{ bearerAuth: [] }],
  request: {
    query: privateListingsQuerySchema
  },
  responses: {
    200: { description: 'Private listings returned', schema: publicListingsResponseSchema },
    401: { description: 'Unauthorized', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to fetch private listings', schema: genericErrorResponseSchema }
  }
});

registerApiRoute({
  method: 'post',
  path: '/api/listings',
  summary: 'Create a listing',
  tags: ['Listings'],
  security: [{ bearerAuth: [] }],
  request: {
    body: createListingBodySchema
  },
  responses: {
    201: { description: 'Listing created', schema: listingCreateResponseSchema },
    401: { description: 'Unauthorized', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to create listing', schema: genericErrorResponseSchema }
  }
});

registerApiRoute({
  method: 'post',
  path: '/api/listings/{id}/publish',
  summary: 'Publish a listing',
  tags: ['Listings'],
  security: [{ bearerAuth: [] }],
  request: {
    params: listingIdParamsSchema
  },
  responses: {
    200: { description: 'Listing published', schema: listingResponseSchema },
    400: { description: 'Invalid listing id', schema: simpleErrorResponseSchema },
    401: { description: 'Unauthorized', schema: simpleErrorResponseSchema },
    404: { description: 'Listing not found', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to publish listing', schema: genericErrorResponseSchema }
  }
});

registerApiRoute({
  method: 'post',
  path: '/api/listings/{id}/images',
  summary: 'Upload listing images',
  tags: ['Listings'],
  security: [{ bearerAuth: [] }],
  request: {
    params: listingIdParamsSchema,
    body: uploadListingImagesBodySchema
  },
  responses: {
    201: { description: 'Images upload session created', schema: uploadListingImagesResponseSchema },
    400: { description: 'Invalid listing id', schema: simpleErrorResponseSchema },
    401: { description: 'Unauthorized', schema: simpleErrorResponseSchema },
    404: { description: 'Listing not found', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to upload listing images', schema: genericErrorResponseSchema }
  }
});

registerApiRoute({
  method: 'post',
  path: '/api/listings/{listingId}/images/{imageId}/confirm',
  summary: 'Confirm listing image upload',
  description:
    'Validates that the image exists in storage and marks the image as confirmed for display.',
  tags: ['Listings'],
  security: [{ bearerAuth: [] }],
  request: {
    params: listingImageParamsSchema
  },
  responses: {
    200: { description: 'Image confirmed successfully', schema: confirmListingImageResponseSchema },
    400: { description: 'Invalid listing or image id', schema: simpleErrorResponseSchema },
    401: { description: 'Unauthorized', schema: simpleErrorResponseSchema },
    404: { description: 'Image or listing not found', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to confirm image upload', schema: genericErrorResponseSchema }
  }
});

registerApiRoute({
  method: 'get',
  path: '/api/listings/{id}',
  summary: 'Get a private listing by ID',
  tags: ['Listings'],
  security: [{ bearerAuth: [] }],
  request: {
    params: listingIdParamsSchema
  },
  responses: {
    200: { description: 'Listing found', schema: listingResponseSchema },
    400: { description: 'Invalid listing id', schema: simpleErrorResponseSchema },
    401: { description: 'Unauthorized', schema: simpleErrorResponseSchema },
    404: { description: 'Listing not found', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to fetch listing', schema: genericErrorResponseSchema }
  }
});

router.get('/listings/public', (req, res, next) => {
  const parsedQuery = publicListingsQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid query parameters',
      message: parsedQuery.error.issues.map((issue) => issue.message).join(', ')
    });
  }

  return getPublicListings(req, res, next);
});
router.get('/listings/public/:id', (req, res, next) => {
  const parsedParams = listingIdParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  return getPublicListingById(req, res, next);
});
router.get('/listings/private', checkAuth, (req, res, next) => {
  const parsedQuery = privateListingsQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid query parameters',
      message: parsedQuery.error.issues.map((issue) => issue.message).join(', ')
    });
  }

  req.query = {
    page: String(parsedQuery.data.page),
    limit: String(parsedQuery.data.limit)
  };

  return getPrivateListings(req, res, next);
});
router.post('/listings', checkAuth, (req, res, next) => {
  const parsedBody = createListingBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      message: parsedBody.error.issues.map((issue) => issue.message).join(', ')
    });
  }

  req.body = parsedBody.data;
  return createListing(req, res, next);
});
router.post('/listings/:id/publish', checkAuth, (req, res, next) => {
  const parsedParams = listingIdParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  return publishListing(req, res, next);
});
router.post('/listings/:id/images', checkAuth, (req, res, next) => {
  const parsedParams = listingIdParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  const parsedBody = uploadListingImagesBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      message: parsedBody.error.issues.map((issue) => issue.message).join(', ')
    });
  }

  req.body = parsedBody.data;
  return uploadListingImages(req, res, next);
});
router.post('/listings/:listingId/images/:imageId/confirm', checkAuth, (req, res, next) => {
  const parsedParams = listingImageParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: 'Invalid listing or image id' });
  }

  return confirmListingImageUpload(req, res, next);
});
router.get('/listings/:id', checkAuth, (req, res, next) => {
  const parsedParams = listingIdParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  return getListingById(req, res, next);
});

export default router;
