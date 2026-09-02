import express from 'express';
import { z } from 'zod';
import { registerApiRoute } from '../docs/swagger.js';
import {
	confirmAgencyDocumentUpload,
	createAgency,
	getMyAgency,
	getAgencyAgents,
	getPendingAgencyInvitations,
	getUnderReviewAgencies,
	inviteAgencyAgent,
	removeAgencyAgent,
	reviewAgencyApplication,
	respondToAgencyInvitation,
	submitAgencyApplication,
	transferAgencyListings,
	updateAgentListingLimit,
	uploadAgencyDocument
} from '../services/agenciesService.js';
import { checkAuth } from '../utils/authMiddleware.js';

const router = express.Router();

const createAgencyBodySchema = z.object({
	name: z.string().min(2),
	slug: z.string().min(1).optional(),
	description: z.string().optional(),
	email: z.string().email(),
	phone: z.string().min(1),
	website: z.string().optional(),
	address_line1: z.string().optional(),
	address_line2: z.string().optional(),
	region_id: z.coerce.number().int().positive().optional(),
	city_id: z.coerce.number().int().positive().optional(),
	municipality_id: z.coerce.number().int().positive().optional(),
	neighborhood_id: z.coerce.number().int().positive().optional()
});

const agencyIdParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const agencyDocumentParamsSchema = z.object({
	agencyId: z.coerce.number().int().positive(),
	documentId: z.string().uuid()
});
const agencyDocumentUploadBodySchema = z.object({
	document_type: z.enum(['BUSINESS_REGISTRATION', 'OWNER_ID']),
	file_name: z.string().min(1).max(255),
	content_type: z.string().min(1).max(100)
});
const agencyReviewBodySchema = z.object({
	decision: z.enum(['ACTIVE', 'REJECTED']),
	review_note: z.string().max(4000).optional()
});
const agencyInvitationBodySchema = z.object({
	email: z.string().email().optional(),
	user_id: z.string().min(1).optional()
}).refine((body) => Boolean(body.email) !== Boolean(body.user_id), 'Provide exactly one of email or user_id');
const invitationIdParamsSchema = z.object({ id: z.string().uuid() });
const agencyAgentParamsSchema = z.object({ id: z.coerce.number().int().positive(), userId: z.string().min(1) });
const agentListingLimitBodySchema = z.object({ listing_limit: z.number().int().nonnegative().nullable() });
const transferAgencyListingsBodySchema = z.object({
	listing_ids: z.array(z.coerce.number().int().positive()).min(1),
	target_user_id: z.string().min(1)
});

const agencyRecordSchema = z.record(z.string(), z.unknown());

const agencySuccessResponseSchema = z.object({
	success: z.literal(true),
	agency: agencyRecordSchema
});

const agencyErrorResponseSchema = z.object({
	success: z.literal(false),
	error: z.string(),
	message: z.string().optional()
});

registerApiRoute({
	method: 'post',
	path: '/api/agencies',
	summary: 'Create an agency application draft',
	tags: ['Agencies'],
	security: [{ bearerAuth: [] }],
	request: {
		body: createAgencyBodySchema
	},
	responses: {
		201: { description: 'Agency application draft created', schema: agencySuccessResponseSchema },
		400: { description: 'Invalid request', schema: agencyErrorResponseSchema },
		401: { description: 'Unauthorized', schema: agencyErrorResponseSchema },
		409: { description: 'Agency application already exists', schema: agencyErrorResponseSchema },
		500: { description: 'Failed to create agency', schema: agencyErrorResponseSchema }
	}
});

registerApiRoute({
	method: 'post', path: '/api/agencies/{id}/invitations', summary: 'Invite a registered user to join an agency', tags: ['Agencies'], security: [{ bearerAuth: [] }],
	request: { params: agencyIdParamsSchema, body: agencyInvitationBodySchema },
	responses: { 201: { description: 'Invitation created', schema: z.object({ success: z.literal(true), invitation: agencyRecordSchema }) }, 400: { description: 'Invalid request', schema: agencyErrorResponseSchema }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema }, 404: { description: 'Agency or user not found', schema: agencyErrorResponseSchema }, 409: { description: 'Agency inactive or user already belongs to an agency', schema: agencyErrorResponseSchema } }
});

