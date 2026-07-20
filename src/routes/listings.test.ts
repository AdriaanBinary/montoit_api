import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCreateListingInput } from './listings.js';

test('defaults new listings to draft and unpublished when not provided', () => {
  const payload = normalizeCreateListingInput({ title: 'Cozy apartment' }, 'u_test');

  assert.equal(payload.user_id, 'u_test');
  assert.equal(payload.status, 'draft');
  assert.equal(payload.is_published, false);
  assert.equal(payload.currency, 'USD');
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
