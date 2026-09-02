import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Request, RequestHandler } from 'express';
import agenciesDb from '../db/agencies.js';
import usersDb from '../db/users.js';
import { AuthenticatedRequest } from '../utils/authMiddleware.js';

interface CreateAgencyRequestBody {
  name?: string;
  slug?: string;
  description?: string;
  email?: string;
  phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  region_id?: number;
  city_id?: number;
  municipality_id?: number;
  neighborhood_id?: number;
}

interface ConvertUserToAgentRequestBody {
  user_id?: string;
  agency_ids?: number[];
  primary_agency_id?: number;
}

interface AgencyDocumentUploadRequestBody {
  document_type?: 'BUSINESS_REGISTRATION' | 'OWNER_ID';
  file_name?: string;
  content_type?: string;
}

interface AgencyReviewRequestBody {
  decision?: 'ACTIVE' | 'REJECTED';
  review_note?: string;
}

interface AgencyInvitationRequestBody {
  email?: string;
  user_id?: string;
}

interface AgentListingLimitRequestBody {
  listing_limit?: number | null;
}

interface TransferAgencyListingsRequestBody {
  listing_ids?: number[];
  target_user_id?: string;
}

const requiredDocumentTypes = ['BUSINESS_REGISTRATION', 'OWNER_ID'] as const;
const s3Client = new S3Client({
  forcePathStyle: true,
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_S3_ENDPOINT,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
        }
      : undefined
});

function buildAgencyDocumentObjectKey(agencyId: number, documentType: string, fileName: string): string {
  const cleanedFileName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  return `agencies/${agencyId}/documents/${Date.now()}-${documentType.toLowerCase()}-${cleanedFileName}`;
}

async function buildPresignedPutUrl(bucket: string, key: string, contentType: string): Promise<string> {
  return getSignedUrl(s3Client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: 3600 });
}

async function buildPresignedGetUrl(bucket: string, key: string): Promise<string> {
  return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
}

async function objectExistsInS3(bucket: string, key: string): Promise<boolean> {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error) {
      const errorName = String((error as { name?: string }).name);
      if (errorName === 'NotFound' || errorName === 'NoSuchKey') {
        return false;
      }
    }
    throw error;
  }
}

async function isAdmin(userId: string): Promise<boolean> {
  return (await usersDb.getUserRole(userId)) === 'ADMIN';
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function normalizeCreateAgencyInput(input: CreateAgencyRequestBody, creatorUserId: string) {
  if (!input.name || input.name.trim().length < 2) {
    throw new Error('Agency name must be at least 2 characters');
  }

  if (!input.email || input.email.trim().length === 0) {
    throw new Error('Contact email is required');
  }

  if (!input.phone || input.phone.trim().length === 0) {
    throw new Error('Phone number is required');
  }

  const slugSource = input.slug && input.slug.trim().length > 0 ? input.slug : input.name;
  const slug = normalizeSlug(slugSource);

  if (!slug) {
    throw new Error('Agency slug could not be generated');
  }

  return {
    name: input.name.trim(),
    slug,
    description: input.description?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    website: input.website?.trim() || null,
    address_line1: input.address_line1?.trim() || null,
    address_line2: input.address_line2?.trim() || null,
    region_id: input.region_id ?? null,
    city_id: input.city_id ?? null,
    municipality_id: input.municipality_id ?? null,
    neighborhood_id: input.neighborhood_id ?? null,
    created_by_user_id: creatorUserId
  };
}

function normalizeConvertUserToAgentInput(input: ConvertUserToAgentRequestBody) {
  if (!input.user_id || input.user_id.trim().length === 0) {
    throw new Error('user_id is required');
  }

  const parsedAgencyIds = Array.isArray(input.agency_ids)
    ? input.agency_ids.filter((id) => Number.isInteger(id) && id > 0)
    : [];

  if (parsedAgencyIds.length === 0) {
    throw new Error('agency_ids must contain at least one valid agency id');
  }

  const primaryAgencyId =
    input.primary_agency_id && Number.isInteger(input.primary_agency_id) && input.primary_agency_id > 0
      ? input.primary_agency_id
      : parsedAgencyIds[0];

  if (!parsedAgencyIds.includes(primaryAgencyId)) {
    throw new Error('primary_agency_id must be one of agency_ids');
  }

  return {
    userId: input.user_id.trim(),
    agencyIds: parsedAgencyIds,
    primaryAgencyId
  };
}

export const createAgency: RequestHandler = async (req, res) => {
  const creatorUserId = (req as AuthenticatedRequest).user?.user_id;

  if (!creatorUserId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const typedReq = req as Request<{}, {}, CreateAgencyRequestBody>;
    const payload = normalizeCreateAgencyInput(typedReq.body, creatorUserId);
    const agency = await agenciesDb.createAgency(payload);

    return res.status(201).json({ success: true, agency });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('one agency application') ? 409 : message.includes('required') || message.includes('must') ? 400 : 500;

    return res.status(status).json({
      success: false,
      error: 'Failed to create agency',
      message
    });
  }
};

export const getMyAgency: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const agency = await agenciesDb.getOwnedAgency(userId);
  if (!agency) {
    return res.status(404).json({ success: false, error: 'Agency application not found' });
  }

  return res.json({ success: true, agency });
};

