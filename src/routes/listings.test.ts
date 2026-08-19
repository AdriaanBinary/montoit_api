import test from 'node:test';
import assert from 'node:assert/strict';
import { buildListingImageObjectKey, normalizeCreateListingInput } from '../services/listingsService.js';
import { buildPublicListingsWhere } from '../services/publicListingsService.js';
import { publicListingsQuerySchema } from './listings.js';

test('defaults new listings to draft and unpublished when not provided', () => {
  const payload = normalizeCreateListingInput({ title: 'Cozy apartment' }, 'u_test');

  assert.equal(payload.user_id, 'u_test');
  assert.equal(payload.status, 'draft');
  assert.equal(payload.is_published, false);
  assert.equal(payload.currency, 'XAF');
  assert.deepEqual(payload.features, []);
  assert.deepEqual(payload.other, []);
});

test('preserves explicit values when creating a listing', () => {
  const payload = normalizeCreateListingInput(
    {
      title: 'Luxury villa',
      status: 'active',
      is_published: true,
      amount: 250000,
      bedrooms: 3,
      bathrooms: 2.5,
      features: ['pool', 'garden']
    },
    'u_test'
  );

  assert.equal(payload.title, 'Luxury villa');
  assert.equal(payload.status, 'active');
  assert.equal(payload.is_published, true);
  assert.equal(payload.amount, 250000);
  assert.equal(payload.bedrooms, 3);
  assert.equal(payload.bathrooms, 2.5);
  assert.deepEqual(payload.features, ['pool', 'garden']);
});

test('builds a deterministic listing image object key', () => {
  const key = buildListingImageObjectKey(42, 1, 'Front View.jpg');

  assert.match(key, /^listings\/42\//);
  assert.match(key, /-2-Front-View\.jpg$/);
});

test('builds public listing filters with repeated location ids', () => {
  const where = buildPublicListingsWhere({
    region_id: [1, 2],
    city_id: [3],
    municipality_id: [6, 7],
    neighborhood_id: [11],
    sortBy: 'date_desc'
  });

  assert.deepEqual(where.AND, [
    {
      OR: [
        { region_id: { in: [1, 2] } },
        { city_id: { in: [3] } },
        { municipality_id: { in: [6, 7] } },
        { neighborhood_id: { in: [11] } }
      ]
    }
  ]);
});

test('rejects invalid location ids in the public listings query schema', () => {
  const parsed = publicListingsQuerySchema.safeParse({ region_id: ['1', 'bad-value'] });

  assert.equal(parsed.success, false);
});

test('builds an any-match filter for listing option ids', () => {
  const where = buildPublicListingsWhere({
    optionIds: [1, 2, 2],
    sortBy: 'date_desc'
  });

  assert.deepEqual(where.AND, [
    {
      optionSelections: {
        some: { option_id: { in: [1, 2] } }
      }
    }
  ]);
});

test('builds an all-match filter for listing option ids', () => {
  const where = buildPublicListingsWhere({
    optionIds: [1, 2],
    optionMatch: 'all',
    sortBy: 'date_desc'
  });

  assert.deepEqual(where.AND, [
    { optionSelections: { some: { option_id: 1 } } },
    { optionSelections: { some: { option_id: 2 } } }
  ]);
});

test('parses option ids and defaults option matching to any', () => {
  const parsed = publicListingsQuerySchema.safeParse({ optionIds: ['1', '2'] });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data.optionIds, [1, 2]);
    assert.equal(parsed.data.optionMatch, 'any');
  }
});

test('rejects unsupported option matching modes', () => {
  const parsed = publicListingsQuerySchema.safeParse({ optionMatch: 'none' });

  assert.equal(parsed.success, false);
});
