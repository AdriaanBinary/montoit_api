import express from 'express';
import { z } from 'zod';
import {
  createListingEnquiry,
  confirmListingImageUpload,
  createListing,
  deleteListing,
  getListingById,
  getPublicListingById,
  getListingOptions,
  getPrivateListings,
  publishListing,
  reorderListingImages,
  unpublishListing,
  updateListing,
  uploadListingImages
} from '../services/listingsService.js';
import { registerApiRoute } from '../docs/swagger.js';
import { getPublicListings } from '../services/publicListingsService.js';
import { checkAuth } from '../utils/authMiddleware.js';

const router = express.Router();

const listingCreatorSchema = z.object({
  id: z.string(),
  username: z.string(),
  role: z.enum(['PRIVATE', 'AGENT']),
  email: z.string().email(),
  phone: z.string().nullable()
});

const listingOptionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  type: z.enum(['AMENITY', 'SECURITY_OPTION'])
});

const listingGeneralFeeSchema = z.object({
  fee_id: z.number().int().positive(),
  name: z.string(),
  amount: z.number().nonnegative()
});

const listingOtherGeneralFeeResultSchema = z.object({
  description: z.string(),
  amount: z.number().nonnegative()
});

const listingImageResultSchema = z.object({
  id: z.string(),
  bucket: z.string(),
  object_key: z.string(),
  upload_confirmed: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  file_name: z.string().optional(),
  upload_url: z.string().optional(),
  view_url: z.string().optional(),
  url: z.string().optional()
});

const listingLocationDetailsSchema = z.object({
  region: z.object({ id: z.number().int().positive(), name: z.string() }).nullable(),
  city: z.object({ id: z.number().int().positive(), name: z.string() }).nullable(),
  municipality: z.object({ id: z.number().int().positive(), name: z.string() }).nullable(),
  neighborhood: z
    .object({ id: z.number().int().positive(), name: z.string(), aliases: z.array(z.string()) })
    .nullable()
});

export const listingResultSchema = z
  .object({
    id: z.number().int().positive(),
    user_id: z.string(),
    creator: listingCreatorSchema,
    title: z.string().nullable(),
    description: z.string().nullable(),
    location: z.string().nullable(),
    location_details: listingLocationDetailsSchema,
    property_type: z.enum(['House', 'Apartment / Flat', 'Villa', 'Commercial', 'Industrial', 'Vacant Land']).nullable(),
    listing_type: z.enum(['SALE', 'RENT']),
    bedrooms: z.number().int().nullable(),
    bathrooms: z.number().nullable(),
    property_size: z.number().nullable(),
    living_area: z.number().nullable(),
    land_size: z.number().nullable(),
    amount: z.number().nullable(),
    furnished: z.boolean().nullable(),
    available_from: z.string().nullable(),
    rental_term: z.string().nullable(),
    parking_spaces: z.number().int().nullable(),
    parking_type: z.string().nullable(),
    pet_friendly: z.boolean().nullable(),
    garden: z.boolean().nullable(),
    pool: z.boolean().nullable(),
    flatlet: z.boolean().nullable(),
    retirement: z.boolean().nullable(),
    on_show: z.boolean().nullable(),
    security_estate: z.boolean().nullable(),
    currency: z.string(),
    features: z.array(z.string()),
    other: z.array(z.string()),
    status: z.enum(['draft', 'active', 'archived', 'sold']),
    sold: z.boolean().nullable(),
    region_id: z.number().int().nullable(),
    city_id: z.number().int().nullable(),
    municipality_id: z.number().int().nullable(),
    neighborhood_id: z.number().int().nullable(),
    listing_owner_type: z.enum(['PRIVATE', 'AGENT']).nullable(),
    agency_id: z.number().int().nullable(),
    is_published: z.boolean(),
    rights_confirmed: z.boolean(),
    rights_confirmed_at: z.string().nullable(),
    verified: z.boolean(),
    deleted_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    option_ids: z.array(z.number().int().positive()),
    options: z.array(listingOptionSchema),
    general_fees: z.array(listingGeneralFeeSchema),
    other_general_fees: z.array(listingOtherGeneralFeeResultSchema),
    images: z.array(listingImageResultSchema).optional()
  })
  .passthrough();

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
  }, z.array(z.enum(['House', 'Apartment / Flat', 'Villa', 'Commercial', 'Industrial', 'Vacant Land'])).nonempty())
  .optional();

