import prisma from './prisma.js';

export interface AgencyCreatePayload {
  name: string;
  slug: string;
  description: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  address_line2: string | null;
  region_id: number | null;
  city_id: number | null;
  municipality_id: number | null;
  neighborhood_id: number | null;
  created_by_user_id: string;
}

export interface PromoteUserToAgentPayload {
  userId: string;
  agencyIds: number[];
  primaryAgencyId: number;
}

export interface PromoteUserToAgentResult {
  user_id: string;
  role_changed: boolean;
  linked_agency_count: number;
  converted_listing_count: number;
  primary_agency_id: number;
}

export type AgencyDocumentType = 'BUSINESS_REGISTRATION' | 'OWNER_ID';
export type AgencyReviewDecision = 'ACTIVE' | 'REJECTED';

export interface AgencyDocumentPayload {
  agencyId: number;
  documentType: AgencyDocumentType;
  objectKey: string;
  fileName: string;
  contentType: string;
}

function uniqueAgencyIds(agencyIds: number[]): number[] {
  return [...new Set(agencyIds)];
}

function toRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

async function ensureAgenciesExist(
  tx: Pick<typeof prisma, 'agency'>,
  agencyIds: number[]
): Promise<void> {
  const uniqueIds = uniqueAgencyIds(agencyIds);
  const existingAgencies = await tx.agency.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true }
  });

  const found = new Set(existingAgencies.map((row) => row.id));
  const missing = uniqueIds.filter((id) => !found.has(id));

  if (missing.length > 0) {
    throw new Error(`The following agencies do not exist: ${missing.join(', ')}`);
  }
}

async function setUserAgencyLinks(
  tx: Pick<typeof prisma, 'agencyAgent'>,
  userId: string,
  agencyIds: number[],
  primaryAgencyId: number
): Promise<number> {
  const uniqueIds = uniqueAgencyIds(agencyIds);

  await tx.agencyAgent.updateMany({
    where: { user_id: userId },
    data: {
      is_primary: false,
      updated_at: new Date()
    }
  });

  for (const agencyId of uniqueIds) {
    await tx.agencyAgent.upsert({
      where: {
        agency_id_user_id: {
          agency_id: agencyId,
          user_id: userId
        }
      },
      create: {
        agency_id: agencyId,
        user_id: userId,
        is_primary: agencyId === primaryAgencyId,
        joined_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      },
      update: {
        is_primary: agencyId === primaryAgencyId,
        updated_at: new Date()
      }
    });
  }

  return uniqueIds.length;
}

async function convertPrivateListingsToAgent(
  tx: Pick<typeof prisma, 'listing'>,
  userId: string,
  primaryAgencyId: number
): Promise<number> {
  const setAgencyResult = await tx.listing.updateMany({
    where: {
      user_id: userId,
      deleted_at: null,
      agency_id: null,
      OR: [{ listing_owner_type: null }, { listing_owner_type: 'PRIVATE' }]
    },
    data: {
      listing_owner_type: 'AGENT',
      agency_id: primaryAgencyId,
      updated_at: new Date()
    }
  });

  const keepExistingAgencyResult = await tx.listing.updateMany({
    where: {
      user_id: userId,
      deleted_at: null,
      NOT: { agency_id: null },
      OR: [{ listing_owner_type: null }, { listing_owner_type: 'PRIVATE' }]
    },
    data: {
      listing_owner_type: 'AGENT',
      updated_at: new Date()
    }
  });

  return setAgencyResult.count + keepExistingAgencyResult.count;
}

