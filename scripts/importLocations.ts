// One-off import of real Cameroon administrative boundaries from geoBoundaries into
// regions/cities/municipalities/neighborhoods. Run with `npm run import:locations`.
// Source: geoBoundaries CMR ADM1 (regions) + ADM3 (arrondissements/communes -> municipalities).
// "City" has no official equivalent in Cameroon's admin hierarchy - it is derived here by
// grouping arrondissements that share a name once a trailing roman numeral is stripped
// (e.g. "Douala I".."Douala V" -> city "Douala"). Arrondissements with no such siblings
// become their own 1:1 city.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as turf from '@turf/turf';
import type { Feature, Polygon, MultiPolygon, Geometry } from 'geojson';
import prisma from '../src/db/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data', 'geoBoundaries');

type AdmFeature = Feature<Polygon | MultiPolygon, { shapeName: string }>;

interface AdmCollection {
  features: AdmFeature[];
}

function loadGeoJson(fileName: string): AdmCollection {
  const raw = fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8');
  return JSON.parse(raw) as AdmCollection;
}

// geoBoundaries ADM3 shapeName values are mojibake (UTF-8 bytes mis-decoded as latin1),
// e.g. "MÃ©long" should be "Mélong". Only re-decode strings that show that pattern.
function fixEncoding(name: string): string {
  if (!/Ã[\x80-\xBF]/.test(name)) {
    return name;
  }
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}

// Longest-first so "VIII" isn't matched as "V" + leftover "III".
const ROMAN_SUFFIXES = ['XIII', 'XII', 'XI', 'VIII', 'VII', 'VI', 'IX', 'IV', 'III', 'II', 'X', 'V', 'I'];
const ROMAN_SUFFIX_RE = new RegExp(`^(.*\\S)\\s+(${ROMAN_SUFFIXES.join('|')})$`);

function deriveCityBaseName(municipalityName: string): string {
  const match = municipalityName.match(ROMAN_SUFFIX_RE);
  return match ? match[1] : municipalityName;
}

interface RegionRecord {
  id: number;
  name: string;
  geometry: Geometry;
}

interface MunicipalitySource {
  name: string;
  geometry: Geometry;
  regionName: string;
}

function assignRegion(admFeature: AdmFeature, regions: RegionRecord[]): RegionRecord {
  const point = turf.pointOnFeature(admFeature);

  for (const region of regions) {
    if (turf.booleanPointInPolygon(point, region.geometry as Polygon | MultiPolygon)) {
      return region;
    }
  }

  // Fallback for simplified/coastal shapes whose sample point falls just outside every
  // region polygon - pick the nearest region boundary instead.
  let nearest = regions[0];
  let nearestDistance = Infinity;
  for (const region of regions) {
    const distance = turf.pointToPolygonDistance(point, region.geometry as Polygon | MultiPolygon, {
      units: 'kilometers'
    });
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = region;
    }
  }
  return nearest;
}

function unionGeometries(geometries: Geometry[]): Geometry {
  if (geometries.length === 1) {
    return geometries[0];
  }

  const fc = turf.featureCollection(geometries.map((geometry) => turf.feature(geometry as Polygon | MultiPolygon)));
  const unioned = turf.union(fc as turf.helpers.FeatureCollection<Polygon | MultiPolygon>);

  if (!unioned) {
    throw new Error('turf.union returned null');
  }

  return unioned.geometry;
}

