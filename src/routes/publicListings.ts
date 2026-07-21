import express, { Request, Response } from 'express';
import MontoitDB from '../db/pool.js';

const router = express.Router();

router.get('/listings/active', async (_req: Request, res: Response) => {
  const rawPage = Number(_req.query.page);
  const rawLimit = Number(_req.query.limit);
  const currentPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const itemsPerPage = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

  try {
    const countResult = await MontoitDB.query(
      `SELECT COUNT(*)::int AS total
       FROM listings
       WHERE status = 'active' AND deleted_at IS NULL`
    );

    const totalItems = countResult.rows[0]?.total ?? 0;
    const pages = totalItems === 0 ? 1 : Math.ceil(totalItems / itemsPerPage);
    const safePage = Math.min(currentPage, pages);
    const safeOffset = (safePage - 1) * itemsPerPage;

    const result = await MontoitDB.query(
      `SELECT *
       FROM listings
       WHERE status = 'active' AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [itemsPerPage, safeOffset]
    );

    return res.json({
      success: true,
      pagination: {
        currentpage: safePage,
        pages,
        itemsPerPage
      },
      totalItems,
      count: result.rows.length,
      listings: result.rows
    });
  } catch (error: unknown) {
    console.error('Get active listings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch active listings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;