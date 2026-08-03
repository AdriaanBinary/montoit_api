import prisma from './prisma.js';

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function asListingStatus(value: unknown): 'draft' | 'active' | 'archived' | 'sold' {
  if (value === 'active') {
    return 'active';
  }
  if (value === 'archived') {
    return 'archived';
  }
  if (value === 'sold') {
    return 'sold';
  }

  return 'draft';
}

function toRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function toRecords(values: unknown[]): Record<string, unknown>[] {
  return values.map((value) => toRecord(value));
}

export interface ListingImageInsertResult {
  id: string;
  listing_id: number;
  object_key: string;
  sort_order: number;
  upload_confirmed: boolean;
  created_at: string;
}

export interface ListingImageRecord {
  id: string;
  listing_id: number;
  object_key: string;
  sort_order: number;
  upload_confirmed: boolean;
  created_at: string;
}

const listingsDb = {
  createListing: async function(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const created = await prisma.listing.create({
      data: {
        user_id: String(payload.user_id),
        title: asString(payload.title),
        description: asString(payload.description),
        property_type: asString(payload.property_type),
        bedrooms: asInteger(payload.bedrooms),
        bathrooms: asNumber(payload.bathrooms),
        property_size: asNumber(payload.property_size),
        amount: asNumber(payload.amount),
        currency: asString(payload.currency) ?? 'USD',
        features: asStringArray(payload.features),
        other: asStringArray(payload.other),
        status: asListingStatus(payload.status),
        sold: Boolean(payload.sold ?? false),
        region_id: asInteger(payload.region_id),
        city_id: asInteger(payload.city_id),
        municipality_id: asInteger(payload.municipality_id),
        neighborhood_id: asInteger(payload.neighborhood_id),
        is_published: Boolean(payload.is_published ?? false),
        verified: Boolean(payload.verified ?? false)
      }
    });

    return toRecord(created);
  },

  publishListing: async function(listingId: number, userId: string): Promise<Record<string, unknown> | null> {
    const existing = await prisma.listing.findFirst({
      where: {
        id: listingId,
        user_id: userId,
        deleted_at: null
      }
    });

    if (!existing) {
      return null;
    }

    const updated = await prisma.listing.update({
      where: { id: listingId },
      data: {
        status: 'active',
        is_published: true,
        updated_at: new Date()
      }
    });

    return toRecord(updated);
  },

  getOwnedListingById: async function(listingId: number, userId: string): Promise<Record<string, unknown> | null> {
    const listing = await prisma.listing.findFirst({
      where: {
        id: listingId,
        user_id: userId,
        deleted_at: null
      }
    });

    return listing ? toRecord(listing) : null;
  },

  getPublicListingById: async function(listingId: number): Promise<Record<string, unknown> | null> {
    const listing = await prisma.listing.findFirst({
      where: {
        id: listingId,
        status: 'active',
        is_published: true,
        deleted_at: null
      }
    });

    return listing ? toRecord(listing) : null;
  },

  ensureListingImagesTable: async function(): Promise<void> {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS listing_images (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        object_key TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        width INTEGER,
        height INTEGER,
        upload_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE listing_images
      ADD COLUMN IF NOT EXISTS upload_confirmed BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE listing_images
      ALTER COLUMN upload_confirmed SET DEFAULT FALSE
    `);
  },

  createListingImage: async function(
    listingId: number,
    objectKey: string,
    sortOrder: number
  ): Promise<ListingImageInsertResult> {
    const created = await prisma.listingImage.create({
      data: {
        listing_id: listingId,
        object_key: objectKey,
        sort_order: sortOrder,
        upload_confirmed: false
      }
    });

    return toRecord(created) as unknown as ListingImageInsertResult;
  },

  getListingImages: async function(listingId: number): Promise<ListingImageRecord[]> {
    const images = await prisma.listingImage.findMany({
      where: {
        listing_id: listingId,
        upload_confirmed: true
      },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }]
    });

    return JSON.parse(JSON.stringify(images)) as ListingImageRecord[];
  },

  getListingImageById: async function(listingId: number, imageId: string): Promise<ListingImageRecord | null> {
    const image = await prisma.listingImage.findFirst({
      where: {
        listing_id: listingId,
        id: imageId
      }
    });

    return image ? (toRecord(image) as unknown as ListingImageRecord) : null;
  },

  confirmListingImageUpload: async function(
    listingId: number,
    imageId: string
  ): Promise<ListingImageRecord | null> {
    const image = await prisma.listingImage.findFirst({
      where: {
        listing_id: listingId,
        id: imageId
      }
    });

    if (!image) {
      return null;
    }

    const updated = await prisma.listingImage.update({
      where: { id: imageId },
      data: {
        upload_confirmed: true
      }
    });

    return toRecord(updated) as unknown as ListingImageRecord;
  },

  countPrivateListings: async function(userId: string): Promise<number> {
    const total = await prisma.listing.count({
      where: {
        user_id: userId,
        deleted_at: null
      }
    });

    return total;
  },

  getPrivateListings: async function(
    userId: string,
    limit: number,
    offset: number
  ): Promise<Record<string, unknown>[]> {
    const listings = await prisma.listing.findMany({
      where: {
        user_id: userId,
        deleted_at: null
      },
      orderBy: {
        created_at: 'desc'
      },
      take: limit,
      skip: offset
    });

    return toRecords(listings);
  },

  countPublicListings: async function(where: Record<string, unknown>): Promise<number> {
    const total = await prisma.listing.count({
      where
    });

    return total;
  },

  getPublicListings: async function(
    limit: number,
    offset: number,
    where: Record<string, unknown>,
    orderBy: Record<string, unknown>
  ): Promise<Record<string, unknown>[]> {
    const listings = await prisma.listing.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset
    });

    return toRecords(listings);
  }
};

export default listingsDb;
