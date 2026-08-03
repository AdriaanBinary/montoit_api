import { Request, RequestHandler } from 'express';
import listingsDb from '../db/listings.js';

interface PublicListingsRequestQuery {
  page?: string | number;
  limit?: string | number;
  q?: string;
  propertyType?: string[] | string;
  minPrice?: string | number;
  maxPrice?: string | number;
  bedrooms?: string | number;
  bathrooms?: string | number;
  parkingSpaces?: string | number;
  parkingType?: string;
  minLivingArea?: string | number;
  maxLivingArea?: string | number;
  minLandSize?: string | number;
  maxLandSize?: string | number;
  furnished?: string | boolean;
  availableFrom?: string;
  rentalTerm?: string;
  petFriendly?: string | boolean;
  garden?: string | boolean;
  pool?: string | boolean;
  flatlet?: string | boolean;
  retirement?: string | boolean;
  onShow?: string | boolean;
  securityEstate?: string | boolean;
  sortBy?: 'price_asc' | 'price_desc' | 'date_desc' | 'date_asc';
}

interface ParsedBedrooms {
  exact?: number;
  min?: number;
}

type ListingWhere = Record<string, unknown>;
type ListingOrderBy = Record<string, unknown>;

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return undefined;
}

function toPropertyTypes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : []))
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      )
    );
  }

  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      )
    );
  }

  return [];
}

function toParsedBedrooms(value: unknown): ParsedBedrooms {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return { exact: value };
  }

  if (typeof value !== 'string') {
    return {};
  }

  const trimmed = value.trim();
  if (/^\d+\+$/.test(trimmed)) {
    return { min: Number.parseInt(trimmed.slice(0, -1), 10) };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return { exact: parsed };
  }

  return {};
}

function toSortBy(sortBy: PublicListingsRequestQuery['sortBy']): ListingOrderBy {
  switch (sortBy) {
    case 'price_asc':
      return { amount: 'asc' };
    case 'price_desc':
      return { amount: 'desc' };
    case 'date_asc':
      return { created_at: 'asc' };
    case 'date_desc':
    default:
      return { created_at: 'desc' };
  }
}

export const getPublicListings: RequestHandler = async (req, res) => {
  const typedReq = req as Request<{}, {}, {}, PublicListingsRequestQuery>;
  const currentPage = toPositiveInt(typedReq.query.page, 1);
  const itemsPerPage = Math.min(toPositiveInt(typedReq.query.limit, 20), 100);

  const q = typedReq.query.q?.trim();
  const propertyTypes = toPropertyTypes(typedReq.query.propertyType);
  const minPrice = toOptionalNumber(typedReq.query.minPrice);
  const maxPrice = toOptionalNumber(typedReq.query.maxPrice);
  const bedrooms = toParsedBedrooms(typedReq.query.bedrooms);
  const bathrooms = toOptionalNumber(typedReq.query.bathrooms);
  const parkingSpaces = toOptionalNumber(typedReq.query.parkingSpaces);
  const parkingType = typedReq.query.parkingType?.trim();
  const minLivingArea = toOptionalNumber(typedReq.query.minLivingArea);
  const maxLivingArea = toOptionalNumber(typedReq.query.maxLivingArea);
  const minLandSize = toOptionalNumber(typedReq.query.minLandSize);
  const maxLandSize = toOptionalNumber(typedReq.query.maxLandSize);
  const furnished = toOptionalBoolean(typedReq.query.furnished);
  const availableFrom = typedReq.query.availableFrom ? new Date(typedReq.query.availableFrom) : undefined;
  const rentalTerm = typedReq.query.rentalTerm?.trim();
  const petFriendly = toOptionalBoolean(typedReq.query.petFriendly);
  const garden = toOptionalBoolean(typedReq.query.garden);
  const pool = toOptionalBoolean(typedReq.query.pool);
  const flatlet = toOptionalBoolean(typedReq.query.flatlet);
  const retirement = toOptionalBoolean(typedReq.query.retirement);
  const onShow = toOptionalBoolean(typedReq.query.onShow);
  const securityEstate = toOptionalBoolean(typedReq.query.securityEstate);

  const where: ListingWhere = {
    status: 'active',
    is_published: true,
    deleted_at: null
  };

  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { location: { contains: q, mode: 'insensitive' } }
    ];
  }

  if (propertyTypes.length > 0) {
    where.property_type = { in: propertyTypes };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.amount = {
      ...(minPrice !== undefined ? { gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { lte: maxPrice } : {})
    };
  }

  if (bedrooms.exact !== undefined) {
    where.bedrooms = bedrooms.exact;
  } else if (bedrooms.min !== undefined) {
    where.bedrooms = { gte: bedrooms.min };
  }

  if (bathrooms !== undefined) {
    where.bathrooms = bathrooms;
  }

  if (parkingSpaces !== undefined) {
    where.parking_spaces = parkingSpaces;
  }

  if (parkingType) {
    where.parking_type = { equals: parkingType, mode: 'insensitive' };
  }

  if (minLivingArea !== undefined || maxLivingArea !== undefined) {
    where.living_area = {
      ...(minLivingArea !== undefined ? { gte: minLivingArea } : {}),
      ...(maxLivingArea !== undefined ? { lte: maxLivingArea } : {})
    };
  }

  if (minLandSize !== undefined || maxLandSize !== undefined) {
    where.land_size = {
      ...(minLandSize !== undefined ? { gte: minLandSize } : {}),
      ...(maxLandSize !== undefined ? { lte: maxLandSize } : {})
    };
  }

  if (furnished !== undefined) {
    where.furnished = furnished;
  }

  if (availableFrom) {
    where.available_from = { lte: availableFrom };
  }

  if (rentalTerm) {
    where.rental_term = { equals: rentalTerm, mode: 'insensitive' };
  }

  if (petFriendly !== undefined) {
    where.pet_friendly = petFriendly;
  }

  if (garden !== undefined) {
    where.garden = garden;
  }

  if (pool !== undefined) {
    where.pool = pool;
  }

  if (flatlet !== undefined) {
    where.flatlet = flatlet;
  }

  if (retirement !== undefined) {
    where.retirement = retirement;
  }

  if (onShow !== undefined) {
    where.on_show = onShow;
  }

  if (securityEstate !== undefined) {
    where.security_estate = securityEstate;
  }

  const orderBy = toSortBy(typedReq.query.sortBy);

  try {
    const totalItems = await listingsDb.countPublicListings(where);
    const pages = totalItems === 0 ? 1 : Math.ceil(totalItems / itemsPerPage);
    const safePage = Math.min(currentPage, pages);
    const safeOffset = (safePage - 1) * itemsPerPage;

    const listings = await listingsDb.getPublicListings(itemsPerPage, safeOffset, where, orderBy);

    return res.json({
      success: true,
      pagination: {
        currentpage: safePage,
        pages,
        itemsPerPage
      },
      totalItems,
      count: listings.length,
      listings
    });
  } catch (error: unknown) {
    console.error('Get active listings error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch active listings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