registerApiRoute({
	method: 'get', path: '/api/agencies/invitations/pending', summary: 'List the authenticated user pending agency invitations', tags: ['Agencies'], security: [{ bearerAuth: [] }],
	responses: { 200: { description: 'Pending invitations', schema: z.object({ success: z.literal(true), invitations: z.array(agencyRecordSchema) }) }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema } }
});

registerApiRoute({
	method: 'post', path: '/api/agencies/invitations/{id}/accept', summary: 'Accept an agency invitation', tags: ['Agencies'], security: [{ bearerAuth: [] }], request: { params: invitationIdParamsSchema },
	responses: { 200: { description: 'Invitation accepted', schema: z.object({ success: z.literal(true), invitation: agencyRecordSchema }) }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema }, 404: { description: 'Pending invitation not found', schema: agencyErrorResponseSchema }, 409: { description: 'Already belongs to an agency', schema: agencyErrorResponseSchema } }
});

registerApiRoute({
	method: 'post', path: '/api/agencies/invitations/{id}/decline', summary: 'Decline an agency invitation', tags: ['Agencies'], security: [{ bearerAuth: [] }], request: { params: invitationIdParamsSchema },
	responses: { 200: { description: 'Invitation declined', schema: z.object({ success: z.literal(true), invitation: agencyRecordSchema }) }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema }, 404: { description: 'Pending invitation not found', schema: agencyErrorResponseSchema } }
});

registerApiRoute({
	method: 'get', path: '/api/agencies/{id}/agents', summary: 'List agency team members', tags: ['Agencies'], security: [{ bearerAuth: [] }], request: { params: agencyIdParamsSchema },
	responses: { 200: { description: 'Agency agents', schema: z.object({ success: z.literal(true), agents: z.array(agencyRecordSchema) }) }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema }, 404: { description: 'Agency not found', schema: agencyErrorResponseSchema } }
});

registerApiRoute({
	method: 'patch', path: '/api/agencies/{id}/agents/{userId}/listing-limit', summary: 'Set an agent listing limit', tags: ['Agencies'], security: [{ bearerAuth: [] }], request: { params: agencyAgentParamsSchema, body: agentListingLimitBodySchema },
	responses: { 200: { description: 'Listing limit updated', schema: z.object({ success: z.literal(true), agent: agencyRecordSchema }) }, 400: { description: 'Invalid request', schema: agencyErrorResponseSchema }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema }, 404: { description: 'Agency or agent not found', schema: agencyErrorResponseSchema } }
});

registerApiRoute({
	method: 'delete', path: '/api/agencies/{id}/agents/{userId}', summary: 'Remove an agency agent and reassign their listings to the owner', tags: ['Agencies'], security: [{ bearerAuth: [] }], request: { params: agencyAgentParamsSchema },
	responses: { 200: { description: 'Agent removed', schema: z.object({ success: z.literal(true), reassigned_listing_count: z.number().int() }) }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema }, 404: { description: 'Agency or removable agent not found', schema: agencyErrorResponseSchema } }
});

registerApiRoute({
	method: 'post', path: '/api/agencies/{id}/listings/transfer', summary: 'Transfer selected agency listings to a team member', tags: ['Agencies'], security: [{ bearerAuth: [] }], request: { params: agencyIdParamsSchema, body: transferAgencyListingsBodySchema },
	responses: { 200: { description: 'Listings transferred', schema: z.object({ success: z.literal(true), transferred_count: z.number().int() }) }, 400: { description: 'Invalid request', schema: agencyErrorResponseSchema }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema }, 404: { description: 'Agency or target agent not found', schema: agencyErrorResponseSchema }, 409: { description: 'Target limit exceeded', schema: agencyErrorResponseSchema } }
});