// Preserves the hand-written demo neighborhoods from the old fake seed, remapped onto the
// real municipality names (accents restored, e.g. old ASCII "Limbe I" -> real "Limbé I").
const NEIGHBORHOOD_SEED: Array<{ municipalityName: string; name: string; aliases: string[] }> = [
  { municipalityName: 'Douala I', name: 'Akwa', aliases: ['Rond-point', 'Boulevard de la Liberte', 'Palais Dika Akwa', 'Ancien Dalip'] },
  { municipalityName: 'Douala I', name: 'Bonanjo', aliases: ['Administrative Centre', 'La Court', 'Place du Gouvernement', 'BCEAO'] },
  { municipalityName: 'Douala I', name: 'Bali', aliases: ['Koumassi', 'Ancien Cinema', 'Carrefour Bali', 'Njo-Njo'] },
  { municipalityName: 'Douala I', name: 'Deido', aliases: ['Rond-point Deido', 'Ecole Publique', 'Vallee Deido', 'Rue de la Joie'] },
  { municipalityName: 'Douala II', name: 'New Bell', aliases: ['Ngangue', 'Ngangwe', 'Kasala', 'Marche Central', 'Caserne', 'Bassa'] },
  { municipalityName: 'Douala III', name: 'Logbaba', aliases: ['Zone Industrielle', 'Carrefour Ndokoti', 'Ndogbong', 'Nyalla', 'Yassa'] },
  { municipalityName: 'Douala IV', name: 'Bonaberi', aliases: ['Sodiko', 'Mambanda', 'Quatre etages', 'Ancien Prix', 'Grand Hangar'] },
  { municipalityName: 'Douala V', name: 'Bonamoussadi', aliases: ['Carrefour Sable', 'Rond-point', 'Fin goudron', 'Marche', 'Poste'] },
  { municipalityName: 'Douala V', name: 'Kotto', aliases: ['Kotto Immeubles', 'Blockhaus', 'Kotto Village', 'Antenne Kotto'] },
  { municipalityName: 'Douala V', name: 'Logpom', aliases: ['Carrefour Macon', 'Bassong', 'Total Logpom', 'College des Nations'] },
  { municipalityName: 'Douala V', name: 'Makepe', aliases: ['Denver', 'Rhone-Poulenc', 'Saint Tropez', 'Maison Blanche', 'Carrefour Lycee'] },
  { municipalityName: 'Yaoundé I', name: 'Bastos', aliases: ['Ambassades', 'Carrefour Bastos', 'Palais des Congres', 'Casino'] },
  { municipalityName: 'Yaoundé I', name: 'Etoudi', aliases: ['Presidence', 'Abattoir', 'Carrefour Etoudi', 'Gare Routiere'] },
  { municipalityName: 'Yaoundé I', name: 'Omnisports', aliases: ['Stade', 'Mballa II', 'Nlongkak', 'Fouda', 'Rue Ceper'] },
  { municipalityName: 'Yaoundé II', name: 'Tsinga', aliases: ['Mokolo', 'Briqueterie', 'Carrefour Tsinga', 'Madagascar'] },
  { municipalityName: 'Yaoundé VI', name: 'Biyem-Assi', aliases: ['Carrefour Jouvence', 'Acacia', 'Rond-point Express', 'Melen', 'Maison Blanche'] },
  { municipalityName: 'Yaoundé VI', name: 'Mendong', aliases: ['Camp SIC Mendong', 'Polytechnique', 'Carrefour Simbock', 'Lycee Mendong'] },
  { municipalityName: 'Kribi I', name: 'Ngoye', aliases: ['Ngoye Plage', 'Dombe', 'Mboa-Manga', 'Centre-ville'] },
  { municipalityName: 'Limbé I', name: 'Bota', aliases: ['Bota Island', 'Down Beach', 'New Town', 'Mile 4', 'Ambas Bay'] }
];

