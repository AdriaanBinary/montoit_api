import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterConfirmedImages,
  normalizeCreateListingInput,
  validatePublishRequirements
} from './listingsService.js';

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
