import express from 'express';
import queries from '../db/queries.js';

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
 * 
 * Example:
 *   GET /autocomplete?q=Buea
 *   GET /autocomplete?q=Yaounde&limit=10
 */
router.get('/autocomplete', async (req, res) => {
    try {
        const { q, limit } = req.query;

        // Validate required parameter
        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Search parameter "q" is required'
            });
        }

        // Validate minimum query length
        if (q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Search query must be at least 2 characters'
            });
        }

        const resultLimit = limit ? Math.min(parseInt(limit, 10) || 8, 50) : 8;

        const suggestions = await queries.getTopSuggestions(q, resultLimit);

        console.log('Autocomplete query:', q);
        console.log('Autocomplete results:', JSON.stringify(suggestions));

        res.json({
            success: true,
            query: q,
            results: suggestions,
            count: suggestions.length
        });
    } catch (error) {
        console.error('Autocomplete error:', error);
        res.status(500).json({
            success: false,
            error: 'An error occurred while processing your request'
        });
    }
});

export default router;
