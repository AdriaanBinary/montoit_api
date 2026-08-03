import MontoitDB from './pool.js';
import { PoolClient } from 'pg';

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

interface UserRoleRow {
  role: string;
}

interface IdRow {
  id: number;
}

function uniqueAgencyIds(agencyIds: number[]): number[] {
  return [...new Set(agencyIds)];
}

async function ensureAgenciesExist(client: PoolClient, agencyIds: number[]): Promise<void> {
  const uniqueIds = uniqueAgencyIds(agencyIds);
  const result = await client.query<IdRow>('SELECT id FROM agencies WHERE id = ANY($1::int[])', [uniqueIds]);
  const found = new Set(result.rows.map((row) => row.id));
  const missing = uniqueIds.filter((id) => !found.has(id));

  if (missing.length > 0) {
    throw new Error(`The following agencies do not exist: ${missing.join(', ')}`);
  }
}

async function setUserAgencyLinks(
  client: PoolClient,
  userId: string,
  agencyIds: number[],
  primaryAgencyId: number
): Promise<number> {
  const uniqueIds = uniqueAgencyIds(agencyIds);

  await client.query(
    `UPDATE agency_agents
     SET is_primary = FALSE,
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );

  const upsertResult = await client.query(
    `INSERT INTO agency_agents (agency_id, user_id, is_primary, joined_at, created_at, updated_at)
     SELECT agency_id,
            $2,
            CASE WHEN agency_id = $3 THEN TRUE ELSE FALSE END,
            NOW(),
            NOW(),
            NOW()
     FROM UNNEST($1::int[]) AS agency_id
     ON CONFLICT (agency_id, user_id)
     DO UPDATE
       SET is_primary = EXCLUDED.is_primary,
           updated_at = NOW()
     RETURNING agency_id`,
    [uniqueIds, userId, primaryAgencyId]
  );

  return upsertResult.rowCount ?? 0;
}

async function convertPrivateListingsToAgent(client: PoolClient, userId: string, primaryAgencyId: number): Promise<number> {
  const result = await client.query(
    `UPDATE listings
     SET listing_owner_type = 'AGENT',
         agency_id = COALESCE(agency_id, $2),
         updated_at = NOW()
     WHERE user_id = $1
       AND deleted_at IS NULL
       AND COALESCE(listing_owner_type::text, 'PRIVATE') = 'PRIVATE'`,
    [userId, primaryAgencyId]
  );

  return result.rowCount ?? 0;
}

const agenciesDb = {
  createAgency: async function(payload: AgencyCreatePayload): Promise<Record<string, unknown>> {
    const result = await MontoitDB.query(
      `INSERT INTO agencies (
         name,
         slug,
         description,
         email,
         phone,
         website,
         address_line1,
         address_line2,
         region_id,
         city_id,
         municipality_id,
         neighborhood_id,
         created_by_user_id,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
       RETURNING *`,
      [
        payload.name,
        payload.slug,
        payload.description,
        payload.email,
        payload.phone,
        payload.website,
        payload.address_line1,
        payload.address_line2,
        payload.region_id,
        payload.city_id,
        payload.municipality_id,
        payload.neighborhood_id,
        payload.created_by_user_id
      ]
    );

    return result.rows[0] as Record<string, unknown>;
  },

  promoteUserToAgent: async function(payload: PromoteUserToAgentPayload): Promise<PromoteUserToAgentResult> {
    const client = await MontoitDB.connect();

    try {
      await client.query('BEGIN');

      const userResult = await client.query<UserRoleRow>('SELECT role FROM users WHERE id = $1 FOR UPDATE', [payload.userId]);
      const user = userResult.rows[0];

      if (!user) {
        throw new Error('User not found');
      }

      await ensureAgenciesExist(client, payload.agencyIds);

      const linkedCount = await setUserAgencyLinks(client, payload.userId, payload.agencyIds, payload.primaryAgencyId);

      const roleChanged = user.role !== 'AGENT';
      if (roleChanged) {
        await client.query('UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1', [payload.userId, 'AGENT']);
      }

      const convertedListings = await convertPrivateListingsToAgent(client, payload.userId, payload.primaryAgencyId);

      await client.query('COMMIT');

      return {
        user_id: payload.userId,
        role_changed: roleChanged,
        linked_agency_count: linkedCount,
        converted_listing_count: convertedListings,
        primary_agency_id: payload.primaryAgencyId
      };
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

export default agenciesDb;