export const uploadAgencyDocument: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const agencyId = Number(req.params.id);
  const body = (req.body ?? {}) as AgencyDocumentUploadRequestBody;

  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!Number.isInteger(agencyId)) return res.status(400).json({ success: false, error: 'Invalid agency id' });
  if (!body.document_type || !requiredDocumentTypes.includes(body.document_type)) {
    return res.status(400).json({ success: false, error: 'Invalid agency document type' });
  }
  if (!body.file_name?.trim() || !body.content_type?.trim()) {
    return res.status(400).json({ success: false, error: 'file_name and content_type are required' });
  }

  try {
    const agency = await agenciesDb.getOwnedAgencyById(agencyId, userId);
    if (!agency) return res.status(404).json({ success: false, error: 'Agency application not found' });
    if (agency.status !== 'DRAFT') return res.status(409).json({ success: false, error: 'Documents can only be changed while the application is a draft' });
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      return res.status(500).json({ success: false, error: 'S3 credentials are not configured' });
    }

    const fileName = body.file_name.trim();
    const contentType = body.content_type.trim();
    const objectKey = buildAgencyDocumentObjectKey(agencyId, body.document_type, fileName);
    const document = await agenciesDb.upsertAgencyDocument({
      agencyId,
      documentType: body.document_type,
      objectKey,
      fileName,
      contentType
    });
    const bucket = process.env.AWS_S3_BUCKET ?? 'agency-documents';

    return res.status(201).json({
      success: true,
      document: {
        ...document,
        bucket,
        upload_url: await buildPresignedPutUrl(bucket, objectKey, contentType)
      }
    });
  } catch (error: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to create agency document upload', message: error instanceof Error ? error.message : 'Unknown error' });
  }
};

export const confirmAgencyDocumentUpload: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const agencyId = Number(req.params.agencyId);
  const documentId = req.params.documentId;

  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!Number.isInteger(agencyId) || !documentId) return res.status(400).json({ success: false, error: 'Invalid agency or document id' });

  try {
    const agency = await agenciesDb.getOwnedAgencyById(agencyId, userId);
    if (!agency) return res.status(404).json({ success: false, error: 'Agency application not found' });
    if (agency.status !== 'DRAFT') return res.status(409).json({ success: false, error: 'Documents can only be changed while the application is a draft' });

    const document = await agenciesDb.getAgencyDocumentById(agencyId, documentId);
    if (!document) return res.status(404).json({ success: false, error: 'Agency document not found' });
    const bucket = process.env.AWS_S3_BUCKET ?? 'agency-documents';
    if (!(await objectExistsInS3(bucket, String(document.object_key)))) {
      return res.status(404).json({ success: false, error: 'Uploaded document not found in storage' });
    }

    const confirmedDocument = await agenciesDb.confirmAgencyDocumentUpload(agencyId, documentId);
    return res.json({ success: true, document: confirmedDocument });
  } catch (error: unknown) {
    return res.status(500).json({ success: false, error: 'Failed to confirm agency document upload', message: error instanceof Error ? error.message : 'Unknown error' });
  }
};

export const submitAgencyApplication: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const agencyId = Number(req.params.id);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!Number.isInteger(agencyId)) return res.status(400).json({ success: false, error: 'Invalid agency id' });

  const agency = await agenciesDb.getOwnedAgencyById(agencyId, userId);
  if (!agency) return res.status(404).json({ success: false, error: 'Agency application not found' });
  if (agency.status !== 'DRAFT') return res.status(409).json({ success: false, error: 'Only draft applications can be submitted' });

  const confirmedTypes = await agenciesDb.getConfirmedDocumentTypes(agencyId);
  const missingTypes = requiredDocumentTypes.filter((documentType) => !confirmedTypes.includes(documentType));
  if (missingTypes.length > 0) {
    return res.status(400).json({ success: false, error: 'Required documents are missing or unconfirmed', missing_document_types: missingTypes });
  }

  const submittedAgency = await agenciesDb.submitAgencyApplication(agencyId, userId);
  if (!submittedAgency) return res.status(409).json({ success: false, error: 'Agency application could not be submitted' });
  return res.json({ success: true, agency: submittedAgency });
};

