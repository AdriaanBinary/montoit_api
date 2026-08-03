import express from 'express';
import { z } from 'zod';
import { registerApiRoute } from '../docs/swagger.js';
import { createAgency, convertUserToAgent } from '../services/agenciesService.js';
import { checkAuth } from '../utils/authMiddleware.js';

const router = express.Router();

const createAgencyBodySchema = z.object({
	name: z.string().min(2),
	slug: z.string().min(1).optional(),
	description: z.string().optional(),
	email: z.string().email().optional(),
	phone: z.string().optional(),
	website: z.string().optional(),
	address_line1: z.string().optional(),
	address_line2: z.string().optional(),
	region_id: z.coerce.number().int().positive().optional(),
	city_id: z.coerce.number().int().positive().optional(),
	municipality_id: z.coerce.number().int().positive().optional(),
	neighborhood_id: z.coerce.number().int().positive().optional()
});

const convertUserToAgentBodySchema = z.object({
	user_id: z.string().min(1),
	agency_ids: z.array(z.coerce.number().int().positive()).min(1),
	primary_agency_id: z.coerce.number().int().positive().optional()
});

const agencyRecordSchema = z.record(z.string(), z.unknown());

const agencySuccessResponseSchema = z.object({
	success: z.literal(true),
	agency: agencyRecordSchema
});

const conversionSuccessResponseSchema = z.object({
	success: z.literal(true),
	message: z.string(),
	conversion: agencyRecordSchema
});

const agencyErrorResponseSchema = z.object({
	success: z.literal(false),
	error: z.string(),
	message: z.string().optional()
});

registerApiRoute({
	method: 'post',
	path: '/api/agencies',
	summary: 'Create an agency',
	tags: ['Agencies'],
	security: [{ bearerAuth: [] }],
	request: {
		body: createAgencyBodySchema
	},
	responses: {
		201: { description: 'Agency created', schema: agencySuccessResponseSchema },
		400: { description: 'Invalid request', schema: agencyErrorResponseSchema },
		401: { description: 'Unauthorized', schema: agencyErrorResponseSchema },
		500: { description: 'Failed to create agency', schema: agencyErrorResponseSchema }
	}
});

registerApiRoute({
	method: 'post',
	path: '/api/agencies/agents/convert',
	summary: 'Convert a user to an agent',
	tags: ['Agencies'],
	security: [{ bearerAuth: [] }],
	request: {
		body: convertUserToAgentBodySchema
	},
	responses: {
		200: { description: 'Conversion successful', schema: conversionSuccessResponseSchema },
		400: { description: 'Invalid request', schema: agencyErrorResponseSchema },
		401: { description: 'Unauthorized', schema: agencyErrorResponseSchema },
		403: { description: 'Forbidden', schema: agencyErrorResponseSchema },
		404: { description: 'User not found', schema: agencyErrorResponseSchema },
		500: { description: 'Failed to convert user to agent', schema: agencyErrorResponseSchema }
	}
});

router.post('/agencies', checkAuth, (req, res, next) => {
	const parsedBody = createAgencyBodySchema.safeParse(req.body);

	if (!parsedBody.success) {
		return res.status(400).json({
			success: false,
			error: 'Failed to create agency',
			message: parsedBody.error.issues.map((issue) => issue.message).join(', ')
		});
	}

	req.body = parsedBody.data;
	return createAgency(req, res, next);
});

router.post('/agencies/agents/convert', checkAuth, (req, res, next) => {
	const parsedBody = convertUserToAgentBodySchema.safeParse(req.body);

	if (!parsedBody.success) {
		return res.status(400).json({
			success: false,
			error: 'Failed to convert user to agent',
			message: parsedBody.error.issues.map((issue) => issue.message).join(', ')
		});
	}

	req.body = parsedBody.data;
	return convertUserToAgent(req, res, next);
});

export default router;
