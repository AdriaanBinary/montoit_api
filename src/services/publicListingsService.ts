import { Request, RequestHandler } from 'express';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import listingsDb from '../db/listings.js';
import { addListingOptions } from '../db/listingOptions.js';
import { addListingGeneralFees } from '../db/generalFees.js';

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
  optionIds?: string[] | string | number[] | number;
  optionMatch?: 'any' | 'all';
  region_id?: string[] | string | number[] | number;
  city_id?: string[] | string | number[] | number;
  municipality_id?: string[] | string | number[] | number;
  neighborhood_id?: string[] | string | number[] | number;
  sortBy?: 'price_asc' | 'price_desc' | 'date_desc' | 'date_asc';
}

interface ParsedBedrooms {
  exact?: number;
  min?: number;
}

type ListingWhere = Record<string, unknown>;
type ListingOrderBy = Record<string, unknown>;

type ListingRecord = Record<string, unknown>;
type ListingImageRecord = Record<string, unknown>;

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

async function buildPresignedGetUrl(bucket: string, key: string): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key
  });

  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

function asListingImages(value: unknown): ListingImageRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is ListingImageRecord =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      )
    : [];
}

export async function attachPublicImageUrls(listings: ListingRecord[]): Promise<ListingRecord[]> {
  const bucketName = process.env.AWS_S3_BUCKET ?? 'property-images';

  return Promise.all(
    listings.map(async (listing) => {
      const images = asListingImages(listing.images);

      if (images.length === 0) {
        return listing;
      }

      const hydratedImages = await Promise.all(
        images.map(async (image) => {
          const objectKey = typeof image.object_key === 'string' ? image.object_key : null;

          if (!objectKey) {
            return image;
          }

          try {
            const url = await buildPresignedGetUrl(bucketName, objectKey);
            return {
              ...image,
              url
            };
          } catch (error: unknown) {
            console.error('Failed to build listing image URL:', error);
            return {
              ...image,
              url: null
            };
          }
        })
      );

      return {
        ...listing,
        images: hydratedImages
      };
    })
  );
}

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

function toPositiveIntArray(value: unknown): number[] {
  if (value === null || value === undefined || value === '') {
    return [];
  }

  const entries = Array.isArray(value) ? value : [value];
  const normalized = entries
    .flatMap((entry) => {
      if (typeof entry === 'number' && Number.isInteger(entry) && entry > 0) {
        return [entry];
      }

      if (typeof entry === 'string') {
        const parsed = Number(entry.trim());
        return Number.isInteger(parsed) && parsed > 0 ? [parsed] : [];
      }

      return [];
    })
    .filter((value, index, array) => array.indexOf(value) === index);

  return normalized;
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

function toStoredPropertyType(value: string): string {
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
      return value;
  }
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

export function buildPublicListingsWhere(query: PublicListingsRequestQuery): ListingWhere {
  const q = query.q?.trim();
  const propertyTypes = toPropertyTypes(query.propertyType);
  const minPrice = toOptionalNumber(query.minPrice);
  const maxPrice = toOptionalNumber(query.maxPrice);
  const bedrooms = toParsedBedrooms(query.bedrooms);
  const bathrooms = toOptionalNumber(query.bathrooms);
  const parkingSpaces = toOptionalNumber(query.parkingSpaces);
  const parkingType = query.parkingType?.trim();
  const minLivingArea = toOptionalNumber(query.minLivingArea);
  const maxLivingArea = toOptionalNumber(query.maxLivingArea);
  const minLandSize = toOptionalNumber(query.minLandSize);
  const maxLandSize = toOptionalNumber(query.maxLandSize);
  const furnished = toOptionalBoolean(query.furnished);
  const availableFrom = query.availableFrom ? new Date(query.availableFrom) : undefined;
  const rentalTerm = query.rentalTerm?.trim();
  const petFriendly = toOptionalBoolean(query.petFriendly);
  const garden = toOptionalBoolean(query.garden);
  const pool = toOptionalBoolean(query.pool);
  const flatlet = toOptionalBoolean(query.flatlet);
  const retirement = toOptionalBoolean(query.retirement);
  const onShow = toOptionalBoolean(query.onShow);
  const securityEstate = toOptionalBoolean(query.securityEstate);
  const optionIds = toPositiveIntArray(query.optionIds);
  const optionMatch = query.optionMatch ?? 'any';

  const where: ListingWhere = {
    status: 'active',
    is_published: true,
    deleted_at: null
  };

  const andFilters: ListingWhere[] = [];

  if (q) {
    andFilters.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { location: { contains: q, mode: 'insensitive' } }
      ]
    });
  }

  const locationFilters: ListingWhere[] = [];
  const regionIds = toPositiveIntArray(query.region_id);
  const cityIds = toPositiveIntArray(query.city_id);
  const municipalityIds = toPositiveIntArray(query.municipality_id);
  const neighborhoodIds = toPositiveIntArray(query.neighborhood_id);

  if (regionIds.length > 0) {
    locationFilters.push({ region_id: { in: regionIds } });
  }

  if (cityIds.length > 0) {
    locationFilters.push({ city_id: { in: cityIds } });
  }

  if (municipalityIds.length > 0) {
    locationFilters.push({ municipality_id: { in: municipalityIds } });
  }

  if (neighborhoodIds.length > 0) {
    locationFilters.push({ neighborhood_id: { in: neighborhoodIds } });
  }

  if (locationFilters.length > 0) {
    andFilters.push({ OR: locationFilters });
  }

  if (propertyTypes.length > 0) {
    where.property_type = { in: propertyTypes.map(toStoredPropertyType) };
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

  if (optionIds.length > 0) {
    if (optionMatch === 'all') {
      for (const optionId of optionIds) {
        andFilters.push({
          optionSelections: {
            some: { option_id: optionId }
          }
        });
      }
    } else {
      andFilters.push({
        optionSelections: {
          some: { option_id: { in: optionIds } }
        }
      });
    }
  }

  if (andFilters.length > 0) {
    where.AND = andFilters;
  }

  return where;
}

export const getPublicListings: RequestHandler = async (req, res) => {
  const typedReq = req as Request<{}, {}, {}, PublicListingsRequestQuery>;
  const currentPage = toPositiveInt(typedReq.query.page, 1);
  const itemsPerPage = Math.min(toPositiveInt(typedReq.query.limit, 20), 100);
  const where = buildPublicListingsWhere(typedReq.query);

  const orderBy = toSortBy(typedReq.query.sortBy);

  try {
    const totalItems = await listingsDb.countPublicListings(where);
    const pages = totalItems === 0 ? 1 : Math.ceil(totalItems / itemsPerPage);
    const safePage = Math.min(currentPage, pages);
    const safeOffset = (safePage - 1) * itemsPerPage;

    const listings = await listingsDb.getPublicListings(itemsPerPage, safeOffset, where, orderBy);
    const listingsWithOptions = await Promise.all(
      listings.map(async (listing) => addListingGeneralFees(await addListingOptions(listing)))
    );
    const hydratedListings = await attachPublicImageUrls(listingsWithOptions);

    return res.json({
      success: true,
      pagination: {
        currentpage: safePage,
        pages,
        itemsPerPage
      },
      totalItems,
      count: hydratedListings.length,
      listings: hydratedListings
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
