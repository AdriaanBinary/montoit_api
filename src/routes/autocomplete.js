import express, { Request, Response } from 'express';
import queries from '../db/queries.js';

interface AutocompleteRequestQuery {
  q?: string;
  limit?: string;
}

const router = express.Router();

/**
 * GET /autocomplete
 *
 * Query Parameters:
 *   - q (string, required): Search query (minimum 2 characters)
 *   - limit (number, optional): Maximum number of results (default: 8)
 *
 * Response:
 *   - Array of suggestion objects with { name, type, id }
 */
router.get('/autocomplete', async (req: Request<{}, {}, {}, AutocompleteRequestQuery>, res: Response) => {
    try {
        const { q, limit } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search parameter "q" is required and must be at least 2 characters'
            });
        }

        const parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : 8;
        const resultLimit = Number.isNaN(parsedLimit) ? 8 : Math.min(parsedLimit, 50);

        const suggestions = await queries.getTopSuggestions(q, resultLimit);

        console.log('Autocomplete query:', q);
        console.log('Autocomplete results:', JSON.stringify(suggestions));

        res.json({
            success: true,
            query: q,
            results: suggestions,
            count: suggestions.length
        });
    } catch (error: unknown) {
        console.error('Autocomplete error:', error);
        res.status(500).json({
            success: false,
            error: 'An error occurred while processing your request'
        });
    }
});

export default router;