const agenciesDb = {
  createAgency: async function(payload: AgencyCreatePayload): Promise<Record<string, unknown>> {
    const created = await prisma.$transaction(async (tx) => {
      const existingApplication = await tx.agency.findFirst({
        where: { created_by_user_id: payload.created_by_user_id },
        select: { id: true }
      });

      if (existingApplication) {
        throw new Error('You can only create one agency application');
      }

      const agency = await tx.agency.create({
        data: {
          name: payload.name,
          slug: payload.slug,
          description: payload.description,
          email: payload.email,
          phone: payload.phone,
          website: payload.website,
          address_line1: payload.address_line1,
          address_line2: payload.address_line2,
          region_id: payload.region_id,
          city_id: payload.city_id,
          municipality_id: payload.municipality_id,
          neighborhood_id: payload.neighborhood_id,
          created_by_user_id: payload.created_by_user_id
        }
      });

      await tx.agencyAgent.create({
        data: {
          agency_id: agency.id,
          user_id: payload.created_by_user_id,
          is_primary: true
        }
      });

      return agency;
    });

    return toRecord(created);
  },

  getOwnedAgencyById: async function(agencyId: number, userId: string): Promise<Record<string, unknown> | null> {
    const agency = await prisma.agency.findFirst({
      where: { id: agencyId, created_by_user_id: userId },
      include: { documents: true }
    });

    return agency ? toRecord(agency) : null;
  },

  getOwnedAgency: async function(userId: string): Promise<Record<string, unknown> | null> {
    const agency = await prisma.agency.findFirst({
      where: { created_by_user_id: userId },
      include: { documents: true }
    });

    return agency ? toRecord(agency) : null;
  },

  upsertAgencyDocument: async function(payload: AgencyDocumentPayload): Promise<Record<string, unknown>> {
    const document = await prisma.agencyDocument.upsert({
      where: {
        agency_id_document_type: {
          agency_id: payload.agencyId,
          document_type: payload.documentType
        }
      },
      create: {
        agency_id: payload.agencyId,
        document_type: payload.documentType,
        object_key: payload.objectKey,
        file_name: payload.fileName,
        content_type: payload.contentType
      },
      update: {
        object_key: payload.objectKey,
        file_name: payload.fileName,
        content_type: payload.contentType,
        upload_confirmed: false,
        updated_at: new Date()
      }
    });

    return toRecord(document);
  },

  getAgencyDocumentById: async function(agencyId: number, documentId: string): Promise<Record<string, unknown> | null> {
    const document = await prisma.agencyDocument.findFirst({
      where: { id: documentId, agency_id: agencyId }
    });

    return document ? toRecord(document) : null;
  },

  confirmAgencyDocumentUpload: async function(agencyId: number, documentId: string): Promise<Record<string, unknown> | null> {
    const document = await prisma.agencyDocument.updateMany({
      where: { id: documentId, agency_id: agencyId },
      data: { upload_confirmed: true, updated_at: new Date() }
    });

    if (document.count === 0) {
      return null;
    }

    return this.getAgencyDocumentById(agencyId, documentId);
  },

  getConfirmedDocumentTypes: async function(agencyId: number): Promise<AgencyDocumentType[]> {
    const documents = await prisma.agencyDocument.findMany({
      where: { agency_id: agencyId, upload_confirmed: true },
      select: { document_type: true }
    });

    return documents.map((document) => document.document_type as AgencyDocumentType);
  },

  submitAgencyApplication: async function(agencyId: number, userId: string): Promise<Record<string, unknown> | null> {
    const result = await prisma.agency.updateMany({
      where: { id: agencyId, created_by_user_id: userId, status: 'DRAFT' },
      data: { status: 'UNDER_REVIEW', submitted_at: new Date(), updated_at: new Date() }
    });

    if (result.count === 0) {
      return null;
    }

    return this.getOwnedAgencyById(agencyId, userId);
  },

  getUnderReviewAgencies: async function(): Promise<Record<string, unknown>[]> {
    const agencies = await prisma.agency.findMany({
      where: { status: 'UNDER_REVIEW' },
      include: { documents: true },
      orderBy: { submitted_at: 'asc' }
    });

    return agencies.map(toRecord);
  },

  reviewAgencyApplication: async function(
    agencyId: number,
    reviewerUserId: string,
    decision: AgencyReviewDecision,
    reviewNote: string | null
  ): Promise<Record<string, unknown> | null> {
    return prisma.$transaction(async (tx) => {
      const result = await tx.agency.updateMany({
        where: { id: agencyId, status: 'UNDER_REVIEW' },
        data: {
          status: decision,
          is_active: decision === 'ACTIVE',
          reviewed_at: new Date(),
          reviewed_by_user_id: reviewerUserId,
          review_note: reviewNote,
          updated_at: new Date()
        }
      });

      if (result.count === 0) {
        return null;
      }

      const agency = await tx.agency.findUniqueOrThrow({ where: { id: agencyId } });

      if (decision === 'ACTIVE') {
        await tx.user.update({
          where: { id: agency.created_by_user_id },
          data: { role: 'AGENT', updated_at: new Date() }
        });
      }

      return toRecord(agency);
    });
  },

  promoteUserToAgent: async function(payload: PromoteUserToAgentPayload): Promise<PromoteUserToAgentResult> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: payload.userId },
        select: { role: true }
      });

      if (!user) {
        throw new Error('User not found');
      }

      await ensureAgenciesExist(tx, payload.agencyIds);

      const linkedCount = await setUserAgencyLinks(tx, payload.userId, payload.agencyIds, payload.primaryAgencyId);

      const roleChanged = user.role !== 'AGENT';
      if (roleChanged) {
        await tx.user.update({
          where: { id: payload.userId },
          data: {
            role: 'AGENT',
            updated_at: new Date()
          }
        });
      }

      const convertedListings = await convertPrivateListingsToAgent(tx, payload.userId, payload.primaryAgencyId);

      return {
        user_id: payload.userId,
        role_changed: roleChanged,
        linked_agency_count: linkedCount,
        converted_listing_count: convertedListings,
        primary_agency_id: payload.primaryAgencyId
      };
    });
  }
};

export default agenciesDb;
