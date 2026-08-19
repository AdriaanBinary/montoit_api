import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterConfirmedImages,
  isAgentRole,
  normalizeCreateListingInput,
  requiresAgentForPropertyType,
  validatePublishRequirements
} from './listingsService.js';

test('requires an agent only for commercial listings', () => {
  assert.equal(isAgentRole('AGENT'), true);
  assert.equal(isAgentRole('PRIVATE'), false);
  assert.equal(isAgentRole(undefined), false);
  assert.equal(requiresAgentForPropertyType('Commercial'), true);
  assert.equal(requiresAgentForPropertyType('House'), false);
  assert.equal(requiresAgentForPropertyType('Apartment / Flat'), false);
  assert.equal(requiresAgentForPropertyType(undefined), false);
});

test('only keeps images that have been confirmed', () => {
  const images = [
    { id: 'img-1', object_key: 'a', upload_confirmed: true },
    { id: 'img-2', object_key: 'b', upload_confirmed: false },
    { id: 'img-3', object_key: 'c', upload_confirmed: true }
  ];

  const filtered = filterConfirmedImages(images as Array<Record<string, unknown>>);

  assert.deepEqual(filtered, [
    { id: 'img-1', object_key: 'a', upload_confirmed: true },
    { id: 'img-3', object_key: 'c', upload_confirmed: true }
  ]);
});

test('requires at least 5 confirmed images before a listing can be published', () => {
  assert.deepEqual(validatePublishRequirements(4), {
    valid: false,
    message: 'A listing must have at least 5 confirmed images before it can be published.'
  });

  assert.deepEqual(validatePublishRequirements(5), {
    valid: true,
    message: undefined
  });

  assert.deepEqual(validatePublishRequirements(10), {
    valid: true,
    message: undefined
  });
});

test('normalizes the listing type to sale or rent', () => {
  assert.equal(normalizeCreateListingInput({ listing_type: 'sale' }, 'u-123').listing_type, 'sale');
  assert.equal(normalizeCreateListingInput({ listing_type: 'rent' }, 'u-123').listing_type, 'rent');
  assert.equal(normalizeCreateListingInput({}, 'u-123').listing_type, 'sale');
});

test('normalizes listing option ids and removes duplicates', () => {
  assert.deepEqual(
    normalizeCreateListingInput({ option_ids: [3, 3, 7] }, 'u-123').option_ids,
    [3, 7]
  );
  assert.deepEqual(normalizeCreateListingInput({}, 'u-123').option_ids, []);
});

test('preserves selected general fees and custom fees when normalizing a listing', () => {
  const payload = normalizeCreateListingInput(
    {
      general_fees: [{ fee_id: 2, amount: 12500 }],
      other_general_fees: [{ description: 'Generator contribution', amount: 5000 }]
    },
    'u-123'
  );

  assert.deepEqual(payload.general_fees, [{ fee_id: 2, amount: 12500 }]);
  assert.deepEqual(payload.other_general_fees, [{ description: 'Generator contribution', amount: 5000 }]);
});
