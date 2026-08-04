import prisma from './prisma.js';

export class LocationValidationError extends Error {}

export interface ListingLocationIds {
  region_id?: number | null;
  city_id?: number | null;
  municipality_id?: number | null;
  neighborhood_id?: number | null;
}

let initializationPromise: Promise<void> | null = null;

async function createLocationTables(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS regions (
      id INTEGER PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cities (
      id INTEGER PRIMARY KEY,
      region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      CONSTRAINT unique_city_per_region UNIQUE (region_id, name)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS municipalities (
      id INTEGER PRIMARY KEY,
      city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
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

async function seedCameroonLocations(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    INSERT INTO regions (id, name) VALUES
    (1, 'Littoral'),
    (2, 'Centre'),
    (3, 'South'),
    (4, 'South West'),
    (5, 'Adamaoua'),
    (6, 'East'),
    (7, 'Extreme North'),
    (8, 'North'),
    (9, 'North West'),
    (10, 'West')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO cities (id, region_id, name) VALUES
    (1, 1, 'Douala'),
    (2, 2, 'Yaounde'),
    (3, 3, 'Kribi'),
    (4, 4, 'Limbe')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, region_id = EXCLUDED.region_id
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO municipalities (id, city_id, name) VALUES
    (1, 1, 'Douala I'),
    (2, 1, 'Douala II'),
    (3, 1, 'Douala III'),
    (4, 1, 'Douala IV'),
    (5, 1, 'Douala V'),
    (6, 2, 'Yaounde I'),
    (7, 2, 'Yaounde II'),
    (8, 2, 'Yaounde III'),
    (9, 2, 'Yaounde IV'),
    (10, 2, 'Yaounde V'),
    (11, 2, 'Yaounde VI'),
    (12, 2, 'Yaounde VII'),
    (13, 3, 'Kribi I'),
    (14, 3, 'Kribi II'),
    (15, 4, 'Limbe I'),
    (16, 4, 'Limbe II')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, city_id = EXCLUDED.city_id
  `);

  await prisma.$executeRawUnsafe(`
    INSERT INTO neighborhoods (municipality_id, name, aliases) VALUES
    (1, 'Akwa', ARRAY['Rond-point', 'Boulevard de la Liberte', 'Palais Dika Akwa', 'Ancien Dalip']),
    (1, 'Bonanjo', ARRAY['Administrative Centre', 'La Court', 'Place du Gouvernement', 'BCEAO']),
    (1, 'Bali', ARRAY['Koumassi', 'Ancien Cinema', 'Carrefour Bali', 'Njo-Njo']),
    (1, 'Deido', ARRAY['Rond-point Deido', 'Ecole Publique', 'Vallee Deido', 'Rue de la Joie']),
    (2, 'New Bell', ARRAY['Ngangue', 'Ngangwe', 'Kasala', 'Marche Central', 'Caserne', 'Bassa']),
    (3, 'Logbaba', ARRAY['Zone Industrielle', 'Carrefour Ndokoti', 'Ndogbong', 'Nyalla', 'Yassa']),
    (4, 'Bonaberi', ARRAY['Sodiko', 'Mambanda', 'Quatre etages', 'Ancien Prix', 'Grand Hangar']),
    (5, 'Bonamoussadi', ARRAY['Carrefour Sable', 'Rond-point', 'Fin goudron', 'Marche', 'Poste']),
    (5, 'Kotto', ARRAY['Kotto Immeubles', 'Blockhaus', 'Kotto Village', 'Antenne Kotto']),
    (5, 'Logpom', ARRAY['Carrefour Macon', 'Bassong', 'Total Logpom', 'College des Nations']),
    (5, 'Makepe', ARRAY['Denver', 'Rhone-Poulenc', 'Saint Tropez', 'Maison Blanche', 'Carrefour Lycee']),
    (6, 'Bastos', ARRAY['Ambassades', 'Carrefour Bastos', 'Palais des Congres', 'Casino']),
    (6, 'Etoudi', ARRAY['Presidence', 'Abattoir', 'Carrefour Etoudi', 'Gare Routiere']),
    (6, 'Omnisports', ARRAY['Stade', 'Mballa II', 'Nlongkak', 'Fouda', 'Rue Ceper']),
    (7, 'Tsinga', ARRAY['Mokolo', 'Briqueterie', 'Carrefour Tsinga', 'Madagascar']),
    (11, 'Biyem-Assi', ARRAY['Carrefour Jouvence', 'Acacia', 'Rond-point Express', 'Melen', 'Maison Blanche']),
    (11, 'Mendong', ARRAY['Camp SIC Mendong', 'Polytechnique', 'Carrefour Simbock', 'Lycee Mendong']),
    (13, 'Ngoye', ARRAY['Ngoye Plage', 'Dombe', 'Mboa-Manga', 'Centre-ville']),
    (15, 'Bota', ARRAY['Bota Island', 'Down Beach', 'New Town', 'Mile 4', 'Ambas Bay'])
    ON CONFLICT (municipality_id, name) DO UPDATE
    SET aliases = EXCLUDED.aliases, updated_at = now()
  `);
}

export async function ensureCameroonLocationDataInitialized(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      await createLocationTables();
      await seedCameroonLocations();
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
