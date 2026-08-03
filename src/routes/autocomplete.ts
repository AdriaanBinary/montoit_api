import express from 'express';
import { z } from 'zod';
import { registerApiRoute } from '../docs/swagger.js';
import { getAutocompleteSuggestions } from '../services/autocompleteService.js';

const router = express.Router();

const autocompleteQuerySchema = z.object({
	q: z.string().min(2),
	limit: z.coerce.number().int().positive().max(50).optional()
});

const autocompleteResultSchema = z.record(z.string(), z.unknown());

const autocompleteSuccessResponseSchema = z.object({
	success: z.literal(true),
	query: z.string(),
	results: z.array(autocompleteResultSchema),
	count: z.number().int().nonnegative()
});

const autocompleteErrorResponseSchema = z.object({
	success: z.literal(false),
	error: z.string(),
	message: z.string().optional()
});

registerApiRoute({
	method: 'get',
	path: '/api/autocomplete',
	summary: 'Get autocomplete suggestions',
	tags: ['Autocomplete'],
	request: {
		query: autocompleteQuerySchema
	},
	responses: {
		200: { description: 'Autocomplete results returned', schema: autocompleteSuccessResponseSchema },
		400: { description: 'Invalid query parameters', schema: autocompleteErrorResponseSchema },
		500: { description: 'Internal server error', schema: autocompleteErrorResponseSchema }
	}
});

router.get('/autocomplete', (req, res, next) => {
	const parsedQuery = autocompleteQuerySchema.safeParse(req.query);

	if (!parsedQuery.success) {
		return res.status(400).json({
			success: false,
			error: 'Search parameter "q" is required and must be at least 2 characters',
			message: parsedQuery.error.issues.map((issue) => issue.message).join(', ')
		});
	}

	req.query = {
		q: parsedQuery.data.q,
		limit: String(parsedQuery.data.limit ?? 8)
	};

	return getAutocompleteSuggestions(req, res, next);
});

export default router;
