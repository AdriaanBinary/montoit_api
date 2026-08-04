import express from 'express';
import { z } from 'zod';
import { registerApiRoute } from '../docs/swagger.js';
import {
  addFavoriteListing,
  getFavoriteListings,
  removeFavoriteListing
} from '../services/usersService.js';
import { checkAuth } from '../utils/authMiddleware.js';

const router = express.Router();

const favoriteListingBodySchema = z.object({
  listing_id: z.coerce.number().int().positive()
});

const favoriteListingParamsSchema = z.object({
  listingId: z.coerce.number().int().positive()
});

const favoritesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const listingResultSchema = z.record(z.string(), z.unknown());

const favoritesResponseSchema = z.object({
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

const favoriteSuccessResponseSchema = z.object({
  success: z.literal(true),
  listing: listingResultSchema
});

const favoriteDeleteResponseSchema = z.object({
  success: z.literal(true),
  message: z.string()
});

const favoriteErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string().optional()
});

registerApiRoute({
  method: 'post',
  path: '/api/users/favorites',
  summary: 'Save a public listing',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  request: {
    body: favoriteListingBodySchema
  },
  responses: {
    201: { description: 'Favorite created', schema: favoriteSuccessResponseSchema },
    400: { description: 'Invalid request', schema: favoriteErrorResponseSchema },
    401: { description: 'Unauthorized', schema: favoriteErrorResponseSchema },
    404: { description: 'Listing not found', schema: favoriteErrorResponseSchema },
    500: { description: 'Failed to add favorite listing', schema: favoriteErrorResponseSchema }
  }
});

registerApiRoute({
  method: 'delete',
  path: '/api/users/favorites/{listingId}',
  summary: 'Remove a saved listing',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  request: {
    params: favoriteListingParamsSchema
  },
  responses: {
    200: { description: 'Favorite removed', schema: favoriteDeleteResponseSchema },
    400: { description: 'Invalid request', schema: favoriteErrorResponseSchema },
    401: { description: 'Unauthorized', schema: favoriteErrorResponseSchema },
    500: { description: 'Failed to remove favorite listing', schema: favoriteErrorResponseSchema }
  }
});

registerApiRoute({
  method: 'get',
  path: '/api/users/favorites',
  summary: 'List saved listings for the authenticated user',
  tags: ['Users'],
  security: [{ bearerAuth: [] }],
  request: {
    query: favoritesQuerySchema
  },
  responses: {
    200: { description: 'Saved listings returned', schema: favoritesResponseSchema },
    401: { description: 'Unauthorized', schema: favoriteErrorResponseSchema },
    500: { description: 'Failed to fetch favorite listings', schema: favoriteErrorResponseSchema }
  }
});

router.post('/users/favorites', checkAuth, (req, res, next) => {
  const parsedBody = favoriteListingBodySchema.safeParse(req.body);

  if (!parsedBody.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request body',
      message: parsedBody.error.issues.map((issue) => issue.message).join(', ')
    });
  }

  req.body = parsedBody.data;
  return addFavoriteListing(req, res, next);
});

router.delete('/users/favorites/:listingId', checkAuth, (req, res, next) => {
  const parsedParams = favoriteListingParamsSchema.safeParse(req.params);

  if (!parsedParams.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid listing id'
    });
  }

  return removeFavoriteListing(req, res, next);
});

router.get('/users/favorites', checkAuth, (req, res, next) => {
  const parsedQuery = favoritesQuerySchema.safeParse(req.query);

  if (!parsedQuery.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request query',
      message: parsedQuery.error.issues.map((issue) => issue.message).join(', ')
    });
  }

  req.query = {
    page: String(parsedQuery.data.page),
    limit: String(parsedQuery.data.limit)
  };

  return getFavoriteListings(req, res, next);
});

export default router;