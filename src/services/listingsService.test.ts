import test from 'node:test';
import assert from 'node:assert/strict';
import { filterConfirmedImages } from './listingsService.js';

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