const multiValuePositiveIntQueryParam = z
  .preprocess((value) => {
    if (value === undefined) {
      return undefined;
    }

    return Array.isArray(value) ? value : [value];
  }, z.array(z.coerce.number().int().positive()).nonempty())
  .optional();

export const publicListingsQuerySchema = z.object({
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
  optionIds: multiValuePositiveIntQueryParam,
  optionMatch: z.enum(['any', 'all']).default('any'),
  region_id: multiValuePositiveIntQueryParam,
  city_id: multiValuePositiveIntQueryParam,
  municipality_id: multiValuePositiveIntQueryParam,
  neighborhood_id: multiValuePositiveIntQueryParam,
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

const reorderListingImagesBodySchema = z.object({
  image_ids: z.array(z.string().min(1)).min(1)
});

const reorderListingImagesResponseSchema = z.object({
  success: z.literal(true),
  images: z.array(listingImageResultSchema)
});

const publishListingBodySchema = z.object({
  rights_confirmed: z
    .boolean()
    .refine((value) => value === true, {
      message: 'You must confirm you have the rights and permission to publish this listing.'
    })
});

const listingEnquiryBodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  phone: z.string().trim().min(1).optional(),
  message: z.string().trim().min(1)
});

const generalFeeSelectionSchema = z.object({
  fee_id: z.coerce.number().int().positive(),
  amount: z.coerce.number().finite().nonnegative()
});

const otherGeneralFeeSchema = z.object({
  description: z.string().trim().min(1).max(255),
  amount: z.coerce.number().finite().nonnegative()
});

const listingUpdateBodySchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    property_type: z.enum(['House', 'Apartment / Flat', 'Villa', 'Commercial', 'Industrial', 'Vacant Land']).optional(),
    listing_type: z.enum(['sale', 'rent']).optional(),
    bedrooms: z.coerce.number().optional(),
    bathrooms: z.coerce.number().optional(),
    property_size: z.coerce.number().optional(),
    living_area: z.coerce.number().optional(),
    land_size: z.coerce.number().optional(),
    amount: z.coerce.number().optional(),
    furnished: z.boolean().optional(),
    available_from: z.coerce.date().optional(),
    rental_term: z.string().optional(),
    parking_spaces: z.coerce.number().optional(),
    parking_type: z.string().optional(),
    pet_friendly: z.boolean().optional(),
    garden: z.boolean().optional(),
    pool: z.boolean().optional(),
    flatlet: z.boolean().optional(),
    retirement: z.boolean().optional(),
    on_show: z.boolean().optional(),
    security_estate: z.boolean().optional(),
    currency: z.literal('XAF').optional(),
    features: z.array(z.string()).optional(),
    other: z.array(z.string()).optional(),
    option_ids: z.array(z.coerce.number().int().positive()).optional(),
    general_fees: z.array(generalFeeSelectionSchema).optional(),
    other_general_fees: z.array(otherGeneralFeeSchema).optional(),
    status: z.enum(['draft', 'active', 'archived', 'sold']).optional(),
    sold: z.boolean().optional(),
    region_id: z.coerce.number().int().positive().optional(),
    city_id: z.coerce.number().int().positive().optional(),
    municipality_id: z.coerce.number().int().positive().optional(),
    neighborhood_id: z.coerce.number().int().positive().optional(),
    verified: z.boolean().optional()
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'At least one field must be provided'
  });

const createListingBodySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  property_type: z.enum(['House', 'Apartment / Flat', 'Villa', 'Commercial', 'Industrial', 'Vacant Land']).optional(),
  listing_type: z.enum(['sale', 'rent']).optional(),
  bedrooms: z.coerce.number().optional(),
  bathrooms: z.coerce.number().optional(),
  property_size: z.coerce.number().optional(),
  amount: z.coerce.number().optional(),
  currency: z.literal('XAF').optional(),
  features: z.array(z.string()).optional(),
  other: z.array(z.string()).optional(),
  option_ids: z.array(z.coerce.number().int().positive()).optional(),
  general_fees: z.array(generalFeeSelectionSchema).optional(),
  other_general_fees: z.array(otherGeneralFeeSchema).optional(),
  status: z.enum(['draft', 'active', 'archived', 'sold']).optional(),
  sold: z.boolean().optional(),
  region_id: z.coerce.number().int().positive().optional(),
  city_id: z.coerce.number().int().positive().optional(),
  municipality_id: z.coerce.number().int().positive().optional(),
  neighborhood_id: z.coerce.number().int().positive().optional(),
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

const listingOptionsResponseSchema = z.object({
  success: z.literal(true),
  amenities: z.array(listingOptionSchema),
  security_options: z.array(listingOptionSchema),
  general_fees: z.array(z.object({ id: z.number().int().positive(), name: z.string() }))
});

