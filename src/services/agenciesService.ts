import { Request, RequestHandler } from 'express';
import agenciesDb from '../db/agencies.js';
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
    const status = message.includes('required') || message.includes('must') ? 400 : 500;

    return res.status(status).json({
      success: false,
      error: 'Failed to create agency',
      message
    });
  }
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