registerApiRoute({
	method: 'get',
	path: '/api/agencies/me',
	summary: 'Get the authenticated owner agency application',
	tags: ['Agencies'],
	security: [{ bearerAuth: [] }],
	responses: {
		200: { description: 'Agency application', schema: agencySuccessResponseSchema },
		401: { description: 'Unauthorized', schema: agencyErrorResponseSchema },
		404: { description: 'Agency application not found', schema: agencyErrorResponseSchema }
	}
});

registerApiRoute({
	method: 'post',
	path: '/api/agencies/{id}/documents',
	summary: 'Create an agency document upload',
	tags: ['Agencies'],
	security: [{ bearerAuth: [] }],
	request: { params: agencyIdParamsSchema, body: agencyDocumentUploadBodySchema },
	responses: { 201: { description: 'Upload URL created', schema: z.object({ success: z.literal(true), document: agencyRecordSchema }) }, 400: { description: 'Invalid request', schema: agencyErrorResponseSchema }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema }, 404: { description: 'Agency application not found', schema: agencyErrorResponseSchema }, 409: { description: 'Application is not a draft', schema: agencyErrorResponseSchema }, 500: { description: 'Upload failed', schema: agencyErrorResponseSchema } }
});

registerApiRoute({
	method: 'post',
	path: '/api/agencies/{agencyId}/documents/{documentId}/confirm',
	summary: 'Confirm an uploaded agency document',
	tags: ['Agencies'],
	security: [{ bearerAuth: [] }],
	request: { params: agencyDocumentParamsSchema },
	responses: { 200: { description: 'Document confirmed', schema: z.object({ success: z.literal(true), document: agencyRecordSchema.nullable() }) }, 400: { description: 'Invalid request', schema: agencyErrorResponseSchema }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema }, 404: { description: 'Application or document not found', schema: agencyErrorResponseSchema }, 409: { description: 'Application is not a draft', schema: agencyErrorResponseSchema } }
});

registerApiRoute({
	method: 'post',
	path: '/api/agencies/{id}/submit',
	summary: 'Submit a complete agency application for review',
	tags: ['Agencies'],
	security: [{ bearerAuth: [] }],
	request: { params: agencyIdParamsSchema },
	responses: { 200: { description: 'Agency application submitted', schema: agencySuccessResponseSchema }, 400: { description: 'Required documents missing', schema: agencyErrorResponseSchema }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema }, 404: { description: 'Agency application not found', schema: agencyErrorResponseSchema }, 409: { description: 'Application is not a draft', schema: agencyErrorResponseSchema } }
});

registerApiRoute({
	method: 'get',
	path: '/api/agencies/review-queue',
	summary: 'List agency applications awaiting admin review',
	tags: ['Agencies'],
	security: [{ bearerAuth: [] }],
	responses: { 200: { description: 'Agency review queue', schema: z.object({ success: z.literal(true), agencies: z.array(agencyRecordSchema) }) }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema }, 403: { description: 'Admin access required', schema: agencyErrorResponseSchema } }
});