const listingEnquiryResponseSchema = z.object({
  success: z.literal(true),
  enquiry: z.record(z.string(), z.unknown())
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
  path: '/api/listings/options',
  summary: 'Get available listing amenities and security options',
  tags: ['Listings'],
  responses: {
    200: { description: 'Available listing options returned', schema: listingOptionsResponseSchema },
    500: { description: 'Failed to fetch listing options', schema: genericErrorResponseSchema }
  }
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
  method: 'post',
  path: '/api/listings/public/{id}/enquire',
  summary: 'Submit an enquiry for a public listing',
  tags: ['Listings'],
  request: {
    params: listingIdParamsSchema,
    body: listingEnquiryBodySchema
  },
  responses: {
    201: { description: 'Enquiry created', schema: listingEnquiryResponseSchema },
    400: { description: 'Invalid request', schema: simpleErrorResponseSchema },
    401: { description: 'Unauthorized', schema: simpleErrorResponseSchema },
    404: { description: 'Listing not found', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to create listing enquiry', schema: genericErrorResponseSchema }
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
    403: { description: 'Only agents can create commercial property listings', schema: genericErrorResponseSchema },
    500: { description: 'Failed to create listing', schema: genericErrorResponseSchema }
  }
});

registerApiRoute({
  method: 'post',
  path: '/api/listings/{id}/publish',
  summary: 'Publish a listing',
  description: 'Requires the listing owner to confirm they have the rights and permission to publish the listing.',
  tags: ['Listings'],
  security: [{ bearerAuth: [] }],
  request: {
    params: listingIdParamsSchema,
    body: publishListingBodySchema
  },
  responses: {
    200: { description: 'Listing published', schema: listingResponseSchema },
    400: { description: 'Invalid listing id or missing rights confirmation', schema: simpleErrorResponseSchema },
    401: { description: 'Unauthorized', schema: simpleErrorResponseSchema },
    404: { description: 'Listing not found', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to publish listing', schema: genericErrorResponseSchema }
  }
});

registerApiRoute({
  method: 'post',
  path: '/api/listings/{id}/unpublish',
  summary: 'Unpublish a listing',
  description: 'Clears the recorded rights confirmation; the owner must reconfirm to publish again.',
  tags: ['Listings'],
  security: [{ bearerAuth: [] }],
  request: {
    params: listingIdParamsSchema
  },
  responses: {
    200: { description: 'Listing unpublished', schema: listingResponseSchema },
    400: { description: 'Invalid listing id', schema: simpleErrorResponseSchema },
    401: { description: 'Unauthorized', schema: simpleErrorResponseSchema },
    404: { description: 'Listing not found', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to unpublish listing', schema: genericErrorResponseSchema }
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
  method: 'patch',
  path: '/api/listings/{id}/images/reorder',
  summary: 'Reorder listing images',
  description: 'Sets the display order of a listing\'s images based on the order of image ids provided.',
  tags: ['Listings'],
  security: [{ bearerAuth: [] }],
  request: {
    params: listingIdParamsSchema,
    body: reorderListingImagesBodySchema
  },
  responses: {
    200: { description: 'Images reordered successfully', schema: reorderListingImagesResponseSchema },
    400: { description: 'Invalid listing id or request body', schema: simpleErrorResponseSchema },
    401: { description: 'Unauthorized', schema: simpleErrorResponseSchema },
    404: { description: 'Listing not found', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to reorder listing images', schema: genericErrorResponseSchema }
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

registerApiRoute({
  method: 'put',
  path: '/api/listings/{id}',
  summary: 'Update an owned listing',
  tags: ['Listings'],
  security: [{ bearerAuth: [] }],
  request: {
    params: listingIdParamsSchema,
    body: listingUpdateBodySchema
  },
  responses: {
    200: { description: 'Listing updated', schema: listingResponseSchema },
    400: { description: 'Invalid request', schema: simpleErrorResponseSchema },
    401: { description: 'Unauthorized', schema: simpleErrorResponseSchema },
    403: { description: 'Forbidden', schema: genericErrorResponseSchema },
    404: { description: 'Listing not found', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to update listing', schema: genericErrorResponseSchema }
  }
});

registerApiRoute({
  method: 'delete',
  path: '/api/listings/{id}',
  summary: 'Archive an owned listing',
  tags: ['Listings'],
  security: [{ bearerAuth: [] }],
  request: {
    params: listingIdParamsSchema
  },
  responses: {
    200: { description: 'Listing archived', schema: listingResponseSchema },
    400: { description: 'Invalid listing id', schema: simpleErrorResponseSchema },
    401: { description: 'Unauthorized', schema: simpleErrorResponseSchema },
    403: { description: 'Forbidden', schema: genericErrorResponseSchema },
    404: { description: 'Listing not found', schema: simpleErrorResponseSchema },
    500: { description: 'Failed to archive listing', schema: genericErrorResponseSchema }
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
router.get('/listings/options', (req, res, next) => getListingOptions(req, res, next));
router.get('/listings/public/:id', (req, res, next) => {
  const parsedParams = listingIdParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  return getPublicListingById(req, res, next);
});
router.post('/listings/public/:id/enquire', (req, res, next) => {
  const parsedParams = listingIdParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  const parsedBody = listingEnquiryBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      message: parsedBody.error.issues.map((issue) => issue.message).join(', ')
    });
  }

  req.body = parsedBody.data;
  return createListingEnquiry(req, res, next);
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

  const parsedBody = publishListingBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      error: 'Rights confirmation required',
      message: parsedBody.error.issues.map((issue) => issue.message).join(', ')
    });
  }

  req.body = parsedBody.data;
  return publishListing(req, res, next);
});
router.post('/listings/:id/unpublish', checkAuth, (req, res, next) => {
  const parsedParams = listingIdParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  return unpublishListing(req, res, next);
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
router.patch('/listings/:id/images/reorder', checkAuth, (req, res, next) => {
  const parsedParams = listingIdParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  const parsedBody = reorderListingImagesBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      message: parsedBody.error.issues.map((issue) => issue.message).join(', ')
    });
  }

  req.body = parsedBody.data;
  return reorderListingImages(req, res, next);
});
router.get('/listings/:id', checkAuth, (req, res, next) => {
  const parsedParams = listingIdParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  return getListingById(req, res, next);
});
router.put('/listings/:id', checkAuth, (req, res, next) => {
  const parsedParams = listingIdParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  const parsedBody = listingUpdateBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      message: parsedBody.error.issues.map((issue) => issue.message).join(', ')
    });
  }

  req.body = parsedBody.data;
  return updateListing(req, res, next);
});
router.delete('/listings/:id', checkAuth, (req, res, next) => {
  const parsedParams = listingIdParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({ success: false, error: 'Invalid listing id' });
  }

  return deleteListing(req, res, next);
});

export default router;
