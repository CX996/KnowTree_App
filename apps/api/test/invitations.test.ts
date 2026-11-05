import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInviteUrl,
  compensationStatus,
  createInviteCredential,
  normalizeInviteEmail,
} from '../src/services/invitations.js';

test('invitation tokens are random, URL safe and stored only as hashes', () => {
  const first = createInviteCredential();
  const second = createInviteCredential();

  assert.notEqual(first.token, second.token);
  assert.match(first.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(first.tokenHash, /^[0-9a-f]{64}$/);
  assert.notEqual(first.tokenHash, first.token);
});

test('invitation email normalization is stable', () => {
  assert.equal(normalizeInviteEmail(' User@Example.com '), 'user@example.com');
});

test('invite links keep the secret in the fragment', () => {
  const url = buildInviteUrl('https://knowtree.example/', 'opaque-token');
  assert.equal(url, 'https://knowtree.example/register.html#invite=opaque-token');
  assert.equal(url.includes('?invite='), false);
});

test('claim compensation distinguishes known failure from uncertain state', () => {
  assert.equal(
    compensationStatus({ authUserCreated: false, cleanupSucceeded: true }),
    'active',
  );
  assert.equal(
    compensationStatus({ authUserCreated: true, cleanupSucceeded: true }),
    'active',
  );
  assert.equal(
    compensationStatus({ authUserCreated: true, cleanupSucceeded: false }),
    'needs_attention',
  );
  assert.equal(
    compensationStatus({ authUserCreated: false, cleanupSucceeded: false }),
    'needs_attention',
  );
});