registerApiRoute({
	method: 'post',
	path: '/api/agencies/{id}/review',
	summary: 'Approve or reject an agency application',
	tags: ['Agencies'],
	security: [{ bearerAuth: [] }],
	request: { params: agencyIdParamsSchema, body: agencyReviewBodySchema },
	responses: { 200: { description: 'Agency application reviewed', schema: agencySuccessResponseSchema }, 400: { description: 'Invalid request', schema: agencyErrorResponseSchema }, 401: { description: 'Unauthorized', schema: agencyErrorResponseSchema }, 403: { description: 'Admin access required', schema: agencyErrorResponseSchema }, 409: { description: 'Application is not under review', schema: agencyErrorResponseSchema } }
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

router.get('/agencies/me', checkAuth, getMyAgency);

router.post('/agencies/:id/documents', checkAuth, (req, res, next) => {
	const parsedParams = agencyIdParamsSchema.safeParse(req.params);
	const parsedBody = agencyDocumentUploadBodySchema.safeParse(req.body);
	if (!parsedParams.success || !parsedBody.success) return res.status(400).json({ success: false, error: 'Invalid request' });
	req.params = parsedParams.data as unknown as typeof req.params;
	req.body = parsedBody.data;
	return uploadAgencyDocument(req, res, next);
});

router.post('/agencies/:agencyId/documents/:documentId/confirm', checkAuth, (req, res, next) => {
	const parsedParams = agencyDocumentParamsSchema.safeParse(req.params);
	if (!parsedParams.success) return res.status(400).json({ success: false, error: 'Invalid request' });
	req.params = parsedParams.data as unknown as typeof req.params;
	return confirmAgencyDocumentUpload(req, res, next);
});

router.post('/agencies/:id/submit', checkAuth, (req, res, next) => {
	const parsedParams = agencyIdParamsSchema.safeParse(req.params);
	if (!parsedParams.success) return res.status(400).json({ success: false, error: 'Invalid request' });
	req.params = parsedParams.data as unknown as typeof req.params;
	return submitAgencyApplication(req, res, next);
});

router.get('/agencies/review-queue', checkAuth, getUnderReviewAgencies);

router.post('/agencies/:id/review', checkAuth, (req, res, next) => {
	const parsedParams = agencyIdParamsSchema.safeParse(req.params);
	const parsedBody = agencyReviewBodySchema.safeParse(req.body);
	if (!parsedParams.success || !parsedBody.success) return res.status(400).json({ success: false, error: 'Invalid request' });
	req.params = parsedParams.data as unknown as typeof req.params;
	req.body = parsedBody.data;
	return reviewAgencyApplication(req, res, next);
});

router.post('/agencies/:id/invitations', checkAuth, (req, res, next) => {
	const params = agencyIdParamsSchema.safeParse(req.params);
	const body = agencyInvitationBodySchema.safeParse(req.body);
	if (!params.success || !body.success) return res.status(400).json({ success: false, error: 'Invalid request' });
	req.params = params.data as unknown as typeof req.params;
	req.body = body.data;
	return inviteAgencyAgent(req, res, next);
});

router.get('/agencies/invitations/pending', checkAuth, getPendingAgencyInvitations);

router.post('/agencies/invitations/:id/accept', checkAuth, (req, res, next) => {
	const params = invitationIdParamsSchema.safeParse(req.params);
	if (!params.success) return res.status(400).json({ success: false, error: 'Invalid request' });
	req.params = params.data as unknown as typeof req.params;
	return respondToAgencyInvitation(true)(req, res, next);
});

router.post('/agencies/invitations/:id/decline', checkAuth, (req, res, next) => {
	const params = invitationIdParamsSchema.safeParse(req.params);
	if (!params.success) return res.status(400).json({ success: false, error: 'Invalid request' });
	req.params = params.data as unknown as typeof req.params;
	return respondToAgencyInvitation(false)(req, res, next);
});

router.get('/agencies/:id/agents', checkAuth, getAgencyAgents);

router.patch('/agencies/:id/agents/:userId/listing-limit', checkAuth, (req, res, next) => {
	const params = agencyAgentParamsSchema.safeParse(req.params);
	const body = agentListingLimitBodySchema.safeParse(req.body);
	if (!params.success || !body.success) return res.status(400).json({ success: false, error: 'Invalid request' });
	req.params = params.data as unknown as typeof req.params;
	req.body = body.data;
	return updateAgentListingLimit(req, res, next);
});

router.delete('/agencies/:id/agents/:userId', checkAuth, (req, res, next) => {
	const params = agencyAgentParamsSchema.safeParse(req.params);
	if (!params.success) return res.status(400).json({ success: false, error: 'Invalid request' });
	req.params = params.data as unknown as typeof req.params;
	return removeAgencyAgent(req, res, next);
});

router.post('/agencies/:id/listings/transfer', checkAuth, (req, res, next) => {
	const params = agencyIdParamsSchema.safeParse(req.params);
	const body = transferAgencyListingsBodySchema.safeParse(req.body);
	if (!params.success || !body.success) return res.status(400).json({ success: false, error: 'Invalid request' });
	req.params = params.data as unknown as typeof req.params;
	req.body = body.data;
	return transferAgencyListings(req, res, next);
});

export default router;
