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

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
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

function asListingType(value: unknown): 'SALE' | 'RENT' {
  if (value === 'rent' || value === 'RENT') {
    return 'RENT';
  }

  return 'SALE';
}

function asPropertyType(value: unknown):
  | 'HOUSE'
  | 'APARTMENT_FLAT'
  | 'VILLA'
  | 'COMMERCIAL'
  | 'INDUSTRIAL'
  | 'VACANT_LAND'
  | null {
  switch (value) {
    case 'House':
      return 'HOUSE';
    case 'Apartment / Flat':
      return 'APARTMENT_FLAT';
    case 'Villa':
      return 'VILLA';
    case 'Commercial':
      return 'COMMERCIAL';
    case 'Industrial':
      return 'INDUSTRIAL';
    case 'Vacant Land':
      return 'VACANT_LAND';
    default:
      return null;
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function toRecords(values: unknown[]): Record<string, unknown>[] {
  return values.map((value) => toRecord(value));
}

const listingCreatorInclude = {
  creator: {
    select: {
      id: true,
      username: true,
      role: true,
      email: true,
      phone: true
    }
  }
};

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
        property_type: asPropertyType(payload.property_type),
        listing_type: asListingType(payload.listing_type),
        bedrooms: asInteger(payload.bedrooms),
        bathrooms: asNumber(payload.bathrooms),
        property_size: asNumber(payload.property_size),
        amount: asNumber(payload.amount),
        currency: asString(payload.currency) ?? 'XAF',
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
      },
      include: listingCreatorInclude
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
      },
      include: listingCreatorInclude
    });

    return toRecord(updated);
  },

  getListingById: async function(listingId: number): Promise<Record<string, unknown> | null> {
    const listing = await prisma.listing.findFirst({
      where: {
        id: listingId,
        deleted_at: null
      },
      include: listingCreatorInclude
    });

    return listing ? toRecord(listing) : null;
  },

  getOwnedListingById: async function(listingId: number, userId: string): Promise<Record<string, unknown> | null> {
    const listing = await prisma.listing.findFirst({
      where: {
        id: listingId,
        user_id: userId,
        deleted_at: null
      },
      include: listingCreatorInclude
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
      },
      include: listingCreatorInclude
    });

    return listing ? toRecord(listing) : null;
  },

  updateOwnedListing: async function(
    listingId: number,
    userId: string,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
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

    const data: Record<string, unknown> = {
      updated_at: new Date()
    };

    if (payload.title !== undefined) data.title = typeof payload.title === 'string' ? payload.title : null;
    if (payload.description !== undefined) data.description = typeof payload.description === 'string' ? payload.description : null;
    if (payload.location !== undefined) data.location = typeof payload.location === 'string' ? payload.location : null;
    if (payload.property_type !== undefined) data.property_type = asPropertyType(payload.property_type);
    if (payload.listing_type !== undefined) data.listing_type = asListingType(payload.listing_type);
    if (payload.bedrooms !== undefined) data.bedrooms = asInteger(payload.bedrooms);
    if (payload.bathrooms !== undefined) data.bathrooms = asNumber(payload.bathrooms);
    if (payload.property_size !== undefined) data.property_size = asNumber(payload.property_size);
    if (payload.living_area !== undefined) data.living_area = asNumber(payload.living_area);
    if (payload.land_size !== undefined) data.land_size = asNumber(payload.land_size);
    if (payload.amount !== undefined) data.amount = asNumber(payload.amount);
    if (payload.furnished !== undefined) data.furnished = typeof payload.furnished === 'boolean' ? payload.furnished : null;
    if (payload.available_from !== undefined) data.available_from = asDate(payload.available_from);
    if (payload.rental_term !== undefined) data.rental_term = typeof payload.rental_term === 'string' ? payload.rental_term : null;
    if (payload.parking_spaces !== undefined) data.parking_spaces = asInteger(payload.parking_spaces);
    if (payload.parking_type !== undefined) data.parking_type = typeof payload.parking_type === 'string' ? payload.parking_type : null;
    if (payload.pet_friendly !== undefined) data.pet_friendly = typeof payload.pet_friendly === 'boolean' ? payload.pet_friendly : null;
    if (payload.garden !== undefined) data.garden = typeof payload.garden === 'boolean' ? payload.garden : null;
    if (payload.pool !== undefined) data.pool = typeof payload.pool === 'boolean' ? payload.pool : null;
    if (payload.flatlet !== undefined) data.flatlet = typeof payload.flatlet === 'boolean' ? payload.flatlet : null;
    if (payload.retirement !== undefined) data.retirement = typeof payload.retirement === 'boolean' ? payload.retirement : null;
    if (payload.on_show !== undefined) data.on_show = typeof payload.on_show === 'boolean' ? payload.on_show : null;
    if (payload.security_estate !== undefined) data.security_estate = typeof payload.security_estate === 'boolean' ? payload.security_estate : null;
    if (payload.currency !== undefined) data.currency = typeof payload.currency === 'string' ? payload.currency : null;
    if (payload.features !== undefined) data.features = asStringArray(payload.features);
    if (payload.other !== undefined) data.other = asStringArray(payload.other);
    if (payload.status !== undefined) data.status = asListingStatus(payload.status);
    if (payload.sold !== undefined) data.sold = typeof payload.sold === 'boolean' ? payload.sold : false;
    if (payload.region_id !== undefined) data.region_id = asInteger(payload.region_id);
    if (payload.city_id !== undefined) data.city_id = asInteger(payload.city_id);
    if (payload.municipality_id !== undefined) data.municipality_id = asInteger(payload.municipality_id);
    if (payload.neighborhood_id !== undefined) data.neighborhood_id = asInteger(payload.neighborhood_id);
    if (payload.is_published !== undefined) data.is_published = typeof payload.is_published === 'boolean' ? payload.is_published : false;
    if (payload.verified !== undefined) data.verified = typeof payload.verified === 'boolean' ? payload.verified : false;

    const updated = await prisma.listing.update({
      where: { id: listingId },
      data,
      include: listingCreatorInclude
    });

    return toRecord(updated);
  },

  archiveOwnedListing: async function(listingId: number, userId: string): Promise<Record<string, unknown> | null> {
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

    const archived = await prisma.listing.update({
      where: { id: listingId },
      data: {
        status: 'archived',
        is_published: false,
        deleted_at: new Date(),
        updated_at: new Date()
      },
      include: listingCreatorInclude
    });

    return toRecord(archived);
  },

  ensureListingEnquiriesTable: async function(): Promise<void> {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS listing_enquiries (
        id SERIAL PRIMARY KEY,
        listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
        listing_owner_user_id VARCHAR(16) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        submitted_by_user_id VARCHAR(16) REFERENCES users(id) ON DELETE SET NULL,
        name VARCHAR(160) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  },

  createListingEnquiry: async function(payload: {
    listing_id: number;
    listing_owner_user_id: string;
    submitted_by_user_id?: string | null;
    name: string;
    email: string;
    phone?: string | null;
    message: string;
  }): Promise<Record<string, unknown>> {
    const created = await prisma.listingEnquiry.create({
      data: {
        listing_id: payload.listing_id,
        listing_owner_user_id: payload.listing_owner_user_id,
        submitted_by_user_id: payload.submitted_by_user_id ?? null,
        name: payload.name,
        email: payload.email,
        phone: payload.phone ?? null,
        message: payload.message
      }
    });

    return toRecord(created);
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
      skip: offset,
      include: listingCreatorInclude
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
      skip: offset,
      include: listingCreatorInclude
    });

    const listingIds = listings
      .map((listing: { id: unknown }) => listing.id)
      .filter((id: unknown): id is number => Number.isInteger(id));

    if (listingIds.length === 0) {
      return toRecords(listings).map((listing) => ({ ...listing, images: [] }));
    }

    const listingImages = await prisma.listingImage.findMany({
      where: {
        listing_id: { in: listingIds },
        upload_confirmed: true
      },
      orderBy: [{ listing_id: 'asc' }, { sort_order: 'asc' }, { created_at: 'asc' }]
    });

    const imagesByListing = new Map<number, Record<string, unknown>[]>();

    for (const image of listingImages) {
      const images = imagesByListing.get(image.listing_id) ?? [];

      if (images.length < 5) {
        images.push(toRecord(image));
        imagesByListing.set(image.listing_id, images);
      }
    }

    return toRecords(listings).map((listing) => {
      const listingId = typeof listing.id === 'number' ? listing.id : Number(listing.id);
      const images = Number.isInteger(listingId) ? (imagesByListing.get(listingId) ?? []) : [];

      return {
        ...listing,
        images
      };
    });
  }
};

export default listingsDb;
