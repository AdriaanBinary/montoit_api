import express from 'express';
import { z } from 'zod';
import { registerApiRoute } from '../docs/swagger.js';
import { getLocationTree, getLocationGeometryHandler } from '../services/locationsService.js';

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

const locationGeometrySuccessResponseSchema = z.object({
  success: z.literal(true),
  type: z.enum(['region', 'city', 'municipality']),
  id: z.number().int().positive(),
  geometry: z.unknown()
});

const locationGeometryErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string().optional()
});

registerApiRoute({
  method: 'get',
  path: '/api/locations/geometry',
  summary: 'Get boundary geometry for a single region, city, or municipality',
  description:
    'Returns the GeoJSON geometry for one location, for on-demand map rendering. Not embedded in /locations/tree to keep that payload lean.',
  tags: ['Locations'],
  request: {
    query: z.object({
      type: z.enum(['region', 'city', 'municipality']),
      id: z.coerce.number().int().positive()
    })
  },
  responses: {
    200: { description: 'Geometry returned', schema: locationGeometrySuccessResponseSchema },
    400: { description: 'Invalid type or id', schema: locationGeometryErrorResponseSchema },
    404: { description: 'Geometry not found', schema: locationGeometryErrorResponseSchema },
    500: { description: 'Failed to fetch geometry', schema: locationGeometryErrorResponseSchema }
  }
});

router.get('/locations/geometry', getLocationGeometryHandler);

export default router;
