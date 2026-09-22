import { RequestHandler } from 'express';
import prisma from '../db/prisma.js';
import auditLogsDb from '../db/auditLogs.js';
import { reviewAgencyApplication } from './agenciesService.js';

type AdminRequest = Parameters<RequestHandler>[0] & { user?: { user_id?: string }; requestId?: string };

function pageValues(req: AdminRequest): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function pagination(page: number, limit: number, totalItems: number) {
  return { currentpage: page, pages: Math.max(1, Math.ceil(totalItems / limit)), itemsPerPage: limit };
}

function actorId(req: AdminRequest): string {
  return String(req.user?.user_id);
}

async function audit(req: AdminRequest, action: string, entityType: string, entityId: string | number, metadata?: Record<string, unknown>) {
  await auditLogsDb.create({
    actor_id: actorId(req),
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
    request_id: req.requestId ?? null
  });
}

export const getAdminOverview: RequestHandler = async (req, res) => {
  const [totalUsers, usersByRole, totalListings, listingsByStatus, verifiedListings, totalAgencies, agenciesByStatus, pendingAgencies, recentActivity] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.listing.count({ where: { deleted_at: null } }),
    prisma.listing.groupBy({ by: ['status'], where: { deleted_at: null }, _count: { _all: true } }),
    prisma.listing.count({ where: { verified: true, deleted_at: null } }),
    prisma.agency.count(),
    prisma.agency.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.agency.count({ where: { status: 'UNDER_REVIEW' } }),
    prisma.auditLog.findMany({ take: 10, orderBy: { created_at: 'desc' }, include: { actor: { select: { id: true, username: true } } } })
  ]);

  return res.json({
    success: true,
    stats: {
      total_users: totalUsers,
      users_by_role: Object.fromEntries(usersByRole.map((entry) => [entry.role, entry._count._all])),
      total_listings: totalListings,
      listings_by_status: Object.fromEntries(listingsByStatus.map((entry) => [entry.status, entry._count._all])),
      verified_listings: verifiedListings,
      total_agencies: totalAgencies,
      agencies_by_status: Object.fromEntries(agenciesByStatus.map((entry) => [entry.status, entry._count._all])),
      pending_agency_reviews: pendingAgencies
    },
    recent_activity: recentActivity
  });
};

export const getAdminUsers: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pageValues(req as AdminRequest);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const role = typeof req.query.role === 'string' ? req.query.role : undefined;
  const suspended = req.query.suspended === 'true' ? true : req.query.suspended === 'false' ? false : undefined;
  const where = {
    ...(role ? { role: role as 'PRIVATE' | 'AGENT' | 'AGENCY_OWNER' | 'ADMIN' } : {}),
    ...(suspended === true ? { suspended_at: { not: null } } : suspended === false ? { suspended_at: null } : {}),
    ...(search ? { OR: [{ username: { contains: search, mode: 'insensitive' as const } }, { email: { contains: search, mode: 'insensitive' as const } }] } : {})
  };
  const [totalItems, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      select: { id: true, username: true, email: true, phone: true, role: true, subscription: true, subscription_expiry: true, email_verified: true, suspended_at: true, suspension_reason: true, created_at: true, updated_at: true, _count: { select: { createdListings: true, agencyMemberships: true } } }
    })
  ]);
  const usersWithCounts = users.map(({ _count, ...user }) => ({
    ...user,
    created_listing_count: _count.createdListings,
    agency_membership_count: _count.agencyMemberships
  }));
  return res.json({ success: true, pagination: pagination(page, limit, totalItems), totalItems, count: usersWithCounts.length, users: usersWithCounts });
};

export const getAdminUser: RequestHandler = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, username: true, email: true, phone: true, role: true, subscription: true, subscription_expiry: true, email_verified: true, suspended_at: true, suspension_reason: true, created_at: true, updated_at: true, createdListings: { select: { id: true, title: true, status: true, is_published: true, verified: true, created_at: true }, orderBy: { created_at: 'desc' }, take: 50 }, agencyMemberships: { include: { agency: { select: { id: true, name: true, status: true } } } } }
  });
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  return res.json({ success: true, user });
};

export const updateAdminUserRole: RequestHandler = async (req, res) => {
  const targetId = req.params.id;
  const role = req.body?.role;
  if (!['PRIVATE', 'AGENT', 'AGENCY_OWNER', 'ADMIN'].includes(role)) return res.status(400).json({ success: false, error: 'Invalid role' });
  if (targetId === actorId(req as AdminRequest)) return res.status(400).json({ success: false, error: 'Administrators cannot change their own role' });
  const existing = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } });
  if (!existing) return res.status(404).json({ success: false, error: 'User not found' });
  const user = await prisma.user.update({ where: { id: targetId }, data: { role, updated_at: new Date() }, select: { id: true, username: true, email: true, role: true } });
  await audit(req as AdminRequest, 'change_user_role', 'user', targetId, { from: existing.role, to: role });
  return res.json({ success: true, user });
};

