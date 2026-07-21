import { Request, RequestHandler } from 'express';
import listingsDb from '../db/listings.js';

interface PublicListingsRequestQuery {
  page?: string;
  limit?: string;
}

export const getPublicListings: RequestHandler = async (req, res) => {
  const typedReq = req as Request<{}, {}, {}, PublicListingsRequestQuery>;
  const rawPage = Number(typedReq.query.page);
  const rawLimit = Number(typedReq.query.limit);
  const currentPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const itemsPerPage = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

  try {
    const totalItems = await listingsDb.countPublicListings();
    const pages = totalItems === 0 ? 1 : Math.ceil(totalItems / itemsPerPage);
    const safePage = Math.min(currentPage, pages);
    const safeOffset = (safePage - 1) * itemsPerPage;

    const listings = await listingsDb.getPublicListings(itemsPerPage, safeOffset);

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
    console.error('Get active listings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch active listings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
