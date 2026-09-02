import prisma from './prisma.js';

export class LocationValidationError extends Error {}

export interface ListingLocationIds {
  region_id?: number | null;
  city_id?: number | null;
  municipality_id?: number | null;
  neighborhood_id?: number | null;
}

export interface LocationNeighborhood {
  id: number;
  name: string;
  aliases: string[];
}

export interface LocationMunicipality {
  id: number;
  name: string;
  neighborhoods: LocationNeighborhood[];
}

export interface LocationCity {
  id: number;
  name: string;
  municipalities: LocationMunicipality[];
}

export interface LocationRegion {
  id: number;
  name: string;
  cities: LocationCity[];
}

let initializationPromise: Promise<void> | null = null;

async function createLocationTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      geometry JSONB
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY,
      region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      geometry JSONB,
      CONSTRAINT unique_city_per_region UNIQUE (region_id, name)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS municipalities (
      id INTEGER PRIMARY KEY,
      city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      geometry JSONB,
      CONSTRAINT unique_municipality_per_city UNIQUE (city_id, name)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS neighborhoods (
      id SERIAL PRIMARY KEY,
      municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
      name VARCHAR(160) NOT NULL,
      aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT unique_neighborhood_per_municipality UNIQUE (municipality_id, name)
    )
  `);
}

export async function ensureCameroonLocationDataInitialized(): Promise<void> {
  // Real region/city/municipality/neighborhood data is populated via `npm run import:locations`
  // (scripts/importLocations.ts), sourced from geoBoundaries. This just guarantees tables exist.
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await createLocationTables();
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }

  await initializationPromise;
}

export async function validateListingLocationIds(locationIds: ListingLocationIds): Promise<void> {
  await ensureCameroonLocationDataInitialized();

  const regionId = locationIds.region_id ?? null;
  const cityId = locationIds.city_id ?? null;
  const municipalityId = locationIds.municipality_id ?? null;
  const neighborhoodId = locationIds.neighborhood_id ?? null;

  if (regionId !== null) {
    const regions = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
      'SELECT id FROM regions WHERE id = $1 LIMIT 1',
      regionId
    );

    if (regions.length === 0) {
      throw new LocationValidationError('Invalid region_id');
    }
  }

  if (cityId !== null) {
    const cities = await prisma.$queryRawUnsafe<Array<{ id: number; region_id: number }>>(
      'SELECT id, region_id FROM cities WHERE id = $1 LIMIT 1',
      cityId
    );

    const city = cities[0];
    if (!city) {
      throw new LocationValidationError('Invalid city_id');
    }

    if (regionId !== null && city.region_id !== regionId) {
      throw new LocationValidationError('city_id does not belong to region_id');
    }
  }

  if (municipalityId !== null) {
    const municipalities = await prisma.$queryRawUnsafe<Array<{ id: number; city_id: number }>>(
      'SELECT id, city_id FROM municipalities WHERE id = $1 LIMIT 1',
      municipalityId
    );

    const municipality = municipalities[0];
    if (!municipality) {
      throw new LocationValidationError('Invalid municipality_id');
    }

    if (cityId !== null && municipality.city_id !== cityId) {
      throw new LocationValidationError('municipality_id does not belong to city_id');
    }
  }

  if (neighborhoodId !== null) {
    const neighborhoods = await prisma.$queryRawUnsafe<Array<{ id: number; municipality_id: number }>>(
      'SELECT id, municipality_id FROM neighborhoods WHERE id = $1 LIMIT 1',
      neighborhoodId
    );

    const neighborhood = neighborhoods[0];
    if (!neighborhood) {
      throw new LocationValidationError('Invalid neighborhood_id');
    }

    if (municipalityId !== null && neighborhood.municipality_id !== municipalityId) {
      throw new LocationValidationError('neighborhood_id does not belong to municipality_id');
    }
  }
}

export async function getLocationHierarchyTree(): Promise<LocationRegion[]> {
  await ensureCameroonLocationDataInitialized();

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      region_id: number;
      region_name: string;
      city_id: number | null;
      city_name: string | null;
      municipality_id: number | null;
      municipality_name: string | null;
      neighborhood_id: number | null;
      neighborhood_name: string | null;
      neighborhood_aliases: string[] | null;
    }>
  >(`
    SELECT
      r.id AS region_id,
      r.name AS region_name,
      c.id AS city_id,
      c.name AS city_name,
      m.id AS municipality_id,
      m.name AS municipality_name,
      n.id AS neighborhood_id,
      n.name AS neighborhood_name,
      n.aliases AS neighborhood_aliases
    FROM regions r
    LEFT JOIN cities c ON c.region_id = r.id
    LEFT JOIN municipalities m ON m.city_id = c.id
    LEFT JOIN neighborhoods n ON n.municipality_id = m.id
    ORDER BY r.name, c.name, m.name, n.name
  `);

  const regionsById = new Map<number, LocationRegion>();

  for (const row of rows) {
    let region = regionsById.get(row.region_id);

    if (!region) {
      region = {
        id: row.region_id,
        name: row.region_name,
        cities: []
      };
      regionsById.set(row.region_id, region);
    }

    if (row.city_id === null || row.city_name === null) {
      continue;
    }

    let city = region.cities.find((item) => item.id === row.city_id);

    if (!city) {
      city = {
        id: row.city_id,
        name: row.city_name,
        municipalities: []
      };
      region.cities.push(city);
    }

    if (row.municipality_id === null || row.municipality_name === null) {
      continue;
    }

    let municipality = city.municipalities.find((item) => item.id === row.municipality_id);

    if (!municipality) {
      municipality = {
        id: row.municipality_id,
        name: row.municipality_name,
        neighborhoods: []
      };
      city.municipalities.push(municipality);
    }

    if (row.neighborhood_id === null || row.neighborhood_name === null) {
      continue;
    }

    municipality.neighborhoods.push({
      id: row.neighborhood_id,
      name: row.neighborhood_name,
      aliases: Array.isArray(row.neighborhood_aliases) ? row.neighborhood_aliases : []
    });
  }

  return Array.from(regionsById.values());
}

export type LocationGeometryType = 'region' | 'city' | 'municipality';

const LOCATION_GEOMETRY_TABLE_BY_TYPE: Record<LocationGeometryType, string> = {
  region: 'regions',
  city: 'cities',
  municipality: 'municipalities'
};

export async function getLocationGeometry(
  type: LocationGeometryType,
  id: number
): Promise<unknown | null> {
  await ensureCameroonLocationDataInitialized();

  const table = LOCATION_GEOMETRY_TABLE_BY_TYPE[type];
  const rows = await prisma.$queryRawUnsafe<Array<{ geometry: unknown | null }>>(
    `SELECT geometry FROM ${table} WHERE id = $1 LIMIT 1`,
    id
  );

  return rows[0]?.geometry ?? null;
}