export const suspendAdminUser: RequestHandler = async (req, res) => {
  const targetId = req.params.id;
  if (targetId === actorId(req as AdminRequest)) return res.status(400).json({ success: false, error: 'Administrators cannot suspend themselves' });
  const existing = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!existing) return res.status(404).json({ success: false, error: 'User not found' });
  const user = await prisma.user.update({ where: { id: targetId }, data: { suspended_at: new Date(), suspension_reason: typeof req.body?.reason === 'string' ? req.body.reason.trim() : null, updated_at: new Date() }, select: { id: true, username: true, suspended_at: true, suspension_reason: true } });
  await audit(req as AdminRequest, 'suspend_user', 'user', targetId, { reason: user.suspension_reason });
  return res.json({ success: true, user });
};

export const unsuspendAdminUser: RequestHandler = async (req, res) => {
  const targetId = req.params.id;
  const existing = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!existing) return res.status(404).json({ success: false, error: 'User not found' });
  const user = await prisma.user.update({ where: { id: targetId }, data: { suspended_at: null, suspension_reason: null, updated_at: new Date() }, select: { id: true, username: true, suspended_at: true, suspension_reason: true } });
  await audit(req as AdminRequest, 'unsuspend_user', 'user', targetId);
  return res.json({ success: true, user });
};

export const getAdminListings: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pageValues(req as AdminRequest);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const where = { ...(req.query.status ? { status: String(req.query.status) as 'draft' | 'active' | 'archived' | 'sold' } : {}), ...(req.query.verified === 'true' ? { verified: true } : req.query.verified === 'false' ? { verified: false } : {}), ...(req.query.published === 'true' ? { is_published: true } : req.query.published === 'false' ? { is_published: false } : {}), ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' as const } }, { creator: { username: { contains: search, mode: 'insensitive' as const } } }] } : {}) };
  const [totalItems, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' }, include: { creator: { select: { id: true, username: true, email: true } }, assignedAgent: { select: { id: true, username: true, email: true } }, agency: { select: { id: true, name: true, status: true } } } })
  ]);
  return res.json({ success: true, pagination: pagination(page, limit, totalItems), totalItems, count: listings.length, listings });
};

export const getAdminListing: RequestHandler = async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: Number(req.params.id) }, include: { creator: { select: { id: true, username: true, email: true, phone: true } }, assignedAgent: { select: { id: true, username: true, email: true, phone: true } }, agency: true } });
  if (!listing) return res.status(404).json({ success: false, error: 'Listing not found' });
  return res.json({ success: true, listing });
};

export const updateAdminListing: RequestHandler = async (req, res) => {
  const listingId = Number(req.params.id);
  const data: { verified?: boolean; is_published?: boolean; status?: 'draft' | 'active' | 'archived' | 'sold' } = {};
  if (typeof req.body?.verified === 'boolean') data.verified = req.body.verified;
  if (typeof req.body?.is_published === 'boolean') data.is_published = req.body.is_published;
  if (['draft', 'active', 'archived', 'sold'].includes(req.body?.status)) data.status = req.body.status;
  if (Object.keys(data).length === 0) return res.status(400).json({ success: false, error: 'At least one valid listing moderation field is required' });
  const existing = await prisma.listing.findUnique({ where: { id: listingId }, select: { verified: true, is_published: true, status: true } });
  if (!existing) return res.status(404).json({ success: false, error: 'Listing not found' });
  const listing = await prisma.listing.update({ where: { id: listingId }, data: { ...data, updated_at: new Date() }, select: { id: true, title: true, verified: true, is_published: true, status: true } });
  await audit(req as AdminRequest, 'moderate_listing', 'listing', listingId, { from: existing, to: data });
  return res.json({ success: true, listing });
};

