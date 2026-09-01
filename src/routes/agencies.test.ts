import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCreateAgencyInput,
  normalizeConvertUserToAgentInput
} from '../services/agenciesService.js';

test('normalizes agency create input and generates slug from name', () => {
  const payload = normalizeCreateAgencyInput(
    {
      name: 'Prime Estates Cameroon',
      email: ' contact@prime.cm ',
      phone: ' +237 600 000 000 '
    },
    'u_creator'
  );

  assert.equal(payload.name, 'Prime Estates Cameroon');
  assert.equal(payload.slug, 'prime-estates-cameroon');
  assert.equal(payload.created_by_user_id, 'u_creator');
  assert.equal(payload.email, 'contact@prime.cm');
  assert.equal(payload.phone, '+237 600 000 000');
});

test('requires agency contact email and phone number', () => {
  assert.throws(
    () => normalizeCreateAgencyInput({ name: 'Prime Estates', phone: '+237 600 000 000' }, 'u_creator'),
    /Contact email is required/
  );
  assert.throws(
    () => normalizeCreateAgencyInput({ name: 'Prime Estates', email: 'contact@prime.cm' }, 'u_creator'),
    /Phone number is required/
  );
});

test('validates and normalizes convert user to agent input', () => {
  const payload = normalizeConvertUserToAgentInput({
    user_id: 'u_123',
    agency_ids: [4, 4, 8],
    primary_agency_id: 8
  });

  assert.equal(payload.userId, 'u_123');
  assert.deepEqual(payload.agencyIds, [4, 4, 8]);
  assert.equal(payload.primaryAgencyId, 8);
});