export const getUnderReviewAgencies: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!(await isAdmin(userId))) return res.status(403).json({ success: false, error: 'Forbidden' });

  const bucket = process.env.AWS_S3_BUCKET ?? 'agency-documents';
  const agencies = await agenciesDb.getUnderReviewAgencies();
  const agenciesWithDocumentUrls = await Promise.all(agencies.map(async (agency) => {
    const documents = Array.isArray(agency.documents) ? agency.documents as Array<Record<string, unknown>> : [];
    return {
      ...agency,
      documents: await Promise.all(documents.map(async (document) => ({
        ...document,
        view_url: await buildPresignedGetUrl(bucket, String(document.object_key))
      })))
    };
  }));

  return res.json({ success: true, agencies: agenciesWithDocumentUrls });
};

export const reviewAgencyApplication: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const agencyId = Number(req.params.id);
  const body = (req.body ?? {}) as AgencyReviewRequestBody;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!(await isAdmin(userId))) return res.status(403).json({ success: false, error: 'Forbidden' });
  if (!Number.isInteger(agencyId)) return res.status(400).json({ success: false, error: 'Invalid agency id' });
  if (body.decision !== 'ACTIVE' && body.decision !== 'REJECTED') return res.status(400).json({ success: false, error: 'decision must be ACTIVE or REJECTED' });

  const agency = await agenciesDb.reviewAgencyApplication(agencyId, userId, body.decision, body.review_note?.trim() || null);
  if (!agency) return res.status(409).json({ success: false, error: 'Only under-review applications can be reviewed' });
  return res.json({ success: true, agency });
};

export const inviteAgencyAgent: RequestHandler = async (req, res) => {
  const ownerUserId = (req as AuthenticatedRequest).user?.user_id;
  const agencyId = Number(req.params.id);
  const body = (req.body ?? {}) as AgencyInvitationRequestBody;
  if (!ownerUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!Number.isInteger(agencyId)) return res.status(400).json({ success: false, error: 'Invalid agency id' });
  if ((!body.email?.trim() && !body.user_id?.trim()) || (body.email?.trim() && body.user_id?.trim())) {
    return res.status(400).json({ success: false, error: 'Provide exactly one of email or user_id' });
  }

  const agency = await agenciesDb.getOwnedAgencyById(agencyId, ownerUserId);
  if (!agency) return res.status(404).json({ success: false, error: 'Agency application not found' });
  if (agency.status !== 'ACTIVE') return res.status(409).json({ success: false, error: 'Only active agencies can invite agents' });

  const invitedUser = await agenciesDb.findUserForInvitation({ email: body.email?.trim(), userId: body.user_id?.trim() });
  if (!invitedUser) return res.status(404).json({ success: false, error: 'Registered user not found' });
  if (invitedUser.id === ownerUserId) return res.status(400).json({ success: false, error: 'Agency owner is already a member' });
  if (await agenciesDb.getAgencyMembership(String(invitedUser.id))) {
    return res.status(409).json({ success: false, error: 'User already belongs to an agency' });
  }

  const invitation = await agenciesDb.createAgencyInvitation(agencyId, String(invitedUser.id), ownerUserId);
  return res.status(201).json({ success: true, invitation });
};

export const getPendingAgencyInvitations: RequestHandler = async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  return res.json({ success: true, invitations: await agenciesDb.getPendingInvitations(userId) });
};

export const respondToAgencyInvitation = (accept: boolean): RequestHandler => async (req, res) => {
  const userId = (req as AuthenticatedRequest).user?.user_id;
  const invitationId = req.params.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!invitationId) return res.status(400).json({ success: false, error: 'Invalid invitation id' });
  try {
    const invitation = await agenciesDb.respondToInvitation(invitationId, userId, accept);
    if (!invitation) return res.status(404).json({ success: false, error: 'Pending invitation not found' });
    return res.json({ success: true, invitation });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(message.includes('already belongs') ? 409 : 500).json({ success: false, error: accept ? 'Failed to accept invitation' : 'Failed to decline invitation', message });
  }
};