export const getAdminAuditLogs: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pageValues(req as AdminRequest);
  const where = { ...(typeof req.query.action === 'string' ? { action: req.query.action } : {}), ...(typeof req.query.entity_type === 'string' ? { entity_type: req.query.entity_type } : {}) };
  const [totalItems, logs] = await Promise.all([prisma.auditLog.count({ where }), prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' }, include: { actor: { select: { id: true, username: true } } } })]);
  return res.json({ success: true, pagination: pagination(page, limit, totalItems), totalItems, count: logs.length, audit_logs: logs });
};

export const reviewAdminAgency: RequestHandler = async (req, res, next) => {
  return reviewAgencyApplication(req, res, next);
};

export const updateAdminAgencyStatus: RequestHandler = async (req, res) => {
  const adminId = String((req as AdminRequest).user?.user_id);
  const agencyId = Number(req.params.id);
  const status = req.body?.status;
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : null;
  const validStatuses = ['DRAFT', 'UNDER_REVIEW', 'ACTIVE', 'REJECTED'] as const;

  if (!Number.isInteger(agencyId)) return res.status(400).json({ success: false, error: 'Invalid agency id' });
  if (!validStatuses.includes(status)) return res.status(400).json({ success: false, error: 'Invalid agency status' });
  if ((status === 'REJECTED' || status === 'DRAFT') && !note) {
    return res.status(400).json({ success: false, error: 'A reason is required for this status change' });
  }

  const agency = await prisma.$transaction(async (tx) => {
    const updated = await tx.agency.updateMany({
      where: { id: agencyId },
      data: {
        status,
        is_active: status === 'ACTIVE',
        ...(status === 'ACTIVE' ? { reviewed_at: new Date(), reviewed_by_user_id: adminId } : {}),
        ...(note ? { review_note: note } : {}),
        updated_at: new Date()
      }
    });
    if (updated.count === 0) return null;

    const updatedAgency = await tx.agency.findUniqueOrThrow({ where: { id: agencyId } });
    if (status === 'ACTIVE') {
      await tx.user.update({ where: { id: updatedAgency.created_by_user_id }, data: { role: 'AGENT', updated_at: new Date() } });
    }
    return updatedAgency;
  });

  if (!agency) return res.status(404).json({ success: false, error: 'Agency not found' });
  await auditLogsDb.create({
    actor_id: adminId,
    action: 'change_agency_status',
    entity_type: 'agency',
    entity_id: agencyId,
    metadata: { status, note },
    request_id: req.requestId ?? null
  });
  return res.json({ success: true, agency });
};

export const getAdminAgencies: RequestHandler = async (req, res) => {
  const { page, limit, skip } = pageValues(req as AdminRequest);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const where = { ...(status ? { status: status as 'DRAFT' | 'UNDER_REVIEW' | 'ACTIVE' | 'REJECTED' } : {}), ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { slug: { contains: search, mode: 'insensitive' as const } }] } : {}) };
  const [totalItems, agencies] = await Promise.all([
    prisma.agency.count({ where }),
    prisma.agency.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' }, include: { creator: { select: { id: true, username: true, email: true } }, _count: { select: { agents: true, documents: true } } } })
  ]);
  const agenciesWithCounts = await Promise.all(agencies.map(async ({ _count, ...agency }) => ({
    ...agency,
    agent_count: _count.agents,
    listing_count: await prisma.listing.count({ where: { agency_id: agency.id, deleted_at: null } }),
    document_count: _count.documents
  })));
  return res.json({ success: true, pagination: pagination(page, limit, totalItems), totalItems, count: agenciesWithCounts.length, agencies: agenciesWithCounts });
};

export const getAdminAgency: RequestHandler = async (req, res) => {
  const agency = await prisma.agency.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      creator: { select: { id: true, username: true, email: true, phone: true, role: true } },
      reviewer: { select: { id: true, username: true } },
      documents: {
        select: { id: true, document_type: true, object_key: true, file_name: true, content_type: true, upload_confirmed: true, created_at: true }
      },
      agents: {
        select: {
          id: true,
          user_id: true,
          joined_at: true,
          user: { select: { username: true, email: true, phone: true, role: true } }
        }
      },
      _count: { select: { listings: true, agents: true, documents: true } }
    }
  });
  if (!agency) return res.status(404).json({ success: false, error: 'Agency not found' });

  const [agentRows, listingCount] = await Promise.all([
    Promise.all(agency.agents.map(async (agent) => ({
      id: String(agent.id),
      user_id: agent.user_id,
      username: agent.user.username,
      email: agent.user.email,
      phone: agent.user.phone,
      role: agent.user.role,
      joined_at: agent.joined_at,
      listing_count: await prisma.listing.count({ where: { agency_id: agency.id, user_id: agent.user_id, deleted_at: null } })
    }))),
    prisma.listing.count({ where: { agency_id: agency.id, deleted_at: null } })
  ]);

  const { _count, documents, agents, ...agencyDetails } = agency;
  return res.json({
    success: true,
    agency: {
      ...agencyDetails,
      agent_count: _count.agents,
      listing_count: listingCount,
      document_count: _count.documents,
      documents: documents.map((document) => ({
        id: document.id,
        type: document.document_type,
        name: document.file_name,
        file_url: document.object_key,
        status: document.upload_confirmed ? 'verified' : 'pending',
        uploaded_at: document.created_at,
        content_type: document.content_type
      })),
      agents: agentRows
    }
  });
};