async function main(): Promise<void> {
  const adm1 = loadGeoJson('CMR-ADM1_simplified.geojson');
  const adm3 = loadGeoJson('CMR-ADM3_simplified.geojson');

  const regions: RegionRecord[] = adm1.features
    .map((feature) => ({
      name: fixEncoding(feature.properties.shapeName).trim(),
      geometry: feature.geometry
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((region, index) => ({ id: index + 1, ...region }));

  console.log(`Loaded ${regions.length} regions:`, regions.map((r) => r.name).join(', '));

  const municipalitySources: MunicipalitySource[] = adm3.features.map((feature) => {
    const name = fixEncoding(feature.properties.shapeName).trim();
    const region = assignRegion(feature, regions);
    return { name, geometry: feature.geometry, regionName: region.name };
  });

  console.log(`Loaded ${municipalitySources.length} municipalities (arrondissements).`);

  // Group into cities: key = region + base name (roman-numeral suffix stripped).
  const cityGroups = new Map<
    string,
    { regionName: string; baseName: string; members: MunicipalitySource[] }
  >();

  for (const municipality of municipalitySources) {
    const baseName = deriveCityBaseName(municipality.name);
    const key = `${municipality.regionName}::${baseName}`;
    let group = cityGroups.get(key);
    if (!group) {
      group = { regionName: municipality.regionName, baseName, members: [] };
      cityGroups.set(key, group);
    }
    group.members.push(municipality);
  }

  const sortedCityGroups = Array.from(cityGroups.values()).sort((a, b) => {
    const regionCompare = a.regionName.localeCompare(b.regionName);
    return regionCompare !== 0 ? regionCompare : a.baseName.localeCompare(b.baseName);
  });

  const multiMemberCities = sortedCityGroups.filter((g) => g.members.length > 1);
  console.log(`Derived ${sortedCityGroups.length} cities, ${multiMemberCities.length} of which span multiple arrondissements:`);
  for (const group of multiMemberCities) {
    console.log(`  ${group.baseName} (${group.regionName}): ${group.members.map((m) => m.name).join(', ')}`);
  }

  const regionIdByName = new Map(regions.map((r) => [r.name, r.id]));

  interface CityRecord {
    id: number;
    regionId: number;
    name: string;
    geometry: Geometry;
  }

  const cities: CityRecord[] = sortedCityGroups.map((group, index) => ({
    id: index + 1,
    regionId: regionIdByName.get(group.regionName)!,
    name: group.baseName,
    geometry: unionGeometries(group.members.map((m) => m.geometry))
  }));

  const cityIdByKey = new Map(sortedCityGroups.map((group, index) => [`${group.regionName}::${group.baseName}`, index + 1]));

  interface MunicipalityRecord {
    id: number;
    cityId: number;
    name: string;
    geometry: Geometry;
  }

  const allMunicipalityAssignments = sortedCityGroups.flatMap((group) =>
    group.members.map((member) => ({
      cityId: cityIdByKey.get(`${group.regionName}::${group.baseName}`)!,
      name: member.name,
      geometry: member.geometry
    }))
  );

  const municipalities: MunicipalityRecord[] = allMunicipalityAssignments
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m, index) => ({ id: index + 1, ...m }));

  const municipalityIdByName = new Map(municipalities.map((m) => [m.name, m.id]));

  const missingNeighborhoodMunicipalities = NEIGHBORHOOD_SEED.filter(
    (n) => !municipalityIdByName.has(n.municipalityName)
  );
  if (missingNeighborhoodMunicipalities.length > 0) {
    console.warn(
      'Could not remap these demo neighborhoods (municipality name not found in imported data):',
      missingNeighborhoodMunicipalities.map((n) => `${n.name} -> ${n.municipalityName}`)
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('TRUNCATE TABLE regions, cities, municipalities, neighborhoods RESTART IDENTITY CASCADE');

    const regionsParameters: unknown[] = [];
    const regionValues = regions.map((region, index) => {
      const offset = index * 3;
      regionsParameters.push(region.id, region.name, JSON.stringify(region.geometry));
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}::jsonb)`;
    });
    await tx.$executeRawUnsafe(
      `INSERT INTO regions (id, name, geometry) VALUES ${regionValues.join(', ')}`,
      ...regionsParameters
    );

    const citiesParameters: unknown[] = [];
    const cityValues = cities.map((city, index) => {
      const offset = index * 4;
      citiesParameters.push(city.id, city.regionId, city.name, JSON.stringify(city.geometry));
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::jsonb)`;
    });
    await tx.$executeRawUnsafe(
      `INSERT INTO cities (id, region_id, name, geometry) VALUES ${cityValues.join(', ')}`,
      ...citiesParameters
    );

    const municipalitiesParameters: unknown[] = [];
    const municipalityValues = municipalities.map((municipality, index) => {
      const offset = index * 4;
      municipalitiesParameters.push(
        municipality.id,
        municipality.cityId,
        municipality.name,
        JSON.stringify(municipality.geometry)
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}::jsonb)`;
    });
    await tx.$executeRawUnsafe(
      `INSERT INTO municipalities (id, city_id, name, geometry) VALUES ${municipalityValues.join(', ')}`,
      ...municipalitiesParameters
    );

    const neighborhoodsToInsert = NEIGHBORHOOD_SEED.flatMap((neighborhood) => {
      const municipalityId = municipalityIdByName.get(neighborhood.municipalityName);
      return municipalityId ? [{ ...neighborhood, municipalityId }] : [];
    });
    const neighborhoodsParameters: unknown[] = [];
    const neighborhoodValues = neighborhoodsToInsert.map((neighborhood, index) => {
      const offset = index * 3;
      neighborhoodsParameters.push(neighborhood.municipalityId, neighborhood.name, neighborhood.aliases);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}::text[])`;
    });
    await tx.$executeRawUnsafe(
      `INSERT INTO neighborhoods (municipality_id, name, aliases) VALUES ${neighborhoodValues.join(', ')}`,
      ...neighborhoodsParameters
    );
  }, {
    maxWait: 30000,
    timeout: 120000
  });

  console.log(
    `Imported ${regions.length} regions, ${cities.length} cities, ${municipalities.length} municipalities, ` +
      `${NEIGHBORHOOD_SEED.length - missingNeighborhoodMunicipalities.length} neighborhoods.`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('Location import failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
