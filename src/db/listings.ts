import MontoitDB from './pool.js';

const createListingColumns = [
  'user_id',
  'title',
  'description',
  'property_type',
  'bedrooms',
  'bathrooms',
  'property_size',
  'amount',
  'currency',
  'features',
  'other',
  'status',
  'sold',
  'region_id',
  'city_id',
  'municipality_id',
  'neighborhood_id',
  'is_published',
  'verified'
] as const;

export interface ListingImageInsertResult {
  id: string;
  listing_id: number;
  object_key: string;
  sort_order: number;
  created_at: string;
}

const listingsDb = {
  createListing: async function(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const placeholders = createListingColumns.map((_column, index) => `$${index + 1}`).join(', ');
    const values = createListingColumns.map((column) => payload[column]);

    const result = await MontoitDB.query(
      `INSERT INTO listings (${createListingColumns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );

    return result.rows[0] as Record<string, unknown>;
  },

  publishListing: async function(listingId: number, userId: string): Promise<Record<string, unknown> | null> {
    const result = await MontoitDB.query(
      `UPDATE listings
       SET status = 'active', is_published = TRUE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
       RETURNING *`,
      [listingId, userId]
    );

    return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
  },

  getOwnedListingById: async function(listingId: number, userId: string): Promise<Record<string, unknown> | null> {
    const result = await MontoitDB.query(
      `SELECT * FROM listings
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [listingId, userId]
    );

    return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
  },

  getPublicListingById: async function(listingId: number): Promise<Record<string, unknown> | null> {
    const result = await MontoitDB.query(
      `SELECT * FROM listings
       WHERE id = $1
         AND status = 'active'
         AND is_published = TRUE
         AND deleted_at IS NULL`,
      [listingId]
    );

    return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
  },

  ensureListingImagesTable: async function(): Promise<void> {
    await MontoitDB.query(`
      CREATE TABLE IF NOT EXISTS listing_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        object_key TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        width INTEGER,
        height INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  },

  createListingImage: async function(
    listingId: number,
    objectKey: string,
    sortOrder: number
  ): Promise<ListingImageInsertResult> {
    const result = await MontoitDB.query(
      `INSERT INTO listing_images (listing_id, object_key, sort_order, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, listing_id, object_key, sort_order, created_at`,
      [listingId, objectKey, sortOrder]
    );

    return result.rows[0] as ListingImageInsertResult;
  },

  getListingImageObjectKeys: async function(listingId: number): Promise<string[]> {
    const result = await MontoitDB.query(
      `SELECT object_key
       FROM listing_images
       WHERE listing_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [listingId]
    );

    return result.rows.map((row) => String(row.object_key));
  },

  countPrivateListings: async function(userId: string): Promise<number> {
    const result = await MontoitDB.query(
      `SELECT COUNT(*)::int AS total
       FROM listings
       WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    return Number(result.rows[0]?.total ?? 0);
  },

  getPrivateListings: async function(
    userId: string,
    limit: number,
    offset: number
  ): Promise<Record<string, unknown>[]> {
    const result = await MontoitDB.query(
      `SELECT *
       FROM listings
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows as Record<string, unknown>[];
  },

  countPublicListings: async function(): Promise<number> {
    const result = await MontoitDB.query(
      `SELECT COUNT(*)::int AS total
       FROM listings
       WHERE status = 'active' AND is_published = TRUE AND deleted_at IS NULL`
    );

    return Number(result.rows[0]?.total ?? 0);
  },

  getPublicListings: async function(limit: number, offset: number): Promise<Record<string, unknown>[]> {
    const result = await MontoitDB.query(
      `SELECT *
       FROM listings
       WHERE status = 'active' AND is_published = TRUE AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows as Record<string, unknown>[];
  }
};

export default listingsDb;
