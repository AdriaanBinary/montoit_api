import { RequestHandler } from 'express';
import { getLocationGeometries, getLocationHierarchyTree, getLocationGeometry, LocationGeometryType } from '../db/locations.js';

export const getLocationTree: RequestHandler = async (_req, res) => {
  try {
    const regions = await getLocationHierarchyTree();

    return res.json({
      success: true,
      regions
    });
  } catch (error: unknown) {
    console.error('Get location tree error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch location tree',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

const VALID_GEOMETRY_TYPES: LocationGeometryType[] = ['region', 'city', 'municipality'];

export const getLocationGeometryHandler: RequestHandler = async (req, res) => {
  try {
    const type = String(req.query.type);
    const hasId = req.query.id !== undefined;
    const id = Number(req.query.id);

    if (!VALID_GEOMETRY_TYPES.includes(type as LocationGeometryType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be one of: region, city, municipality'
      });
    }

    if (hasId && (!Number.isInteger(id) || id <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid id. Must be a positive integer'
      });
    }

    if (!hasId) {
      const geometries = await getLocationGeometries(type as LocationGeometryType);
      return res.json({ success: true, type, geometries });
    }

    const geometry = await getLocationGeometry(type as LocationGeometryType, id);

    if (geometry === null) {
      return res.status(404).json({
        success: false,
        error: 'Geometry not found'
      });
    }

    return res.json({
      success: true,
      type,
      id,
      geometry
    });
  } catch (error: unknown) {
    console.error('Get location geometry error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch location geometry',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

