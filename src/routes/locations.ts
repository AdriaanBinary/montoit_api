import express from 'express';
import { z } from 'zod';
import { registerApiRoute } from '../docs/swagger.js';
import { getLocationTree } from '../services/locationsService.js';

const router = express.Router();

const locationNeighborhoodSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  aliases: z.array(z.string())
});

const locationMunicipalitySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  neighborhoods: z.array(locationNeighborhoodSchema)
});

const locationCitySchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  municipalities: z.array(locationMunicipalitySchema)
});

const locationRegionSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  cities: z.array(locationCitySchema)
});

const locationTreeSuccessResponseSchema = z.object({
  success: z.literal(true),
  regions: z.array(locationRegionSchema)
});

const locationTreeErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string().optional()
});

registerApiRoute({
  method: 'get',
  path: '/api/locations/tree',
  summary: 'Get full location tree for listing forms',
  description:
    'Returns nested regions, cities, municipalities, and neighborhoods so frontend can implement cascading selectors.',
  tags: ['Locations'],
  responses: {
    200: { description: 'Location tree returned', schema: locationTreeSuccessResponseSchema },
    500: { description: 'Failed to fetch location tree', schema: locationTreeErrorResponseSchema }
  }
});

router.get('/locations/tree', getLocationTree);

export default router;
