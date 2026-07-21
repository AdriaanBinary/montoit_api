import { Request, RequestHandler } from 'express';
import queries from '../db/queries.js';

interface AutocompleteRequestQuery {
  q?: string;
  limit?: string;
}

export const getAutocompleteSuggestions: RequestHandler = async (req, res) => {
  try {
    const typedReq = req as Request<{}, {}, {}, AutocompleteRequestQuery>;
    const { q, limit } = typedReq.query;

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

    return res.json({
      success: true,
      query: q,
      results: suggestions,
      count: suggestions.length
    });
  } catch (error: unknown) {
    console.error('Autocomplete error:', error);
    return res.status(500).json({
      success: false,
      error: 'An error occurred while processing your request'
    });
  }
};