export const getAgencyAgents: RequestHandler = async (req, res) => {
  const ownerUserId = (req as AuthenticatedRequest).user?.user_id;
  const agencyId = Number(req.params.id);
  if (!ownerUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!Number.isInteger(agencyId)) return res.status(400).json({ success: false, error: 'Invalid agency id' });
  if (!await agenciesDb.getOwnedAgencyById(agencyId, ownerUserId)) return res.status(404).json({ success: false, error: 'Agency application not found' });
  return res.json({ success: true, agents: await agenciesDb.getAgencyAgents(agencyId) });
};

export const updateAgentListingLimit: RequestHandler = async (req, res) => {
  const ownerUserId = (req as AuthenticatedRequest).user?.user_id;
  const agencyId = Number(req.params.id);
  const agentUserId = req.params.userId;
  const body = (req.body ?? {}) as AgentListingLimitRequestBody;
  if (!ownerUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!Number.isInteger(agencyId) || !agentUserId) return res.status(400).json({ success: false, error: 'Invalid agency or agent id' });
  if (body.listing_limit !== null && (!Number.isInteger(body.listing_limit) || (body.listing_limit as number) < 0)) return res.status(400).json({ success: false, error: 'listing_limit must be a non-negative integer or null' });
  if (!await agenciesDb.getOwnedAgencyById(agencyId, ownerUserId)) return res.status(404).json({ success: false, error: 'Agency application not found' });
  const agent = await agenciesDb.setAgentListingLimit(agencyId, agentUserId, body.listing_limit ?? null);
  if (!agent) return res.status(404).json({ success: false, error: 'Agent not found or is the agency owner' });
  return res.json({ success: true, agent });
};

export const transferAgencyListings: RequestHandler = async (req, res) => {
  const ownerUserId = (req as AuthenticatedRequest).user?.user_id;
  const agencyId = Number(req.params.id);
  const body = (req.body ?? {}) as TransferAgencyListingsRequestBody;
  const listingIds = Array.isArray(body.listing_ids) ? [...new Set(body.listing_ids)] : [];
  if (!ownerUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!Number.isInteger(agencyId) || !body.target_user_id?.trim() || listingIds.length === 0 || listingIds.some((id) => !Number.isInteger(id) || id < 1)) return res.status(400).json({ success: false, error: 'Valid listing_ids and target_user_id are required' });
  try {
    const transferredCount = await agenciesDb.transferAgencyListings(agencyId, ownerUserId, listingIds, body.target_user_id.trim());
    return res.json({ success: true, transferred_count: transferredCount });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('not found') ? 404 : message.includes('limit') || message.includes('cannot') ? 409 : 500;
    return res.status(status).json({ success: false, error: 'Failed to transfer listings', message });
  }
};

export const removeAgencyAgent: RequestHandler = async (req, res) => {
  const ownerUserId = (req as AuthenticatedRequest).user?.user_id;
  const agencyId = Number(req.params.id);
  const agentUserId = req.params.userId;
  if (!ownerUserId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (!Number.isInteger(agencyId) || !agentUserId) return res.status(400).json({ success: false, error: 'Invalid agency or agent id' });
  const reassignedCount = await agenciesDb.removeAgencyAgent(agencyId, ownerUserId, agentUserId);
  if (reassignedCount === null) return res.status(404).json({ success: false, error: 'Agent not found or is the agency owner' });
  return res.json({ success: true, reassigned_listing_count: reassignedCount });
};

export const convertUserToAgent: RequestHandler = async (req, res) => {
  const actorUserId = (req as AuthenticatedRequest).user?.user_id;

  if (!actorUserId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const typedReq = req as Request<{}, {}, ConvertUserToAgentRequestBody>;
    const payload = normalizeConvertUserToAgentInput(typedReq.body);

    if (payload.userId !== actorUserId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You can only convert your own account to an agent account'
      });
    }

    const conversionResult = await agenciesDb.promoteUserToAgent(payload);

    return res.status(200).json({
      success: true,
      message: 'User converted to agent and linked to agencies',
      conversion: conversionResult
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message === 'User not found') {
      return res.status(404).json({ success: false, error: message });
    }

    const status = message.includes('required') || message.includes('must') || message.includes('do not exist') ? 400 : 500;
    return res.status(status).json({
      success: false,
      error: 'Failed to convert user to agent',
      message
    });
  }
};

export { normalizeCreateAgencyInput, normalizeConvertUserToAgentInput };
