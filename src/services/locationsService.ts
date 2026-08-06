import { RequestHandler } from 'express';
import { getLocationHierarchyTree } from '../db/locations.js';

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
